import { useState } from 'react';
import { useAppContext } from '@/store';
import { X, Save, CheckCircle2, EyeOff, Eye, Lock, ShieldCheck, Users, Hash, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logEvent } from '@/analytics';
import { EQUIPMENT_CATEGORIES, PLAY_MODE_OPTIONS, DEDICATION_OPTIONS, EQUIPMENT_VISIBILITY_OPTIONS } from '@/entities/member/types';
import type { EquipmentVisibility, CategoryVisibility } from '@/entities/member/types';
import { normalizeEquipment, normalizePlayPreferences, normalizeEquipmentVisibility } from '@/shared/lib/equipment';

export default function MemberEquipmentModal({ memberId, onClose }: { memberId: string, onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { db, updateMemberProfile, showToast } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const member = db.members[memberId];
  if (!member) return null;

  const [equipment, setEquipment] = useState(normalizeEquipment(member.equipment));
  const [playPrefs, setPlayPrefs] = useState(normalizePlayPreferences(member.playPreferences));
  const [note, setNote] = useState(member.equipmentNote || '');
  const [visibility, setVisibility] = useState<EquipmentVisibility>(
    normalizeEquipmentVisibility(member.equipmentVisibility, member.isEquipmentHidden)
  );
  const [refiningTraces, setRefiningTraces] = useState<number>(member.refiningTraces ?? 0);
  const [categoryVisibility, setCategoryVisibility] = useState<CategoryVisibility>(member.categoryVisibility ?? {});
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const toggleMode = (mode: any) => {
    setPlayPrefs(prev => {
      const modes = prev.modes.includes(mode)
        ? prev.modes.filter(m => m !== mode)
        : [...prev.modes, mode];
      return { ...prev, modes };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    logEvent('GuildDashboard', 'Update Member Equipment', member.name);
    try {
      setShowSuccess(true);
      await updateMemberProfile(memberId, {
        equipment,
        playPreferences: playPrefs,
        equipmentNote: note,
        equipmentVisibility: visibility,
        categoryVisibility,
        refiningTraces,
      });
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error("Error updating member equipment:", error);
      showToast(t('common.save_failed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateCount = (key: string, field: 'c23' | 'c24', value: number) => {
    setEquipment(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: Math.max(0, value), updatedAt: Date.now() }
    }));
  };

  const setCatVisibility = (key: string, field: 'visibility' | 'c23' | 'c24', value: EquipmentVisibility | undefined) => {
    setCategoryVisibility(prev => {
      const current = { ...(prev[key] || {}) };
      if (value === undefined) {
        delete current[field];
      } else {
        current[field] = value;
      }
      const next = { ...prev };
      if (Object.keys(current).length === 0) {
        delete next[key];
      } else {
        next[key] = current;
      }
      return next;
    });
  };

  const visibilityIcon = (v: EquipmentVisibility) =>
    v === 'public' ? null : v === 'admin' ? <Lock className="w-4 h-4" /> : v === 'guild_manager' ? <Hash className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />;

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm pt-[80px]">
      <div className="bg-stone-100 dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[calc(100vh-120px)] flex flex-col overflow-hidden">
        <div className="bg-white dark:bg-stone-800 px-6 py-4 border-b border-stone-200 dark:border-stone-700 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200">{t('equipment.edit_title', { name: member.name })}</h2>
            <p className="text-stone-500 dark:text-stone-400 text-sm">{t('equipment.edit_desc')}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-full transition-colors">
            <X className="w-6 h-6 text-stone-500 dark:text-stone-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* 裝備數量 */}
          <section className="bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
            <h3 className="bg-stone-50 dark:bg-stone-700 px-5 py-3 border-b border-stone-200 dark:border-stone-600 font-bold text-stone-800 dark:text-stone-200">
              {t('equipment.title')}
            </h3>
            <div className="divide-y divide-stone-100 dark:divide-stone-700">
              {EQUIPMENT_CATEGORIES.map(cat => {
                const item = equipment[cat.key] || { c23: 0, c24: 0 };
                return (
                  <div key={cat.key} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={cat.icon}
                        alt=""
                        className="w-9 h-9 object-contain rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-600"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div>
                        <div className="font-medium text-stone-800 dark:text-stone-200">
                          {t(`equipment.items.${cat.key}`, cat.name)}
                        </div>
                        {cat.icons && cat.icons.length > 1 && (
                          <div className="text-[11px] text-stone-400 dark:text-stone-500">
                            {cat.icons.map(i => i.name).join(' / ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400">
                        23C
                        <input
                          type="number"
                          min={0}
                          value={item.c23}
                          onChange={(e) => updateCount(cat.key, 'c23', Number(e.target.value))}
                          className="w-16 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-700 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm font-bold text-purple-600 dark:text-purple-400">
                        24C
                        <input
                          type="number"
                          min={0}
                          value={item.c24}
                          onChange={(e) => updateCount(cat.key, 'c24', Number(e.target.value))}
                          className="w-16 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-700 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        />
                      </label>
                      {item.updatedAt && (
                        <span className="text-[10px] text-stone-400 dark:text-stone-500 whitespace-nowrap">
                          {new Date(item.updatedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 遊玩傾向 - 內容（可複選） */}
          <section className="bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
            <h3 className="bg-stone-50 dark:bg-stone-700 px-5 py-3 border-b border-stone-200 dark:border-stone-600 font-bold text-stone-800 dark:text-stone-200">
              {t('equipment.play_preference')}
            </h3>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-sm font-semibold text-stone-600 dark:text-stone-400 mb-2">{t('equipment.modes')} <span className="text-xs font-normal">({t('equipment.multi_select')})</span></p>
                <div className="flex flex-wrap gap-2">
                  {PLAY_MODE_OPTIONS.map(mode => {
                    const active = playPrefs.modes.includes(mode);
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => toggleMode(mode)}
                        className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-colors ${active
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-600'}`}
                      >
                        {t(`equipment.modes_opt.${mode}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-600 dark:text-stone-400 mb-2">{t('equipment.dedication')} <span className="text-xs font-normal">({t('equipment.single_select')})</span></p>
                <div className="flex flex-wrap gap-2">
                  {DEDICATION_OPTIONS.map(d => {
                    const active = playPrefs.dedication === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPlayPrefs(prev => ({ ...prev, dedication: d }))}
                        className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-colors ${active
                          ? 'bg-indigo-500 text-white border-indigo-500'
                          : 'bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-600'}`}
                      >
                        {t(`equipment.dedication_opt.${d}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* 備註 */}
          <section className="bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
            <h3 className="bg-stone-50 dark:bg-stone-700 px-5 py-3 border-b border-stone-200 dark:border-stone-600 font-bold text-stone-800 dark:text-stone-200">
              {t('equipment.note')}
            </h3>
            <div className="p-5">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={t('equipment.note_placeholder')}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-700 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
              />
            </div>
          </section>

          {/* 隱私級別（全域預設） */}
          <section className="bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                {visibilityIcon(visibility) ?? <Eye className="w-5 h-5 text-amber-500" />}
                <div>
                  <p className="font-bold text-stone-800 dark:text-stone-200">{t('equipment.visibility')}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{t('equipment.visibility_desc')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_VISIBILITY_OPTIONS.map(v => {
                  const active = visibility === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisibility(v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg border transition-colors ${active
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-600'}`}
                    >
                      {visibilityIcon(v)}
                      {t(`equipment.visibility_opt.${v}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 部位個別隱私設定（折疊式，可覆蓋全域預設） */}
          <section className="bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Users className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="font-bold text-stone-800 dark:text-stone-200">{t('equipment.category_visibility')}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{t('equipment.category_visibility_desc')}</p>
                </div>
              </div>
              <div className="divide-y divide-stone-100 dark:divide-stone-700 rounded-xl overflow-hidden border border-stone-100 dark:border-stone-700">
                {EQUIPMENT_CATEGORIES.map(cat => {
                  const catVis = categoryVisibility[cat.key];
                  const hasOverride = !!catVis && Object.keys(catVis).length > 0;
                  const isExpanded = expandedCat === cat.key;
                  const resolved = catVis;
                  return (
                    <div key={cat.key} className="bg-stone-50/50 dark:bg-stone-800/50">
                      <button
                        type="button"
                        onClick={() => setExpandedCat(isExpanded ? null : cat.key)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-stone-100 dark:hover:bg-stone-700/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-stone-400" />
                            : <ChevronRight className="w-4 h-4 text-stone-400" />}
                          <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">
                            {t(`equipment.items.${cat.key}`, cat.name)}
                          </span>
                          {hasOverride && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              {t('equipment.has_override')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {visibilityIcon(resolved?.visibility || resolved?.c23 || resolved?.c24 || visibility)}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 space-y-3">
                          <p className="text-[11px] text-stone-400 dark:text-stone-500">{t('equipment.category_visibility_hint')}</p>
                          <div>
                            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">{t('equipment.category_level')}</p>
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => setCatVisibility(cat.key, 'visibility', undefined)}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${!catVis?.visibility
                                  ? 'bg-amber-500 text-white border-amber-500'
                                  : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300 border-stone-200 dark:border-stone-600'}`}
                              >
                                <RotateCcw className="w-3 h-3 inline-block mr-1" />
                                {t('equipment.follow_default')}
                              </button>
                              {EQUIPMENT_VISIBILITY_OPTIONS.map(v => {
                                const active = catVis?.visibility === v;
                                return (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => setCatVisibility(cat.key, 'visibility', active ? undefined : v)}
                                    className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${active
                                      ? 'bg-amber-500 text-white border-amber-500'
                                      : 'bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-600'}`}
                                  >
                                    {visibilityIcon(v)}
                                    {t(`equipment.visibility_opt.${v}`)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          {(['c23', 'c24'] as const).map(cField => (
                            <div key={cField}>
                              <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
                                {cField === 'c23' ? '23C' : '24C'}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setCatVisibility(cat.key, cField, undefined)}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${!catVis?.[cField]
                                    ? 'bg-amber-500 text-white border-amber-500'
                                    : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300 border-stone-200 dark:border-stone-600'}`}
                                >
                                  <RotateCcw className="w-3 h-3 inline-block mr-1" />
                                  {t('equipment.follow_default')}
                                </button>
                                {EQUIPMENT_VISIBILITY_OPTIONS.map(v => {
                                  const active = catVis?.[cField] === v;
                                  return (
                                    <button
                                      key={v}
                                      type="button"
                                      onClick={() => setCatVisibility(cat.key, cField, active ? undefined : v)}
                                      className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${active
                                        ? 'bg-amber-500 text-white border-amber-500'
                                        : 'bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-600'}`}
                                    >
                                      {visibilityIcon(v)}
                                      {t(`equipment.visibility_opt.${v}`)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 煉製之痕 */}
          <section className="bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden">
            <div className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Hash className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="font-bold text-stone-800 dark:text-stone-200">{t('equipment.refining_traces')}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{t('equipment.refining_traces_desc')}</p>
                </div>
              </div>
              <input
                type="number"
                min={0}
                value={refiningTraces}
                onChange={(e) => setRefiningTraces(Math.max(0, Number(e.target.value)))}
                className="w-24 px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-lg bg-stone-50 dark:bg-stone-700 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-right"
              />
            </div>
          </section>
        </div>

        <div className="bg-white dark:bg-stone-800 px-6 py-4 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="p-2 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-xl transition-colors"
            title={t('common.cancel')}
          >
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center justify-center p-2 rounded-xl font-medium shadow-sm transition-all active:scale-95 disabled:opacity-70 ${showSuccess ? 'bg-green-600 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
            title={showSuccess ? t('common.saved') : isSaving ? t('common.saving') : t('common.save_changes')}
          >
            {showSuccess ? <CheckCircle2 className="w-6 h-6" /> : <Save className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </div>
  );
}
