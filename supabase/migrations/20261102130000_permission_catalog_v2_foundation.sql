-- ============================================================
-- 權限系統 v2：單一能力目錄（Phase 1 foundation）
-- 2026-11-02
--
-- 這支 migration 只「新增」資料表與函式，不改任何現有 policy，
-- 因此對目前行為零影響（見 docs/plans/2026-11-02-permissions-v2.md §7）。
--
-- 內容：
--   1) permissions / role_grants / user_grants / permission_meta
--   2) my_roles() / has_permission() / my_permissions() / get_my_access()
--   3) 由 permissions.ts 產生的 seed（GENERATED 區塊）
--   4) 把現有 access_control 等價遷移成 role_grants（保留所有自訂）
--
-- 依賴（已存在於先前 migration / 遠端 DB）：
--   public.current_profile()、public.my_managed_guild_ids()、public.my_member_ids()
--
-- 可重複執行；建議在單一 transaction 內執行（scripts/apply-sql.mjs 已這樣做）。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：資料表
-- ------------------------------------------------------------
create table if not exists public.permissions (
  key          text primary key,
  domain       text not null,
  needs_guild  boolean not null default false,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);

create table if not exists public.role_grants (
  role        text not null check (role in ('member', 'manager', 'officer', 'admin')),
  permission  text not null references public.permissions(key) on delete cascade,
  scope       text not null default 'global' check (scope in ('global', 'managed')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (role, permission)
);

-- 例外授權（Phase 4 才會有 UI；先建表讓 resolver 一次寫完）
create table if not exists public.user_grants (
  id            uuid primary key default gen_random_uuid(),
  user_auth_id  uuid not null,
  permission    text not null references public.permissions(key) on delete cascade,
  effect        text not null check (effect in ('allow', 'deny')),
  guild_id      text,
  expires_at    timestamptz,
  reason        text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (user_auth_id, permission, guild_id, effect)
);
comment on column public.user_grants.guild_id is
  'NULL = 全站；有值 = 只在那個公會。刻意不加 FK，避免公會刪除時連帶清掉稽核資料。';

create table if not exists public.permission_meta (
  id          integer primary key default 1 check (id = 1),
  version     bigint not null default 1,
  updated_at  timestamptz not null default now()
);
insert into public.permission_meta (id) values (1) on conflict do nothing;

-- ------------------------------------------------------------
-- STEP 2：版本號（前端用 version 判斷是否要重抓）
-- ------------------------------------------------------------
create or replace function public.bump_permission_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.permission_meta
     set version = version + 1, updated_at = now()
   where id = 1;
  return null;
end;
$$;

revoke all on function public.bump_permission_version() from public;

drop trigger if exists role_grants_bump on public.role_grants;
create trigger role_grants_bump
  after insert or update or delete on public.role_grants
  for each statement execute function public.bump_permission_version();

drop trigger if exists user_grants_bump on public.user_grants;
create trigger user_grants_bump
  after insert or update or delete on public.user_grants
  for each statement execute function public.bump_permission_version();

-- ------------------------------------------------------------
-- STEP 3：RLS（目錄與授權可讀；只有 admin/creator 可寫）
-- ------------------------------------------------------------
alter table public.permissions     enable row level security;
alter table public.role_grants     enable row level security;
alter table public.user_grants     enable row level security;
alter table public.permission_meta enable row level security;

drop policy if exists "permissions_read" on public.permissions;
create policy "permissions_read" on public.permissions
  for select to authenticated using (true);

drop policy if exists "role_grants_read" on public.role_grants;
create policy "role_grants_read" on public.role_grants
  for select to authenticated using (true);

drop policy if exists "permission_meta_read" on public.permission_meta;
create policy "permission_meta_read" on public.permission_meta
  for select to authenticated using (true);

drop policy if exists "role_grants_admin_write" on public.role_grants;
create policy "role_grants_admin_write" on public.role_grants
  for all to authenticated
  using (
    exists (select 1 from public.current_profile() cp where cp.user_role in ('creator', 'admin'))
  )
  with check (
    exists (select 1 from public.current_profile() cp where cp.user_role in ('creator', 'admin'))
  );

drop policy if exists "user_grants_admin_all" on public.user_grants;
create policy "user_grants_admin_all" on public.user_grants
  for all to authenticated
  using (
    exists (select 1 from public.current_profile() cp where cp.user_role in ('creator', 'admin'))
  )
  with check (
    exists (select 1 from public.current_profile() cp where cp.user_role in ('creator', 'admin'))
  );

-- ------------------------------------------------------------
-- STEP 4：解析函式（唯一真相）
--   規則：
--     1) admin 一律放行（唯一硬規則）
--     2) 其餘角色只看 role_grants
--     3) scope = managed → 需 p_guild_id ∈ my_managed_guild_ids()
--     4) 不帶 p_guild_id = 「任何地方都可以嗎？」（只給選單/路由）
--     5) user_grants：deny 優先，支援到期
-- ------------------------------------------------------------
create or replace function public.my_roles()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(r), '{}')
  from (
    select 'member'::text as r
     where exists (select 1 from public.current_profile())
    union
    select 'manager'
     where exists (
       select 1 from public.current_profile() cp where cp.user_role = 'manager'
     )
    union
    select 'officer'
     where exists (select 1 from public.my_managed_guild_ids())
    union
    select 'admin'
     where exists (
       select 1 from public.current_profile() cp where cp.user_role in ('creator', 'admin')
     )
  ) t;
$$;

create or replace function public.has_permission(
  p_permission text,
  p_guild_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select public.my_roles() as roles,
           array(select public.my_managed_guild_ids()) as guild_ids
  ),
  granted as (
    select 1
    from public.role_grants rg, me
    where rg.permission = p_permission
      and rg.role = any(me.roles)
      and (
        rg.scope = 'global'
        -- managed：帶公會就比對；沒帶公會 = 「任何一個我管理的公會都可以嗎？」
        or (rg.scope = 'managed' and (
              (p_guild_id is null and cardinality(me.guild_ids) > 0)
              or (p_guild_id is not null and p_guild_id = any(me.guild_ids))
        ))
      )
  ),
  denied as (
    select 1
    from public.user_grants ug
    where ug.user_auth_id = auth.uid()
      and ug.permission = p_permission
      and ug.effect = 'deny'
      and (ug.guild_id is null or ug.guild_id = p_guild_id)
      and (ug.expires_at is null or ug.expires_at > now())
  ),
  allowed as (
    select 1
    from public.user_grants ug
    where ug.user_auth_id = auth.uid()
      and ug.permission = p_permission
      and ug.effect = 'allow'
      and (ug.guild_id is null or ug.guild_id = p_guild_id)
      and (ug.expires_at is null or ug.expires_at > now())
  )
  select
    ('admin' = any(me.roles))
    or exists (select 1 from allowed)
    or (exists (select 1 from granted) and not exists (select 1 from denied))
  from me;
$$;

create or replace function public.my_permissions(p_guild_id text default null)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when 'admin' = any(public.my_roles())
      then (select coalesce(array_agg(key order by key), '{}') from public.permissions)
    else (
      select coalesce(array_agg(distinct rg.permission), '{}')
      from public.role_grants rg
      where rg.role = any(public.my_roles())
        and (
          rg.scope = 'global'
          or (p_guild_id is not null and p_guild_id in (select public.my_managed_guild_ids()))
        )
    )
  end;
$$;

create or replace function public.get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select public.my_roles() as roles,
           array(select public.my_managed_guild_ids()) as guild_ids
  )
  select jsonb_build_object(
    'roles', to_jsonb(me.roles),
    'isAdmin', 'admin' = any(me.roles),
    'managedGuildIds', to_jsonb(me.guild_ids),
    -- 我所屬的公會（成員綁定），給「manager 只看自己公會」這類需求用
    'memberGuildIds', to_jsonb(array(select public.my_guild_ids())),
    'globalPermissions', coalesce((
      select jsonb_agg(distinct rg.permission)
      from public.role_grants rg
      where rg.role = any(me.roles) and rg.scope = 'global'
    ), '[]'::jsonb),
    'managedPermissions', coalesce((
      select jsonb_agg(distinct rg.permission)
      from public.role_grants rg
      where rg.role = any(me.roles) and rg.scope = 'managed'
    ), '[]'::jsonb),
    'version', coalesce((select version from public.permission_meta where id = 1), 1)
  )
  from me;
$$;

grant execute on function public.my_roles() to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;
grant execute on function public.my_permissions(text) to authenticated;
grant execute on function public.get_my_access() to authenticated;

-- ------------------------------------------------------------
-- STEP 4.1：Phase 1 期間的雙寫（後台「存取控制」仍寫 access_control）
--
--   舊 UI 只會寫 access_control；但 Phase 1 的頁面判斷已改讀 role_grants，
--   所以存檔時必須同步一份，否則管理員會「存了沒效果」。
--   SECURITY INVOKER：沿用 role_grants 的 admin-only RLS，不另外放行。
-- ------------------------------------------------------------
create or replace function public.set_page_roles(p_page text, p_roles text[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_permission text;
begin
  v_permission := case p_page
    when 'costume_list'         then 'page.equipment.view'
    when 'my_costumes'          then 'page.my_costumes.view'
    when 'application_mailbox'  then 'page.mailbox.view'
    when 'arcade'               then 'page.arcade.view'
    when 'toolbox'              then 'page.toolbox.view'
    when 'guild_raid_manager'   then 'page.raid_manage.view'
    when 'admin_settings'       then 'page.admin.view'
    when 'alliance_raid_record' then 'page.raid.view'
    else null
  end;

  -- member_board 是 adminOnly，舊設定一律忽略（與 access.ts 一致）
  if v_permission is null or p_page = 'member_board' then
    return;
  end if;

  delete from public.role_grants
   where permission = v_permission
     and role <> 'admin';

  insert into public.role_grants (role, permission, scope)
  select distinct
         case when u.role = 'creator' then 'admin' else u.role end,
         v_permission,
         'global'
  from unnest(p_roles) as u(role)
  where u.role in ('member', 'manager', 'admin', 'creator')
  on conflict (role, permission) do update set scope = excluded.scope;

  -- 公會級頁面：MANAGER 有勾 → 幹部視同 manager
  if p_page = 'guild_raid_manager' and 'manager' = any(p_roles) then
    insert into public.role_grants (role, permission, scope)
    values ('officer', v_permission, 'managed')
    on conflict (role, permission) do nothing;
  end if;
end;
$$;

grant execute on function public.set_page_roles(text, text[]) to authenticated;

-- ------------------------------------------------------------
-- STEP 5：目錄 + 預設授權
--   這一區由 `npm run db:catalog:write` 從
--   src/shared/lib/permissions.ts 產生，請不要手改。
--   `npm run db:catalog:check` 會在 CI 檢查 drift。
-- ------------------------------------------------------------
-- >>> GENERATED:permissions
insert into public.permissions (key, domain, needs_guild, sort_order) values
  ('page.equipment.view', 'page', false, 10),
  ('page.my_costumes.view', 'page', false, 20),
  ('page.mailbox.view', 'page', false, 30),
  ('page.arcade.view', 'page', false, 40),
  ('page.toolbox.view', 'page', false, 50),
  ('page.raid.view', 'page', false, 60),
  ('page.raid_manage.view', 'page', false, 70),
  ('page.member_board.view', 'page', false, 80),
  ('page.admin.view', 'page', false, 90),
  ('equipment.read.managed', 'equipment', true, 100),
  ('equipment.read.staff', 'equipment', false, 110),
  ('equipment.write.self', 'equipment', false, 120),
  ('equipment.visibility.configure', 'equipment', false, 130),
  ('member.edit.managed', 'member', true, 140),
  ('member.archive', 'member', false, 150),
  ('member.note.write.managed', 'member', true, 160),
  ('raid.score.write', 'raid', true, 170),
  ('raid.season.manage', 'raid', false, 180),
  ('raid.ghost.manage', 'raid', true, 190),
  ('raid.roster.move', 'raid', true, 200),
  ('raid.checkin.write', 'raid', true, 210),
  ('mailbox.process', 'mailbox', false, 220),
  ('admin.guild.manage', 'admin', false, 230),
  ('admin.costume.manage', 'admin', false, 240),
  ('admin.identity.manage', 'admin', false, 250),
  ('admin.logs.read', 'admin', false, 260),
  ('admin.tools.run', 'admin', false, 270),
  ('admin.settings.manage', 'admin', false, 280),
  ('admin.permission.manage', 'admin', false, 290),
  ('admin.role.assign', 'admin', false, 300),
  ('admin.archive.read', 'admin', false, 310),
  ('arcade.speed_refining.use', 'arcade', false, 320)
on conflict (key) do update
  set domain = excluded.domain,
      needs_guild = excluded.needs_guild,
      sort_order = excluded.sort_order;

insert into public.role_grants (role, permission, scope) values
  ('member', 'page.equipment.view', 'global'),
  ('manager', 'page.equipment.view', 'global'),
  ('officer', 'page.equipment.view', 'global'),
  ('admin', 'page.equipment.view', 'global'),
  ('member', 'page.my_costumes.view', 'global'),
  ('manager', 'page.my_costumes.view', 'global'),
  ('officer', 'page.my_costumes.view', 'global'),
  ('admin', 'page.my_costumes.view', 'global'),
  ('member', 'page.mailbox.view', 'global'),
  ('manager', 'page.mailbox.view', 'global'),
  ('officer', 'page.mailbox.view', 'global'),
  ('admin', 'page.mailbox.view', 'global'),
  ('manager', 'page.arcade.view', 'global'),
  ('admin', 'page.arcade.view', 'global'),
  ('manager', 'page.toolbox.view', 'global'),
  ('admin', 'page.toolbox.view', 'global'),
  ('manager', 'page.raid.view', 'global'),
  ('officer', 'page.raid.view', 'managed'),
  ('admin', 'page.raid.view', 'global'),
  ('manager', 'page.raid_manage.view', 'global'),
  ('officer', 'page.raid_manage.view', 'managed'),
  ('admin', 'page.raid_manage.view', 'global'),
  ('admin', 'page.member_board.view', 'global'),
  ('admin', 'page.admin.view', 'global'),
  ('officer', 'equipment.read.managed', 'managed'),
  ('admin', 'equipment.read.managed', 'global'),
  ('manager', 'equipment.read.staff', 'global'),
  ('admin', 'equipment.read.staff', 'global'),
  ('member', 'equipment.write.self', 'global'),
  ('manager', 'equipment.write.self', 'global'),
  ('officer', 'equipment.write.self', 'global'),
  ('admin', 'equipment.write.self', 'global'),
  ('member', 'equipment.visibility.configure', 'global'),
  ('manager', 'equipment.visibility.configure', 'global'),
  ('officer', 'equipment.visibility.configure', 'global'),
  ('admin', 'equipment.visibility.configure', 'global'),
  ('admin', 'member.edit.managed', 'global'),
  ('admin', 'member.archive', 'global'),
  ('officer', 'member.note.write.managed', 'managed'),
  ('admin', 'member.note.write.managed', 'global'),
  ('officer', 'raid.score.write', 'managed'),
  ('admin', 'raid.score.write', 'global'),
  ('officer', 'raid.season.manage', 'global'),
  ('admin', 'raid.season.manage', 'global'),
  ('officer', 'raid.ghost.manage', 'managed'),
  ('admin', 'raid.ghost.manage', 'global'),
  ('officer', 'raid.roster.move', 'managed'),
  ('admin', 'raid.roster.move', 'global'),
  ('officer', 'raid.checkin.write', 'managed'),
  ('admin', 'raid.checkin.write', 'global'),
  ('officer', 'mailbox.process', 'global'),
  ('admin', 'mailbox.process', 'global'),
  ('admin', 'admin.guild.manage', 'global'),
  ('admin', 'admin.costume.manage', 'global'),
  ('admin', 'admin.identity.manage', 'global'),
  ('admin', 'admin.logs.read', 'global'),
  ('admin', 'admin.tools.run', 'global'),
  ('admin', 'admin.settings.manage', 'global'),
  ('admin', 'admin.permission.manage', 'global'),
  ('admin', 'admin.role.assign', 'global'),
  ('manager', 'admin.archive.read', 'global'),
  ('admin', 'admin.archive.read', 'global'),
  ('manager', 'arcade.speed_refining.use', 'global'),
  ('admin', 'arcade.speed_refining.use', 'global')
on conflict (role, permission) do update set scope = excluded.scope;

-- 清掉目錄已不存在的權限
delete from public.permissions p
where p.key not in (
  'page.equipment.view',
  'page.my_costumes.view',
  'page.mailbox.view',
  'page.arcade.view',
  'page.toolbox.view',
  'page.raid.view',
  'page.raid_manage.view',
  'page.member_board.view',
  'page.admin.view',
  'equipment.read.managed',
  'equipment.read.staff',
  'equipment.write.self',
  'equipment.visibility.configure',
  'member.edit.managed',
  'member.archive',
  'member.note.write.managed',
  'raid.score.write',
  'raid.season.manage',
  'raid.ghost.manage',
  'raid.roster.move',
  'raid.checkin.write',
  'mailbox.process',
  'admin.guild.manage',
  'admin.costume.manage',
  'admin.identity.manage',
  'admin.logs.read',
  'admin.tools.run',
  'admin.settings.manage',
  'admin.permission.manage',
  'admin.role.assign',
  'admin.archive.read',
  'arcade.speed_refining.use'
);

-- <<< GENERATED:permissions

-- ------------------------------------------------------------
-- STEP 6：把現有 access_control 等價遷移成 role_grants
--
--   access_control（Phase 0 已驗證）只有 page / roles / created_at / updated_at，
--   所以只能表達「頁面 → 角色」，這裡就照它的語意搬家：
--     * 有自訂列（存在該 page）→ 先清掉該權限的非 admin 預設，再照 roles 重建
--     * creator 併入 admin（resolver 只看 admin）
--     * member_board 在舊程式是 adminOnly，忽略其自訂列（與現況一致）
--     * 公會級頁面：舊規則「MANAGER 有勾 → 幹部視同 manager」→ 補 officer 的 managed 授權
--
--   注意：access_control 在 repo 內沒有 DDL，但 Phase 0 已用 Management API
--   確認它存在且欄位如上；若在別的環境不存在，這段會直接報錯（可安全回滾）。
-- ------------------------------------------------------------
delete from public.role_grants rg
using public.access_control ac, (values
  ('costume_list',         'page.equipment.view'),
  ('my_costumes',          'page.my_costumes.view'),
  ('application_mailbox',  'page.mailbox.view'),
  ('arcade',               'page.arcade.view'),
  ('toolbox',              'page.toolbox.view'),
  ('guild_raid_manager',   'page.raid_manage.view'),
  ('member_board',         'page.member_board.view'),
  ('admin_settings',       'page.admin.view'),
  ('alliance_raid_record', 'page.raid.view')
) as m(page_id, permission)
where ac.page = m.page_id
  and ac.page <> 'member_board'
  and rg.permission = m.permission
  and rg.role <> 'admin';

insert into public.role_grants (role, permission, scope)
select distinct
  case when u.role = 'creator' then 'admin' else u.role end,
  m.permission,
  'global'
from public.access_control ac
cross join lateral unnest(ac.roles) as u(role)
join (values
  ('costume_list',         'page.equipment.view'),
  ('my_costumes',          'page.my_costumes.view'),
  ('application_mailbox',  'page.mailbox.view'),
  ('arcade',               'page.arcade.view'),
  ('toolbox',              'page.toolbox.view'),
  ('guild_raid_manager',   'page.raid_manage.view'),
  ('member_board',         'page.member_board.view'),
  ('admin_settings',       'page.admin.view'),
  ('alliance_raid_record', 'page.raid.view')
) as m(page_id, permission) on m.page_id = ac.page
where ac.page <> 'member_board'
  and u.role in ('member', 'manager', 'admin', 'creator')
on conflict (role, permission) do update set scope = excluded.scope;

-- 公會級頁面的幹部特例（只有 MANAGER 有勾時才成立）
insert into public.role_grants (role, permission, scope)
select distinct 'officer', m.permission, 'managed'
from public.access_control ac
cross join lateral unnest(ac.roles) as u(role)
join (values
  ('guild_raid_manager', 'page.raid_manage.view'),
  ('alliance_raid_record', 'page.raid.view')
) as m(page_id, permission) on m.page_id = ac.page
where u.role = 'manager'
on conflict (role, permission) do nothing;

-- 註：access_control 另有兩個歷史資料，刻意不搬：
--   * team_assign_board：舊 page id（程式已改用 member_board），不屬於任何權限
--   * member_board 的自訂列：舊程式是 adminOnly，忽略設定（與現況一致）

-- ------------------------------------------------------------
-- STEP 7：Phase 1 驗收（手動執行，應回傳 0 列）
--
--   select m.page_id, r.role,
--          (r.role = any(coalesce(ac.roles, '{}'))) as legacy_allowed,
--          exists (select 1 from public.role_grants rg
--                  where rg.permission = m.permission and rg.role = r.role) as new_allowed
--   from (values
--     ('costume_list','page.equipment.view'), ('my_costumes','page.my_costumes.view'),
--     ('application_mailbox','page.mailbox.view'), ('arcade','page.arcade.view'),
--     ('toolbox','page.toolbox.view'), ('guild_raid_manager','page.raid_manage.view'),
--     ('admin_settings','page.admin.view')
--   ) as m(page_id, permission)
--   left join public.access_control ac on ac.page = m.page_id
--   cross join (values ('member'),('manager'),('admin')) as r(role)
--   where (r.role = any(coalesce(ac.roles, '{}'))) is distinct from
--         exists (select 1 from public.role_grants rg
--                 where rg.permission = m.permission and rg.role = r.role);
-- ------------------------------------------------------------


