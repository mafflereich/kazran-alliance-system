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
  updatedAt?: number; // epoch ms：該服裝最近更新時間
}

// 遊玩傾向：可複選的內容模式
export const PLAY_MODE_OPTIONS = [
  'guild_raid',   // 公會聯合戰
  'beast',        // 魔獸
  'golden_mirror',// 黃金鏡中
  'story',        // 劇情
] as const;
export type PlayMode = typeof PLAY_MODE_OPTIONS[number];

// 遊玩傾向：只能選一的投入程度
export const DEDICATION_OPTIONS = [
  'aggressive',   // 進取
  'normal',       // 平常
  'casual',       // 休閒
] as const;
export type Dedication = typeof DEDICATION_OPTIONS[number];

export interface PlayPreferences {
  modes: PlayMode[];
  dedication?: Dedication;
}

// 舊版「部位分組」定義（多件裝備共用一個 23C / 24C 欄位）
interface LegacyEquipmentGroupDef {
  key: string;
  icon: string;
  icons?: { thumb: string; name: string }[];
}

// 裝備單件定義（每件各自一欄，記錄 23C / 24C 數量）
//   key   = 穩定識別碼（members.equipment 的 jsonb key）
//   icon  = 代表圖示 thumb URL
//   name  = 預設顯示名稱（i18n 缺漏時的 fallback）
//   group = 所屬部位分組 key（表頭 / 編輯視窗的分組標示用）
//   icons = 向後相容欄位（單件時僅含自己一筆）
export interface EquipmentCategoryDef {
  key: string;
  icon: string;
  name: string;
  group: string;
  icons?: { thumb: string; name: string }[];
}

const WEAPONS_THUMB = (id: string) => `https://image-bd2db.souseha.com/weapons_new/thumbs/${id}_thumb.webp`;

const LEGACY_EQUIPMENT_GROUPS: LegacyEquipmentGroupDef[] = [
  {
    key: 'phys_weapon',
    icon: WEAPONS_THUMB('icon_equipment4101_61'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4101_61'), name: '惡龍的魔劍' },
      { thumb: WEAPONS_THUMB('icon_equipment4102_62'), name: '雷霆槌子' },
      { thumb: WEAPONS_THUMB('icon_equipment4103_63'), name: '必中之矛' },
    ],
  },
  {
    key: 'magic_weapon',
    icon: WEAPONS_THUMB('icon_equipment4104_64'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4104_64'), name: '旅行之神的摯友' },
      { thumb: WEAPONS_THUMB('icon_equipment4105_65'), name: '毀滅者之眼' },
      { thumb: WEAPONS_THUMB('icon_equipment4106_66'), name: '魔王的禁書' },
    ],
  },
  {
    key: 'ur_exclusive',
    icon: WEAPONS_THUMB('icon_equipment201_21'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment201_21'), name: '皇家石' },
    ],
  },
  {
    key: 'venom_serpent',
    icon: WEAPONS_THUMB('icon_equipment4504_88'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4504_88'), name: '毒蛇之手' },
    ],
  },
  {
    key: 'life_crit_dmg',
    icon: WEAPONS_THUMB('icon_equipment4505_89'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4505_89'), name: '湖水戒指' },
      { thumb: WEAPONS_THUMB('icon_equipment4506_90'), name: '魅惑之眼' },
    ],
  },
  {
    key: 'life_crit_rate',
    icon: WEAPONS_THUMB('icon_equipment4502_86'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4502_86'), name: '美學之巔' },
      { thumb: WEAPONS_THUMB('icon_equipment4503_87'), name: '調和之約' },
    ],
  },
  {
    key: 'phys_glove',
    icon: WEAPONS_THUMB('icon_equipment4201_79'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4201_79'), name: '神王的銀臂' },
      { thumb: WEAPONS_THUMB('icon_equipment4203_81'), name: '主神的威嚴' },
    ],
  },
  {
    key: 'magic_glove',
    icon: WEAPONS_THUMB('icon_equipment4206_84'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4206_84'), name: '背叛的束縛' },
      { thumb: WEAPONS_THUMB('icon_equipment4205_83'), name: '守護的龍鱗' },
    ],
  },
  {
    key: 'phys_crit_glove',
    icon: WEAPONS_THUMB('icon_equipment4202_80'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4202_80'), name: '造反的決心' },
    ],
  },
  {
    key: 'magic_crit_glove',
    icon: WEAPONS_THUMB('icon_equipment4204_82'),
    icons: [
      { thumb: WEAPONS_THUMB('icon_equipment4204_82'), name: '憤怒之環' },
    ],
  },
];

// ------------------------------------------------------------
// 需要「分拆成單件」的舊分組 key
//   → 這些分組原本把多件裝備合併成一個 23C / 24C 欄位，數值無法對應回
//     單件，因此分拆後既有資料一律清空，由成員重新填寫
//     （見 docs/sql/split_ur_equipment_items.sql）。
// ------------------------------------------------------------
export const SPLIT_LEGACY_GROUP_KEYS = [
  'phys_weapon',
  'magic_weapon',
  'life_crit_dmg',
  'life_crit_rate',
  'phys_glove',
  'magic_glove',
] as const;

// 舊分組 key → 各單件的穩定 key（順序需與 icons 陣列一致）
const SPLIT_ITEM_KEYS: Record<string, string[]> = {
  phys_weapon: ['phys_weapon_dragon_sword', 'phys_weapon_thunder_hammer', 'phys_weapon_piercing_spear'],
  magic_weapon: ['magic_weapon_traveler_friend', 'magic_weapon_destroyer_eye', 'magic_weapon_demon_grimoire'],
  life_crit_dmg: ['life_crit_dmg_lake_ring', 'life_crit_dmg_charm_eye'],
  life_crit_rate: ['life_crit_rate_aesthetic_peak', 'life_crit_rate_harmony_pact'],
  phys_glove: ['phys_glove_god_arm', 'phys_glove_chief_majesty'],
  magic_glove: ['magic_glove_betrayal_bond', 'magic_glove_guardian_scale'],
};

// ------------------------------------------------------------
// 裝備清單（每個 UR 通用裝備各自一欄）
//   - 多件分組 → 逐件拆開（key 取 SPLIT_ITEM_KEYS）
//   - 單件分組 → 沿用原 key（既有資料保留，不清空）
//   - ur_exclusive（5星UR專用裝備）→ 不參與分拆，維持單欄
// ------------------------------------------------------------
export const EQUIPMENT_CATEGORIES: EquipmentCategoryDef[] = LEGACY_EQUIPMENT_GROUPS.flatMap(group => {
  const icons = group.icons && group.icons.length > 0 ? group.icons : [{ thumb: group.icon, name: group.key }];
  const itemKeys = SPLIT_ITEM_KEYS[group.key];
  return icons.map((ico, idx) => ({
    key: itemKeys?.[idx] ?? group.key,
    icon: ico.thumb,
    name: ico.name,
    group: group.key,
    icons: [ico],
  }));
});

export interface EquipmentItem {
  c23: number; // 23C 數量
  c24: number; // 24C 數量
  updatedAt?: number; // epoch ms：該部位最近更新時間
}

export type Equipment = Record<string, EquipmentItem>;

// 裝備表隱私級別
export const EQUIPMENT_VISIBILITY_OPTIONS = [
  'public',
  'all_manager',
  'guild_manager',
  'admin',
] as const;
export type EquipmentVisibility = typeof EQUIPMENT_VISIBILITY_OPTIONS[number];

// 每個部位的隱私設定（23C/24C 可獨立覆蓋）
export interface CategoryVisibilityItem {
  visibility?: EquipmentVisibility;  // 部位級（未設定則 fallback 到 equipmentVisibility）
  c23?: EquipmentVisibility;         // 23C 專屬覆蓋
  c24?: EquipmentVisibility;         // 24C 專屬覆蓋
}

// 全域 → 部位 → C值 的層級隱私 map（key = EQUIPMENT_CATEGORIES 的 key）
export type CategoryVisibility = Record<string, CategoryVisibilityItem>;

export interface Member {
  id?: string;
  name: string;
  guildId: string;
  role: Role;
  records: Record<string, CostumeRecord>;
  exclusiveWeapons?: Record<string, boolean>; // characterId: boolean
  equipment?: Equipment;
  playPreferences?: PlayPreferences;
  equipmentNote?: string;
  equipmentVisibility?: EquipmentVisibility;
  categoryVisibility?: CategoryVisibility; // 每部位獨立隱私（覆蓋 equipmentVisibility）
  isEquipmentHidden?: boolean; // 舊版布林（僅向後相容用）
  refiningTraces?: number; // 煉製之痕數量
  equipmentUpdatedAt?: number; // 整張裝備表最近更新（epoch ms）
  costumesUpdatedAt?: number; // 全部服裝/專武最近更新（epoch ms）
  note?: string;
  seasonNote?: string;
  overkill?: number | null;
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
  gender?: string;
  atkType?: string;
  star?: string;
  attribute?: string;
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
  applicationPendingCount?: number;
  // 裝備表「請更新」基準時間（epoch ms）：
  //   成員的裝備表更新時間若早於此時間點，裝備表會高亮該成員並可一鍵請貝拉通知。
  //   0 / null / undefined 表示不啟用高亮。
  equipmentReminderAt?: number;
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