-- ============================================================
-- 聯合戰「成員簽到」權限 + RPC
-- 2026-11-02
--
-- 目的：
--   1) 新增 raid.checkin.write（officer = managed、admin = global）
--   2) 簽到記號只透過 SECURITY DEFINER RPC 寫入，DB 端真正檢查
--      has_permission('raid.checkin.write', guild_id)
--   3) 不改 member_notes 的 RLS；一般成員備註仍走原本的
--      member.note.write.managed 路徑
--
-- 記號格式（存在 member_notes.note）：
--   [checkin]1,2,4[/checkin]
--   1~3 = 第 1~3 次簽到，4 = 死（永久失聯）
--
-- 可重複執行。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：權限目錄與預設授權
--   注意：這是 incremental seed（舊的 20261102130000 已套用在既有環境）。
--   未來若從 permissions.ts 移除本權限，需另建 migration 刪除；
--   否則新環境執行此檔時仍會重新插入。
-- ------------------------------------------------------------
insert into public.permissions (key, domain, needs_guild, sort_order)
values ('raid.checkin.write', 'raid', true, 210)
on conflict (key) do update
  set domain = excluded.domain,
      needs_guild = excluded.needs_guild,
      sort_order = excluded.sort_order;

insert into public.role_grants (role, permission, scope)
values
  ('officer', 'raid.checkin.write', 'managed'),
  ('admin', 'raid.checkin.write', 'global')
on conflict (role, permission) do update set scope = excluded.scope;

-- ------------------------------------------------------------
-- STEP 2：共用 helper
--   只替換/移除 [checkin] 段落，其他備註與 [prev_guild] 原封不動。
-- ------------------------------------------------------------
create or replace function public.apply_checkin_marks(p_note text, p_marks int[])
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_marks int[];
  v_rest text;
  v_segment text;
begin
  v_marks := array(
    select distinct m
    from unnest(coalesce(p_marks, '{}'::int[])) as m
    where m between 1 and 4
    order by m
  );

  v_rest := btrim(
    regexp_replace(coalesce(p_note, ''), '\[checkin\].*?\[/checkin\][[:space:]]*', '', 'g'),
    E' \t\r\n'
  );

  if cardinality(v_marks) = 0 then
    return v_rest;
  end if;

  v_segment := '[checkin]' || array_to_string(v_marks, ',') || '[/checkin]';
  return case
    when v_rest = '' then v_segment
    else v_segment || E'\n' || v_rest
  end;
end;
$$;

revoke all on function public.apply_checkin_marks(text, int[]) from public;

-- ------------------------------------------------------------
-- STEP 3：單一成員切換簽到記號
--   回傳寫入後的完整 note，讓前端不用再猜格式。
-- ------------------------------------------------------------
create or replace function public.set_member_checkin_marks(
  p_member_id text,
  p_marks int[]
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guild_id text;
  v_note text;
  v_new_note text;
begin
  select m.guild_id into v_guild_id
  from public.members m
  where m.id = p_member_id;

  if not found then
    raise exception 'member not found: %', p_member_id using errcode = 'P0002';
  end if;

  if not (select public.has_permission('raid.checkin.write', v_guild_id)) then
    raise exception 'permission denied: raid.checkin.write' using errcode = '42501';
  end if;

  select coalesce(n.note, '') into v_note
  from public.member_notes n
  where n.member_id = p_member_id;

  v_new_note := public.apply_checkin_marks(v_note, p_marks);

  insert into public.member_notes (member_id, note)
  values (p_member_id, v_new_note)
  on conflict (member_id) do update set note = excluded.note;

  update public.members
  set updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = p_member_id;

  return v_new_note;
end;
$$;

revoke all on function public.set_member_checkin_marks(text, int[]) from public;
grant execute on function public.set_member_checkin_marks(text, int[]) to authenticated;

-- ------------------------------------------------------------
-- STEP 4：重置整個公會的簽到記號
--   p_keep_dead = true  → 清 1/2/3，保留 4（永久失聯）
--   p_keep_dead = false → 1/2/3/4 全清
--   回傳 [{ member_id, note }]，讓前端同步本地狀態。
-- ------------------------------------------------------------
create or replace function public.reset_guild_checkin_marks(
  p_guild_id text,
  p_keep_dead boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_marks int[];
  v_new_note text;
  v_result jsonb := '[]'::jsonb;
  v_member_ids text[] := '{}';
begin
  if not (select public.has_permission('raid.checkin.write', p_guild_id)) then
    raise exception 'permission denied: raid.checkin.write' using errcode = '42501';
  end if;

  for v_row in
    select n.member_id, coalesce(n.note, '') as note
    from public.member_notes n
    join public.members m on m.id = n.member_id
    where m.guild_id = p_guild_id
      and coalesce(m.status, 'active') = 'active'
      and coalesce(n.note, '') like '%[checkin]%'
  loop
    v_marks := array(
      select distinct parts.value::int
      from regexp_split_to_table(
        coalesce(substring(v_row.note from '\[checkin\](.*?)\[/checkin\]'), ''),
        ','
      ) as parts(value)
      where parts.value ~ '^[1-4]$'
        and p_keep_dead
        and parts.value = '4'
      order by parts.value::int
    );

    v_new_note := public.apply_checkin_marks(v_row.note, v_marks);

    update public.member_notes
    set note = v_new_note
    where member_id = v_row.member_id;

    v_member_ids := array_append(v_member_ids, v_row.member_id);
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('member_id', v_row.member_id, 'note', v_new_note)
    );
  end loop;

  if cardinality(v_member_ids) > 0 then
    update public.members
    set updated_at = (extract(epoch from now()) * 1000)::bigint
    where id = any(v_member_ids);
  end if;

  return v_result;
end;
$$;

revoke all on function public.reset_guild_checkin_marks(text, boolean) from public;
grant execute on function public.reset_guild_checkin_marks(text, boolean) to authenticated;

comment on function public.set_member_checkin_marks(text, int[]) is
  '聯合戰簽到：設定單一成員的 [checkin] 記號（1~3 簽到、4 死）；需 raid.checkin.write。';
comment on function public.reset_guild_checkin_marks(text, boolean) is
  '聯合戰簽到：重置公會成員的 [checkin] 記號；預設保留 4（死）。需 raid.checkin.write。';
