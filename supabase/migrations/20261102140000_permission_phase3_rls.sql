-- ============================================================
-- 權限 v2 Phase 3：RLS 改用 has_permission()
-- 2026-11-02
--
-- 只替換「可證明等價」的三個地方，其餘 policy 不動：
--   1) can_edit_raid_record()  → has_permission('raid.score.write')
--   2) raid_seasons 寫入       → has_permission('raid.season.manage')
--   3) apply_mail 更新/刪除     → has_permission('mailbox.process')
--
-- 另外把 `/raid` 拆出來（page.raid.view）：把目前 page.raid_manage.view 的授權
-- 複製過去，確保 manager / 幹部看得到 /raid（原本兩個路由共用同一個 pageId）。
-- 只在 page.raid.view 還沒有任何非 admin 授權時才複製，避免覆蓋後續自訂。
--
-- 可重複執行。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：/raid 的權限（一次性初始化）
-- ------------------------------------------------------------
do $$
begin
  if (
    select count(*)
    from public.role_grants
    where permission = 'page.raid.view'
      and role <> 'admin'
  ) = 0 then
    delete from public.role_grants
     where permission = 'page.raid.view'
       and role <> 'admin';

    insert into public.role_grants (role, permission, scope)
    select rg.role, 'page.raid.view', rg.scope
      from public.role_grants rg
     where rg.permission = 'page.raid_manage.view'
       and rg.role <> 'admin'
    on conflict (role, permission) do update set scope = excluded.scope;
  end if;
end $$;

-- ------------------------------------------------------------
-- STEP 2：戰記寫入
--   舊：is_global_admin() OR is_guild_officer()
--   新：has_permission('raid.score.write')（admin 硬規則 + officer 的 managed 授權）
-- ------------------------------------------------------------
create or replace function public.can_edit_raid_record()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_permission('raid.score.write');
$$;

grant execute on function public.can_edit_raid_record() to authenticated;

-- ------------------------------------------------------------
-- STEP 3：賽季異動
-- ------------------------------------------------------------
drop policy if exists "賽季僅管理員或幹部可異動" on public.raid_seasons;
create policy "賽季僅管理員或幹部可異動"
  on public.raid_seasons
  for all
  to authenticated
  using ((select public.has_permission('raid.season.manage')))
  with check ((select public.has_permission('raid.season.manage')));

-- ------------------------------------------------------------
-- STEP 4：申請信箱（處理申請）
--   讀取維持 `登入者可讀取`（USING true），不動。
-- ------------------------------------------------------------
drop policy if exists "公會幹部可更新申請" on public.apply_mail;
create policy "公會幹部可更新申請"
  on public.apply_mail
  for update
  to authenticated
  using ((select public.has_permission('mailbox.process')))
  with check ((select public.has_permission('mailbox.process')));

drop policy if exists "公會幹部可刪除申請" on public.apply_mail;
create policy "公會幹部可刪除申請"
  on public.apply_mail
  for delete
  to authenticated
  using ((select public.has_permission('mailbox.process')));
