import { useMemo } from 'react';
import { useAppContext } from '@/store';
import {
  AccessRole,
  canUserAccessGuildPage,
  isGlobalAdminRole,
  isManagerOrAboveRole,
} from './access';
import { legacyPagePermission } from './permissions';
import { useCan } from './useCan';

export interface PageAccessOptions {
  /**
   * Header 用：後台規則表還沒載入時先當作沒權限，
   * 避免「規則還沒回來就先放行」造成選單閃一下。
   */
  requireRulesLoaded?: boolean;
}

/**
 * 全站統一的權限入口。
 *
 * 判斷來源只有三個：
 *   1. profiles.user_role（admin_users / Discord 身分組）
 *   2. 綁定成員的職位（members.role = leader / coleader → 公會幹部）
 *   3. access_control（各頁面開放給哪些角色）
 *
 * 任何頁面或元件都應使用這個 hook，不要各自重寫角色判斷。
 */
export function usePermissions() {
  const { db, userRole, managedGuildIds, canManageGuild, isRoleLoading, isLoaded, access } = useAppContext();
  // Phase 1 相容層：DB 有 v2 授權（version > 0）時走目錄，否則完全沿用舊規則
  const { can } = useCan();

  return useMemo(() => {
    const role = (userRole || undefined) as AccessRole | undefined;
    const isGlobalAdmin = isGlobalAdminRole(role);
    const isManager = isManagerOrAboveRole(role);
    const isGuildOfficer = managedGuildIds.length > 0;
    // isLoaded = 初始資料（含 access_control）已抓完；空表代表「全部用預設值」，
    // 與「還沒載入」必須分開，否則空表會讓選單全部消失、直接打網址卻進得去。
    const rulesLoaded = isLoaded;

    const canAccessPage = (pageId: string, options: PageAccessOptions = {}): boolean => {
      if (options.requireRulesLoaded && !rulesLoaded) return false;

      // Phase 1：只換「判斷來源」，不改行為。
      // migration 尚未套用時 access.version === 0，直接回退舊規則。
      const permission = legacyPagePermission(pageId);
      if (access.version > 0 && permission) {
        return can(permission);
      }
      return canUserAccessGuildPage(pageId, role, db.accessControl, canManageGuild);
    };

    return {
      // 身分
      role,
      userRole,
      isRoleLoading,
      isGlobalAdmin,
      isManager,
      isGuildOfficer,
      managedGuildIds,

      // 頁面
      rulesLoaded,
      canAccessPage,

      // 公會級能力
      canManageGuild,
      canViewAllGuilds: isManager,
      canProcessApplications: canManageGuild(),
      canManageRaid: canManageGuild(),
      canManageMemberBoard: isGlobalAdmin,
      canManageAdmin: isGlobalAdmin,
    };
  }, [db.accessControl, userRole, managedGuildIds, canManageGuild, isRoleLoading, isLoaded, access, can]);
}
