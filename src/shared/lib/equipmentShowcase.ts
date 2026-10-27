import { EQUIPMENT_CATEGORIES } from '@/entities/member/types';

/**
 * MemberBoard 成員卡右側顯示的 24C 裝備。
 *   venom_serpent                → 毒蛇之手
 *   phys_glove_chief_majesty     → 主神的威嚴
 *   magic_glove_guardian_scale   → 守護的龍鱗
 */
export const MEMBER_CARD_EQUIPMENT_KEYS = [
  'venom_serpent',
  'phys_glove_chief_majesty',
  'magic_glove_guardian_scale',
] as const;

export type MemberCardEquipmentKey = typeof MEMBER_CARD_EQUIPMENT_KEYS[number];

/**
 * 三件裝備的 24C 數量。
 *   number → 可見且有資料（0 代表沒有）
 *   null   → 該欄位被隱私設定遮蔽（或整張裝備表不可見）
 */
export type MemberEquipmentCounts = Record<MemberCardEquipmentKey, number | null>;

const CATEGORY_MAP = new Map(EQUIPMENT_CATEGORIES.map(category => [category.key, category]));

/** 卡片用的圖示 / 名稱 / 顏色（顏色需為完整 Tailwind class，避免動態拼接被 purge）。 */
export const MEMBER_CARD_EQUIPMENT_ITEMS = MEMBER_CARD_EQUIPMENT_KEYS.map(key => {
  const category = CATEGORY_MAP.get(key);
  const accentClass =
    key === 'venom_serpent'
      ? 'text-emerald-300'
      : key === 'phys_glove_chief_majesty'
        ? 'text-amber-300'
        : 'text-sky-300';

  return {
    key,
    icon: category?.icon ?? '',
    name: category?.name ?? key,
    accentClass,
  };
});

export const createEmptyMemberEquipmentCounts = (): MemberEquipmentCounts => ({
  venom_serpent: 0,
  phys_glove_chief_majesty: 0,
  magic_glove_guardian_scale: 0,
});

export const createHiddenMemberEquipmentCounts = (): MemberEquipmentCounts => ({
  venom_serpent: null,
  phys_glove_chief_majesty: null,
  magic_glove_guardian_scale: null,
});

/**
 * 從裝備表 jsonb / member.equipment 取出三件裝備的 24C 數量。
 *
 * 與 DB 的遮蔽語意對齊：
 *   - equipment 為 null / undefined → 整張裝備表不可見 → 全部 null
 *   - 裝備表可見但沒有該部位資料 → 0
 *   - 該部位有資料但 c24 為 null（C 值層級遮蔽）→ null
 */
export function extractMemberEquipmentCounts(equipment: unknown): MemberEquipmentCounts {
  if (!equipment || typeof equipment !== 'object') {
    return createHiddenMemberEquipmentCounts();
  }

  const source = equipment as Record<string, { c24?: number | string | null } | undefined>;

  return MEMBER_CARD_EQUIPMENT_KEYS.reduce((acc, key) => {
    const item = source[key];
    if (!item) {
      acc[key] = 0;
      return acc;
    }

    const raw = item.c24;
    if (raw === null) {
      acc[key] = null;
      return acc;
    }

    const value = Number(raw);
    acc[key] = Number.isFinite(value) ? value : 0;
    return acc;
  }, {} as MemberEquipmentCounts);
}
