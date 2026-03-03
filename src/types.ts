export type Role = 'leader' | 'coleader' | 'member';

export interface Guild {
  id?: string;
  name: string;
  tier?: number;
  orderNum?: number;
  username?: string;
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
  updatedAt?: number;
  status?: string;
  archiveRemark?: string;
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
  role: 'creator' | 'admin' | 'manager';
}

export interface Setting {
  id: string;
  bgmUrl?: string;
  bgmDefaultVolume?: number;
}

export interface Database {
  guilds: Record<string, Guild>;
  guildOrder?: string[];
  members: Record<string, Member>;
  characters: Record<string, Character>;
  costumes: Record<string, Costume>;
  users: Record<string, User>;
  settings: Record<string, Setting>;
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