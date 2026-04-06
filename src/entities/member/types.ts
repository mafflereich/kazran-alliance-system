export type Role = 'leader' | 'coleader' | 'member';

export interface Guild {
  id?: string;
  name: string;
  tier?: number;
  orderNum?: number;
  username?: string;
  isDisplay?: boolean;
  serial?: string | number;
  percentShown?: number;
}

export interface CostumeRecord {
  level: number; // -1 for Not Owned, 0-5 for +0 to +5
  cValue?: number; // 6-24
}

export interface Member {
  id?: string;
  name: string;
  guildId: string;
  role: Role;
  records: Record<string, CostumeRecord>;
  exclusiveWeapons?: Record<string, boolean>; // characterId: boolean
  note?: string;
  seasonNote?: string;
  color?: string;
  score?: number;
  updatedAt?: number;
  status?: string;
  archiveRemark?: string;
  parentId?: string;
  isReserved?: boolean;
}

export interface Character {
  id: string;
  name: string;
  nameE?: string;
  orderNum: number;
  imageName?: string;
}

export interface Costume {
  id: string;
  name: string;
  nameE?: string;
  characterId: string;
  imageName?: string;
  orderNum?: number;
  isNew?: boolean;
}

export interface User {
  username: string;
  role: 'creator' | 'admin' | 'manager' | 'member';
}

export interface Setting {
  id: string;
  bgmUrl?: string;
  bgmDefaultVolume?: number;
  indexMessage?: string;
  indexPercentType?: 'empty' | 'new_costumes_owned';
  isDebugMode?: boolean;
}

export interface ApplyMail {
  id: string;
  createdAt: string;
  subject: string;
  content: string;
  status: string;
  loginId: string;
}

export interface AccessControl {
  page: string;
  roles: ('member' | 'manager' | 'admin' | 'creator')[];
}

export interface Database {
  guilds: Record<string, Guild>;
  guildOrder?: string[];
  members: Record<string, Member>;
  characters: Record<string, Character>;
  costumes: Record<string, Costume>;
  settings: Record<string, Setting>;
  applyMails: Record<string, ApplyMail>;
  accessControl: Record<string, AccessControl>;
}
export interface ArchiveHistory {
  id: string;
  memberId: string;
  fromGuildId: string;
  archiveReason: string;
  archivedAt: string;
  guilds: {
    name: string;
  };
}

export interface ArchivedMember {
  id: string;
  name: string;
  status: string;
  archiveRemark: string;
  membersArchiveHistory: ArchiveHistory[];
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export type GuildWithMembers = Guild & {
  members: Member[];
};

export type TieredData = {
  tier: number;
  guilds: GuildWithMembers[];
};