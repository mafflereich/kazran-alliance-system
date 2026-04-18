import { useState, useMemo, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import type { RaidSeason, MemberRaidRecord } from '../types';

interface RaidMemberSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  season: RaidSeason | undefined;
  isSeasonArchived: boolean;
  records: Record<string, MemberRaidRecord>;
  onSelectGuild: (guildId: string) => void;
}

export default function RaidMemberSearchModal({ isOpen, onClose, season, isSeasonArchived, records, onSelectGuild }: RaidMemberSearchModalProps) {
  const { t } = useTranslation(['raid', 'translation']);
  const { db } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) setSearchQuery('');
  }, [isOpen]);

  const results = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    if (isSeasonArchived) {
      return Object.entries(records)
        .filter(([memberId]) => {
          const member = db.members[memberId];
          return member && member.name.toLowerCase().includes(q);
        })
        .map(([memberId, record]) => ({
          memberId,
          name: db.members[memberId].name,
          guildId: record.season_guild || db.members[memberId].guildId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return Object.values(db.members)
      .filter(m => m.status === 'active' && m.name.toLowerCase().includes(q))
      .map(m => ({ memberId: m.id!, name: m.name, guildId: m.guildId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [searchQuery, isSeasonArchived, records, db.members]);

  if (!isOpen) return null;

  const seasonLabel = season
    ? `S${season.season_number}${season.period_text ? ` ${season.period_text}` : ''}`
    : '';
  const hasSearched = searchQuery.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm pt-[80px]">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-600 flex justify-between items-center bg-stone-50 dark:bg-stone-700">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
            <Search className="w-5 h-5 text-stone-500 dark:text-stone-400" />
            {t('raid.find_member', '尋找成員')}
            {season && (
              <span className="text-sm font-normal text-stone-500 dark:text-stone-400 ml-1">
                — {seasonLabel}
              </span>
            )}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 dark:hover:bg-stone-600 rounded-full transition-colors">
            <X className="w-5 h-5 text-stone-500 dark:text-stone-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-stone-400 dark:text-stone-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('dashboard.enter_member_name', '請輸入成員名稱...')}
              autoFocus
              className="w-full pl-10 pr-4 py-2 border border-stone-300 dark:border-stone-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all bg-stone-50 dark:bg-stone-700 focus:bg-white dark:focus:bg-stone-600 dark:text-stone-100"
            />
          </div>

          {/* Results */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">
              {t('dashboard.search_results', '搜尋結果')}
              {hasSearched && ` (${results.length})`}
            </h3>

            <div className="border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden divide-y divide-stone-100 dark:divide-stone-700 max-h-[400px] overflow-y-auto">
              {results.length > 0 ? (
                results.map((r) => {
                  const guildName = db.guilds[r.guildId]?.name || '';
                  const canNavigate = !!r.guildId && !!db.guilds[r.guildId];
                  return (
                    <div
                      key={r.memberId}
                      onClick={() => canNavigate && (onSelectGuild(r.guildId), onClose())}
                      className={`flex items-center justify-between p-4 transition-colors ${canNavigate ? 'cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20' : ''}`}
                    >
                      <span className="font-medium text-stone-800 dark:text-stone-200">{r.name}</span>
                      {guildName && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{guildName}</span>
                      )}
                    </div>
                  );
                })
              ) : hasSearched ? (
                <div className="p-8 text-center text-stone-500 dark:text-stone-400 flex flex-col items-center gap-2">
                  <Search className="w-8 h-8 text-stone-300 dark:text-stone-600" />
                  <p>{t('dashboard.no_results', '找不到符合的成員')}</p>
                </div>
              ) : (
                <div className="p-8 text-center text-stone-400 dark:text-stone-500">
                  {t('dashboard.search_hint', '輸入名稱搜尋成員')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
