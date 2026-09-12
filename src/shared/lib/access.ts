import { AccessControl } from '@/entities/member/types';

// 公會級管理頁面：正/副會長（取代 manager 角色）可存取
const GUILD_MANAGEMENT_PAGES = ['guild_raid_manager', 'member_board'];

export const isGuildManagementPage = (pageId: string): boolean =>
  GUILD_MANAGEMENT_PAGES.includes(pageId);

export const getDefaultRoles = (pageId: string): ('member' | 'manager' | 'admin' | 'creator')[] => {
  switch (pageId) {
    case 'costume_list': return ['member', 'manager', 'admin', 'creator'];
    case 'my_costumes': return ['member', 'manager', 'admin', 'creator'];
    case 'application_mailbox': return ['member', 'manager', 'admin', 'creator'];
    case 'arcade': return ['manager', 'admin', 'creator'];
    case 'alliance_raid_record': return ['creator'];
    case 'toolbox': return ['manager', 'admin', 'creator'];
    case 'member_board': return ['member', 'manager', 'admin', 'creator'];
    case 'guild_raid_manager': return ['manager', 'admin', 'creator'];
    case 'admin_settings': return ['admin', 'creator'];
    default: return ['creator', 'admin'];
  }
};

export const canUserAccessPage = (
  pageId: string, 
  userRole: string | undefined, 
  accessControl: Record<string, AccessControl>
): boolean => {
  if (!userRole) return false;
  const ac = accessControl[pageId];
  const roles = ac?.roles || getDefaultRoles(pageId);
  
  const hasAccess = roles.includes(userRole as any);
  
  /* Debug用
  if (!hasAccess) {
    console.warn(`Access denied for page ${pageId}. User role: ${userRole}. Allowed roles:`, roles);
  }
  */
  
  return hasAccess;
};

// 公會級管理頁面權限：正/副會長（canManageGuild）或「後台存取權限設定」任一符合即可。
// 這樣 Discord manager 角色也能依 access_control 設定檢視頁面，同時保留正/副會長的身分判定。
export const canUserAccessGuildPage = (
  pageId: string,
  userRole: string | undefined,
  accessControl: Record<string, AccessControl>,
  canManageGuild: () => boolean,
): boolean => {
  // 公會級管理頁面：正/副會長 或 accessControl 角色規則皆可
  if (isGuildManagementPage(pageId)) {
    return canManageGuild() || canUserAccessPage(pageId, userRole, accessControl);
  }
  // 其餘頁面維持既有角色規則
  return canUserAccessPage(pageId, userRole, accessControl);
};
