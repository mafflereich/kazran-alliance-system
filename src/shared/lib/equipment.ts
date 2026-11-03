import { EQUIPMENT_CATEGORIES, Equipment, PlayPreferences, DEDICATION_OPTIONS, Dedication, PlayMode, PLAY_MODE_OPTIONS, EquipmentVisibility, LegacyEquipmentVisibility, CategoryVisibility, ResourceVisibility, EquipmentResourceKey, EQUIPMENT_RESOURCES, EQUIPMENT_VISIBILITY_OPTIONS, DEFAULT_EQUIPMENT_VISIBILITY, EquipmentResources } from '@/entities/member/types';
import { isGlobalAdminRole, isManagerOrAboveRole } from './access';

export const getEmptyEquipment = (): Equipment => {
  const e: Equipment = {};
  EQUIPMENT_CATEGORIES.forEach(c => { e[c.key] = { c23: 0, c24: 0 }; });
  return e;
};

// 重要資源：全部初始化為 0，缺欄位 / 非數字一律視為 0
export const getEmptyEquipmentResources = (): EquipmentResources => {
  const resources = {} as EquipmentResources;
  EQUIPMENT_RESOURCES.forEach(({ key }) => { resources[key] = 0; });
  return resources;
};

export const normalizeEquipmentResources = (
  raw?: Partial<Record<string, unknown>> | null,
  fallbackRefiningTrace?: number | null,
): EquipmentResources => {
  const resources = getEmptyEquipmentResources();
  if (raw && typeof raw === 'object') {
    EQUIPMENT_RESOURCES.forEach(({ key }) => {
      const value = Number(raw[key]);
      resources[key] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    });
  }
  // 向後相容：舊資料只存在 members.refining_traces
  const fallback = Number(fallbackRefiningTrace);
  if (resources.refiningTrace === 0 && Number.isFinite(fallback) && fallback > 0) {
    resources.refiningTrace = Math.floor(fallback);
  }
  return resources;
};

// 從 equipment.__resources 取出重要資源（沒有資料時回傳全 0）
export const getEquipmentResources = (
  equipment?: Equipment | null,
  fallbackRefiningTrace?: number | null,
): EquipmentResources =>
  normalizeEquipmentResources((equipment as any)?.__resources, fallbackRefiningTrace);

export const normalizeEquipment = (equipment?: Equipment): Equipment => {
  const e = getEmptyEquipment();
  if (!equipment) {
    (e as any).__resources = getEmptyEquipmentResources();
    return e;
  }
  EQUIPMENT_CATEGORIES.forEach(c => {
    e[c.key] = {
      c23: Number(equipment[c.key]?.c23) || 0,
      c24: Number(equipment[c.key]?.c24) || 0,
      updatedAt: equipment[c.key]?.updatedAt,
    };
  });
  // 保留重要資源，避免存檔時被 normalize 清掉
  (e as any).__resources = normalizeEquipmentResources((equipment as any).__resources);
  return e;
};


export const emptyPlayPreferences = (): PlayPreferences => ({ modes: [] });

export const normalizePlayPreferences = (pp?: PlayPreferences): PlayPreferences => {
  if (!pp) return emptyPlayPreferences();
  return { modes: pp.modes || [], dedication: pp.dedication };
};

// 角色判斷統一由 shared/lib/access.ts 提供（單一來源）
export const isManagerRole = (role: string | null): boolean => isManagerOrAboveRole(role);

// 是否為頂層管理者（creator / admin）
export const isAdminRole = (role: string | null): boolean => isGlobalAdminRole(role);

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

// 統一取得隱私級別（向後相容舊布林 isEquipmentHidden 與已停用的 'public' / 'admin'）
//   裝備表最低可見度＝本公會正副會長（guild_manager）：
//     舊資料的 'public' / 'admin' / 未設定 / 未知值 → 'guild_manager'
//     舊版布林 is_equipment_hidden = true（僅管理者可見）→ 'all_manager'
export const normalizeEquipmentVisibility = (
  visibility?: LegacyEquipmentVisibility | null,
  legacyHidden?: boolean,
): EquipmentVisibility => {
  if (visibility === 'public' || visibility === 'admin' || visibility == null) {
    return legacyHidden ? 'all_manager' : DEFAULT_EQUIPMENT_VISIBILITY;
  }
  return (EQUIPMENT_VISIBILITY_OPTIONS as readonly string[]).includes(visibility)
    ? (visibility as EquipmentVisibility)
    : DEFAULT_EQUIPMENT_VISIBILITY;
};

// 單一隱私級別的權限判定（前端鏡像 DB 的 mask_category_can）
//   viewerManagedGuilds：目前使用者「身為正/副會長」的公會 id 清單（由外部帶入）
//   設計原則：本公會正副會長與總長一律可見 —— 先無條件放行，
//   再依級別決定是否額外開放給其他管理者。部位/資源覆蓋也套用同一規則。
const canViewWithVisibility = (
  visibility: EquipmentVisibility,
  viewerRole: string | null,
  member: { guildId?: string },
  viewerManagedGuilds: string[],
): boolean => {
  if (isAdminRole(viewerRole)) return true;
  if (!!member.guildId && viewerManagedGuilds.includes(member.guildId)) return true;

  switch (visibility) {
    case 'all_manager':
      return isManagerRole(viewerRole);
    case 'guild_manager':
    default:
      return false;
  }
};

// 前端鏡像 DB 的 can_view_equipment 政策，用於 UI 顯示
//   viewerRole: 目前使用者角色
//   viewerManagedGuilds: 目前使用者可管理的公會 id 清單（GUI 由外部帶入）
//   member: 目標成員
export const canViewEquipmentForUI = (
  viewerRole: string | null,
  member: { equipmentVisibility?: EquipmentVisibility; isEquipmentHidden?: boolean; guildId?: string },
  viewerManagedGuilds: string[],
  isCurrentUser: boolean,
): boolean => {
  if (isCurrentUser) return true;
  const vis = normalizeEquipmentVisibility(member.equipmentVisibility, member.isEquipmentHidden);
  return canViewWithVisibility(vis, viewerRole, member, viewerManagedGuilds);
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
    if (cOverride) return normalizeEquipmentVisibility(cOverride);
    if (catVis.visibility) return normalizeEquipmentVisibility(catVis.visibility);
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
  return canViewWithVisibility(vis, viewerRole, member, viewerManagedGuilds);
};

// 取得某項重要資源的最終隱私級別（資源覆蓋 > 全域）
export const resolveResourceVisibility = (
  member: { equipmentVisibility?: EquipmentVisibility; resourceVisibility?: ResourceVisibility; isEquipmentHidden?: boolean },
  resourceKey: EquipmentResourceKey,
): EquipmentVisibility => {
  const override = member.resourceVisibility?.[resourceKey];
  if (override) return normalizeEquipmentVisibility(override);
  return normalizeEquipmentVisibility(member.equipmentVisibility, member.isEquipmentHidden);
};

// 判斷觀看者能否看到某項重要資源
export const canViewResourceForUI = (
  viewerRole: string | null,
  member: { equipmentVisibility?: EquipmentVisibility; resourceVisibility?: ResourceVisibility; isEquipmentHidden?: boolean; guildId?: string },
  resourceKey: EquipmentResourceKey,
  viewerManagedGuilds: string[],
  isCurrentUser: boolean,
): boolean => {
  if (isCurrentUser) return true;
  const vis = resolveResourceVisibility(member, resourceKey);
  return canViewWithVisibility(vis, viewerRole, member, viewerManagedGuilds);
};

export { DEDICATION_OPTIONS, PLAY_MODE_OPTIONS };
export type { Dedication, PlayMode, EquipmentVisibility, LegacyEquipmentVisibility, CategoryVisibility, ResourceVisibility, EquipmentResourceKey };
