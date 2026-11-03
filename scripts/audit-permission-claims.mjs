#!/usr/bin/env node
/**
 * 權限文件斷言稽核（docs/plans/2026-11-02-permissions-v2.md）
 *
 * 目的：文件裡每一條「可機械驗證」的事實，都變成一條檢查。
 * 只要有一條 FAIL，就代表文件寫錯（或被改到失效），而不是「我覺得」。
 *
 * 用法：npm run audit:permissions
 * 限制：只驗證程式結構與行為，不驗證設計主張（§2–§7 是設計，不是事實）。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

const read = (p) => {
  const f = resolve(ROOT, p);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};
const after = (text, marker, len = 800) => {
  const i = text.indexOf(marker);
  return i < 0 ? '' : text.slice(i, i + len);
};

const check = (claim, fn) => {
  try {
    const r = fn();
    if (r === true) results.push({ ok: true, claim });
    else results.push({ ok: false, claim, detail: String(r) });
  } catch (e) {
    results.push({ ok: false, claim, detail: `throw: ${e.message}` });
  }
};

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(resolve(ROOT, dir))) {
    const rel = join(dir, name);
    const st = statSync(resolve(ROOT, rel));
    if (st.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx|sql)$/.test(name)) out.push(rel.replace(/\\/g, '/'));
  }
  return out;
};

// ── 檔案 ────────────────────────────────────────────────────────────
const access = read('src/shared/lib/access.ts');
const usePerm = read('src/shared/lib/usePermissions.ts');
const header = read('src/shared/ui/Header.tsx');
const dashboard = read('src/features/guild/pages/GuildDashboard.tsx');
const myCostumes = read('src/features/guild/pages/MyCostumes.tsx');
const matrix = read('src/features/guild/components/CostumeMatrixTable.tsx');
const raidPage = read('src/features/raid/pages/GuildRaidManager.tsx');
const mailbox = read('src/features/mailbox/pages/ApplicationMailbox.tsx');
const store = read('src/store/index.tsx');
const logger = read('src/shared/utils/logger.ts');
const types = read('src/entities/member/types.ts');
const alignment = read('supabase/migrations/20261102120000_member_board_admin_only_and_rls_alignment.sql');
const bulk = read('supabase/migrations/20261029090200_save_raid_records_bulk.sql');
const rlsEval = read('supabase/migrations/20261029090100_rls_single_eval.sql');

// ── 1. 裝備 / 服裝編輯：UI 只有本人 ───────────────────────────────────
check('GuildDashboard 的裝備編輯只允許本人（canEdit = isCurrentUser）', () => {
  const block = after(dashboard, 'const handleEditClick', 300);
  return block.includes('const canEdit = isCurrentUser;') && block.includes('if (!canEdit) return;')
    ? true
    : `實際內容：${block.slice(0, 160)}`;
});

check('MyCostumes 的服裝編輯器只渲染自己綁定的成員（myMembers）', () => {
  const block = after(myCostumes, 'myMembers.length > 0 &&', 400);
  return block.includes('{myMembers.map(member => (') && block.includes('<MemberCostumeEditor')
    ? true
    : '找不到 myMembers.map + MemberCostumeEditor';
});

check('CostumeMatrixTable 是唯讀（props 沒有 onChange）', () =>
  matrix.includes('onChange') ? '發現 onChange，矩陣可能可編輯' : true);

// ── 2. Header 沒有使用 profiles.user_guilds（初版寫錯的那條）──────────
check('Header 只有 destructure userGuildRoles，沒有實際使用', () => {
  if (!header.includes('userGuildRoles')) return 'Header 完全沒提到 userGuildRoles';
  return header.includes('userGuildRoles.') || header.includes('userGuildRoles[')
    ? 'Header 有實際使用 userGuildRoles，文件說法需修正'
    : true;
});

// ── 3. 頁面權限的三個特例 ─────────────────────────────────────────────
check('access.ts 有 adminOnly 特例（member_board）', () =>
  access.includes('if (definition?.adminOnly) return isGlobalAdminRole(userRole);'));

check('access.ts 有「幹部視同 manager，但要看 MANAGER 是否勾選」特例', () =>
  access.includes("return canManageGuild() && roles.includes('manager');"));

check('usePermissions 對所有頁面都呼叫 canUserAccessGuildPage', () =>
  usePerm.includes('canUserAccessGuildPage(pageId, role, db.accessControl, canManageGuild)'));

check('canUserAccessPage 只有 access.ts 內部 fallback 在使用（沒有外部呼叫端）', () => {
  const files = walk('src');
  const callers = files.filter(
    (f) => f !== 'src/shared/lib/access.ts' && (read(f) || '').includes('canUserAccessPage('),
  );
  return callers.length === 0 ? true : `外部呼叫端：${callers.join(', ')}`;
});

check('guild_raid_manager 的預設角色含 manager（路由會放 manager 進來）', () => {
  const block = after(access, "id: 'guild_raid_manager'", 260);
  return block.includes("'manager'") ? true : block;
});

// ── 4. DB 與 UI 的強弱方向 ────────────────────────────────────────────
check('members_update = admin 或本人（UI 比 DB 嚴）', () => {
  const block = after(alignment, 'CREATE POLICY "members_update"', 700);
  return block.includes('(SELECT public.is_global_admin())') && block.includes('id IN (SELECT public.my_member_ids())')
    ? true
    : block.slice(0, 200);
});

check('save_raid_records_bulk 的權限守衛沒有比對 guild_id（任一幹部可寫整季）', () => {
  const body = after(bulk, 'CREATE OR REPLACE FUNCTION public.save_raid_records_bulk(', 2600);
  const guard = body.split('-- 1) 分數')[0];
  if (!guard.includes('permission denied for save_raid_records_bulk')) return '找不到權限守衛';
  // 只看真正的比對，避免被區域變數 v_guild_ids 誤判
  return /my_managed_guild_ids|guild_id\s*=|=\s*guild_id|guild_id\s+IN/.test(guard)
    ? '守衛區塊出現 guild_id 比對，需人工確認是否已加入公會限制'
    : true;
});

check('member_raid_records 的寫入 policy 用 can_edit_raid_record()', () => {
  const block = after(rlsEval, 'CREATE POLICY "member_raid_records_insert"', 400);
  return block.includes('can_edit_raid_record()') ? true : block.slice(0, 200);
});

check('apply_mail 只有幹部的 UPDATE / DELETE policy（SELECT 不在 repo）', () => {
  if (!alignment.includes('CREATE POLICY "公會幹部可更新申請"')) return '找不到 UPDATE policy';
  if (!alignment.includes('CREATE POLICY "公會幹部可刪除申請"')) return '找不到 DELETE policy';
  const sqlFiles = walk('supabase').concat(walk('docs/sql')).filter((f) => f.endsWith('.sql'));
  const selects = sqlFiles.filter((f) => /ON public\.apply_mail[\s\S]{0,300}FOR SELECT/.test(read(f) || ''));
  return selects.length === 0 ? true : `發現 SELECT policy：${selects.join(', ')}`;
});

// ── 5. access_control 只在瀏覽器生效 ─────────────────────────────────
check('沒有 RLS policy 依賴 access_control（只有 Phase 1 遷移會讀它）', () => {
  // Phase 1 的 migration 需要讀 access_control 做等價搬遷，這是唯一允許的引用。
  const allowed = 'supabase/migrations/20261102130000_permission_catalog_v2_foundation.sql';
  const bad = [];
  for (const f of walk('supabase').concat(walk('docs/sql')).filter((x) => x.endsWith('.sql') && x !== allowed)) {
    (read(f) || '').split('\n').forEach((line, i) => {
      if (line.includes('access_control') && !line.trim().startsWith('--')) bad.push(`${f}:${i + 1}`);
    });
  }
  return bad.length === 0 ? true : `實際引用：${bad.join(', ')}`;
});

check('access_control 只在 fetchInitialData 載入，沒有 realtime 訂閱', () => {
  if (!store.includes("supabase.from('access_control').select('page, roles')")) return '找不到載入語句';
  return store.includes('access_control-realtime') ? '發現 access_control realtime channel' : true;
});

// ── 6. 稽核在 production 失效 ────────────────────────────────────────
check('Logger 在 production 丟棄 info（權限變更沒有紀錄）', () =>
  logger.includes("if (!import.meta.env.DEV && level === 'info') return;")
    ? true
    : '找不到丟棄 info 的判斷');

check('權限變更走 Logger.info（不是 warn / error）', () =>
  store.includes(
    "Logger.info({ source: 'access_control', action: 'update_access_control', message: '更新頁面存取權限'",
  )
    ? true
    : '找不到成功分支的 Logger.info');

// ── 7. 裝備可見性只有兩級 ─────────────────────────────────────────────
check('EQUIPMENT_VISIBILITY_OPTIONS 只有 guild_manager / all_manager', () => {
  const block = after(types, 'EQUIPMENT_VISIBILITY_OPTIONS = [', 120);
  return block.includes("'guild_manager'") && block.includes("'all_manager'") && !block.includes("'public'")
    ? true
    : block;
});

// ── 8. /raid-manager 的進入 / 編輯分離（D1） ─────────────────────────
check('GuildRaidManager 用 page.raid_manage.view 進入、raid.score.write 編輯', () => {
  if (!raidPage.includes("can('page.raid_manage.view')")) return '找不到 canViewPage';
  if (!raidPage.includes("can('raid.score.write')")) return '找不到 canEdit';
  if (!raidPage.includes('readOnly={!canEdit}')) return '找不到 readOnly';
  return raidPage.includes('canManageGuild()') ? '頁面仍依賴 canManageGuild()' : true;
});

check('GuildRaidTable 有 readOnly 且鎖住輸入 / 按鈕', () => {
  const table = read('src/features/raid/components/GuildRaidTable.tsx') || '';
  return table.includes('readOnly?: boolean') && table.includes('const locked = isArchived === true || readOnly')
    ? true
    : 'readOnly 沒有接上';
});

check('SeasonActionsPanel 只在 GuildRaidManager 使用', () => {
  const users = walk('src').filter(
    (f) => !f.endsWith('SeasonActionsPanel.tsx') && (read(f) || '').includes('SeasonActionsPanel'),
  );
  return users.length === 1 && users[0].endsWith('GuildRaidManager.tsx')
    ? true
    : `使用端：${users.join(', ')}`;
});

// ── 9. 申請信箱前端抓全表 ─────────────────────────────────────────────
check('fetchApplyMails 沒有依 loginId / 公會過濾', () => {
  const block = after(store, 'const fetchApplyMails = async () => {', 400);
  return block.includes("from('apply_mail').select(") && !/\.eq\(|\.in\(/.test(block)
    ? true
    : '發現過濾條件，文件說法需修正';
});

check('ApplicationMailbox 的 isPrivileged = canManageGuild()', () =>
  mailbox.includes('const isPrivileged = canManageGuild();') ? true : '找不到 isPrivileged');

// ── 10. 角色來源：admin_users 與寫死的 Discord role ID ────────────────
check('admin_users 只被 Edge Function 查詢（src / migrations 沒有 .from 或 FROM），文件有記錄', () => {
  // 只看真正的查詢，忽略 i18n 文案與註解（AccessControlManager 的 legend、usePermissions 的 JSDoc）
  const queryPattern = /\.from\(['"]admin_users['"]\)|FROM\s+(public\.)?admin_users/i;
  const codeUsers = walk('src').concat(walk('supabase')).filter((f) => queryPattern.test(read(f) || ''));
  if (codeUsers.length > 0) return `程式碼查詢 admin_users：${codeUsers.join(', ')}`;
  const doc = read('src/features/auth/sync-discord-roles.md') || '';
  return doc.includes('.from("admin_users")') ? true : '文件也沒有記錄 admin_users 的用法，需重新確認';
});

check('manager / member 是寫死的 Discord role ID（身分規則不在 DB）', () => {
  const doc = read('src/features/auth/sync-discord-roles.md') || '';
  return doc.includes('1251021144144740372') && doc.includes('1404976598507323393')
    ? true
    : '找不到寫死的 role ID，文件說法需修正';
});

check('Login 用「公會名稱字串」比對，而 my_guild_ids() 用 members.guild_id（兩套來源）', () => {
  const login = read('src/features/auth/pages/Login.tsx') || '';
  const myGuildIds = read('supabase/migrations/20261029091000_members_guild_scoped_rls.sql') || '';
  const loginByName = login.includes('userGuildRoles.some(');
  const sqlByMembership = /SELECT DISTINCT m\.guild_id[\s\S]{0,300}JOIN public\.members m/.test(myGuildIds);
  return loginByName && sqlByMembership ? true : `Login 名稱比對=${loginByName}, my_guild_ids 用 membership=${sqlByMembership}`;
});

// ── 11. Phase 1 產物（存在且接上線） ─────────────────────────────────
const migration = read('supabase/migrations/20261102130000_permission_catalog_v2_foundation.sql') || '';
const useCanFile = read('src/shared/lib/useCan.ts') || '';

check('Phase 1 migration 存在，且包含 role_grants / get_my_access / set_page_roles', () =>
  migration.includes('create table if not exists public.role_grants')
  && migration.includes('create or replace function public.get_my_access()')
  && migration.includes('create or replace function public.set_page_roles(')
    ? true
    : 'migration 內容不完整');

check('store 會呼叫 get_my_access 並提供 refreshAccess', () =>
  store.includes("supabase.rpc('get_my_access')") && store.includes('const refreshAccess = useCallback')
    ? true
    : 'store 沒有接上 get_my_access');

check('store 儲存存取控制時會雙寫 role_grants（set_page_roles）', () =>
  store.includes("supabase.rpc('set_page_roles'") ? true : '缺少 set_page_roles 雙寫');

check('usePermissions 在 access.version = 0 時回退舊規則（零行為變更）', () =>
  usePerm.includes('access.version > 0')
  && usePerm.includes('canUserAccessGuildPage(pageId, role, db.accessControl, canManageGuild)')
    ? true
    : '找不到 fallback');

check('useCan 只讀 access（不重算角色）', () =>
  useCanFile.includes('access.globalPermissions') && useCanFile.includes('access.managedPermissions')
    ? true
    : 'useCan 沒有讀 get_my_access 的結果');

check('Phase 1 等價性驗證 SQL 存在', () =>
  read('scripts/verify-permission-parity.sql')?.includes('role_grants') ? true : '找不到 parity SQL');

// ── 12. D1 / D2 決議已落實 ──────────────────────────────────────────
const catalog = read('src/shared/lib/permissions.ts') || '';

check('D2：目錄沒有 equipment.write.managed（任何人都不改他人裝備）', () =>
  catalog.includes("'equipment.write.managed'")
    ? '目錄仍有 equipment.write.managed'
    : true);

check('D1：migration 的 get_my_access 有 memberGuildIds', () =>
  migration.includes("'memberGuildIds'") ? true : 'get_my_access 沒有 memberGuildIds');

// ── 13. Phase 2 / 3 產物 ─────────────────────────────────────────────
const phase3 = read('supabase/migrations/20261102140000_permission_phase3_rls.sql') || '';
const routes = read('src/app/routes.tsx') || '';

check('Phase 3：can_edit_raid_record 改用 has_permission', () =>
  phase3.includes("select public.has_permission('raid.score.write')")
    ? true
    : 'can_edit_raid_record 沒有改用 has_permission');

check('Phase 3：raid_seasons / apply_mail policy 改用 has_permission', () => {
  const okSeason = phase3.includes("has_permission('raid.season.manage')");
  const okMail = phase3.includes("has_permission('mailbox.process')");
  return okSeason && okMail ? true : `season=${okSeason}, mailbox=${okMail}`;
});

check('Phase 2：/raid 與 /raid-manager 已拆成不同權限', () =>
  routes.includes('perm="page.raid.view"') && routes.includes('perm="page.raid_manage.view"')
    ? true
    : 'routes 仍共用同一個權限');

check('Phase 2：routes 不再用 pageId（全站已改用 perm）', () => {
  const remaining = (routes.match(/pageId=/g) || []).length;
  return remaining === 0 ? true : `仍有 ${remaining} 處 pageId`;
});

// ── 14. admin-only 收回 + Phase 4 + D2 guard ────────────────────────
const adminOnly = read('supabase/migrations/20261102150000_permission_admin_only_and_preview.sql') || '';
const guard = read('supabase/migrations/20261102160000_member_equipment_guard.sql') || '';
const restoreHook = read('src/features/admin/hooks/useRestoreDiff.ts') || '';

check('guilds / costumes 已收回成 admin-only（has_permission）', () => {
  const guilds = /on public\.guilds[\s\S]{0,260}has_permission\('admin\.guild\.manage'\)/i.test(adminOnly);
  const costumes = /on public\.costumes[\s\S]{0,260}has_permission\('admin\.costume\.manage'\)/i.test(adminOnly);
  return guilds && costumes ? true : `guilds=${guilds}, costumes=${costumes}`;
});

check('preview_access 存在且只允許 admin（raise 42501）', () =>
  adminOnly.includes('create or replace function public.preview_access')
  && adminOnly.includes("raise exception 'permission denied: preview_access'")
    ? true
    : 'preview_access 缺少 admin 檢查');

check('Phase 4：後台有 PermissionManager 與 4 個分頁', () => {
  const shell = read('src/features/admin/components/PermissionManager.tsx') || '';
  const tabs = [
    'PermissionMatrixTab',
    'PermissionOverridesTab',
    'PermissionPreviewTab',
    'PermissionAuditTab',
  ].every(name => shell.includes(name));
  const admin = read('src/features/admin/pages/AdminDashboard.tsx') || '';
  return tabs && admin.includes('<PermissionManager />') ? true : 'PermissionManager 沒有接上';
});

check('Phase 4：舊「存取控制」UI 已移除（單一編輯面）', () => {
  const admin = read('src/features/admin/pages/AdminDashboard.tsx') || '';
  const legacyFile = resolve(process.cwd(), 'src/features/admin/components/AccessControlManager.tsx');
  return !admin.includes('AccessControlManager') && !existsSync(legacyFile)
    ? true
    : 'AdminDashboard 仍有 AccessControlManager';
});

check('D2：members 有裝備欄位 guard（非本人 + 非還原 → 42501）', () =>
  guard.includes('create trigger members_equipment_guard')
  && guard.includes("raise exception 'permission denied: 只能編輯自己的裝備／服裝'")
    ? true
    : '缺少 members_equipment_guard');

check('D2：備份還原改走 restore_members_snapshot RPC', () =>
  guard.includes('create or replace function public.restore_members_snapshot')
  && restoreHook.includes("supabase.rpc('restore_members_snapshot'")
    ? true
    : '還原路徑沒有走 RPC');

// ── 輸出 ────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.claim}${r.ok ? '' : `\n      -> ${r.detail}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
