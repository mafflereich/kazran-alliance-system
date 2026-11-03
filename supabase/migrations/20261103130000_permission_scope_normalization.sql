-- ============================================================
-- 權限目錄對齊：raid.season.manage / mailbox.process 對 officer 改為 global
-- 2026-11-03
--
-- 原因：
--   * raid_seasons 沒有 guild_id，RLS 呼叫 has_permission() 時也不可能帶公會；
--     原本 officer 的 managed 授權在「不帶公會」時本來就會通過，等同全站生效。
--   * apply_mail 是全聯盟共用（沒有公會欄位），policy 也是不帶公會呼叫。
-- 這裡只把 DB 的 scope 正規化成與 src/shared/lib/permissions.ts 一致，
-- 不改變任何實際可做的事。
--
-- 可重複執行。
-- ============================================================

update public.role_grants
   set scope = 'global'
 where role = 'officer'
   and permission in ('raid.season.manage', 'mailbox.process')
   and scope <> 'global';
