import type { AccessRoleV2 } from '@/shared/lib/permissions';

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
}

export interface AuditRow {
  created_at: string;
  level: string;
  message: string;
  user_id: string | null;
  details: any;
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
