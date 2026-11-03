-- ============================================================
-- Phase 1 等價性驗證：舊 access_control / 舊 TS 規則  vs  role_grants
--
-- 舊規則（src/shared/lib/access.ts）：
--   1) creator / admin 一律放行
--   2) member_board 是 adminOnly（忽略 access_control）
--   3) 其他頁面：access_control 有列就用列的 roles，沒有就用預設 roles
--   4) 只有 scope='guild' 的頁面（guild_raid_manager）才有「幹部視同 manager」，
--      且必須 roles 含 manager
--   → 幹部不是獨立的授權角色，只是 guild 頁面的特例
--
-- 期望輸出不論在任何環境都應該是 0 列。
-- 執行：node scripts/apply-sql.mjs --sql-file scripts/verify-permission-parity.sql
-- ============================================================
with defaults(page_id, permission, roles) as (values
  ('costume_list',         'page.equipment.view',   array['member','manager','admin','creator']),
  ('my_costumes',          'page.my_costumes.view', array['member','manager','admin','creator']),
  ('application_mailbox',  'page.mailbox.view',     array['member','manager','admin','creator']),
  ('arcade',               'page.arcade.view',      array['manager','admin','creator']),
  ('toolbox',              'page.toolbox.view',     array['manager','admin','creator']),
  ('guild_raid_manager',   'page.raid_manage.view', array['manager','admin','creator']),
  ('member_board',         'page.member_board.view',array['admin','creator']),
  ('admin_settings',       'page.admin.view',       array['admin','creator'])
),
effective as (
  select d.page_id,
         d.permission,
         case
           when d.page_id = 'member_board' then array['admin','creator']::text[]
           else coalesce(ac.roles, d.roles)
         end as roles
  from defaults d
  left join public.access_control ac on ac.page = d.page_id
),
personas(role) as (values ('member'), ('manager'), ('admin'), ('officer')),
expected as (
  select e.page_id,
         e.permission,
         p.role,
         case
           when p.role = 'admin'   then e.roles && array['admin','creator']::text[]
           when p.role = 'officer' then e.page_id = 'guild_raid_manager'
                                       and e.roles && array['manager']::text[]
           else p.role = any(e.roles)
         end as allowed
  from effective e
  cross join personas p
  where p.role <> 'officer' or e.page_id = 'guild_raid_manager'
),
actual as (
  select e.page_id,
         e.permission,
         p.role,
         exists (
           select 1
           from public.role_grants rg
           where rg.permission = e.permission
             and rg.role = p.role
         ) as allowed
  from effective e
  cross join personas p
  where p.role <> 'officer' or e.page_id = 'guild_raid_manager'
)
select ex.page_id,
       ex.role,
       ex.allowed as legacy_allowed,
       coalesce(ac.allowed, false) as new_allowed
from expected ex
left join actual ac
  on ac.page_id = ex.page_id
 and ac.permission = ex.permission
 and ac.role = ex.role
where ex.allowed is distinct from coalesce(ac.allowed, false)
order by ex.page_id, ex.role;
