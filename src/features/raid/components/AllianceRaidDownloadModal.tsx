import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download, BarChart3 } from 'lucide-react';

interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
}

interface Guild {
  id?: string;
  name: string;
  tier?: number;
}

export interface DownloadConfig {
  seasonFrom: string;
  seasonTo: string;
  includeScore: boolean;
  selectedGuildIds: Set<string>;
}

interface AllianceRaidDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  seasons: RaidSeason[];
  guilds: Guild[];
  showScoreInTable: boolean;
  hideLatestSeason: boolean;
  onDownload: (config: DownloadConfig) => void;
}

const TIER_COLORS: Record<number, string> = {
  1: 'text-orange-400',
  2: 'text-blue-400',
  3: 'text-stone-400',
  4: 'text-green-400',
};

export default function AllianceRaidDownloadModal({
  isOpen,
  onClose,
  seasons,
  guilds,
  showScoreInTable,
  hideLatestSeason,
  onDownload,
}: AllianceRaidDownloadModalProps) {
  const { t } = useTranslation(['raid', 'translation']);

  const defaultSeasonId = useMemo(() => {
    if (seasons.length === 0) return '';
    if (hideLatestSeason && seasons.length > 1) return seasons[1].id;
    return seasons[0].id;
  }, [seasons, hideLatestSeason]);

  const allGuildIds = useMemo(
    () => new Set(guilds.map(g => g.id).filter(Boolean) as string[]),
    [guilds]
  );

  const tierNumbers = useMemo(() => {
    return Array.from(new Set(guilds.map(g => g.tier ?? 0))).sort((a, b) => a - b);
  }, [guilds]);

  const guildsByTier = useMemo(() => {
    const map: Record<number, Guild[]> = {};
    guilds.forEach(g => {
      const tier = g.tier ?? 0;
      if (!map[tier]) map[tier] = [];
      map[tier].push(g);
    });
    return map;
  }, [guilds]);

  const [seasonFrom, setSeasonFrom] = useState('');
  const [seasonTo, setSeasonTo] = useState('');
  const [includeScore, setIncludeScore] = useState(showScoreInTable);
  const [tierEnabled, setTierEnabled] = useState<Record<number, boolean>>({});
  const [selectedGuildIds, setSelectedGuildIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setSeasonFrom(defaultSeasonId);
    setSeasonTo(defaultSeasonId);
    setIncludeScore(showScoreInTable);
    const tiers = Array.from(new Set(guilds.map(g => g.tier ?? 0)));
    const enabled: Record<number, boolean> = {};
    tiers.forEach(tier => { enabled[tier] = true; });
    setTierEnabled(enabled);
    setSelectedGuildIds(new Set(guilds.map(g => g.id).filter(Boolean) as string[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultSeasonId, showScoreInTable]);

  const effectiveSelectedIds = useMemo(() => {
    return new Set(
      Array.from(selectedGuildIds).filter(id => {
        const guild = guilds.find(g => g.id === id);
        return tierEnabled[guild?.tier ?? 0] !== false;
      })
    );
  }, [selectedGuildIds, guilds, tierEnabled]);

  const totalCount = guilds.length;
  const selectedCount = effectiveSelectedIds.size;

  const toggleTier = (tier: number) => {
    setTierEnabled(prev => ({ ...prev, [tier]: !prev[tier] }));
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
    const allSelected = selectedGuildIds.size === allGuildIds.size && tierNumbers.every(t => tierEnabled[t] !== false);
    if (allSelected) {
      const disabled: Record<number, boolean> = {};
      tierNumbers.forEach(t => { disabled[t] = false; });
      setTierEnabled(disabled);
      setSelectedGuildIds(new Set());
    } else {
      const enabled: Record<number, boolean> = {};
      tierNumbers.forEach(t => { enabled[t] = true; });
      setTierEnabled(enabled);
      setSelectedGuildIds(new Set(allGuildIds));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-8 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-stone-800 border border-stone-700 rounded-2xl w-[780px] max-w-full shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-stone-700">
          <div className="flex items-center gap-2 text-lg font-bold text-stone-100">
            <Download className="w-[18px] h-[18px] text-amber-500" />
            {t('alliance_raid.download_modal_title')}
          </div>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-300 p-1 rounded-md flex items-center justify-center"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Season Range */}
          <div>
            <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest mb-2">
              {t('alliance_raid.download_modal_season_range')}
            </div>
            <div className="flex items-center gap-3">
              <select
                value={seasonFrom}
                onChange={e => setSeasonFrom(e.target.value)}
                className="flex-1 bg-stone-900 border border-stone-600 rounded-lg text-stone-200 px-3 py-2 text-sm cursor-pointer"
              >
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>
                    S{s.season_number}（{s.period_text}）
                  </option>
                ))}
              </select>
              <span className="text-stone-500 text-lg">→</span>
              <select
                value={seasonTo}
                onChange={e => setSeasonTo(e.target.value)}
                className="flex-1 bg-stone-900 border border-stone-600 rounded-lg text-stone-200 px-3 py-2 text-sm cursor-pointer"
              >
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>
                    S{s.season_number}（{s.period_text}）
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Score Toggle */}
          <div className="flex items-center justify-between px-3.5 py-3 bg-stone-900 border border-stone-600 rounded-xl">
            <div className="flex items-center gap-2 text-sm text-stone-300">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              {t('alliance_raid.download_modal_show_score')}
            </div>
            <button
              onClick={() => setIncludeScore(v => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                includeScore ? 'bg-amber-600' : 'bg-stone-600'
              }`}
            >
              <span
                className={`absolute top-[3px] w-3.5 h-3.5 bg-white rounded-full transition-all ${
                  includeScore ? 'right-[3px]' : 'left-[3px]'
                }`}
              />
            </button>
          </div>

          {/* Guild Selection */}
          <div>
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
            <div className="grid grid-cols-4 gap-2.5">
              {tierNumbers.map(tier => {
                const tierGuilds = guildsByTier[tier] ?? [];
                const isOn = tierEnabled[tier] !== false;
                const tierColor = TIER_COLORS[tier] ?? 'text-stone-400';
                return (
                  <div key={tier} className="bg-stone-900 border border-stone-600 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center justify-between px-2.5 py-2 border-b border-stone-800 cursor-pointer hover:bg-stone-800 transition-colors"
                      onClick={() => toggleTier(tier)}
                    >
                      <span className={`text-xs font-bold uppercase tracking-wide ${tierColor}`}>
                        Tier {tier}
                      </span>
                      <div
                        className={`relative w-7 h-4 rounded-full flex-shrink-0 transition-colors ${
                          isOn ? 'bg-amber-600' : 'bg-stone-600'
                        }`}
                      >
                        <span
                          className={`absolute top-[3px] w-2.5 h-2.5 bg-white rounded-full transition-all ${
                            isOn ? 'right-[3px]' : 'left-[3px]'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="py-1.5">
                      {tierGuilds.map(g => {
                        const id = g.id ?? `noId-${g.name}`;
                        const checked = isOn && selectedGuildIds.has(id);
                        return (
                          <div
                            key={id}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
                              isOn ? 'cursor-pointer hover:bg-stone-800' : 'opacity-35 cursor-default'
                            }`}
                            onClick={() => isOn && toggleGuild(id)}
                          >
                            <div
                              className={`w-3.5 h-3.5 border rounded flex-shrink-0 flex items-center justify-center transition-colors ${
                                checked
                                  ? 'bg-amber-600 border-amber-600'
                                  : 'bg-stone-700 border-stone-500'
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
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-t border-stone-700">
          <span className="text-xs text-stone-500 mr-auto">
            {t('alliance_raid.download_modal_selected_count', { selected: selectedCount, total: totalCount })}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-800 border border-stone-600 rounded-xl text-stone-400 text-sm font-semibold hover:border-stone-500 transition-colors"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            onClick={() => onDownload({ seasonFrom, seasonTo, includeScore, selectedGuildIds: effectiveSelectedIds })}
            disabled={selectedCount === 0 || !seasonFrom || !seasonTo}
            className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {t('alliance_raid.download_png')}
          </button>
        </div>
      </div>
    </div>
  );
}
