-- ============================================================
-- Discord 成員名單快照（貝拉 GSD_Bella 的 GET /api/discordMembers）
--
-- 目的：把「抓整個伺服器成員」的結果持久化在 DB（單列 id = 1），
--       bot 重啟或多實例時都不必重新打 Discord API。
--       Discord 對 GUILD_MEMBERS 的請求有嚴格 rate limit，每次呼叫都抓一輪
--       很容易被限流（尤其有人連續按「重新抓取名單」）。
--
-- 讀寫者：只有 GSD_Bella（service_role）。前端一律走 bot 的
--         /api/discordMembers（那裡會驗 admin/creator 的 JWT）。
--
-- 可重複執行。
-- ============================================================

create table if not exists public.discord_member_snapshot (
  id           integer primary key default 1 check (id = 1),
  guild_id     text        not null,
  fetched_at   timestamptz not null default now(),
  member_count integer     not null default 0,
  -- { guildId, fetchedAt, memberCount, members: [...] }（bot 端原樣回傳）
  payload      jsonb       not null,
  updated_at   timestamptz not null default now()
);

comment on table public.discord_member_snapshot is
  'Discord 伺服器成員名單快照（單列 id=1）：由 GSD_Bella 以 service_role 寫入，避免重複呼叫 Discord API 撞 rate limit。';

alter table public.discord_member_snapshot enable row level security;

-- 只有 service_role 能存取；anon / authenticated 一律收回（RLS 又沒有 policy，
-- 所以即使拿得到 anon key 也讀不到名單）。
revoke all on table public.discord_member_snapshot from anon, authenticated;
grant select, insert, update, delete on table public.discord_member_snapshot to service_role;

-- 驗證：
--   select id, guild_id, fetched_at, member_count, jsonb_array_length(payload->'members') as members
--   from public.discord_member_snapshot;
