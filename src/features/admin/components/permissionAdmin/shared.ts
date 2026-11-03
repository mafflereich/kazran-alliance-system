import type { AccessRoleV2 } from '@/shared/lib/permissions';
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

export const DOMAIN_LABELS: Record<string, { zh: string; en: string }> = {
  page: { zh: '頁面', en: 'Pages' },
  equipment: { zh: '裝備／服裝', en: 'Equipment' },
  member: { zh: '成員', en: 'Members' },
  raid: { zh: '聯合戰', en: 'Raid' },
  mailbox: { zh: '申請信箱', en: 'Mailbox' },
  admin: { zh: '後台', en: 'Admin' },
  arcade: { zh: '小遊戲', en: 'Arcade' },
};

/** 30 個權限的中英標籤（admin 後台用；比 i18n key 直覺） */
export const PERMISSION_LABELS: Record<string, { zh: string; en: string }> = {
  'page.equipment.view': { zh: '裝備表', en: 'Equipment table' },
  'page.my_costumes.view': { zh: '服裝表', en: 'Costumes' },
  'page.mailbox.view': { zh: '申請信箱', en: 'Application mailbox' },
  'page.arcade.view': { zh: '小遊戲', en: 'Arcade' },
  'page.toolbox.view': { zh: '小工具', en: 'Toolbox' },
  'page.raid.view': { zh: '聯盟戰記', en: 'Alliance raid record' },
  'page.raid_manage.view': { zh: '公會聯合戰管理', en: 'Guild raid manager' },
  'page.member_board.view': { zh: '團隊看板', en: 'Team assign board' },
  'page.admin.view': { zh: '後台', en: 'Admin' },
  'equipment.read.managed': { zh: '讀取本公會裝備', en: 'Read own-guild equipment' },
  'equipment.read.staff': { zh: '讀取全部裝備', en: 'Read all equipment' },
  'equipment.write.self': { zh: '編輯自己裝備', en: 'Edit own equipment' },
  'equipment.visibility.configure': { zh: '設定裝備可見度', en: 'Configure visibility' },
  'member.edit.managed': { zh: '編輯成員資料', en: 'Edit member profile' },
  'member.archive': { zh: '封存成員', en: 'Archive members' },
  'member.note.write.managed': { zh: '編輯成員備註', en: 'Edit member notes' },
  'raid.score.write': { zh: '編輯戰記分數', en: 'Edit raid scores' },
  'raid.season.manage': { zh: '賽季管理', en: 'Manage seasons' },
  'raid.ghost.manage': { zh: '幽靈紀錄', en: 'Ghost records' },
  'raid.roster.move': { zh: '成員移轉', en: 'Move members' },
  'raid.checkin.write': { zh: '成員簽到', en: 'Member check-in' },
  'mailbox.process': { zh: '處理申請', en: 'Process applications' },
  'admin.guild.manage': { zh: '公會管理', en: 'Manage guilds' },
  'admin.costume.manage': { zh: '服裝資料庫', en: 'Costume database' },
  'admin.identity.manage': { zh: '身分綁定', en: 'Identity binding' },
  'admin.logs.read': { zh: '系統日誌', en: 'System logs' },
  'admin.tools.run': { zh: '工具', en: 'Tools' },
  'admin.settings.manage': { zh: '系統設定', en: 'Settings' },
  'admin.permission.manage': { zh: '權限設定', en: 'Permission settings' },
  'admin.role.assign': { zh: '指派角色', en: 'Assign roles' },
  'arcade.speed_refining.use': { zh: '極速精煉', en: 'Speed refining' },
};

export const permissionLabel = (key: string, isZh: boolean): string => {
  const item = PERMISSION_LABELS[key];
  return item ? (isZh ? item.zh : item.en) : key;
};

/**
 * 每個權限的白話說明。
 *
 * 為什麼要有：例外授權如果只顯示 `raid.season.manage` 這種 key，沒人看得懂
 * 這個開關到底會交出什麼權力，很容易誤開。這裡用一句話講清楚「給了能做什麼」。
 */
export const PERMISSION_DESCRIPTIONS: Record<string, { zh: string; en: string }> = {
  'page.equipment.view': {
    zh: '可以打開裝備表頁面；實際能看到誰的裝備仍受各成員的隱私設定限制。',
    en: 'Open the equipment page; who you can actually see still depends on each member’s privacy settings.',
  },
  'page.my_costumes.view': {
    zh: '可以查看服裝表與專屬武器收集進度。',
    en: 'Open the costume collection page.',
  },
  'page.mailbox.view': {
    zh: '可以查看申請信箱（送出加入申請、查看自己的申請進度）。',
    en: 'Open the application mailbox.',
  },
  'page.arcade.view': {
    zh: '可以使用小遊戲區（例如極速精煉模擬）。',
    en: 'Open the arcade page.',
  },
  'page.toolbox.view': {
    zh: '可以使用小工具區。',
    en: 'Open the toolbox page.',
  },
  'page.raid.view': {
    zh: '可以查看聯盟戰記與歷史賽季紀錄（唯讀）。',
    en: 'View the alliance raid record and past seasons (read-only).',
  },
  'page.raid_manage.view': {
    zh: '可以進入公會聯合戰管理；實際要修改分數、移轉成員、簽到，還需要對應的 raid.* 權限。',
    en: 'Open the guild raid manager; editing scores, moving members or check-in still needs the matching raid.* permission.',
  },
  'page.member_board.view': {
    zh: '可以查看團隊看板（成員分配與封存清單）。',
    en: 'View the team assign board.',
  },
  'page.admin.view': {
    zh: '可以進入後台；每個分頁仍需對應的 admin.* 權限才能使用。',
    en: 'Open the admin dashboard; each tab still needs its matching admin.* permission.',
  },
  'equipment.read.managed': {
    zh: '可以讀取「自己管理的公會」成員裝備（成員設為不公開的項目仍會遮蔽）。',
    en: 'Read equipment of members in guilds you manage (privacy settings still apply).',
  },
  'equipment.read.staff': {
    zh: '可以讀取所有公會成員的裝備（不受公會限制，但成員的隱私設定仍會遮蔽）。',
    en: 'Read equipment of members in every guild (member privacy settings still apply).',
  },
  'equipment.write.self': {
    zh: '可以編輯自己的裝備與重要資源。',
    en: 'Edit your own equipment and important resources.',
  },
  'equipment.visibility.configure': {
    zh: '可以調整裝備／資源的可見度與「請更新」提醒設定。',
    en: 'Configure equipment visibility and update-reminder settings.',
  },
  'member.edit.managed': {
    zh: '可以編輯「自己管理的公會」成員資料（名稱、角色、所屬公會）。',
    en: 'Edit member profiles (name, role, guild) in guilds you manage.',
  },
  'member.archive': {
    zh: '可以封存成員並填寫封存原因。',
    en: 'Archive members and write the archive reason.',
  },
  'member.note.write.managed': {
    zh: '可以編輯「自己管理的公會」成員備註與賽季備註。',
    en: 'Edit member notes and season notes in guilds you manage.',
  },
  'raid.score.write': {
    zh: '可以編輯聯合戰分數與擊殺紀錄（自己管理的公會）。',
    en: 'Edit raid scores and kill records in guilds you manage.',
  },
  'raid.season.manage': {
    zh: '可以建立、修改與封存聯合戰賽季。',
    en: 'Create, edit and archive raid seasons.',
  },
  'raid.ghost.manage': {
    zh: '可以新增或刪除幽靈（未加入公會）成員的紀錄。',
    en: 'Add or delete ghost (guildless) member records.',
  },
  'raid.roster.move': {
    zh: '可以把成員移轉到其他公會，並同步名單。',
    en: 'Move members to another guild and sync the roster.',
  },
  'raid.checkin.write': {
    zh: '可以標記成員的報名／簽到狀態。',
    en: 'Mark member sign-up / check-in status.',
  },
  'mailbox.process': {
    zh: '可以審核加入申請（核准或拒絕）。',
    en: 'Approve or reject join applications.',
  },
  'admin.guild.manage': {
    zh: '可以新增、修改、刪除公會。',
    en: 'Create, edit and delete guilds.',
  },
  'admin.costume.manage': {
    zh: '可以維護服裝與角色資料庫。',
    en: 'Maintain the costume and character database.',
  },
  'admin.identity.manage': {
    zh: '可以綁定 Discord 帳號與遊戲成員、處理認領申請。',
    en: 'Bind Discord accounts to game members and handle claims.',
  },
  'admin.logs.read': {
    zh: '可以查看系統日誌。',
    en: 'Read system logs.',
  },
  'admin.tools.run': {
    zh: '可以執行後台工具（備份還原、CSV 匯入匯出、Discord 同步等）。',
    en: 'Run admin tools (backup/restore, CSV, Discord sync, …).',
  },
  'admin.settings.manage': {
    zh: '可以修改全站系統設定。',
    en: 'Change site-wide settings.',
  },
  'admin.permission.manage': {
    zh: '可以進入「權限設定」，調整角色權限矩陣與例外授權。',
    en: 'Open Permission settings and change role grants / overrides.',
  },
  'admin.role.assign': {
    zh: '可以指派使用者的 manager / member 角色。',
    en: 'Assign the manager / member role to users.',
  },
  'arcade.speed_refining.use': {
    zh: '可以使用極速精煉模擬器。',
    en: 'Use the speed refining simulator.',
  },
};

export const permissionDescription = (key: string, isZh: boolean): string => {
  const item = PERMISSION_DESCRIPTIONS[key];
  return item ? (isZh ? item.zh : item.en) : '';
};

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
