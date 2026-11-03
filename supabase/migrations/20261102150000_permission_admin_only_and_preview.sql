-- ============================================================
-- 權限 v2：admin-only 收回 + Phase 4 後台（預覽 / 稽核）
-- 2026-11-02
--
-- 1) guilds / costumes 的寫入收回成 admin-only
--    （原本是 get_admin_role() in (creator,admin,manager)）
-- 2) preview_access(auth_id)：管理員可預覽「某人會看到什麼」
-- 3) role_grants / user_grants 變更寫入 system_logs（level=warn，production 也會留）
--
-- 可重複執行。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：guilds / costumes → admin-only
-- ------------------------------------------------------------
drop policy if exists "管理員可完整操作" on public.guilds;
create policy "管理員可完整操作"
  on public.guilds
  for all
  to authenticated
  using ((select public.has_permission('admin.guild.manage')))
  with check ((select public.has_permission('admin.guild.manage')));

drop policy if exists "管理員可完整操作" on public.costumes;
create policy "管理員可完整操作"
  on public.costumes
  for all
  to authenticated
  using ((select public.has_permission('admin.costume.manage')))
  with check ((select public.has_permission('admin.costume.manage')));

-- ------------------------------------------------------------
-- STEP 2：預覽用的查詢 helper（只給 preview_access 內部使用）
-- ------------------------------------------------------------
create or replace function public.profile_by_auth(p_auth_id uuid)
returns table (profile_id text, user_role text, discord_id text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.user_role, p.discord_id::text
  from public.profiles p
  where p.auth_id = p_auth_id
  limit 1;
$$;

-- 與 my_managed_guild_ids() 相同的規則，但針對指定 profile
create or replace function public.managed_guild_ids_for(p_profile_id text, p_discord_id text)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct m.guild_id
  from public.profile_members pm
  join public.members m on m.id = pm.member_id
  where pm.profile_id = p_discord_id
    and m.role in ('leader', 'coleader')
    and m.guild_id is not null
  union
  select distinct m.guild_id
  from unnest(string_to_array(coalesce(p_profile_id, ''), ',')) as b(mid)
  join public.members m on m.id = btrim(b.mid)
  where m.role in ('leader', 'coleader')
    and m.guild_id is not null;
$$;

-- 與 my_guild_ids() 相同：只走 profiles.id 的逗號清單
create or replace function public.guild_ids_for(p_profile_id text)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct m.guild_id
  from unnest(string_to_array(coalesce(p_profile_id, ''), ',')) as b(mid)
  join public.members m on m.id = btrim(b.mid)
  where m.guild_id is not null;
$$;

revoke all on function public.profile_by_auth(uuid) from public;
revoke all on function public.managed_guild_ids_for(text, text) from public;
revoke all on function public.guild_ids_for(text) from public;

-- ------------------------------------------------------------
-- STEP 3：preview_access（只有 admin 能呼叫）
-- ------------------------------------------------------------
create or replace function public.preview_access(p_auth_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_admin boolean;
  v_profile record;
  v_roles text[];
  v_managed_guilds text[];
  v_member_guilds text[];
  v_global jsonb;
  v_managed jsonb;
begin
  select exists (
    select 1 from public.current_profile() cp where cp.user_role in ('creator', 'admin')
  ) into v_caller_admin;

  if not v_caller_admin then
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

-- ------------------------------------------------------------
-- STEP 4：稽核（client 觸發的變更才記錄；migration / seed 不記）
-- ------------------------------------------------------------
create or replace function public.log_permission_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return null;
  end if;

  insert into public.system_logs (level, source, action, user_id, message, details)
  values (
    'warn',
    'permissions',
    case when tg_table_name = 'role_grants' then 'role_grants_change' else 'user_grants_change' end,
    auth.uid(),
    case
      when tg_op = 'DELETE' then '移除權限授權'
      when tg_op = 'UPDATE' then '更新權限授權'
      else '新增權限授權'
    end,
    jsonb_build_object(
      'table', tg_table_name,
      'op', tg_op,
      'old', case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
      'new', case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
    )
  );

  return null;
end;
$$;

revoke all on function public.log_permission_change() from public;

drop trigger if exists role_grants_audit on public.role_grants;
create trigger role_grants_audit
  after insert or update or delete on public.role_grants
  for each row execute function public.log_permission_change();

drop trigger if exists user_grants_audit on public.user_grants;
create trigger user_grants_audit
  after insert or update or delete on public.user_grants
  for each row execute function public.log_permission_change();
