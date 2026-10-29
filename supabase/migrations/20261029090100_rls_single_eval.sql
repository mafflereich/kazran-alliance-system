-- ============================================================
-- RLS：讓 policy 的「身分判斷」每個 statement 只算一次
--
-- 症狀：
--   成員數破千之後，任何讀 members 的查詢都會 timeout（57014）。
--
-- 原因：
--   1) members_select_public 呼叫 public.can_view_equipment(id)——
--      它是 PL/pgSQL SECURITY DEFINER，內部又逐列呼叫
--      owns_member / is_manager / is_admin / is_guild_manager_of，
--      每個 helper 各查一次 profiles + auth.identities。
--      1000 列 = 數千次子查詢（docs/sql/fix_get_member_equipment_timeout.sql
--      已記錄過同一個問題）。
--   2) current_profile() 用三個 OR + ::text cast 比對，
--      完全無法走索引，而且每次 policy 求值都會再算一次。
--
-- 修法（語意不變）：
--   a) current_profile() 先用 auth_id 索引命中，找不到才退回舊的 OR 條件
--   b) policy 內的無參數函式改寫成 (SELECT public.fn())，
--      planner 會把它變成 InitPlan → 每個 statement 只求值一次
--   c) members 的「公開可見」條件直接用欄位判斷（不再呼叫 PL/pgSQL）
--
-- 【為什麼 members_select_public 可以拿掉 all_manager / admin /
--   guild_manager 三個分支？】
--   這三個分支的前提都是 is_manager() / is_admin()，
--   而 members_select_manager 這條 policy 已對管理者開放「所有列」；
--   policy 之間是 OR 關係，所以管理者看到的結果完全相同。
--   一般成員（非 manager）在這三個分支本來就永遠是 false。
--
-- 可重複執行。回滾方式見檔尾。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 0：補回 can_edit_raid_record()
--
-- 線上診斷發現這支函式「不存在」，也就是 docs/sql/fix_raid_records_rls.sql
-- 從未被套用，導致 member_raid_records 只有一條
--   「僅限管理員存取成員賽季紀錄」(ALL, manager 以上)
-- 的 policy → 公會正/副會長在 UI 上能進頁面，但一存檔就被 RLS 拒絕。
--
-- 這裡直接內嵌判斷（不依賴 is_guild_officer），讓本檔可獨立執行。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_raid_record()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_manager() OR EXISTS (
    SELECT 1
    FROM public.current_profile() cp
    CROSS JOIN LATERAL unnest(string_to_array(COALESCE(cp.id, ''), ',')) AS b(mid)
    JOIN public.members m ON m.id = btrim(b.mid)
    WHERE m.role IN ('leader', 'coleader')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_raid_record() TO authenticated;

-- ------------------------------------------------------------
-- STEP 1：身分解析（走索引）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_discord_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT provider_id::text
  FROM auth.identities
  WHERE user_id = auth.uid() AND provider = 'discord'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS TABLE (id text, user_role text, discord_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH direct AS (
    -- 正常情況：sync-discord-roles 已把 auth_id 寫進 profiles
    SELECT p.id, p.user_role, p.discord_id::text AS discord_id
    FROM public.profiles p
    WHERE p.auth_id = auth.uid()          -- 走 idx_profiles_auth_id
    LIMIT 1
  ),
  legacy AS (
    -- 舊資料 / email 登入：維持原本的 OR 語意
    SELECT p.id, p.user_role, p.discord_id::text AS discord_id
    FROM public.profiles p
    WHERE p.id::text = auth.uid()::text
       OR p.discord_id::text = public.current_discord_id()
    LIMIT 1
  )
  SELECT * FROM direct
  UNION ALL
  SELECT * FROM legacy
  WHERE NOT EXISTS (SELECT 1 FROM direct)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_discord_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;

-- ------------------------------------------------------------
-- STEP 2：members 的 SELECT policy
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "members_select_manager" ON public.members;
CREATE POLICY "members_select_manager"
  ON public.members
  FOR SELECT
  TO authenticated, anon
  USING ((SELECT public.is_manager()));

DROP POLICY IF EXISTS "members_select_owner" ON public.members;
CREATE POLICY "members_select_owner"
  ON public.members
  FOR SELECT
  TO authenticated, anon
  USING ((SELECT public.owns_member(id)));

DROP POLICY IF EXISTS "members_select_public" ON public.members;
CREATE POLICY "members_select_public"
  ON public.members
  FOR SELECT
  TO authenticated, anon
  USING (
    -- 未設定 / 未知的隱私值 → 視為公開（與 can_view_equipment 預設一致）
    COALESCE(equipment_visibility, '') NOT IN ('public', 'all_manager', 'guild_manager', 'admin')
    OR equipment_visibility = 'public'
    -- 本人
    OR (SELECT public.owns_member(id))
  );

-- ------------------------------------------------------------
-- STEP 3：寫入 policy（把無參數的 is_manager() 收斂成 InitPlan）
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "members_insert" ON public.members;
CREATE POLICY "members_insert"
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_manager()) OR (SELECT public.owns_member(id)));

DROP POLICY IF EXISTS "members_update" ON public.members;
CREATE POLICY "members_update"
  ON public.members
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_manager()) OR (SELECT public.owns_member(id)))
  WITH CHECK ((SELECT public.is_manager()) OR (SELECT public.owns_member(id)));

DROP POLICY IF EXISTS "members_delete" ON public.members;
CREATE POLICY "members_delete"
  ON public.members
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_manager()));

-- ------------------------------------------------------------
-- STEP 4：戰記表的 policy（對齊 docs/sql/fix_raid_records_rls.sql）
--
-- 線上原本只有：
--   member_raid_records：「僅限管理員存取成員賽季紀錄」(ALL, manager 以上)
--   guild_raid_records：「所有人可閱讀戰績」(SELECT true)
--                       「管理員可異動戰績」(ALL, manager 以上)
-- 造成的問題：
--   1. 公會正/副會長（profiles.user_role 不是 manager）完全無法寫入
--      → 「頁面進得去、存檔卻被 RLS 拒絕」
--   2. 一般成員連讀取都被擋（MemberBoard 看不到分數）
--
-- 改為與前端權限一致的規則，並把舊 policy 一併移除避免混淆。
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "僅限管理員存取成員賽季紀錄" ON public.member_raid_records;
DROP POLICY IF EXISTS "所有人可閱讀戰績" ON public.guild_raid_records;
DROP POLICY IF EXISTS "管理員可異動戰績" ON public.guild_raid_records;

-- 讀取：所有已登入者（戰記相關頁面都在 ProtectedRoute 後方）
DROP POLICY IF EXISTS "member_raid_records_select" ON public.member_raid_records;
CREATE POLICY "member_raid_records_select"
  ON public.member_raid_records
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "guild_raid_records_select" ON public.guild_raid_records;
CREATE POLICY "guild_raid_records_select"
  ON public.guild_raid_records
  FOR SELECT
  TO authenticated
  USING (true);

-- 新增：upsert 走 INSERT 分支時的關鍵（舊環境完全沒有這條）
DROP POLICY IF EXISTS "member_raid_records_insert" ON public.member_raid_records;
CREATE POLICY "member_raid_records_insert"
  ON public.member_raid_records
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.can_edit_raid_record()));

DROP POLICY IF EXISTS "member_raid_records_update" ON public.member_raid_records;
CREATE POLICY "member_raid_records_update"
  ON public.member_raid_records
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.can_edit_raid_record()))
  WITH CHECK ((SELECT public.can_edit_raid_record()));

DROP POLICY IF EXISTS "member_raid_records_delete" ON public.member_raid_records;
CREATE POLICY "member_raid_records_delete"
  ON public.member_raid_records
  FOR DELETE
  TO authenticated
  USING ((SELECT public.can_edit_raid_record()));

DROP POLICY IF EXISTS "guild_raid_records_insert" ON public.guild_raid_records;
CREATE POLICY "guild_raid_records_insert"
  ON public.guild_raid_records
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.can_edit_raid_record()));

DROP POLICY IF EXISTS "guild_raid_records_update" ON public.guild_raid_records;
CREATE POLICY "guild_raid_records_update"
  ON public.guild_raid_records
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.can_edit_raid_record()))
  WITH CHECK ((SELECT public.can_edit_raid_record()));

DROP POLICY IF EXISTS "guild_raid_records_delete" ON public.guild_raid_records;
CREATE POLICY "guild_raid_records_delete"
  ON public.guild_raid_records
  FOR DELETE
  TO authenticated
  USING ((SELECT public.can_edit_raid_record()));

-- 明確補上 table 權限，避免環境差異（RLS 之外還需要 table GRANT）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_raid_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guild_raid_records TO authenticated;

-- ------------------------------------------------------------
-- 驗證（請用「一般成員」與「公會會長」各登入一次）
--
--   -- 1) 成員列表速度
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT id, name, equipment_visibility FROM public.members LIMIT 1000;
--
--   -- 2) policy 清單
--   SELECT policyname, cmd, qual FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'members' ORDER BY cmd, policyname;
--
--   -- 3) 一般成員看到的列數，必須與修改前一致
--   SELECT count(*) FROM public.members;
-- ------------------------------------------------------------
-- 回滾（還原成逐列呼叫函式的寫法）：
--   DROP POLICY IF EXISTS "members_select_public" ON public.members;
--   CREATE POLICY "members_select_public" ON public.members
--     FOR SELECT TO authenticated, anon
--     USING (public.can_view_equipment(id));
-- ------------------------------------------------------------

