-- ============================================================
-- D2：任何人（含 admin）都不得編輯他人的裝備／服裝
-- 2026-11-02
--
-- 1) members BEFORE UPDATE trigger：裝備相關欄位有變、且對象不是自己綁定的成員
--    → 42501（唯一例外：restore_members_snapshot 設定的 transaction-local flag）
-- 2) restore_members_snapshot(jsonb)：備份還原專用，驗 admin 後開 flag 再 upsert
--
-- 為什麼需要 flag：BackupRestoreTool 是「整列覆寫」，若不開例外，還原會失敗。
-- flag 是 transaction-local（set_config(..., true)），結束自動失效。
--
-- 可重複執行。
-- ============================================================

create or replace function public.guard_member_equipment_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 只檢查「裝備／服裝」相關欄位有變更時
  if not (
    old.equipment              is distinct from new.equipment
    or old.records             is distinct from new.records
    or old.exclusive_weapons   is distinct from new.exclusive_weapons
    or old.equipment_note      is distinct from new.equipment_note
    or old.play_preferences    is distinct from new.play_preferences
    or old.equipment_visibility is distinct from new.equipment_visibility
    or old.category_visibility is distinct from new.category_visibility
    or old.resource_visibility is distinct from new.resource_visibility
    or old.is_equipment_hidden is distinct from new.is_equipment_hidden
    or old.refining_traces     is distinct from new.refining_traces
  ) then
    return new;
  end if;

  -- 例外：備份還原（transaction-local）
  if current_setting('app.equipment_write', true) = 'on' then
    return new;
  end if;

  -- 本人（含一個 profile 綁定多個成員）
  if new.id in (select public.my_member_ids()) then
    return new;
  end if;

  raise exception 'permission denied: 只能編輯自己的裝備／服裝'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_member_equipment_update() from public;

drop trigger if exists members_equipment_guard on public.members;
create trigger members_equipment_guard
  before update on public.members
  for each row execute function public.guard_member_equipment_update();

-- ------------------------------------------------------------
-- 備份還原專用 RPC（唯一能繞過 guard 的路徑）
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
  if not exists (
    select 1 from public.current_profile() cp where cp.user_role in ('creator', 'admin')
  ) then
    raise exception 'permission denied: restore_members_snapshot' using errcode = '42501';
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
