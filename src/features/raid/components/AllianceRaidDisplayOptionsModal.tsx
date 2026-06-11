import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, SlidersHorizontal } from 'lucide-react';

interface Guild {
  id?: string;
  name: string;
  tier?: number;
}

interface AllianceRaidDisplayOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  guilds: Guild[];
  initialSelectedIds: Set<string>;
  onApply: (ids: Set<string>) => void;
}

const TIER_COLORS: Record<number, string> = {
  1: 'text-orange-400',
  2: 'text-blue-400',
  3: 'text-stone-400',
  4: 'text-green-400',
};

export default function AllianceRaidDisplayOptionsModal({
  isOpen,
  onClose,
  guilds,
  initialSelectedIds,
  onApply,
}: AllianceRaidDisplayOptionsModalProps) {
  const { t } = useTranslation(['raid', 'translation']);

  const allGuildIds = useMemo(
    () => new Set(guilds.map(g => g.id).filter(Boolean) as string[]),
    [guilds]
  );

  const tierNumbers = useMemo(
    () => Array.from(new Set(guilds.map(g => g.tier ?? 0))).sort((a, b) => a - b),
    [guilds]
  );

  const guildsByTier = useMemo(() => {
    const map: Record<number, Guild[]> = {};
    guilds.forEach(g => {
      const tier = g.tier ?? 0;
      if (!map[tier]) map[tier] = [];
      map[tier].push(g);
    });
    return map;
  }, [guilds]);

  const [selectedGuildIds, setSelectedGuildIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setSelectedGuildIds(new Set(initialSelectedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const selectedCount = selectedGuildIds.size;
  const totalCount = guilds.length;

  const toggleAllInTier = (tier: number) => {
    const tierGuildIds = (guildsByTier[tier] ?? []).map(g => g.id ?? `noId-${g.name}`);
    const allSelected = tierGuildIds.every(id => selectedGuildIds.has(id));
    setSelectedGuildIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        tierGuildIds.forEach(id => next.delete(id));
      } else {
        tierGuildIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleGuild = (id: string) => {
    setSelectedGuildIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedGuildIds.size === allGuildIds.size) {
      setSelectedGuildIds(new Set());
    } else {
      setSelectedGuildIds(new Set(allGuildIds));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-8 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-stone-800 border border-stone-700 rounded-2xl w-[780px] max-w-full shadow-2xl overflow-hidden my-auto">
        <div className="flex justify-between items-center px-5 py-4 border-b border-stone-700">
          <div className="flex items-center gap-2 text-lg font-bold text-stone-100">
            <SlidersHorizontal className="w-[18px] h-[18px] text-amber-500" />
            {t('alliance_raid.display_options_modal_title')}
          </div>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-300 p-1 rounded-md flex items-center justify-center"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex justify-between items-center mb-2.5">
            <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
              {t('alliance_raid.download_modal_select_guild')}
            </div>
            <button
              onClick={toggleAll}
              className="text-xs text-amber-500 hover:text-amber-400 px-1.5 py-0.5 rounded"
            >
              {t('alliance_raid.download_modal_select_all')}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {tierNumbers.map(tier => {
              const tierGuilds = guildsByTier[tier] ?? [];
              const tierGuildIds = tierGuilds.map(g => g.id ?? `noId-${g.name}`);
              const allInTierSelected = tierGuildIds.length > 0 && tierGuildIds.every(id => selectedGuildIds.has(id));
              const tierColor = TIER_COLORS[tier] ?? 'text-stone-400';
              return (
                <div key={tier} className="bg-stone-900 border border-stone-600 rounded-xl overflow-hidden">
                  <div
                    className="flex items-center justify-between px-2.5 py-2 border-b border-stone-800 cursor-pointer hover:bg-stone-800 transition-colors"
                    onClick={() => toggleAllInTier(tier)}
                  >
                    <span className={`text-xs font-bold uppercase tracking-wide ${tierColor}`}>
                      Tier {tier}
                    </span>
                    <div
                      className={`relative w-7 h-4 rounded-full flex-shrink-0 transition-colors ${
                        allInTierSelected ? 'bg-amber-600' : 'bg-stone-600'
                      }`}
                    >
                      <span
                        className={`absolute top-[3px] w-2.5 h-2.5 bg-white rounded-full transition-all ${
                          allInTierSelected ? 'right-[3px]' : 'left-[3px]'
                        }`}
                      />
                    </div>
                  </div>
                  <div className="py-1.5">
                    {tierGuilds.map(g => {
                      const id = g.id ?? `noId-${g.name}`;
                      const checked = selectedGuildIds.has(id);
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-stone-800 transition-colors"
                          onClick={() => toggleGuild(id)}
                        >
                          <div
                            className={`w-3.5 h-3.5 border rounded flex-shrink-0 flex items-center justify-center transition-colors ${
                              checked ? 'bg-amber-600 border-amber-600' : 'bg-stone-700 border-stone-500'
                            }`}
                          >
                            {checked && (
                              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                                <path
                                  d="M1 3L3 5L7 1"
                                  stroke="white"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </div>
                          <span className="text-xs text-stone-300 truncate">{g.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-5 py-4 border-t border-stone-700">
          <span className="text-xs text-stone-500 mr-auto">
            {t('alliance_raid.download_modal_selected_count', {
              selected: selectedCount,
              total: totalCount,
            })}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-800 border border-stone-600 rounded-xl text-stone-400 text-sm font-semibold hover:border-stone-500 transition-colors"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            onClick={() => onApply(selectedGuildIds)}
            disabled={selectedGuildIds.size === 0}
            className="px-5 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {t('alliance_raid.display_options_apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
