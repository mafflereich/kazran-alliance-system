-- ============================================================
-- 權限接線：把目錄裡「尚未接線」的 key 全部補上實際檢查點
-- 2026-11-03
--
-- 目標：每個 key 至少有一個前端或資料庫檢查；預設授權不變 ⇒ 行為不變。
-- 內容：
--   1. equipment.read.managed / equipment.read.staff → get_member_equipment* + can_view_equipment
--   2. equipment.write.self / equipment.visibility.configure → members 裝備 guard trigger
--   3. member.edit.managed → members UPDATE policy + 身分欄位 trigger
--   4. member.archive → archive_members_bulk() + 身分欄位 trigger
--   5. member.note.write.managed → member_notes policies
--   6. admin.permission.manage → role_grants / user_grants policies
--   7. admin.tools.run → restore_members_snapshot()
--   8. admin.logs.read → system_logs SELECT policy
--   9. admin.settings.manage → settings 寫入 policy
--  10. admin.identity.manage / admin.role.assign → profiles trigger + UPDATE policy
--  11. admin.archive.read → members_archive_history SELECT policy
--  12. arcade.speed_refining.use → lb_speedrefining 寫入 policy
--
-- 可重複執行。
-- ============================================================

-- ------------------------------------------------------------
-- 0) 新增權限：admin.archive.read（封存成員紀錄，讀取）
--    只影響既有環境；新環境由 20261102130000 的 generated seed 建立。
-- ------------------------------------------------------------
insert into public.permissions (key, domain, needs_guild, sort_order)
values ('admin.archive.read', 'admin', false, 310)
on conflict (key) do update
  set domain = excluded.domain,
      needs_guild = excluded.needs_guild,
      sort_order = excluded.sort_order;

insert into public.role_grants (role, permission, scope) values
  ('manager', 'admin.archive.read', 'global'),
  ('admin', 'admin.archive.read', 'global')
on conflict (role, permission) do update set scope = excluded.scope;

-- ------------------------------------------------------------
-- 1) 裝備讀取：保留原函式，外加一層權限過濾（不允許時只回 null 欄位）
-- ------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.get_member_equipment(text[],text)') is not null
     and to_regprocedure('public.get_member_equipment_unscoped(text[],text)') is null then
    alter function public.get_member_equipment(text[], text) rename to get_member_equipment_unscoped;
  end if;
  if to_regprocedure('public.get_member_equipment_showcase(text[],text)') is not null
     and to_regprocedure('public.get_member_equipment_showcase_unscoped(text[],text)') is null then
    alter function public.get_member_equipment_showcase(text[], text) rename to get_member_equipment_showcase_unscoped;
  end if;
end $$;

-- 原函式改名後仍保留 ACL；必須收回，避免有人直接呼叫未過濾版本
do $$
begin
  if to_regprocedure('public.get_member_equipment_unscoped(text[],text)') is not null then
    execute 'revoke all on function public.get_member_equipment_unscoped(text[], text) from public';
    execute 'revoke all on function public.get_member_equipment_unscoped(text[], text) from authenticated';
  end if;
  if to_regprocedure('public.get_member_equipment_showcase_unscoped(text[],text)') is not null then
    execute 'revoke all on function public.get_member_equipment_showcase_unscoped(text[], text) from public';
    execute 'revoke all on function public.get_member_equipment_showcase_unscoped(text[], text) from authenticated';
  end if;
end $$;

create or replace function public.can_view_equipment(p_member_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vis text;
  v_guild text;
begin
  if public.owns_member(p_member_id) then
    return true;
  end if;

  select equipment_visibility, guild_id into v_vis, v_guild
  from members where id = p_member_id;

  return case public.normalize_equipment_visibility(v_vis)
    when 'all_manager' then
      public.is_manager() and public.has_permission('equipment.read.staff')
    else
      public.is_guild_manager_of(v_guild)
      and public.has_permission('equipment.read.managed', v_guild)
  end;
end;
$$;

grant execute on function public.can_view_equipment(text) to authenticated;

create or replace function public.get_member_equipment(
  p_member_ids text[] default null,
  p_guild_id text default null
)
returns table(id text, equipment jsonb, records jsonb, exclusive_weapons jsonb, refining_traces integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select * from public.get_member_equipment_unscoped(p_member_ids, p_guild_id)
  ),
  allowed as (
    select
      b.*,
      m.guild_id,
      public.normalize_equipment_visibility(m.equipment_visibility) as vis,
      public.owns_member(b.id) as owns_member
    from base b
    join public.members m on m.id = b.id
  ),
  gated as (
    select
      a.*,
      (
        a.owns_member
        or auth.uid() is null
        or public.is_global_admin()
        or (a.vis = 'all_manager' and public.has_permission('equipment.read.staff'))
        or (a.vis <> 'all_manager' and public.has_permission('equipment.read.managed', a.guild_id))
      ) as ok
    from allowed a
  )
  select
    g.id,
    case when g.ok then g.equipment else null end as equipment,
    case when g.ok then g.records else null end as records,
    case when g.ok then g.exclusive_weapons else null end as exclusive_weapons,
    case when g.ok then g.refining_traces else null end as refining_traces
  from gated g
  order by g.id;
$$;

grant execute on function public.get_member_equipment(text[], text) to authenticated;

create or replace function public.get_member_equipment_showcase(
  p_member_ids text[] default null,
  p_guild_id text default null
)
returns table(id text, venom_serpent_c24 integer, chief_majesty_c24 integer, guardian_scale_c24 integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select * from public.get_member_equipment_showcase_unscoped(p_member_ids, p_guild_id)
  ),
  allowed as (
    select
      b.*,
      m.guild_id,
      public.normalize_equipment_visibility(m.equipment_visibility) as vis,
      public.owns_member(b.id) as owns_member
    from base b
    join public.members m on m.id = b.id
  ),
  gated as (
    select
      a.*,
      (
        a.owns_member
        or auth.uid() is null
        or public.is_global_admin()
        or (a.vis = 'all_manager' and public.has_permission('equipment.read.staff'))
        or (a.vis <> 'all_manager' and public.has_permission('equipment.read.managed', a.guild_id))
      ) as ok
    from allowed a
  )
  select
    g.id,
    case when g.ok then g.venom_serpent_c24 else null end as venom_serpent_c24,
    case when g.ok then g.chief_majesty_c24 else null end as chief_majesty_c24,
    case when g.ok then g.guardian_scale_c24 else null end as guardian_scale_c24
  from gated g
  order by g.id;
$$;

grant execute on function public.get_member_equipment_showcase(text[], text) to authenticated;


-- ------------------------------------------------------------
-- 2) 裝備寫入：本人編輯內容 → equipment.write.self
--               本人調整可見度 → equipment.visibility.configure
--    （備份還原仍走 app.equipment_write transaction flag）
-- ------------------------------------------------------------
create or replace function public.guard_member_equipment_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visibility_changed boolean;
  v_content_changed boolean;
begin
  v_visibility_changed :=
    old.equipment_visibility is distinct from new.equipment_visibility
    or old.category_visibility is distinct from new.category_visibility
    or old.resource_visibility is distinct from new.resource_visibility
    or old.is_equipment_hidden is distinct from new.is_equipment_hidden;

  v_content_changed :=
    old.equipment is distinct from new.equipment
    or old.records is distinct from new.records
    or old.exclusive_weapons is distinct from new.exclusive_weapons
    or old.equipment_note is distinct from new.equipment_note
    or old.play_preferences is distinct from new.play_preferences
    or old.refining_traces is distinct from new.refining_traces;

  if not (v_visibility_changed or v_content_changed) then
    return new;
  end if;

  if current_setting('app.equipment_write', true) = 'on' then
    return new;
  end if;

  if new.id in (select public.my_member_ids()) then
    if v_visibility_changed
       and not public.has_permission('equipment.visibility.configure') then
      raise exception 'permission denied: 需要 equipment.visibility.configure'
        using errcode = '42501';
    end if;
    if v_content_changed
       and not public.has_permission('equipment.write.self') then
      raise exception 'permission denied: 需要 equipment.write.self'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'permission denied: 只能編輯自己的裝備／服裝'
    using errcode = '42501';
end;
$$;

drop trigger if exists members_equipment_guard on public.members;
create trigger members_equipment_guard
  before update on public.members
  for each row execute function public.guard_member_equipment_update();


-- ------------------------------------------------------------
-- 3) 成員編輯：members UPDATE policy + 身分欄位 trigger
--    member.edit.managed（managed）→ 可改自己管理公會的成員資料
--    member.archive（global）      → 可封存／還原（status + guild_id）
-- ------------------------------------------------------------
drop policy if exists "members_update" on public.members;
create policy "members_update"
  on public.members
  for update
  to authenticated
  using (
    (select public.is_global_admin())
    or id in (select public.my_member_ids())
    or (select public.has_permission('member.edit.managed', guild_id))
  )
  with check (
    (select public.is_global_admin())
    or id in (select public.my_member_ids())
    or (select public.has_permission('member.edit.managed', guild_id))
  );

create or replace function public.protect_member_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity_changed boolean;
  v_status_changed boolean;
  v_can_edit boolean;
  v_can_archive boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_global_admin() then
    return new;
  end if;

  v_identity_changed :=
    new.name is distinct from old.name
    or new.guild_id is distinct from old.guild_id
    or new.role is distinct from old.role
    or new.color is distinct from old.color;

  v_status_changed := new.status is distinct from old.status;

  if not (v_identity_changed or v_status_changed) then
    return new;
  end if;

  v_can_edit := public.has_permission(
    'member.edit.managed',
    coalesce(old.guild_id, new.guild_id)
  );
  v_can_archive := public.has_permission('member.archive');

  if v_identity_changed and not (v_can_edit or (v_status_changed and v_can_archive)) then
    raise exception 'permission denied: 需要 member.edit.managed 才能修改成員身分欄位'
      using errcode = '42501';
  end if;

  if v_status_changed and not (v_can_archive or v_can_edit) then
    raise exception 'permission denied: 需要 member.archive 才能變更成員狀態'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_member_identity_columns on public.members;
create trigger protect_member_identity_columns
  before update on public.members
  for each row execute function public.protect_member_identity_columns();

-- ------------------------------------------------------------
-- 4) 封存成員：RPC 改用 member.archive，並以 SECURITY DEFINER 執行
--    （身分 trigger 會再檢查一次，確保只有 member.archive 能改 status）
-- ------------------------------------------------------------
create or replace function public.archive_members_bulk(payload json)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  item record;
begin
  if not public.has_permission('member.archive') then
    raise exception 'permission denied: member.archive' using errcode = '42501';
  end if;

  for item in
    select *
    from json_populate_recordset(null::record, payload)
      as (member_id text, from_guild_id text, reason text)
  loop
    insert into public.members_archive_history (member_id, from_guild_id, archive_reason)
    values (item.member_id, item.from_guild_id, item.reason);

    update public.members
    set status = 'archived', guild_id = null
    where id = item.member_id;

    update public.member_notes
    set archive_remark = item.reason
    where member_id = item.member_id;
  end loop;
end;
$function$;

grant execute on function public.archive_members_bulk(json) to authenticated;

-- ------------------------------------------------------------
-- 5) 成員備註：member.note.write.managed（managed）
-- ------------------------------------------------------------
drop policy if exists "member_notes_insert" on public.member_notes;
create policy "member_notes_insert"
  on public.member_notes
  for insert
  to authenticated
  with check (
    (select public.is_global_admin())
    or member_id in (select public.my_member_ids())
    or exists (
      select 1
      from public.members m
      where m.id = member_notes.member_id
        and public.has_permission('member.note.write.managed', m.guild_id)
    )
  );

drop policy if exists "member_notes_update" on public.member_notes;
create policy "member_notes_update"
  on public.member_notes
  for update
  to authenticated
  using (
    (select public.is_global_admin())
    or member_id in (select public.my_member_ids())
    or exists (
      select 1
      from public.members m
      where m.id = member_notes.member_id
        and public.has_permission('member.note.write.managed', m.guild_id)
    )
  )
  with check (
    (select public.is_global_admin())
    or member_id in (select public.my_member_ids())
    or exists (
      select 1
      from public.members m
      where m.id = member_notes.member_id
        and public.has_permission('member.note.write.managed', m.guild_id)
    )
  );


-- ------------------------------------------------------------
-- 6) 權限管理：role_grants / user_grants 寫入 → admin.permission.manage
-- ------------------------------------------------------------
drop policy if exists "role_grants_admin_write" on public.role_grants;
create policy "role_grants_admin_write"
  on public.role_grants
  for all
  to authenticated
  using ((select public.has_permission('admin.permission.manage')))
  with check ((select public.has_permission('admin.permission.manage')));

drop policy if exists "user_grants_admin_all" on public.user_grants;
create policy "user_grants_admin_all"
  on public.user_grants
  for all
  to authenticated
  using ((select public.has_permission('admin.permission.manage')))
  with check ((select public.has_permission('admin.permission.manage')));

-- ------------------------------------------------------------
-- 7) 備份還原：restore_members_snapshot → admin.tools.run
-- ------------------------------------------------------------
create or replace function public.restore_members_snapshot(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_set_clause text;
  v_count integer;
begin
  if not public.has_permission('admin.tools.run') then
    raise exception 'permission denied: admin.tools.run' using errcode = '42501';
  end if;

  select string_agg(format('%I = excluded.%I', attname, attname), ', ')
    into v_set_clause
  from pg_attribute
  where attrelid = 'public.members'::regclass
    and attnum > 0
    and not attisdropped
    and attname <> 'id';

  perform set_config('app.equipment_write', 'on', true);

  execute format(
    'insert into public.members select * from jsonb_populate_recordset(null::public.members, $1)
     on conflict (id) do update set %s',
    v_set_clause
  ) using p_rows;

  get diagnostics v_count = row_count;

  perform set_config('app.equipment_write', 'off', true);

  return v_count;
end;
$$;

revoke all on function public.restore_members_snapshot(jsonb) from public;
grant execute on function public.restore_members_snapshot(jsonb) to authenticated;

-- ------------------------------------------------------------
-- 8) 系統日誌：寫入任何登入者、讀取 admin.logs.read
-- ------------------------------------------------------------
do $$
declare
  p record;
begin
  if to_regclass('public.system_logs') is null then
    return;
  end if;

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'system_logs'
  loop
    execute format('drop policy if exists %I on public.system_logs', p.policyname);
  end loop;

  execute 'alter table public.system_logs enable row level security';

  execute 'create policy "system_logs_insert_authenticated"
             on public.system_logs
             for insert
             to authenticated
             with check (auth.uid() is not null)';

  execute 'create policy "system_logs_select_admin_logs"
             on public.system_logs
             for select
             to authenticated
             using ((select public.has_permission(''admin.logs.read'')))';
end $$;

-- ------------------------------------------------------------
-- 9) 系統設定：讀取所有登入者、寫入 admin.settings.manage
-- ------------------------------------------------------------
do $$
declare
  p record;
begin
  if to_regclass('public.settings') is null then
    return;
  end if;

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'settings'
  loop
    execute format('drop policy if exists %I on public.settings', p.policyname);
  end loop;

  execute 'alter table public.settings enable row level security';

  execute 'create policy "settings_select_authenticated"
             on public.settings
             for select
             to authenticated
             using (true)';

  execute 'create policy "settings_insert_admin_settings"
             on public.settings
             for insert
             to authenticated
             with check ((select public.has_permission(''admin.settings.manage'')))';

  execute 'create policy "settings_update_admin_settings"
             on public.settings
             for update
             to authenticated
             using ((select public.has_permission(''admin.settings.manage'')))
             with check ((select public.has_permission(''admin.settings.manage'')))';

  execute 'create policy "settings_delete_admin_settings"
             on public.settings
             for delete
             to authenticated
             using ((select public.has_permission(''admin.settings.manage'')))';
end $$;


-- ------------------------------------------------------------
-- 10) 身分綁定 / 角色指派：profiles 依欄位分流
--     user_role        → admin.role.assign
--     id / discord_id  → admin.identity.manage
--     （本人改自己的顯示資料不受影響；service_role 不受限）
-- ------------------------------------------------------------
do $$
declare
  p record;
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'UPDATE'
  loop
    execute format('drop policy if exists %I on public.profiles', p.policyname);
  end loop;
end $$;

create policy "profiles_update_permission_manage"
  on public.profiles
  for update
  to authenticated
  using (
    auth_id = auth.uid()
    or (select public.has_permission('admin.identity.manage'))
    or (select public.has_permission('admin.role.assign'))
  )
  with check (
    auth_id = auth.uid()
    or (select public.has_permission('admin.identity.manage'))
    or (select public.has_permission('admin.role.assign'))
  );

create or replace function public.protect_profile_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_global_admin() then
    return new;
  end if;

  if new.user_role is distinct from old.user_role
     and not public.has_permission('admin.role.assign') then
    raise exception 'permission denied: 需要 admin.role.assign 才能變更角色'
      using errcode = '42501';
  end if;

  if (
       new.id is distinct from old.id
       or new.discord_id is distinct from old.discord_id
     )
     and not public.has_permission('admin.identity.manage') then
    raise exception 'permission denied: 需要 admin.identity.manage 才能變更綁定'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_permissions on public.profiles;
create trigger protect_profile_permissions
  before update on public.profiles
  for each row execute function public.protect_profile_permissions();

-- ------------------------------------------------------------
-- 11) 封存成員紀錄（後台清單）→ admin.archive.read
-- ------------------------------------------------------------
drop policy if exists "封存歷史可讀取" on public.members_archive_history;
create policy "封存歷史可讀取"
  on public.members_archive_history
  for select
  to authenticated
  using ((select public.has_permission('admin.archive.read')));

-- ------------------------------------------------------------
-- 12) 極速精煉排行榜 → arcade.speed_refining.use
-- ------------------------------------------------------------
do $$
declare
  p record;
begin
  if to_regclass('public.lb_speedrefining') is null then
    return;
  end if;

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'lb_speedrefining'
  loop
    execute format('drop policy if exists %I on public.lb_speedrefining', p.policyname);
  end loop;

  execute 'alter table public.lb_speedrefining enable row level security';

  execute 'create policy "lb_speedrefining_select_authenticated" on public.lb_speedrefining
             for select to authenticated using (true)';

  execute 'create policy "lb_speedrefining_write_permission" on public.lb_speedrefining
             for all to authenticated
             using ((select public.has_permission(''arcade.speed_refining.use'')))
             with check ((select public.has_permission(''arcade.speed_refining.use'')))';
end $$;


-- ------------------------------------------------------------
-- 13) 幽靈（招魂）紀錄 → raid.ghost.manage
-- ------------------------------------------------------------
drop policy if exists "ghost_records_write" on public.ghost_records;
create policy "ghost_records_write"
  on public.ghost_records
  for all
  to authenticated
  using ((select public.has_permission('raid.ghost.manage')))
  with check ((select public.has_permission('raid.ghost.manage')));


-- ------------------------------------------------------------
-- 14) 權限預覽：preview_access → admin.permission.manage
-- ------------------------------------------------------------
create or replace function public.preview_access(p_auth_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
  v_profile record;
  v_roles text[];
  v_managed_guilds text[];
  v_member_guilds text[];
  v_global jsonb;
  v_managed jsonb;
begin
  select public.has_permission('admin.permission.manage') into v_allowed;

  if not v_allowed then
    raise exception 'permission denied: preview_access' using errcode = '42501';
  end if;

  select * into v_profile from public.profile_by_auth(p_auth_id);

  if v_profile.profile_id is null and v_profile.user_role is null then
    return jsonb_build_object(
      'roles', '[]'::jsonb,
      'isAdmin', false,
      'managedGuildIds', '[]'::jsonb,
      'memberGuildIds', '[]'::jsonb,
      'globalPermissions', '[]'::jsonb,
      'managedPermissions', '[]'::jsonb,
      'version', coalesce((select version from public.permission_meta where id = 1), 1)
    );
  end if;

  v_managed_guilds := array(select public.managed_guild_ids_for(v_profile.profile_id, v_profile.discord_id));
  v_member_guilds := array(select public.guild_ids_for(v_profile.profile_id));

  v_roles := array_remove(array[
    'member',
    case when v_profile.user_role = 'manager' then 'manager' end,
    case when cardinality(v_managed_guilds) > 0 then 'officer' end,
    case when v_profile.user_role in ('creator', 'admin') then 'admin' end
  ], null);

  select coalesce(jsonb_agg(distinct rg.permission), '[]'::jsonb)
    into v_global
  from public.role_grants rg
  where rg.role = any(v_roles) and rg.scope = 'global';

  select coalesce(jsonb_agg(distinct rg.permission), '[]'::jsonb)
    into v_managed
  from public.role_grants rg
  where rg.role = any(v_roles) and rg.scope = 'managed';

  return jsonb_build_object(
    'roles', to_jsonb(v_roles),
    'isAdmin', 'admin' = any(v_roles),
    'managedGuildIds', to_jsonb(v_managed_guilds),
    'memberGuildIds', to_jsonb(v_member_guilds),
    'globalPermissions', v_global,
    'managedPermissions', v_managed,
    'version', coalesce((select version from public.permission_meta where id = 1), 1)
  );
end;
$$;

grant execute on function public.preview_access(uuid) to authenticated;

