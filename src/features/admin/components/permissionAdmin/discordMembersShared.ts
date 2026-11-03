/** 系統角色對應的 Discord 身分組（與 sync-discord-roles / GSD_Bella routes/shared.ts 一致） */
export const MANAGER_ROLE_ID = '1251021144144740372';
export const MEMBER_ROLE_ID = '1404976598507323393';

/** 公會身分組命名規則：`${公會名稱}-公會成員 (棕色2)`（容忍全形 dash 與空白） */
const GUILD_ROLE_PATTERN = /^(.+?)[-－]\s*公會成員.*棕色2/;

export interface DiscordMemberEntry {
  /** Discord user id（對應 profiles.discord_id） */
  id: string;
  username: string;
  globalName: string | null;
  nickname: string | null;
  displayName: string;
  joinedAt: string | null;
  roleIds: string[];
  roleNames: string[];
}

export interface DiscordMemberSnapshot {
  guildId: string;
  /** 名單取得時間（bot 端快取時間） */
  fetchedAt: string;
  cached: boolean;
  memberCount: number;
  members: DiscordMemberEntry[];
}

/** 這個成員在系統裡應該是什麼角色（manager > member > null） */
export function systemRoleOf(member: DiscordMemberEntry): 'manager' | 'member' | null {
  if (member.roleIds.includes(MANAGER_ROLE_ID)) return 'manager';
  if (member.roleIds.includes(MEMBER_ROLE_ID)) return 'member';
  return null;
}

/** 從公會身分組取出公會名稱（例如「青龍-公會成員 (棕色2)」→「青龍」） */
export function guildNamesOf(member: DiscordMemberEntry): string[] {
  return Array.from(
    new Set(
      member.roleNames
        .map(roleName => GUILD_ROLE_PATTERN.exec(roleName)?.[1]?.trim())
        .filter((name): name is string => !!name),
    ),
  );
}
