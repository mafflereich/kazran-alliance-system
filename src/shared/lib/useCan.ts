import { useCallback } from 'react';
import { useAppContext } from '@/store';
import type { PermissionKey } from './permissions';

/**
 * 權限判斷的唯一前端入口（Phase 1）。
 *
 * 只讀 DB 的 get_my_access() 結果，不在瀏覽器重算角色規則。
 * access.version === 0 表示 DB 尚未提供 v2 資料（migration 未套用），
 * 需要舊行為的呼叫端請用 usePermissions()（它會回退到舊規則）。
 */
export function useCan() {
  const { access } = useAppContext();

  const can = useCallback(
    (permission: PermissionKey, guildId?: string | null): boolean => {
      if (access.isAdmin) return true;
      if (access.globalPermissions.includes(permission)) return true;
      if (!access.managedPermissions.includes(permission)) return false;
      // managed：有帶公會就比對，沒帶 = 「任何一個我管理的公會都可以嗎？」
      return guildId ? access.managedGuildIds.includes(guildId) : access.managedGuildIds.length > 0;
    },
    [access],
  );

  return { can, ready: access.version > 0, ...access };
}
