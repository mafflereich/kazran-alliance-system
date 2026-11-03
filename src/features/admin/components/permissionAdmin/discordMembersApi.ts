import { supabase } from '@/shared/api/supabase';
import type { DiscordMemberSnapshot } from './discordMembersShared';

// 角色對應與公會名稱解析是純函式，放在 discordMembersShared.ts（可單獨測試）
export {
  MANAGER_ROLE_ID,
  MEMBER_ROLE_ID,
  guildNamesOf,
  systemRoleOf,
} from './discordMembersShared';
export type { DiscordMemberEntry, DiscordMemberSnapshot } from './discordMembersShared';

/**
 * 貝拉（GSD_Bella，Discord bot）的成員名單 API。
 *
 * 端點：GET https://chaosop.duckdns.org/api/discordMembers
 *   - 由 bot 直接回傳整個伺服器的成員快照（角色 id／角色名稱），10 分鐘快取
 *   - 需要 admin / creator 的 Supabase access token
 *
 * 為什麼不用「每個帳號打一次 sync-discord-roles」：300 個帳號要打 600 次
 * Discord API，又慢又容易撞 rate limit。抓一次名單在本機比對即可。
 */
export const BELLA_API_BASE = 'https://chaosop.duckdns.org';

/** 一次抓回整個伺服器的成員名單 */
export async function fetchDiscordMembers(): Promise<DiscordMemberSnapshot> {
  if (!supabase) throw new Error('Supabase 未初始化');

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('缺少登入憑證，請重新登入');

  const response = await fetch(`${BELLA_API_BASE}/api/discordMembers`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.error || text || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  if (!payload || !Array.isArray(payload.members)) {
    throw new Error('貝拉回傳的名單格式不正確');
  }

  return {
    guildId: String(payload.guildId ?? ''),
    fetchedAt: String(payload.fetchedAt ?? new Date().toISOString()),
    cached: !!payload.cached,
    memberCount: Number(payload.memberCount ?? payload.members.length),
    members: payload.members,
  };
}
