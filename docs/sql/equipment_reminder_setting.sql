-- ============================================================
-- settings：新增「裝備表更新基準時間」欄位（equipment_reminder_at）
--
-- 用途（前端 kazran-alliance-manager）：
--   管理者在「網頁設定」設定一個時間點；裝備表（GuildDashboard）會把
--   更新時間早於此時間點的成員以脈動動畫高亮，並可一鍵請貝拉（Discord bot）
--   到該公會專區 Tag 這些成員，提醒他們回系統更新裝備表。
--
--   型別：bigint（epoch ms），與 members.updated_at / equipment_updated_at 一致。
--   NULL / 0 表示停用高亮。
--
-- 執行方式：Supabase 後台 → SQL Editor 整段執行（可重複執行）。
-- ============================================================

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS equipment_reminder_at bigint;

COMMENT ON COLUMN public.settings.equipment_reminder_at IS
  '裝備表更新基準時間（epoch ms）：成員的裝備表更新時間早於此值時會被高亮，並可請貝拉通知。NULL/0 表示停用。';

-- 前端需要讀取（顯示基準時間）與寫入（管理員儲存設定）
GRANT SELECT (equipment_reminder_at) ON public.settings TO anon, authenticated;
GRANT UPDATE (equipment_reminder_at) ON public.settings TO anon, authenticated;

-- ------------------------------------------------------------
-- 驗證：
--   SELECT id, equipment_reminder_at FROM public.settings;
-- ------------------------------------------------------------
