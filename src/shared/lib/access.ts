import { AccessControl } from '@/entities/member/types';

export const getDefaultRoles = (pageId: string): ('member' | 'manager' | 'admin' | 'creator')[] => {
  switch (pageId) {
    case 'costume_list': return ['member', 'manager', 'admin', 'creator'];
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
