import type { AccessRoleV2, PermissionText } from '@/shared/lib/permissions';
import {
  PERMISSION_ACCESS_LABELS,
  PERMISSION_DOMAIN_LABELS,
  PERMISSION_ENFORCEMENT_LABELS,
  PERMISSIONS,
  getPermissionDescription,
  getPermissionLabel,
} from '@/shared/lib/permissions';
import { supabase } from '@/shared/api/supabase';

export type GrantScope = 'global' | 'managed';
export type GrantMap = Record<string, Partial<Record<AccessRoleV2, GrantScope>>>;

export interface UserGrantRow {
  id: string;
  user_auth_id: string;
  permission: string;
  effect: 'allow' | 'deny';
  guild_id: string | null;
  expires_at: string | null;
  reason: string | null;
}

export interface ProfileRow {
  auth_id: string;
  display_name: string | null;
  user_role: string | null;
  /** profiles.id：以逗號分隔的遊戲成員 id（Discord 帳號才有） */
  id?: string | null;
  discord_username?: string | null;
  /** Discord 使用者 id（sync-discord-roles 需要） */
  discord_id?: string | null;
  /** 以逗號分隔的公會名稱（由 DB trigger 同步） */
  user_guilds?: string | null;
}

export interface AuditRow {
  created_at: string;
  level: string;
  message: string;
  user_id: string | null;
  details: any;
  action?: string | null;
}

export const DOMAIN_LABELS: Record<string, PermissionText> = PERMISSION_DOMAIN_LABELS;

export const ACCESS_LABELS: Record<string, PermissionText> = PERMISSION_ACCESS_LABELS;

export const ENFORCEMENT_LABELS: Record<string, PermissionText> = PERMISSION_ENFORCEMENT_LABELS;

/** 權限顯示名稱：一律由 src/shared/lib/permissions.ts 的 label 衍生，不在這裡重寫。 */
export const PERMISSION_LABELS: Record<string, PermissionText> = Object.fromEntries(
  PERMISSIONS.map(permission => [permission.key, permission.label]),
);

export const permissionLabel = (key: string, isZh: boolean): string => getPermissionLabel(key, isZh);

/** 權限實際功能：一律由 src/shared/lib/permissions.ts 的 description 衍生。 */
export const PERMISSION_DESCRIPTIONS: Record<string, PermissionText> = Object.fromEntries(
  PERMISSIONS.map(permission => [permission.key, permission.description]),
);

export const permissionDescription = (key: string, isZh: boolean): string =>
  getPermissionDescription(key, isZh);

/** 角色代碼的中文名稱（DB 值不動，只改顯示） */
export const ROLE_LABELS: Record<string, { zh: string; en: string }> = {
  creator: { zh: '建立者', en: 'Creator' },
  admin: { zh: '管理員', en: 'Admin' },
  officer: { zh: '幹部', en: 'Officer' },
  manager: { zh: '管理', en: 'Manager' },
  member: { zh: '一般成員', en: 'Member' },
};

export const ROLE_ORDER = ['creator', 'admin', 'officer', 'manager', 'member'];

export const roleLabel = (role: string | null | undefined, isZh: boolean): string => {
  if (!role) return isZh ? '未設定' : 'Unset';
  const item = ROLE_LABELS[role];
  return item ? (isZh ? item.zh : item.en) : role;
};

const PROFILES_PAGE_SIZE = 1000;

/**
 * 取得「可以被授權」的 profiles（有 auth_id 的帳號）。
 *
 * profiles 會隨成員數成長（1000+ 成員的聯盟已有數百個帳號），
 * PostgREST 預設一次最多回 1000 筆，所以這裡用 range 分頁抓完，
 * 避免例外授權的使用者清單漏人。
 */
export async function fetchGrantableProfiles(): Promise<ProfileRow[]> {
  return fetchProfiles(true);
}

/**
 * 帳號健檢用：連「從未登入（auth_id 為 null）」的 profiles 一起抓。
 * 這些列不會出現在例外授權清單，但一樣會佔住 Discord 綁定，需要被看見。
 */
export async function fetchAllProfilesForAudit(): Promise<ProfileRow[]> {
  return fetchProfiles(false);
}

async function fetchProfiles(onlyWithAuth: boolean): Promise<ProfileRow[]> {
  if (!supabase) return [];

  const rows: ProfileRow[] = [];
  for (let from = 0; ; from += PROFILES_PAGE_SIZE) {
    let query = supabase
      .from('profiles')
      .select('auth_id, display_name, user_role, id, discord_username, discord_id, user_guilds')
      .order('display_name', { ascending: true })
      .order('auth_id', { ascending: true });

    if (onlyWithAuth) {
      query = query.not('auth_id', 'is', null);
    }

    const { data, error } = await query.range(from, from + PROFILES_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data as ProfileRow[]) || [];
    rows.push(...page);
    if (page.length < PROFILES_PAGE_SIZE) break;
  }
  return rows;
}
