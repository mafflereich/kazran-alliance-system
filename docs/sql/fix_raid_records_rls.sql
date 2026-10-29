-- ============================================================
-- 修正：公會聯合戰管理寫入時出現
--   new row violates row-level security policy for table "member_raid_records"
--
-- 【原因】
--   1) 這是 PostgreSQL 的 RLS（Row Level Security）錯誤，不是前端 JS
--      例外。錯誤字串中的「new row」代表失敗的是 INSERT
--      （或 UPDATE 的 WITH CHECK 檢查）。
--   2) 前端所有分數寫入都是 upsert
--      （src/features/raid/hooks/useRaidRecordEditor.ts 的
--        doAutoSave / handleBulkScoreFill，
--        src/features/raid/hooks/useSeasonManager.ts 的複製/封存賽季）：
--        supabase.from('member_raid_records')
--          .upsert(payload, { onConflict: 'season_id, member_id' })
--      當「該成員在本賽季還沒有資料列」時，upsert 會走 INSERT 分支；
--      若資料表沒有對應的 INSERT policy（只有 SELECT / UPDATE），
--      就會出現這個錯誤。頁面讀得到分數，代表 SELECT 是通的。
--   3) 另一個常見來源：前端自 2026-09 起把「公會正/副會長」視為
--      manager 放行 guild_raid_manager 頁面
--      （src/shared/lib/access.ts、src/store/index.tsx 的
--        managedGuildIds / canManageGuild），
--      但 DB 的 RLS 若仍只允許 profiles.user_role 屬於
--      (creator, admin, manager)，會長／副會長就會「能進頁面、
--      看得到資料，但一存檔就被 RLS 拒絕」。
--
-- 【本腳本做的事】
--   把 member_raid_records（以及同一寫入流程會用到的 guild_raid_records）
--   的 policy 重建為與前端一致的規則：
--     SELECT：
--       所有已登入使用者（戰記相關頁面都在 ProtectedRoute 後方）
--     INSERT / UPDATE / DELETE：
--       * creator / admin / manager（profiles.user_role）
--       * 公會正/副會長（members.role = leader / coleader）
--   註：公會幹部在 UI 上本來就能執行「賽季操作」——建立/封存賽季、
--   清除整個賽季的紀錄（useSeasonManager.handleArchiveSeason /
--   handleDeleteRecords 會一次寫入/更新所有公會的資料），
--   因此 DB 層對公會幹部採「可寫入整季」而非逐公會限制，
--   否則會長按下封存時，其他公會的資料列會被 RLS 擋下而整批失敗。
--
-- 【執行方式】
--   Supabase Dashboard → SQL Editor → 整段貼上執行。
--   可重複執行（policy 會先全部刪除再重建）。
--   執行前建議先跑 STEP 0 記錄目前的 policy，必要時可回滾。
-- ============================================================


-- ------------------------------------------------------------
-- STEP 0：診斷（只讀，不會修改資料）
-- ------------------------------------------------------------
-- 0-1 確認 RLS 是否啟用
-- SELECT relname, relrowsecurity
--   FROM pg_class
--  WHERE oid = 'public.member_raid_records'::regclass;

-- 0-2 看目前有哪些 policy（若 INSERT 那列是空的，就是本次錯誤主因）
-- SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'member_raid_records'
--  ORDER BY cmd, policyname;

-- 0-3 使用「發生錯誤的那個帳號」登入前台後，在瀏覽器 Console 執行：
--     await supabase.from('member_raid_records')
--       .upsert({ season_id: '<賽季id>', member_id: '<尚無紀錄的成員id>', score: 1 })
--       .select();
--     若仍回傳 RLS 訊息，代表 policy 尚未生效或身份解析不到。


-- ------------------------------------------------------------
-- STEP 1：身份解析 helpers
--
-- 與 docs/sql/rls_member_equipment_security.sql 的定義相同，
-- 這裡用 CREATE OR REPLACE 重建，讓本腳本可以獨立執行
-- （即使那份腳本尚未跑過也能運作，且可重複執行）。
-- 這些函式都是 SECURITY DEFINER，才能讀取受 RLS 保護的
-- profiles / members 表來判斷身份。
-- ※ 若線上環境的 current_profile() / is_manager() 已經存在但簽章不同，
--   這段 CREATE OR REPLACE 會報錯；此時請跳過 STEP 1，
--   只執行 STEP 2 之後（後續 policy 只依賴 is_manager() 與
--   本腳本新增的 is_guild_officer() / can_edit_raid_record()）。
-- ------------------------------------------------------------

-- 目前登入者的 Discord snowflake（沒有則 NULL）
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

-- 目前登入者對應的 profile（id、user_role、discord_id）
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS TABLE (id text, user_role text, discord_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_role, p.discord_id::text
  FROM profiles p
  WHERE p.auth_id::text = auth.uid()::text
     OR p.id::text = auth.uid()::text
     OR p.discord_id::text = public.current_discord_id()
  LIMIT 1;
$$;

-- 目前登入者是否為管理者（creator / admin / manager）
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.current_profile() cp
    WHERE cp.user_role IN ('creator', 'admin', 'manager')
  );
$$;

-- 目前登入者是否為公會正/副會長（任一公會）。
-- profiles.id 對 Discord 使用者是逗號分隔的 member_id 清單，
-- 因此用 string_to_array + unnest 逐一比對 members.role。
CREATE OR REPLACE FUNCTION public.is_guild_officer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.current_profile() cp
    CROSS JOIN LATERAL unnest(string_to_array(COALESCE(cp.id, ''), ',')) AS bound(member_id)
    JOIN public.members m ON m.id = btrim(bound.member_id)
    WHERE m.role IN ('leader', 'coleader')
      AND m.guild_id IS NOT NULL
  );
$$;

-- 是否可以編輯戰記資料（member_raid_records / guild_raid_records）：
--   管理者（creator / admin / manager）或 公會正/副會長。
--   與前端 canUserAccessGuildPage('guild_raid_manager') 的判斷一致：
--   公會正/副會長視同 manager，因此必須也能在 DB 層寫入，
--   否則就會出現「頁面進得去、分數存不進去」的 RLS 錯誤。
CREATE OR REPLACE FUNCTION public.can_edit_raid_record()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_manager() OR public.is_guild_officer();
$$;

GRANT EXECUTE ON FUNCTION public.current_discord_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_guild_officer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_raid_record() TO authenticated;


-- ------------------------------------------------------------
-- STEP 2：重建 member_raid_records 的 RLS policy
--
-- 先把這張表上「所有既有 policy」刪掉，避免舊的、只允許
-- creator/admin/manager 的 policy 繼續存在而造成混淆；
-- 再建立一組完整、與前端權限一致的 policy。
-- ------------------------------------------------------------

ALTER TABLE public.member_raid_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'member_raid_records'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.member_raid_records', p.policyname);
  END LOOP;
END $$;

-- 讀取：所有已登入者（MemberBoard、戰記頁、統計彈窗都要讀分數）。
-- 戰記相關頁面全部包在 ProtectedRoute 內，因此不需要開放 anon；
-- 若之後有公開頁面要讀，再把 anon 加進 TO 清單即可。
CREATE POLICY "member_raid_records_select"
  ON public.member_raid_records
  FOR SELECT
  TO authenticated
  USING (true);

-- 新增：本次錯誤的關鍵。沒有這條 policy 時，
-- 對「本賽季還沒有資料列」的成員存分數（upsert 走 INSERT）必定失敗。
CREATE POLICY "member_raid_records_insert"
  ON public.member_raid_records
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_raid_record());

-- 更新：upsert 命中既有資料列時走這條
-- （USING 檢查舊資料列、WITH CHECK 檢查新資料列，兩者都要通過）。
CREATE POLICY "member_raid_records_update"
  ON public.member_raid_records
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_raid_record())
  WITH CHECK (public.can_edit_raid_record());

-- 刪除：目前前端沒有用到，仍保留給管理者/公會幹部做資料整理。
CREATE POLICY "member_raid_records_delete"
  ON public.member_raid_records
  FOR DELETE
  TO authenticated
  USING (public.can_edit_raid_record());


-- ------------------------------------------------------------
-- STEP 3：重建 guild_raid_records 的 RLS policy
--
-- 分數存檔後，前端會立刻 upsert guild_raid_records 重算中位數
-- （useRaidRecordEditor.updateGuildMedian）。若這張表也只有
-- manager 才能寫，修好 member_raid_records 之後會緊接著在這裡
-- 出現同樣的 RLS 錯誤，因此一併修正。
-- ------------------------------------------------------------

ALTER TABLE public.guild_raid_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'guild_raid_records'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.guild_raid_records', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "guild_raid_records_select"
  ON public.guild_raid_records
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "guild_raid_records_insert"
  ON public.guild_raid_records
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_raid_record());

CREATE POLICY "guild_raid_records_update"
  ON public.guild_raid_records
  FOR UPDATE
  TO authenticated
  USING (public.can_edit_raid_record())
  WITH CHECK (public.can_edit_raid_record());

CREATE POLICY "guild_raid_records_delete"
  ON public.guild_raid_records
  FOR DELETE
  TO authenticated
  USING (public.can_edit_raid_record());


-- ------------------------------------------------------------
-- STEP 4：補齊資料表權限
--
-- RLS 是「資料列」層的檢查，還需要 table 層的 GRANT 才會生效。
-- 一般 Supabase 專案預設就有這些權限，這裡明確補上以免環境差異。
-- ------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_raid_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guild_raid_records TO authenticated;


-- ------------------------------------------------------------
-- STEP 5：驗證
-- ------------------------------------------------------------

-- 5-1 RLS 已啟用、policy 數量正確
-- SELECT relname, relrowsecurity
--   FROM pg_class
--  WHERE oid IN ('public.member_raid_records'::regclass, 'public.guild_raid_records'::regclass);

-- SELECT tablename, cmd, policyname
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('member_raid_records', 'guild_raid_records')
--  ORDER BY tablename, cmd;
-- 預期：兩張表各有 SELECT / INSERT / UPDATE / DELETE 四條 policy。

-- 5-2 確認「發生錯誤的那個帳號」身份解析正確
--     （用該帳號登入前台後，在瀏覽器 Console 執行）：
--   await supabase.from('member_raid_records')
--     .upsert({ season_id: <賽季id>, member_id: '<成員id>', score: 100 },
--             { onConflict: 'season_id, member_id' })
--     .select();
--   預期：回傳該筆資料，error 為 null。

-- 5-3 端到端驗證：回到「公會聯合戰管理」，對一個本賽季尚無紀錄的成員
--     輸入分數 → 應成功寫入，該公會的中位數列同步更新，錯誤橫幅消失。


-- ------------------------------------------------------------
-- 備註
--   1) service_role / postgres（Supabase 後端、Edge Function）具
--      BYPASSRLS，不受本腳本影響；raid-api 仍可正常寫入。
--   2) 若之後換成別的表（例如 raid_seasons）出現同樣的
--      "new row violates row-level security policy" 訊息，代表那張表
--      的 policy 也需要比照「管理者 + 公會正/副會長」重建。
--   3) 若想收緊成「只有管理者能寫」，把 policy 內的
--      public.can_edit_raid_record() 改成 public.is_manager() 即可，
--      但這樣公會正/副會長就無法再從前台存分數。
-- ------------------------------------------------------------



