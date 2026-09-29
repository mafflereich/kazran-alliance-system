import { AccessControl } from '@/entities/member/types';

export type AccessRole = 'member' | 'manager' | 'admin' | 'creator';

// 公會級管理頁面：以「公會正/副會長（公會幹部）」身分判斷的頁面（詳見 canUserAccessGuildPage）
const GUILD_MANAGEMENT_PAGES = ['guild_raid_manager', 'member_board'];

export const isGuildManagementPage = (pageId: string): boolean =>
  GUILD_MANAGEMENT_PAGES.includes(pageId);

export const getDefaultRoles = (pageId: string): AccessRole[] => {
  switch (pageId) {
    case 'costume_list': return ['member', 'manager', 'admin', 'creator'];
    case 'my_costumes': return ['member', 'manager', 'admin', 'creator'];
    case 'application_mailbox': return ['member', 'manager', 'admin', 'creator'];
    case 'arcade': return ['manager', 'admin', 'creator'];
    case 'alliance_raid_record': return ['creator'];
    case 'toolbox': return ['manager', 'admin', 'creator'];
    case 'member_board': return ['manager', 'admin', 'creator'];
    case 'guild_raid_manager': return ['manager', 'admin', 'creator'];
    case 'admin_settings': return ['admin', 'creator'];
    default: return ['creator', 'admin'];
  }
};

// 頁面目前生效的可存取角色：以後台「存取控制」設定為準，尚未設定時才使用預設值
const resolveRoles = (
  pageId: string,
  accessControl: Record<string, AccessControl>
): AccessRole[] => accessControl[pageId]?.roles || getDefaultRoles(pageId);

export const canUserAccessPage = (
  pageId: string, 
  userRole: string | undefined, 
  accessControl: Record<string, AccessControl>
): boolean => {
  if (!userRole) return false;
  const roles = resolveRoles(pageId, accessControl);
  
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
  if (userRole === 'creator' || userRole === 'admin') return true;

  if (isGuildManagementPage(pageId)) {
    const roles: string[] = resolveRoles(pageId, accessControl);
    if (roles.includes(userRole)) return true;
    // 公會正/副會長：僅在後台勾選 MANAGER 時才視為 manager 放行
    return canManageGuild() && roles.includes('manager');
  }
  // 其餘頁面維持既有角色規則
  return canUserAccessPage(pageId, userRole, accessControl);
};
