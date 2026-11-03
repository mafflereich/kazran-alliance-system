/**
 * 權限目錄 v2（Single Capability Catalog）
 *
 * 設計原則（完整說明見 docs/plans/2026-11-02-permissions-v2.md）：
 *   1. 這支檔案只回答「系統有哪些權限」、「哪個路由需要哪個權限」。
 *   2. 「誰有這個權限」一律由 DB 的 role_grants 決定，前端只消費
 *      get_my_access() 回傳的清單，不在瀏覽器重算角色規則。
 *   3. 角色是標籤（member / manager / officer / admin），不是階級；
 *      公會級的授權一律用 scope = managed 表達（officer 只在自己管理的公會生效）。
 *
 * 目前舊程式仍使用 src/shared/lib/access.ts；Phase 2 會把路由、Header、
 * ProtectedRoute 換成這裡的 key，之後再刪掉 access.ts 的角色判斷。
 */

export const ACCESS_ROLES_V2 = ['member', 'manager', 'officer', 'admin'] as const;
export type AccessRoleV2 = (typeof ACCESS_ROLES_V2)[number];

/** global = 全站有效；managed = 只在自己是 leader/coleader 的公會有效 */
export type GrantScope = 'global' | 'managed';

export interface DefaultGrant {
  role: AccessRoleV2;
  scope: GrantScope;
}

export type PermissionDomain =
  | 'page'
  | 'equipment'
  | 'member'
  | 'raid'
  | 'mailbox'
  | 'admin'
  | 'arcade';

export interface PermissionDefinition {
  /** 全域唯一 key：2–4 段，`<domain>.<action>` 或 `<domain>.<resource>.<action>` */
  key: string;
  domain: PermissionDomain;
  /** true = 資料層檢查必須帶 guildId（RLS 只接受這個版本） */
  needsGuild: boolean;
  /** 預設授權；實際生效值仍以 DB 的 role_grants 為準 */
  defaults: readonly DefaultGrant[];
}

/** 讓目錄讀起來像一張表：G = 全站、M = 只在自己管理的公會 */
const G = (role: AccessRoleV2): DefaultGrant => ({ role, scope: 'global' });
const M = (role: AccessRoleV2): DefaultGrant => ({ role, scope: 'managed' });

/**
 * 權限目錄（單一來源）。
 *
 * 新增權限的步驟：
 *   1. 這裡加一筆（含 needsGuild 與預設授權）。
 *   2. `scripts/gen-permission-catalog.mjs`（Phase 1 新增）把目錄同步到 DB 的 permissions 表。
 *   3. 後台「權限」分頁會自動長出這一列，不需要改 UI。
 *   4. 需要擋路由 / 按鈕時，用 `<RouteGate perm="...">` / `<Can perm="...">`。
 */
export const PERMISSIONS = [
  // ── 頁面（只影響導覽與路由，不等於資料安全）────────────────────────────
  {
    key: 'page.equipment.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },
  {
    key: 'page.my_costumes.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },
  {
    key: 'page.mailbox.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },
  {
    key: 'page.arcade.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('manager'), G('admin')],
  },
  {
    key: 'page.toolbox.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('manager'), G('admin')],
  },
  {
    key: 'page.raid.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('manager'), M('officer'), G('admin')],
  },
  {
    key: 'page.raid_manage.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('manager'), M('officer'), G('admin')],
  },
  {
    key: 'page.member_board.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('admin')],
  },
  {
    key: 'page.admin.view',
    domain: 'page',
    needsGuild: false,
    defaults: [G('admin')],
  },

  // ── 裝備／服裝 ──────────────────────────────────────────────────────
  {
    // 對應 members.equipment_visibility = 'guild_manager'
    key: 'equipment.read.managed',
    domain: 'equipment',
    needsGuild: true,
    defaults: [M('officer'), G('admin')],
  },
  {
    // 對應 members.equipment_visibility = 'all_manager'
    key: 'equipment.read.staff',
    domain: 'equipment',
    needsGuild: false,
    defaults: [G('manager'), G('admin')],
  },
  {
    key: 'equipment.write.self',
    domain: 'equipment',
    needsGuild: false,
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },
  {
    key: 'equipment.visibility.configure',
    domain: 'equipment',
    needsGuild: false,
    defaults: [G('member'), G('manager'), G('officer'), G('admin')],
  },

  // ── 成員 ───────────────────────────────────────────────────────────
  {
    key: 'member.edit.managed',
    domain: 'member',
    needsGuild: true,
    defaults: [G('admin')],
  },
  {
    key: 'member.archive',
    domain: 'member',
    needsGuild: false,
    defaults: [G('admin')],
  },
  {
    key: 'member.note.write.managed',
    domain: 'member',
    needsGuild: true,
    defaults: [M('officer'), G('admin')],
  },

  // ── 聯合戰 ─────────────────────────────────────────────────────────
  {
    key: 'raid.score.write',
    domain: 'raid',
    needsGuild: true,
    defaults: [M('officer'), G('admin')],
  },
  {
    key: 'raid.season.manage',
    domain: 'raid',
    needsGuild: false,
    defaults: [M('officer'), G('admin')],
  },
  {
    key: 'raid.ghost.manage',
    domain: 'raid',
    needsGuild: true,
    defaults: [M('officer'), G('admin')],
  },
  {
    key: 'raid.roster.move',
    domain: 'raid',
    needsGuild: true,
    defaults: [M('officer'), G('admin')],
  },
  {
    key: 'raid.checkin.write',
    domain: 'raid',
    needsGuild: true,
    defaults: [M('officer'), G('admin')],
  },

  // ── 申請信箱 ───────────────────────────────────────────────────────
  {
    key: 'mailbox.process',
    domain: 'mailbox',
    needsGuild: true,
    defaults: [M('officer'), G('admin')],
  },

  // ── 後台 ───────────────────────────────────────────────────────────
  { key: 'admin.guild.manage', domain: 'admin', needsGuild: false, defaults: [G('admin')] },
  { key: 'admin.costume.manage', domain: 'admin', needsGuild: false, defaults: [G('admin')] },
  { key: 'admin.identity.manage', domain: 'admin', needsGuild: false, defaults: [G('admin')] },
  { key: 'admin.logs.read', domain: 'admin', needsGuild: false, defaults: [G('admin')] },
  { key: 'admin.tools.run', domain: 'admin', needsGuild: false, defaults: [G('admin')] },
  { key: 'admin.settings.manage', domain: 'admin', needsGuild: false, defaults: [G('admin')] },
  { key: 'admin.permission.manage', domain: 'admin', needsGuild: false, defaults: [G('admin')] },
  { key: 'admin.role.assign', domain: 'admin', needsGuild: false, defaults: [G('admin')] },

  // ── 小遊戲 ─────────────────────────────────────────────────────────
  {
    // 目前寫死 userRole === 'creator'；新方案視為一般後台權限
    key: 'arcade.speed_refining.use',
    domain: 'arcade',
    needsGuild: false,
    defaults: [G('admin')],
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map(p => p.key);

const PERMISSION_MAP: ReadonlyMap<string, PermissionDefinition> = new Map(
  PERMISSIONS.map(definition => [definition.key, definition]),
);

export const getPermissionDefinition = (key: string): PermissionDefinition | undefined =>
  PERMISSION_MAP.get(key);

export const isPermissionKey = (key: string): key is PermissionKey => PERMISSION_MAP.has(key);

/** 舊 pageId → 新權限 key（找不到時 undefined；避免用 string 索引 literal 物件） */
export const legacyPagePermission = (pageId: string): PermissionKey | undefined =>
  (LEGACY_PAGE_TO_PERMISSION as Record<string, PermissionKey>)[pageId];

/**
 * get_my_access() 的回傳形狀（Phase 1）。
 * version = 0 表示 DB 尚未提供 v2 資料，前端必須回退到舊規則。
 */
export interface MyAccess {
  roles: AccessRoleV2[];
  isAdmin: boolean;
  managedGuildIds: string[];
  /** 我所屬的公會（成員綁定）；manager 只看自己公會時會用到 */
  memberGuildIds: string[];
  globalPermissions: PermissionKey[];
  managedPermissions: PermissionKey[];
  version: number;
}

export const EMPTY_ACCESS: MyAccess = {
  roles: [],
  isAdmin: false,
  managedGuildIds: [],
  memberGuildIds: [],
  globalPermissions: [],
  managedPermissions: [],
  version: 0,
};

// 後台 i18n key（admin namespace）：permissions.<key>.label / .description
export const permissionLabelKey = (key: string): string => `permissions.${key}.label`;
export const permissionDescriptionKey = (key: string): string => `permissions.${key}.description`;
export const roleLabelKey = (role: AccessRoleV2): string => `permissions.roles.${role}`;

/**
 * 舊 pageId → 新權限 key。
 *
 * Phase 1 的相容層就靠這張表：`usePermissions().canAccessPage(pageId)` 改成
 * `can(LEGACY_PAGE_TO_PERMISSION[pageId])`，所有既有呼叫端（Header、ProtectedRoute、
 * 各頁面）完全不用改，可見性與 access_control 完全一致。
 *
 * 注意：舊程式 `/raid` 與 `/raid-manager` 共用 `guild_raid_manager`，這裡先映射到
 * `page.raid_manage.view` 以維持完全相同的可見性；Phase 2 再把 `/raid` 拆成
 * `page.raid.view`。
 */
export const LEGACY_PAGE_TO_PERMISSION = {
  costume_list: 'page.equipment.view',
  my_costumes: 'page.my_costumes.view',
  application_mailbox: 'page.mailbox.view',
  arcade: 'page.arcade.view',
  toolbox: 'page.toolbox.view',
  guild_raid_manager: 'page.raid_manage.view',
  member_board: 'page.member_board.view',
  admin_settings: 'page.admin.view',
  alliance_raid_record: 'page.raid.view',
} as const satisfies Record<string, PermissionKey>;

/** 路由 → 頁面權限（Phase 2 的 RouteGate 使用） */
export const ROUTE_PERMISSIONS = {
  '/guild/:guildId': 'page.equipment.view',
  '/costumes': 'page.my_costumes.view',
  '/mailbox': 'page.mailbox.view',
  '/arcade': 'page.arcade.view',
  '/toolbox': 'page.toolbox.view',
  '/raid': 'page.raid.view',
  '/raid-manager': 'page.raid_manage.view',
  '/team': 'page.member_board.view',
  '/admin': 'page.admin.view',
} as const satisfies Record<string, PermissionKey>;
