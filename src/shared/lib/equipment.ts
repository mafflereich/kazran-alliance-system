import { EQUIPMENT_CATEGORIES, Equipment, PlayPreferences, DEDICATION_OPTIONS, Dedication, PlayMode, PLAY_MODE_OPTIONS, EquipmentVisibility, CategoryVisibility } from '@/entities/member/types';

export const getEmptyEquipment = (): Equipment => {
  const e: Equipment = {};
  EQUIPMENT_CATEGORIES.forEach(c => { e[c.key] = { c23: 0, c24: 0 }; });
  return e;
};

export const normalizeEquipment = (equipment?: Equipment): Equipment => {
  const e = getEmptyEquipment();
  if (!equipment) return e;
  EQUIPMENT_CATEGORIES.forEach(c => {
    e[c.key] = {
      c23: Number(equipment[c.key]?.c23) || 0,
      c24: Number(equipment[c.key]?.c24) || 0,
      updatedAt: equipment[c.key]?.updatedAt,
    };
  });
  return e;
};

export const emptyPlayPreferences = (): PlayPreferences => ({ modes: [] });

export const normalizePlayPreferences = (pp?: PlayPreferences): PlayPreferences => {
  if (!pp) return emptyPlayPreferences();
  return { modes: pp.modes || [], dedication: pp.dedication };
};

// 是否為管理者（可看所有成員裝備表）
export const isManagerRole = (role: string | null): boolean =>
  role === 'manager' || role === 'admin' || role === 'creator';

// 是否為頂層管理者（creator / admin）
export const isAdminRole = (role: string | null): boolean =>
  role === 'admin' || role === 'creator';

// 取得成員裝備表最近更新時間（epoch ms）
//   以 equipmentUpdatedAt（整張裝備表）為準；從未更新過裝備表則為 0。
//   （刻意不退回 updatedAt：updatedAt 會被移公會、服裝編輯等操作更新，
//     用來判斷「裝備表是否已更新」會誤放行未更新裝備表的成員。）
export const getEquipmentUpdatedAt = (
  member: { equipmentUpdatedAt?: number },
): number => member.equipmentUpdatedAt ?? 0;

// 成員的裝備表是否「未在系統基準時間之後更新」
//   cutoff：系統設定的基準時間（epoch ms）。0 / undefined 表示不啟用高亮。
export const isEquipmentOutdated = (
  member: { equipmentUpdatedAt?: number },
  cutoff?: number | null,
): boolean => {
  if (!cutoff || cutoff <= 0) return false;
  return getEquipmentUpdatedAt(member) < cutoff;
};

// 統一取得隱私級別（向後相容舊布林 isEquipmentHidden）
export const normalizeEquipmentVisibility = (
  visibility?: EquipmentVisibility,
  legacyHidden?: boolean,
): EquipmentVisibility => {
  if (visibility == null) {
    // 舊版布林 → 只有全部管理者可看（原本「隱藏」= 僅管理者）
    return legacyHidden ? 'all_manager' : 'public';
  }
  return visibility;
};

// 前端鏡像 DB 的 can_view_equipment 政策，用於 UI 顯示
//   viewerRole: 目前使用者角色
//   viewerGuildIds: 目前使用者可管理的公會 id 清單（GUI 由外部帶入）
//   member: 目標成員
export const canViewEquipmentForUI = (
  viewerRole: string | null,
  member: { equipmentVisibility?: EquipmentVisibility; isEquipmentHidden?: boolean; guildId?: string },
  viewerManagedGuilds: string[],
  isCurrentUser: boolean,
): boolean => {
  if (isCurrentUser) return true;
  const vis = normalizeEquipmentVisibility(member.equipmentVisibility, member.isEquipmentHidden);
  switch (vis) {
    case 'public':
      return true;
    case 'all_manager':
      return isManagerRole(viewerRole);
    case 'guild_manager':
      return isManagerRole(viewerRole)
        && (isAdminRole(viewerRole) || (!!member.guildId && viewerManagedGuilds.includes(member.guildId)));
    case 'admin':
      return isAdminRole(viewerRole);
    default:
      return false;
  }
};

// 取得某部位某 C 值的最終隱私級別（全域 → 部位 → C值 層級解析）
export const resolveCategoryVisibility = (
  member: { equipmentVisibility?: EquipmentVisibility; categoryVisibility?: CategoryVisibility; isEquipmentHidden?: boolean },
  categoryKey: string,
  cField: 'c23' | 'c24',
): EquipmentVisibility => {
  const catVis = member.categoryVisibility?.[categoryKey];
  if (catVis) {
    const cOverride = cField === 'c23' ? catVis.c23 : catVis.c24;
    if (cOverride) return cOverride;
    if (catVis.visibility) return catVis.visibility;
  }
  return normalizeEquipmentVisibility(member.equipmentVisibility, member.isEquipmentHidden);
};

// 判斷觀看者能否看到某部位某 C 值的資料
export const canViewCategoryForUI = (
  viewerRole: string | null,
  member: { equipmentVisibility?: EquipmentVisibility; categoryVisibility?: CategoryVisibility; isEquipmentHidden?: boolean; guildId?: string },
  categoryKey: string,
  cField: 'c23' | 'c24',
  viewerManagedGuilds: string[],
  isCurrentUser: boolean,
): boolean => {
  if (isCurrentUser) return true;
  const vis = resolveCategoryVisibility(member, categoryKey, cField);
  switch (vis) {
    case 'public':
      return true;
    case 'all_manager':
      return isManagerRole(viewerRole);
    case 'guild_manager':
      return isManagerRole(viewerRole)
        && (isAdminRole(viewerRole) || (!!member.guildId && viewerManagedGuilds.includes(member.guildId)));
    case 'admin':
      return isAdminRole(viewerRole);
    default:
      return false;
  }
};

export { DEDICATION_OPTIONS, PLAY_MODE_OPTIONS };
export type { Dedication, PlayMode, EquipmentVisibility, CategoryVisibility };
