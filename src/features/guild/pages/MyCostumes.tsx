import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '@/store';
import { useTranslation } from 'react-i18next';
import { Swords, Shield, User, Search, FilterX, LayoutGrid, BookUser, RefreshCw, Loader2, Sparkles, X } from 'lucide-react';
import { getImageUrl, getTierColor } from '@/shared/lib/utils';
import { canViewEquipmentForUI, isAdminRole, isManagerRole } from '@/shared/lib/equipment';
import { getSortedCostumes, getSortedCharacters } from '../utils/sort';
import CostumeMatrixTable from '../components/CostumeMatrixTable';
import { useCan } from '@/shared/lib/useCan';

const ATK_TYPE_FILTERS = ['物', '魔'];
const ATTRIBUTE_FILTERS = ['火', '水', '風', '光', '暗'];

interface CostumeFilters {
  atkType?: string[];
  attribute?: string[];
}

export default function MyCostumesPage() {
  const { t, i18n } = useTranslation();
  const { db, userProfileId, updateMember, showToast, isRoleLoading, userRole, fetchMembers, loadMembersByIds, isMembersLoading, managedGuildIds, canManageGuild } = useAppContext();
  const { can } = useCan();
  const [saveState, setSaveState] = useState<Record<string, 'saving' | 'done'>>({});
  const [drafts, setDrafts] = useState<Record<string, { records: any; exclusiveWeapons: any }>>({});
  const [tagInput, setTagInput] = useState('');
  const [selectedCostumeIds, setSelectedCostumeIds] = useState<string[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<CostumeFilters>({});
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);

  // 全域管理者（manager / admin / creator）可看所有公會；公會正/副會長只看自己管理的公會
  const isGlobalManager = isManagerRole(userRole);
  const canUseMatrix = isGlobalManager || canManageGuild();
  const [view, setView] = useState<'matrix' | 'my'>(() => (canUseMatrix ? 'matrix' : 'my'));
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // 全部公會（含沒有成員的公會），依梯次/管理順序排序
  const allGuilds = useMemo(() => {
    return Object.values(db.guilds)
      .filter(Boolean)
      .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99) || (a.orderNum ?? 99) - (b.orderNum ?? 99));
  }, [db.guilds]);

  // 目前身分可切換的公會：全域管理者 = 全部；公會幹部 = 自己管理的公會
  const visibleGuilds = useMemo(() => {
    if (isGlobalManager) return allGuilds;
    const allowed = new Set(managedGuildIds);
    return allGuilds.filter(g => g.id && allowed.has(g.id));
  }, [allGuilds, isGlobalManager, managedGuildIds]);

  // 依梯次分組（公會篩選表用）
  const guildsByTier = useMemo(() => {
    const map = new Map<number, typeof allGuilds>();
    visibleGuilds.forEach(g => {
      const tier = g.tier ?? 99;
      if (!map.has(tier)) map.set(tier, []);
      map.get(tier)!.push(g);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [visibleGuilds]);

  useEffect(() => {
    if (isRoleLoading) return;
    if (!canUseMatrix) {
      setView('my');
      return;
    }
    setView('matrix');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseMatrix, isRoleLoading]);

  // 預設以第一個「可切換」的公會作為進入點（幹部只會是自己的公會）
  useEffect(() => {
    if (isRoleLoading || !canUseMatrix) return;
    if (selectedGuildIds.length > 0) return;
    const firstId = visibleGuilds[0]?.id;
    if (firstId) setSelectedGuildIds([firstId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseMatrix, isRoleLoading, visibleGuilds]);

  // 為已選但尚未載入的公會抓取成員（點選公會時觸發）
  useEffect(() => {
    if (!canUseMatrix || selectedGuildIds.length === 0) return;
    let failed = false;
    (async () => {
      for (const gid of selectedGuildIds) {
        const hasCached = Object.values(db.members).some(m => m.guildId === gid);
        if (hasCached) continue;
        const ok = await fetchMembers(gid, undefined, true);
        if (!ok) failed = true;
      }
      setLoadingFailed(failed);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseMatrix, selectedGuildIds, reloadKey, db.members]);

  // 「重整成員」：強制重新載入目前選取的公會
  useEffect(() => {
    if (!canUseMatrix || reloadKey === 0 || selectedGuildIds.length === 0) return;
    let failed = false;
    (async () => {
      for (const gid of selectedGuildIds) {
        const ok = await fetchMembers(gid, undefined, true);
        if (!ok) failed = true;
      }
      setLoadingFailed(failed);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const myMemberIds = useMemo(() => {
    // profiles.id 對 Discord 身份綁定而言，正是逗號分隔的 member_id 清單
    return userProfileId ? userProfileId.split(',').map(uid => uid.trim()).filter(Boolean) : [];
  }, [userProfileId]);

  // 依綁定的 id 載入自己的成員資料，避免誤判為「未綁定」（管理者與一般成員皆套用）
  useEffect(() => {
    if (isRoleLoading || myMemberIds.length === 0) return;
    const missing = myMemberIds.filter(id => !db.members[id]);
    if (missing.length === 0) return;
    const t = setTimeout(() => {
      loadMembersByIds(myMemberIds, true);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoleLoading, myMemberIds]);

  const myMemberMap = useMemo(() => new Map(myMemberIds.map(id => [id, db.members[id]])), [db.members, myMemberIds]);
  const myMembers = useMemo(() => Array.from(myMemberMap.values()).filter(Boolean), [myMemberMap]);

  // 初始化/同步草稿：僅在成員資料真正改變時（新載入/儲存後）同步，避免每次 render 覆寫使用者的編輯
  useEffect(() => {
    setDrafts(prev => {
      const next = { ...prev };
      let changed = false;
      myMembers.forEach(m => {
        const current = prev[m.id];
        if (!current || current.records !== m.records || current.exclusiveWeapons !== m.exclusiveWeapons) {
          next[m.id] = { records: m.records ?? {}, exclusiveWeapons: m.exclusiveWeapons ?? {} };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myMemberMap, reloadKey]);

  const setDraft = (memberId: string, patch: Partial<{ records: any; exclusiveWeapons: any }>) => {
    setDrafts(prev => ({
      ...prev,
      [memberId]: { records: prev[memberId]?.records ?? {}, exclusiveWeapons: prev[memberId]?.exclusiveWeapons ?? {}, ...patch }
    }));
  };

  // 目前身分可切換的公會 id（幹部不會因清除篩選就看到別的公會）
  const visibleGuildIds = useMemo(
    () => new Set(visibleGuilds.map(g => g.id).filter(Boolean) as string[]),
    [visibleGuilds],
  );

  const matrixMembers = useMemo(() => {
    let list = Object.values(db.members).filter(
      m => m && m.status !== 'archived' && visibleGuildIds.has(m.guildId),
    );
    if (selectedGuildIds.length > 0) {
      list = list.filter(m => selectedGuildIds.includes(m.guildId));
    }
    return list.sort((a, b) => {
      const orderA = db.guilds[a.guildId]?.orderNum ?? 99;
      const orderB = db.guilds[b.guildId]?.orderNum ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      const roleOrder: Record<string, number> = { leader: 1, coleader: 2, member: 3 };
      const ra = roleOrder[a.role] || 99;
      const rb = roleOrder[b.role] || 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [db.members, db.guilds, selectedGuildIds, visibleGuildIds]);

  // 矩陣中「目前身分無權查看」的成員：避免把遮蔽誤顯示成「沒有服裝」。
  // 判斷邏輯與 DB 的 can_view_equipment() 一致（見 shared/lib/equipment.ts）。
  const maskedMemberIds = useMemo(() => {
    const masked = new Set<string>();
    if (isAdminRole(userRole)) return masked;

    const myIds = new Set(myMemberIds);
    matrixMembers.forEach(member => {
      if (myIds.has(member.id)) return;
      if (!canViewEquipmentForUI(userRole, member, managedGuildIds, false)) {
        masked.add(member.id);
      }
    });
    return masked;
  }, [matrixMembers, myMemberIds, userRole, managedGuildIds]);

  // 有效服裝集合：角色標籤展開為該角色所有服裝（∪），與服裝標籤取交集（∩）
  const effectiveCostumeIds = useMemo(() => {
    const costumeTags = new Set(selectedCostumeIds);
    const charCostumes = new Set(
      Object.values(db.costumes)
        .filter(c => selectedCharacterIds.includes(c.characterId))
        .map(c => c.id)
    );
    if (selectedCostumeIds.length === 0) return charCostumes;
    if (selectedCharacterIds.length === 0) return costumeTags;
    return new Set([...charCostumes].filter(id => costumeTags.has(id)));
  }, [db.costumes, selectedCostumeIds, selectedCharacterIds]);

  const characters = useMemo(() => {
    const list = Object.values(db.characters).sort((a, b) => {
      const aHasNew = Object.values(db.costumes).some(c => c.characterId === a.id && c.isNew);
      const bHasNew = Object.values(db.costumes).some(c => c.characterId === b.id && c.isNew);
      if (aHasNew && !bHasNew) return -1;
      if (!aHasNew && bHasNew) return 1;
      return a.orderNum - b.orderNum;
    });
    const filtered = list.filter(c => {
      if (filters.atkType?.length && !filters.atkType.includes(c.atkType)) return false;
      if (filters.attribute?.length && !filters.attribute.includes(c.attribute)) return false;
      return true;
    });
    if (effectiveCostumeIds.size === 0) return filtered;
    return filtered.filter(c =>
      Object.values(db.costumes).some(co => co.characterId === c.id && effectiveCostumeIds.has(co.id))
    );
  }, [db.characters, db.costumes, filters, effectiveCostumeIds]);

  // 服裝表：只顯示通過搜尋/篩選的角色之服裝
  const characterIds = useMemo(() => new Set(characters.map(c => c.id)), [characters]);
  const matrixCostumes = useMemo(() => {
    const tagSet = effectiveCostumeIds.size > 0 ? effectiveCostumeIds : null;
    return getSortedCostumes(db.costumes, db.characters).filter(c =>
      characterIds.has(c.characterId) && (!tagSet || tagSet.has(c.id))
    );
  }, [db.costumes, db.characters, characterIds, effectiveCostumeIds]);

  const costumeName = (c: any) => (i18n.language === 'en' ? c?.nameE || c?.name : c?.name) || '';
  const characterName = (id: string) => {
    const ch = db.characters[id];
    return ch ? (i18n.language === 'en' ? ch.nameE || ch.name : ch.name) : '';
  };

  // 角色 + 服裝名稱 autocomplete 候選（依角色順序排列，排除已選 tag）：
  // - 角色建議：標示該角色的服裝數
  // - 服裝建議：標示所屬角色
  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    const charList = getSortedCharacters(db.characters, db.costumes)
      .filter(ch => !selectedCharacterIds.includes(ch.id))
      .filter(ch => !q || (i18n.language === 'en' ? ch.nameE || ch.name : ch.name).toLowerCase().includes(q))
      .map(ch => {
        const count = Object.values(db.costumes).filter(c => c.characterId === ch.id).length;
        return { type: 'character' as const, id: ch.id, name: ch.nameE || ch.name || '', imageName: ch.imageName, characterId: ch.id, characterName: '', costumeCount: count };
      });
    const costumeList = getSortedCostumes(db.costumes, db.characters)
      .filter(c => !selectedCostumeIds.includes(c.id))
      .filter(c => !q || costumeName(c).toLowerCase().includes(q))
      .map(c => ({ type: 'costume' as const, id: c.id, name: c.nameE || c.name || '', imageName: c.imageName, characterId: c.characterId, characterName: characterName(c.characterId), costumeCount: 0 }));
    return [...charList, ...costumeList].slice(0, 10);
  }, [db.characters, db.costumes, tagInput, selectedCharacterIds, selectedCostumeIds, i18n.language, characterName]);

  const setFilter = (key: keyof CostumeFilters, value: string) => {
    setFilters(prev => {
      const next = { ...prev };
      const current = next[key] || [];
      const has = current.includes(value);
      const updated = has ? current.filter(v => v !== value) : [...current, value];
      if (updated.length === 0) {
        delete next[key];
      } else {
        next[key] = updated;
      }
      return next;
    });
  };

  const toggleGuild = (guildId: string) => {
    setSelectedGuildIds(prev => {
      const selected = prev.includes(guildId) ? prev.filter(id => id !== guildId) : [...prev, guildId];
      // 至少保留一個公會
      if (selected.length === 0) return prev;
      return selected;
    });
  };

  const hasActiveFilters = Object.values(filters).some(f => !!f?.length) || selectedGuildIds.length > 0 || selectedCostumeIds.length > 0 || selectedCharacterIds.length > 0;

  const resetFilters = () => {
    setFilters({});
    // 矩陣預設回到第一個可切換的公會，避免清除篩選後一次抓全部公會
    setSelectedGuildIds(visibleGuilds[0]?.id ? [visibleGuilds[0].id] : []);
    setSelectedCostumeIds([]);
    setSelectedCharacterIds([]);
    setTagInput('');
  };

  // 點擊外部關閉 autocomplete
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setTagOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addTag = (item: { type: 'character' | 'costume'; id: string }) => {
    if (item.type === 'character') {
      setSelectedCharacterIds(prev => (prev.includes(item.id) ? prev : [...prev, item.id]));
    } else {
      setSelectedCostumeIds(prev => (prev.includes(item.id) ? prev : [...prev, item.id]));
    }
    setTagInput('');
    setHighlightIndex(-1);
    setTagOpen(false);
  };

  const removeTag = (type: 'character' | 'costume', id: string) => {
    if (type === 'character') {
      setSelectedCharacterIds(prev => prev.filter(v => v !== id));
    } else {
      setSelectedCostumeIds(prev => prev.filter(v => v !== id));
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setTagOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      const target = highlightIndex >= 0 ? suggestions[highlightIndex] : suggestions.length === 1 ? suggestions[0] : undefined;
      if (target) {
        e.preventDefault();
        addTag(target);
      }
    }
  };

  const handleSave = async (member: any) => {
    setSaveState(prev => ({ ...prev, [member.id]: 'saving' }));
    try {
      const draft = drafts[member.id] ?? { records: member.records, exclusiveWeapons: member.exclusiveWeapons };
      await updateMember(member.id, {
        records: draft.records,
        exclusiveWeapons: draft.exclusiveWeapons
      });
      setSaveState(prev => ({ ...prev, [member.id]: 'done' }));
      setTimeout(() => setSaveState(prev => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      }), 1200);
    } catch (error) {
      console.error('Error saving costumes:', error);
      showToast(t('common.save_failed'), 'error');
      setSaveState(prev => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
    }
  };

  if (isRoleLoading) {
    return (
      <div className="bg-stone-100 dark:bg-stone-900">
        <div className="max-w-6xl mx-auto p-6 w-full">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 p-8 flex items-center justify-center text-stone-500 dark:text-stone-400">
            {t('common.loading')}
          </div>
        </div>
      </div>
    );
  }

  interface FilterChipGroupProps {
    label: string;
    options: { value: string; label: string }[];
    selected: string[];
    onToggle: (value: string) => void;
  }

  function FilterChipGroup({ label, options, selected, onToggle }: FilterChipGroupProps) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-stone-500 dark:text-stone-400 whitespace-nowrap">{label}</span>
        <div className="flex flex-wrap gap-1.5">
          {options.map(opt => {
            const active = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onToggle(opt.value)}
                className={`px-2.5 py-1 text-xs font-bold rounded-full border transition-all ${active ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-amber-400'}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stone-100 dark:bg-stone-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 w-full">
        <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
                {view === 'matrix' ? <LayoutGrid className="w-6 h-6 text-amber-500" /> : <Shield className="w-6 h-6 text-amber-500" />}
                {t(view === 'matrix' ? 'my_costumes.title' : 'my_costumes.view_my')}
              </h1>
              <p className="text-stone-500 dark:text-stone-400 text-sm mt-1">{t('my_costumes.desc')}</p>
            </div>
            <div className="flex items-center gap-3">
              {canUseMatrix && (
                <div className="flex bg-stone-100 dark:bg-stone-700 rounded-xl p-1">
                  <button
                    onClick={() => setView('matrix')}
                    className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 ${view === 'matrix' ? 'bg-white dark:bg-stone-600 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-stone-500 dark:text-stone-400'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    {t('my_costumes.view_matrix')}
                  </button>
                  <button
                    onClick={() => setView('my')}
                    className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-all flex items-center gap-1.5 ${view === 'my' ? 'bg-white dark:bg-stone-600 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-stone-500 dark:text-stone-400'}`}
                  >
                    <BookUser className="w-4 h-4" />
                    {t('my_costumes.view_my')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 搜尋 + 篩選（兩種檢視共用） */}
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div ref={searchRef} className="relative flex-1 min-w-[180px] sm:max-w-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-stone-400 dark:text-stone-500" />
                </div>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setTagOpen(true); setHighlightIndex(-1); }}
                  onFocus={() => setTagOpen(true)}
                  onKeyDown={handleTagKeyDown}
                  placeholder={t('my_costumes.search_placeholder')}
                  className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-stone-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all bg-stone-50 dark:bg-stone-700 focus:bg-white dark:focus:bg-stone-600 dark:text-stone-100 text-sm"
                />
                {tagOpen && tagInput.trim() && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-xl shadow-lg overflow-hidden">
                    {suggestions.length > 0 ? (
                      <ul className="max-h-60 overflow-y-auto py-1">
                        {suggestions.map((c, i) => (
                          <li
                            key={c.type === 'character' ? `ch-${c.id}` : `co-${c.id}`}
                            onMouseDown={(e) => { e.preventDefault(); addTag(c); }}
                            onMouseEnter={() => setHighlightIndex(i)}
                            className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${i === highlightIndex ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}
                          >
                            {c.imageName && (
                              <div className="w-7 h-7 bg-stone-100 dark:bg-stone-700 rounded overflow-hidden border border-stone-200 dark:border-stone-600 flex-shrink-0">
                                <img src={getImageUrl(c.imageName)} alt={c.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                              </div>
                            )}
                            <span className="flex-1 truncate text-stone-800 dark:text-stone-200">{c.name}</span>
                            {c.type === 'character' ? (
                              <span className="text-[10px] text-indigo-500 dark:text-indigo-400 shrink-0">{t('my_costumes.costume_count', { count: c.costumeCount })}</span>
                            ) : (
                              <span className="text-[10px] text-stone-400 dark:text-stone-500 shrink-0">{c.characterName}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="px-3 py-2 text-sm text-stone-400 dark:text-stone-500">{t('my_costumes.no_matching_costume')}</div>
                    )}
                  </div>
                )}
              </div>
              {(selectedCostumeIds.length > 0 || selectedCharacterIds.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedCharacterIds.map(id => {
                    const ch = db.characters[id];
                    if (!ch) return null;
                    return (
                      <button
                        key={`ch-${id}`}
                        onClick={() => removeTag('character', id)}
                        title={t('my_costumes.remove_tag')}
                        className="px-2.5 py-1 text-xs font-bold rounded-full border bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1"
                      >
                        <User className="w-3 h-3" />
                        {i18n.language === 'en' ? (ch.nameE || ch.name) : ch.name}
                        <X className="w-3 h-3" />
                      </button>
                    );
                  })}
                  {selectedCostumeIds.map(id => {
                    const c = db.costumes[id];
                    if (!c) return null;
                    return (
                      <button
                        key={`co-${id}`}
                        onClick={() => removeTag('costume', id)}
                        title={t('my_costumes.remove_tag')}
                        className="px-2.5 py-1 text-xs font-bold rounded-full border bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors flex items-center gap-1"
                      >
                        {costumeName(c)}
                        <X className="w-3 h-3" />
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                onClick={resetFilters}
                disabled={!hasActiveFilters}
                className={`px-3 py-2 text-sm font-bold rounded-xl transition-colors flex items-center gap-1.5 ${hasActiveFilters ? 'bg-stone-200 hover:bg-stone-300 text-stone-700 dark:bg-stone-600 dark:hover:bg-stone-500 dark:text-stone-200' : 'bg-stone-100 dark:bg-stone-700 text-stone-400 dark:text-stone-500 cursor-not-allowed'}`}
              >
                <FilterX className="w-4 h-4" />
                {t('my_costumes.reset_filters')}
              </button>
              {view === 'matrix' && (
                <button
                  onClick={() => setReloadKey(k => k + 1)}
                  disabled={isMembersLoading}
                  className={`px-3 py-2 text-sm font-bold rounded-xl transition-colors flex items-center gap-1.5 ${isMembersLoading ? 'bg-stone-100 dark:bg-stone-700 text-stone-400 dark:text-stone-500 cursor-not-allowed' : 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-300'}`}
                >
                  <RefreshCw className={`w-4 h-4 ${isMembersLoading ? 'animate-spin' : ''}`} />
                  {t('my_costumes.reload_members')}
                </button>
              )}
            </div>

            {/* 公會篩選表（僅矩陣檢視）：依梯次/管理順序排列，可點按複選 */}
            {view === 'matrix' && visibleGuilds.length > 0 && (
              <div className="bg-stone-50 dark:bg-stone-700/40 border border-stone-200 dark:border-stone-700 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {t('my_costumes.filter_guild')}
                  </span>
                  <span className="text-[11px] text-stone-400 dark:text-stone-500">
                    {selectedGuildIds.length > 0
                      ? t('my_costumes.selected_guilds', { count: selectedGuildIds.length })
                      : t('my_costumes.all_guilds')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {guildsByTier.map(([tier, guilds]) => (
                    <div key={tier} className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getTierColor(tier)}`}>T{tier}</span>
                      {guilds.map(g => {
                        const active = selectedGuildIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            onClick={() => toggleGuild(g.id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-full border transition-all flex items-center gap-1.5 ${active ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-amber-400'}`}
                          >
                            {g.name}
                            {g.serial && <span className={`text-[10px] ${active ? 'text-white/70' : 'text-stone-400'}`}>#{g.serial}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 其餘篩選：點按複選 */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <FilterChipGroup
                label={t('my_costumes.filter_atk_type')}
                options={ATK_TYPE_FILTERS.map(v => ({ value: v, label: v === '物' ? t('my_costumes.atk_phys') : t('my_costumes.atk_magic') }))}
                selected={filters.atkType ?? []}
                onToggle={(v) => setFilter('atkType', v)}
              />
              <FilterChipGroup
                label={t('my_costumes.filter_attribute')}
                options={ATTRIBUTE_FILTERS.map(v => ({ value: v, label: t(`my_costumes.attr_${v === '火' ? 'fire' : v === '水' ? 'water' : v === '風' ? 'wind' : v === '光' ? 'light' : 'dark'}`) }))}
                selected={filters.attribute ?? []}
                onToggle={(v) => setFilter('attribute', v)}
              />
            </div>
          </div>

          {view === 'matrix' ? (
            <>
              <div className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                {t('common.member')} {matrixMembers.length} • {t('my_costumes.characters_count', { count: characterIds.size })}
              </div>
              {isMembersLoading && (
                <div className="mt-3 bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 p-6 flex items-center justify-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.loading')}
                </div>
              )}
              {loadingFailed && (
                <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0" />
                    {t('my_costumes.load_failed')}
                  </p>
                  <button
                    onClick={() => setReloadKey(k => k + 1)}
                    className="px-3 py-1.5 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${isMembersLoading ? 'animate-spin' : ''}`} />
                    {t('my_costumes.retry')}
                  </button>
                </div>
              )}
              {maskedMemberIds.size > 0 && (
                <div className="mt-3 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                  <Shield className="w-4 h-4 shrink-0 text-amber-500" />
                  {t('my_costumes.masked_summary', {
                    count: maskedMemberIds.size,
                    defaultValue: '{{count}} 位成員的服裝資料因權限不足已遮蔽',
                  })}
                </div>
              )}
              <div className="mt-2">
                <CostumeMatrixTable
                  members={matrixMembers}
                  costumes={matrixCostumes}
                  maskedMemberIds={maskedMemberIds}
                />
              </div>
            </>
          ) : (
            <>
              {isMembersLoading && myMembers.length === 0 && (
                <div className="mt-8 p-8 text-center text-stone-500 dark:text-stone-400 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto" />
                  <p>{t('common.loading')}</p>
                </div>
              )}
              {!isMembersLoading && myMembers.length === 0 ? (
                <div className="mt-8 p-8 text-center text-stone-500 dark:text-stone-400 flex flex-col items-center gap-3">
                  <User className="w-10 h-10 text-stone-300 dark:text-stone-600" />
                  <p>{t('my_costumes.no_member')}</p>
                </div>
              ) : (
                myMembers.length > 0 && can('equipment.write.self') && (
                  <div className="mt-6 space-y-6">
                    {myMembers.map(member => (
                      <MemberCostumeEditor
                        key={member.id}
                        member={member}
                        characters={characters}
                        selectedCostumeIds={effectiveCostumeIds}
                        saveState={saveState[member.id]}
                        onSave={() => handleSave(member)}
                        records={drafts[member.id]?.records ?? member.records ?? {}}
                        exclusiveWeapons={drafts[member.id]?.exclusiveWeapons ?? member.exclusiveWeapons ?? {}}
                        onLevelChange={(costumeId, level) => {
                          const cur = drafts[member.id]?.records ?? member.records ?? {};
                          setDraft(member.id, { records: { ...cur, [costumeId]: { ...(cur[costumeId] || { level: -1 }), level } } });
                        }}
                        onWeaponToggle={(characterId, has) => {
                          const cur = drafts[member.id]?.exclusiveWeapons ?? member.exclusiveWeapons ?? {};
                          setDraft(member.id, { exclusiveWeapons: { ...cur, [characterId]: has } });
                        }}
                        onFillAll5={(next) => setDraft(member.id, { records: next })}
                        onGrantAllWeapons={(next) => setDraft(member.id, { exclusiveWeapons: next })}
                      />
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface EditorProps {
  member: any;
  characters: any[];
  selectedCostumeIds: Set<string>;
  saveState?: string;
  onSave: () => void;
  records: any;
  exclusiveWeapons: any;
  onLevelChange: (costumeId: string, level: number) => void;
  onWeaponToggle: (characterId: string, has: boolean) => void;
  onFillAll5: (next: any) => void;
  onGrantAllWeapons: (next: any) => void;
}

function MemberCostumeEditor({ member, characters, selectedCostumeIds, saveState, onSave, records, exclusiveWeapons, onLevelChange, onWeaponToggle, onFillAll5, onGrantAllWeapons }: EditorProps) {
  const { t, i18n } = useTranslation();
  const { db } = useAppContext();
  const setAllLevels = (level: number) => {
    const costumeIds = Object.values(db.costumes).map(c => c.id);
    const next = { ...records };
    costumeIds.forEach(id => {
      next[id] = { ...(next[id] || { level: -1 }), level };
    });
    onFillAll5(next);
  };

  const grantAllWeapons = (has: boolean) => {
    const characterIds = Object.values(db.costumes).map(c => c.characterId);
    const next = { ...exclusiveWeapons };
    characterIds.forEach(id => {
      next[id] = has;
    });
    onGrantAllWeapons(next);
  };

  return (
    <div className="border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
      <div className="bg-stone-50 dark:bg-stone-700 px-5 py-3 border-b border-stone-200 dark:border-stone-600 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-500" />
          {member.name}
          {member.guildId && db.guilds[member.guildId] && (
            <span className="text-xs font-normal text-stone-500 dark:text-stone-400">({db.guilds[member.guildId].name})</span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAllLevels(5)}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-green-100 hover:bg-green-200 text-green-800 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-300 transition-colors flex items-center gap-1.5"
            title={t('my_costumes.fill_all_5_title')}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t('my_costumes.fill_all_5')}
          </button>
          <button
            onClick={() => grantAllWeapons(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300 transition-colors flex items-center gap-1.5"
            title={t('my_costumes.grant_all_weapons_title')}
          >
            <Swords className="w-3.5 h-3.5" />
            {t('my_costumes.grant_all_weapons')}
          </button>
          <button
            onClick={onSave}
            disabled={saveState === 'saving'}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${saveState === 'done' ? 'bg-green-600 text-white' : saveState === 'saving' ? 'bg-stone-300 dark:bg-stone-600 text-stone-500' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
          >
            {saveState === 'done' ? t('common.saved') : saveState === 'saving' ? t('common.saving') : t('common.save_changes')}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {characters.length === 0 && (
          <p className="text-stone-500 dark:text-stone-400 text-center py-8">{t('my_costumes.no_results')}</p>
        )}
        {characters.map(character => {
          const hasExclusiveWeapon = exclusiveWeapons[character.id] ?? false;
          const costumes = Object.values(db.costumes)
            .filter(c => c.characterId === character.id)
            .sort((a, b) => (a.orderNum ?? 999) - (b.orderNum ?? 999))
            .filter(c => selectedCostumeIds.size === 0 || selectedCostumeIds.has(c.id));
          if (costumes.length === 0) return null;

          return (
            <div key={character.id} className={`bg-white dark:bg-stone-800 rounded-xl shadow-sm border ${hasExclusiveWeapon ? 'border-orange-400' : 'border-stone-200 dark:border-stone-700'} overflow-hidden`}>
              <div className="bg-stone-50 dark:bg-stone-700 px-4 py-2.5 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center">
                <h3 className="font-bold text-stone-800 dark:text-stone-200">{i18n.language === 'en' ? (character.nameE || character.name) : character.name}</h3>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <Swords className={`w-4 h-4 ${hasExclusiveWeapon ? 'text-amber-600' : 'text-stone-400'}`} />
                  <span className={`text-sm font-bold ${hasExclusiveWeapon ? 'text-amber-700' : 'text-stone-500 dark:text-stone-400'}`}>{t('common.ur_exclusive')}</span>
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={hasExclusiveWeapon}
                    onChange={(e) => onWeaponToggle(character.id, e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-stone-200 dark:bg-stone-600 rounded-full group-has-[:checked]:bg-amber-500 transition-colors shadow-inner relative">
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform group-has-[:checked]:translate-x-4 shadow-md"></div>
                  </div>
                </label>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-700">
                {costumes.map(costume => {
                  const record = records[costume.id] || { level: -1 };
                  return (
                    <div key={costume.id} className="p-3 flex items-center gap-3 hover:bg-stone-50/50 dark:hover:bg-stone-700/50 transition-colors">
                      {costume.imageName && (
                        <div className="w-[40px] h-[40px] bg-stone-100 dark:bg-stone-700 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-600 flex-shrink-0">
                          <img
                            src={getImageUrl(costume.imageName)}
                            alt={i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="font-medium text-stone-800 dark:text-stone-200 flex-1">{i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}</div>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { val: -1, label: t('common.not_owned') },
                          { val: 0, label: '+0' },
                          { val: 1, label: '+1' },
                          { val: 2, label: '+2' },
                          { val: 3, label: '+3' },
                          { val: 4, label: '+4' },
                          { val: 5, label: '+5' }
                        ].map(opt => {
                          let active = "bg-orange-400 text-stone-900 shadow-sm scale-105";
                          if (opt.val <= 0) active = "bg-stone-300 text-stone-900 shadow-sm scale-105";
                          else if (opt.val === 1) active = "bg-blue-300 text-stone-900 shadow-sm scale-105";
                          else if (opt.val === 2) active = "bg-blue-400 text-stone-900 shadow-sm scale-105";
                          else if (opt.val === 3) active = "bg-purple-300 text-stone-900 shadow-sm scale-105";
                          else if (opt.val === 4) active = "bg-purple-400 text-stone-900 shadow-sm scale-105";

                          return (
                            <button
                              key={opt.val}
                              onClick={() => onLevelChange(costume.id, opt.val)}
                              className={`px-2.5 py-1 text-sm font-bold rounded-lg transition-all ${record.level == opt.val
                                ? active
                                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600'}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}