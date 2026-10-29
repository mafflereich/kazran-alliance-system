-- ============================================================
-- 效能：熱門資料表的索引
--
-- 症狀：公會頁 / 成員頁 / 戰記頁 / 系統日誌會出現
--       "canceling statement due to statement timeout" (57014)
--
-- 原因：除了 system_logs，其餘熱門表在版控中沒有任何索引定義；
--       資料量長大後每一次查詢都是 seq scan + sort。
--
-- 可重複執行。
-- 注意：Supabase migration 會包在 transaction 內，因此不能使用 CONCURRENTLY。
--       若線上資料量大、不想短暫鎖寫入，請改用 SQL Editor 逐條執行並自行加上
--       CONCURRENTLY（該語句必須單獨執行）。
-- ============================================================

-- 模糊搜尋（members.name ILIKE '%q%'）需要 trigram 索引才會走 index。
-- search_path 同時包含 extensions，讓 gin_trgm_ops 在「extension 裝在 public
-- 或 extensions」兩種 Supabase 環境都解析得到。
SET search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- members：公會頁（guild_id）、成員列表（status + name 排序）、搜尋
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_members_guild_status
  ON public.members (guild_id, status);

CREATE INDEX IF NOT EXISTS idx_members_status_name
  ON public.members (status, name);

CREATE INDEX IF NOT EXISTS idx_members_name_trgm
  ON public.members USING gin (name gin_trgm_ops);

-- ------------------------------------------------------------
-- 戰記：upsert 的 onConflict 需要 unique index；
--       有 (season_id, member_id) / (season_id, guild_id) 之後，
--       只查 season_id 的查詢也能吃到前綴，不必再建單欄索引。
--
-- 這裡用 DO 區塊「檢查是否已存在等價的唯一索引」，
-- 避免 IF NOT EXISTS 只看名字而重複建一份一模一樣的索引。
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'member_raid_records'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%(season_id, member_id)%'
  ) THEN
    CREATE UNIQUE INDEX uq_member_raid_records_season_member
      ON public.member_raid_records (season_id, member_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'guild_raid_records'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%(season_id, guild_id)%'
  ) THEN
    CREATE UNIQUE INDEX uq_guild_raid_records_season_guild
      ON public.guild_raid_records (season_id, guild_id);
  END IF;
END $$;

-- ------------------------------------------------------------
-- profiles：登入時以 auth_id / discord_id 查詢
-- （current_profile() 每次 request 都會用到）
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_auth_id
  ON public.profiles (auth_id);

CREATE INDEX IF NOT EXISTS idx_profiles_discord_id
  ON public.profiles (discord_id);

-- ------------------------------------------------------------
-- 系統日誌 / 申請信箱：列表查詢都是 ORDER BY created_at DESC
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at
  ON public.system_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_level_created_at
  ON public.system_logs (level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_apply_mail_created_at
  ON public.apply_mail (created_at DESC);

-- ------------------------------------------------------------
-- 其他常用外鍵
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_member_notes_member_id
  ON public.member_notes (member_id);

CREATE INDEX IF NOT EXISTS idx_ghost_records_member_id
  ON public.ghost_records (member_id);

CREATE INDEX IF NOT EXISTS idx_archive_history_member_id
  ON public.members_archive_history (member_id);

-- ------------------------------------------------------------
-- 讓 planner 立刻有新統計值（避免剛建完索引仍走舊計劃）
-- ------------------------------------------------------------
ANALYZE public.members;
ANALYZE public.member_raid_records;
ANALYZE public.guild_raid_records;
ANALYZE public.profiles;
ANALYZE public.system_logs;

-- ------------------------------------------------------------
-- 驗證：
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE schemaname = 'public'
--      AND tablename IN ('members','member_raid_records','guild_raid_records','profiles')
--    ORDER BY tablename, indexname;
--
--   EXPLAIN ANALYZE
--   SELECT id, name FROM public.members WHERE guild_id = '<guild id>';
--   -- 應為 Index Scan（idx_members_guild_status），不再是 Seq Scan
-- ------------------------------------------------------------
