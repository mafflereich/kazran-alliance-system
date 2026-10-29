-- ============================================================
-- 成員資料的可見範圍：改為「自己公會 + 本人 + 管理階層」
--
-- 需求：
--   1. 一般成員：只看得到「自己公會」的成員，只能改自己的資料
--   2. creator / admin / manager：全部可見可改
--   3. 公會正/副會長：可讀寫自己公會（公會聯合戰管理需要）
--   4. 首頁資訊不受影響
--
-- 為什麼首頁不受影響：
--   首頁（/）的公會卡片只讀 `guilds` 表；每公會的煉痕數 / 填寫人數 /
--   最後更新時間來自 `get_home_page_stats()`（SECURITY DEFINER，讀
--   home_page_stats 快取），而且只有在登入後才顯示。
--   首頁完全不讀 `members`，所以把 members 收斂到「自己公會」不會影響它。
--
-- 為什麼可以移除舊的中文 policy：
--   線上 members 同時有舊的「登入者可閱讀 / 登入者可修改 / 管理員可刪除 /
--   管理員可新增」，其中前兩條的條件是 `true` —— 任何登入者都能讀取並修改
--   任何成員的資料，等於完全抵銷底下所有 policy，也是本次要修掉的主因。
--
-- 可重複執行。回滾方式見檔尾。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：目前登入者「所屬公會」清單（同一個 profile 可綁定多個成員）
--
-- 必須是 SECURITY DEFINER：policy 內若直接查 members 會自我遞迴（42P17）。
-- 回傳 SETOF text（而不是 text[]），policy 端就能寫成
--   guild_id IN (SELECT public.my_guild_ids())
-- 這是「不相關子查詢」，planner 會做成 hashed SubPlan，
-- 整個 statement 只執行一次（等價於 InitPlan，不會變成 per-row 呼叫）。
-- 沒有任何公會（未綁定 / 未登入）時回傳 0 列。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_guild_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.guild_id
  FROM public.current_profile() cp
  CROSS JOIN LATERAL unnest(string_to_array(COALESCE(cp.id, ''), ',')) AS b(mid)
  JOIN public.members m ON m.id = btrim(b.mid)
  WHERE m.guild_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.my_guild_ids() TO authenticated;

-- ------------------------------------------------------------
-- STEP 2：移除 members 的舊 policy
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "登入者可閱讀" ON public.members;
DROP POLICY IF EXISTS "登入者可修改" ON public.members;
DROP POLICY IF EXISTS "管理員可刪除" ON public.members;
DROP POLICY IF EXISTS "管理員可新增" ON public.members;

-- ------------------------------------------------------------
-- STEP 3：members 讀取
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "members_select_manager" ON public.members;
CREATE POLICY "members_select_manager"
  ON public.members
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_manager()));

DROP POLICY IF EXISTS "members_select_owner" ON public.members;
CREATE POLICY "members_select_owner"
  ON public.members
  FOR SELECT
  TO authenticated
  USING ((SELECT public.owns_member(id)));

-- 原本的 members_select_public（依 equipment_visibility 決定「列」是否可見）
-- 改成「同一公會才看得到」。欄位級的裝備隱私仍由
-- get_member_equipment() / column GRANT 負責，兩者職責切開。
DROP POLICY IF EXISTS "members_select_public" ON public.members;
DROP POLICY IF EXISTS "members_select_guild" ON public.members;
CREATE POLICY "members_select_guild"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (guild_id IN (SELECT public.my_guild_ids()));

-- ------------------------------------------------------------
-- STEP 4：members 寫入
--
-- INSERT：管理者，或本人（既有行為不變）
-- UPDATE：管理者 / 本人 / 自己公會的正副會長
--   * USING 限制「只能動自己公會的列」
--   * WITH CHECK 對幹部放寬到「只要具備幹部身分」，
--     這樣 MemberBoard 把成員「移出本公會」時才不會整批失敗
-- DELETE：僅管理者（前端封存走 archive_members_bulk RPC）
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
  USING (
    (SELECT public.is_manager())
    OR (SELECT public.owns_member(id))
    OR (
      guild_id IN (SELECT public.my_guild_ids())
      AND (SELECT public.can_edit_raid_record())
    )
  )
  WITH CHECK (
    (SELECT public.is_manager())
    OR (SELECT public.owns_member(id))
    OR (SELECT public.can_edit_raid_record())
  );

DROP POLICY IF EXISTS "members_delete" ON public.members;
CREATE POLICY "members_delete"
  ON public.members
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_manager()));

-- ------------------------------------------------------------
-- STEP 5：member_notes（成員備註 / 保留位 / 封存原因）
--
-- 線上原本只有一條 `僅限管理員存取成員賽季紀錄`(ALL, manager 以上)，
-- 導致公會正副會長在「公會聯合戰管理」存備註時被 RLS 拒絕。
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "僅限管理員存取成員賽季紀錄" ON public.member_notes;

DROP POLICY IF EXISTS "member_notes_select" ON public.member_notes;
CREATE POLICY "member_notes_select"
  ON public.member_notes
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_manager())
    OR (SELECT public.owns_member(member_id))
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_notes.member_id
        AND m.guild_id IN (SELECT public.my_guild_ids())
    )
  );

-- 新增 / 更新：管理者、本人、自己公會的正副會長
DROP POLICY IF EXISTS "member_notes_insert" ON public.member_notes;
CREATE POLICY "member_notes_insert"
  ON public.member_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_manager())
    OR (SELECT public.owns_member(member_id))
    OR (
      (SELECT public.can_edit_raid_record())
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = member_notes.member_id
          AND m.guild_id IN (SELECT public.my_guild_ids())
      )
    )
  );

DROP POLICY IF EXISTS "member_notes_update" ON public.member_notes;
CREATE POLICY "member_notes_update"
  ON public.member_notes
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_manager())
    OR (SELECT public.owns_member(member_id))
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_notes.member_id
        AND m.guild_id IN (SELECT public.my_guild_ids())
    )
  )
  WITH CHECK (
    (SELECT public.is_manager())
    OR (SELECT public.owns_member(member_id))
    OR (
      (SELECT public.can_edit_raid_record())
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = member_notes.member_id
          AND m.guild_id IN (SELECT public.my_guild_ids())
      )
    )
  );

DROP POLICY IF EXISTS "member_notes_delete" ON public.member_notes;
CREATE POLICY "member_notes_delete"
  ON public.member_notes
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_manager()) OR (SELECT public.owns_member(member_id)));

-- ------------------------------------------------------------
-- STEP 6：ghost_records（前公會成員紀錄，公會聯合戰管理會顯示）
--   讀取開放給已登入者（僅 member_id + season_number，低敏感），
--   寫入仍限管理者。
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "管理員可全權控制" ON public.ghost_records;
DROP POLICY IF EXISTS "ghost_records_select" ON public.ghost_records;
CREATE POLICY "ghost_records_select"
  ON public.ghost_records
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ghost_records_write" ON public.ghost_records;
CREATE POLICY "ghost_records_write"
  ON public.ghost_records
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_manager()))
  WITH CHECK ((SELECT public.is_manager()));

-- ------------------------------------------------------------
-- 驗證：
--   -- 1) 只剩預期中的 policy
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ('members','member_notes','ghost_records')
--    ORDER BY tablename, policyname;
--
--   -- 2) 模擬一般成員（把 <auth uid> 換成某位 user_role='member' 的 auth_id）
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SET LOCAL request.jwt.claims = '{"sub":"<auth uid>","role":"authenticated"}';
--     SELECT public.my_guild_ids() AS my_guilds;
--     SELECT count(*) AS visible_members FROM public.members;
--     SELECT count(DISTINCT guild_id) AS distinct_guilds FROM public.members;
--     ROLLBACK;
--   -- 預期：distinct_guilds = 1（或 0），且 visible_members 遠小於總數
-- ------------------------------------------------------------
-- 回滾（回到「全員可讀可改」的舊狀態）：
--   DROP POLICY IF EXISTS "members_select_guild" ON public.members;
--   CREATE POLICY "登入者可閱讀" ON public.members
--     FOR SELECT TO authenticated USING (true);
--   CREATE POLICY "登入者可修改" ON public.members
--     FOR UPDATE TO authenticated USING (true);
-- ------------------------------------------------------------

