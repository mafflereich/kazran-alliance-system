import { AccessControl } from '@/entities/member/types';

export type AccessRole = 'member' | 'manager' | 'admin' | 'creator';

/** 頁面權限的適用範圍：global = 依角色；guild = 公會級（正副會長視同 manager） */
export type PageAccessScope = 'global' | 'guild';

/** 後台「存取控制」的分組 */
export type PageGroup = 'alliance' | 'guild' | 'system';

export interface PageDefinition {
  id: string;
  group: PageGroup;
  scope: PageAccessScope;
  defaultRoles: AccessRole[];
  /** i18n key（admin namespace）：access.pages.<id>.label / .desc */
  labelKey: string;
  descriptionKey: string;
  /** 不在「存取控制」表格顯示（保留舊資料用） */
  hidden?: boolean;
  /** 固定只有 creator / admin 能進入（忽略 access_control 與公會幹部規則） */
  adminOnly?: boolean;
}

export const ALL_ACCESS_ROLES: AccessRole[] = ['member', 'manager', 'admin', 'creator'];

/**
 * 全站頁面權限的單一來源。
 * 新增頁面時只要在這裡加一筆，路由、Header、存取控制後台都會同步。
 */
export const PAGE_DEFINITIONS: PageDefinition[] = [
  // 聯盟功能
  {
    id: 'costume_list',
    group: 'alliance',
    scope: 'global',
    defaultRoles: ['member', 'manager', 'admin', 'creator'],
    labelKey: 'access.pages.costume_list.label',
    descriptionKey: 'access.pages.costume_list.desc',
  },
  {
    id: 'my_costumes',
    group: 'alliance',
    scope: 'global',
    defaultRoles: ['member', 'manager', 'admin', 'creator'],
    labelKey: 'access.pages.my_costumes.label',
    descriptionKey: 'access.pages.my_costumes.desc',
  },
  {
    id: 'application_mailbox',
    group: 'alliance',
    scope: 'global',
    defaultRoles: ['member', 'manager', 'admin', 'creator'],
    labelKey: 'access.pages.application_mailbox.label',
    descriptionKey: 'access.pages.application_mailbox.desc',
  },
  {
    id: 'arcade',
    group: 'alliance',
    scope: 'global',
    defaultRoles: ['manager', 'admin', 'creator'],
    labelKey: 'access.pages.arcade.label',
    descriptionKey: 'access.pages.arcade.desc',
  },
  {
    id: 'toolbox',
    group: 'alliance',
    scope: 'global',
    defaultRoles: ['manager', 'admin', 'creator'],
    labelKey: 'access.pages.toolbox.label',
    descriptionKey: 'access.pages.toolbox.desc',
  },

  // 公會管理（正副會長視同 manager）
  {
    id: 'guild_raid_manager',
    group: 'guild',
    scope: 'guild',
    defaultRoles: ['manager', 'admin', 'creator'],
    labelKey: 'access.pages.guild_raid_manager.label',
    descriptionKey: 'access.pages.guild_raid_manager.desc',
  },
  {
    id: 'member_board',
    group: 'guild',
    scope: 'global',
    defaultRoles: ['admin', 'creator'],
    labelKey: 'access.pages.member_board.label',
    descriptionKey: 'access.pages.member_board.desc',
    adminOnly: true,
  },

  // 系統設定
  {
    id: 'admin_settings',
    group: 'system',
    scope: 'global',
    defaultRoles: ['admin', 'creator'],
    labelKey: 'access.pages.admin_settings.label',
    descriptionKey: 'access.pages.admin_settings.desc',
  },

  // 舊頁面（routes 已改用 guild_raid_manager）：保留資料但不顯示
  {
    id: 'alliance_raid_record',
    group: 'guild',
    scope: 'global',
    defaultRoles: ['creator'],
    labelKey: 'access.pages.alliance_raid_record.label',
    descriptionKey: 'access.pages.alliance_raid_record.desc',
    hidden: true,
  },
];

const PAGE_DEFINITION_MAP = new Map(PAGE_DEFINITIONS.map(page => [page.id, page]));

export const getPageDefinition = (pageId: string): PageDefinition | undefined =>
  PAGE_DEFINITION_MAP.get(pageId);

export const getDefaultRoles = (pageId: string): AccessRole[] => {
  const definition = PAGE_DEFINITION_MAP.get(pageId);
  return definition ? [...definition.defaultRoles] : ['admin', 'creator'];
};

// 公會級管理頁面：以「公會正/副會長（公會幹部）」身分判斷的頁面（詳見 canUserAccessGuildPage）
export const isGuildManagementPage = (pageId: string): boolean =>
  getPageDefinition(pageId)?.scope === 'guild';

// 角色輔助（全站共用，避免各檔案各自寫死）
export const isGlobalAdminRole = (role?: string | null): boolean =>
  role === 'creator' || role === 'admin';

export const isManagerOrAboveRole = (role?: string | null): boolean =>
  role === 'manager' || isGlobalAdminRole(role);

// 頁面目前生效的可存取角色：以後台「存取控制」設定為準，尚未設定時才使用預設值
export const getEffectiveRoles = (
  pageId: string,
  accessControl: Record<string, AccessControl>
): AccessRole[] => {
  const definition = getPageDefinition(pageId);
  // 固定頁面（例如 Team Assign Board）不接受 access_control 覆寫
  if (definition?.adminOnly) return [...definition.defaultRoles];
  return accessControl[pageId]?.roles || getDefaultRoles(pageId);
};

export const canUserAccessPage = (
  pageId: string, 
  userRole: string | undefined, 
  accessControl: Record<string, AccessControl>
): boolean => {
  if (!userRole) return false;

  // 固定頁面（例如 Team Assign Board）：只允許 creator / admin，忽略所有設定
  const definition = getPageDefinition(pageId);
  if (definition?.adminOnly) return isGlobalAdminRole(userRole);

  const roles = getEffectiveRoles(pageId, accessControl);
  
  const hasAccess = roles.includes(userRole as AccessRole);
  
  /* Debug用
  if (!hasAccess) {
    console.warn(`Access denied for page ${pageId}. User role: ${userRole}. Allowed roles:`, roles);
  }
  */
  
  return hasAccess;
};

// 公會級管理頁面（公會聯合戰管理 / Team Assign Board）權限：
//   1. creator / admin 為全域管理員，一律放行（避免管理員取消勾選後把自己鎖在門外）。
//   2. 其餘使用者一律以「後台存取控制」勾選的角色為準（access_control 是唯一依據）。
//   3. 公會正/副會長視同 manager 角色，但同樣要後台有勾選 MANAGER 才放行。
// 注意：這裡不再無條件以 canManageGuild() 放行，否則「取消勾選 MANAGER」時，
// 身兼公會幹部的 manager 仍會繞過設定看到/進入頁面。
export const canUserAccessGuildPage = (
  pageId: string,
  userRole: string | undefined,
  accessControl: Record<string, AccessControl>,
  canManageGuild: () => boolean,
): boolean => {
  if (!userRole) return false;

  // 全域管理員：不受存取控制設定限制
  if (isGlobalAdminRole(userRole)) return true;

  if (isGuildManagementPage(pageId)) {
    const roles: AccessRole[] = getEffectiveRoles(pageId, accessControl);
    if (roles.includes(userRole as AccessRole)) return true;
    // 公會正/副會長：僅在後台勾選 MANAGER 時才視為 manager 放行
    return canManageGuild() && roles.includes('manager');
  }
  // 其餘頁面維持既有角色規則
  return canUserAccessPage(pageId, userRole, accessControl);
};
