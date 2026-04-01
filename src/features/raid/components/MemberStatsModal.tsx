import React, { useMemo, useState, useEffect } from 'react';
import { X, Swords, Loader2, ChevronDown, ArrowBigUp, ArrowBigDown, ArrowBigRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getImageUrl } from '@/shared/lib/utils';
import { useAppContext } from '@/store';
import { supabase } from '@/shared/api/supabase';

interface MemberStatsModalProps {
  member: any;
  onClose: () => void;
}

export default function MemberStatsModal({ member, onClose }: MemberStatsModalProps) {
  const { t, i18n } = useTranslation(['raid', 'translation']);
  const { db } = useAppContext();

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(4);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!member?.id) return;
      setLoadingHistory(true);
      try {
        // 1. Get seasons based on historyLimit
        const { data: seasons, error: seasonsError, count } = await supabase
          .from('raid_seasons')
          .select('*', { count: 'exact' })
          .order('season_number', { ascending: false })
          .limit(historyLimit);
        
        if (seasonsError) throw seasonsError;
        if (!seasons || seasons.length === 0) {
          setHistoryData([]);
          setHasMoreHistory(false);
          return;
        }

        setHasMoreHistory(count ? seasons.length < count : false);

        const seasonIds = seasons.map(s => s.id);

        // 2. Get member records for these seasons
        const { data: memberRecords, error: memberRecordsError } = await supabase
          .from('member_raid_records')
          .select('*')
          .eq('member_id', member.id)
          .in('season_id', seasonIds);
        
        if (memberRecordsError) throw memberRecordsError;

        // 3. Get guild records for these seasons (to get medians)
        const { data: guildRecords, error: guildRecordsError } = await supabase
          .from('guild_raid_records')
          .select('*')
          .in('season_id', seasonIds);
        
        if (guildRecordsError) throw guildRecordsError;

        // Combine data
        const history = seasons.map(season => {
          const mRecord = memberRecords?.find(r => r.season_id === season.id);
          
          // Determine which guild ID to use for looking up the median
          const targetGuildId = !season.is_archived 
            ? member.guildId 
            : mRecord?.season_guild;

          const gRecord = guildRecords?.find(r => r.season_id === season.id && r.guild_id === targetGuildId);
          
          return {
            season,
            mRecord,
            gRecord
          };
        });

        setHistoryData(history);
      } catch (err) {
        console.error('Error fetching member history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [member?.id, member?.guildId, historyLimit]);

  const getTierColor = (tier: number) => {
    switch (tier) {
      case 1: return 'bg-orange-500 text-white';
      case 2: return 'bg-blue-500 text-white';
      case 3: return 'bg-stone-500 text-white';
      case 4: return 'bg-green-500 text-white';
      default: return 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-400';
    }
  };

  const costumesByCharacter = useMemo(() => {
    if (!member?.records) return [];

    const grouped: Record<string, any[]> = {};
    Object.values(db.costumes).forEach(costume => {
      if (!grouped[costume.characterId]) {
        grouped[costume.characterId] = [];
      }
      grouped[costume.characterId].push(costume);
    });

    // Sort characters
    const sortedCharacterIds = Object.keys(grouped).sort((a, b) => {
      const charA = db.characters[a];
      const charB = db.characters[b];
      return (charA?.orderNum || 99) - (charB?.orderNum || 99);
    });

    return sortedCharacterIds.map(charId => {
      const char = db.characters[charId];
      const costumes = grouped[charId].sort((a, b) => (a.orderNum || 99) - (b.orderNum || 99));
      return {
        character: char,
        costumes
      };
    });
  }, [member, db.costumes, db.characters]);

  if (!member) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-700/50">
          <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100 flex items-center gap-2">
            {member.name} {t('raid.stats', '成員資訊')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {/* History Table */}
          <div className="mb-8">
            <button 
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="w-full text-sm font-bold text-stone-700 dark:text-stone-300 mb-3 flex items-center justify-between group"
            >
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4" />
                {t('raid.recent_season_records', '最近賽季紀錄')}
              </div>
              <div className="text-xs font-normal text-stone-400 group-hover:text-stone-600 transition-colors flex items-center gap-1">
                {isHistoryOpen ? t('common.collapse', '收起') : t('common.expand', '展開')}
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isHistoryOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            
            {isHistoryOpen && (
              loadingHistory && historyData.length === 0 ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
              ) : historyData.length > 0 ? (
                <div className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left max-md:min-w-[600px]">
                      <thead className="bg-stone-50 dark:bg-stone-700/50 text-stone-500 dark:text-stone-400 font-medium">
                        <tr>
                          <th className="px-4 py-2 border-b border-stone-200 dark:border-stone-700">{t('alliance_raid.season_label', '賽季')}</th>
                          <th className="px-4 py-2 border-b border-stone-200 dark:border-stone-700">{t('alliance_raid.period', '期間')}</th>
                          <th className="px-4 py-2 border-b border-stone-200 dark:border-stone-700">{t('common.guild', '公會')}</th>
                          <th className="px-4 py-2 border-b border-stone-200 dark:border-stone-700">{t('raid.column_score', '個人總分')}</th>
                          <th className="px-4 py-2 border-b border-stone-200 dark:border-stone-700">{t('raid.guild_median', '公會中位數')}</th>
                          <th className="px-4 py-2 border-b border-stone-200 dark:border-stone-700">{t('raid.season_note', '賽季備註')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200 dark:divide-stone-700">
                        {historyData.map((item) => {
                          const guild = !item.season.is_archived 
                            ? (member.guildId ? db.guilds[member.guildId] : null)
                            : (item.mRecord?.season_guild ? db.guilds[item.mRecord.season_guild] : null);
                          return (
                            <tr key={item.season.id} className="bg-white dark:bg-stone-800">
                              <td className="px-4 py-3 font-bold text-stone-800 dark:text-stone-200">
                                S{item.season.season_number}
                              </td>
                              <td className="px-4 py-3 text-xs text-stone-500">
                                {item.season.period_text}
                              </td>
                              <td className="px-4 py-3">
                                {guild ? (
                                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${getTierColor(guild.tier || 1)}`}>
                                    {guild.name}
                                  </span>
                                ) : (
                                  <span className="text-stone-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-stone-700 dark:text-stone-300">
                                <div className="flex items-center gap-1">
                                  {item.mRecord?.score?.toLocaleString() || '-'}
                                  {item.mRecord?.score && item.gRecord?.member_score_median && (
                                    <>
                                      {item.mRecord.score > item.gRecord.member_score_median ? (
                                        <ArrowBigUp className="w-4 h-4 text-emerald-500 fill-emerald-500" />
                                      ) : item.mRecord.score < item.gRecord.member_score_median ? (
                                        <ArrowBigDown className="w-4 h-4 text-rose-500 fill-rose-500" />
                                      ) : (
                                        <ArrowBigRight className="w-4 h-4 text-stone-400 fill-stone-400" />
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-stone-700 dark:text-stone-300">
                                {item.gRecord?.member_score_median?.toLocaleString() || '-'}
                              </td>
                              <td className="px-4 py-3 text-xs text-stone-600 dark:text-stone-400 whitespace-pre-wrap break-words max-w-[200px]">
                                {item.mRecord?.season_note || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {hasMoreHistory && (
                    <div className="bg-stone-50 dark:bg-stone-800/50 border-t border-stone-200 dark:border-stone-700 p-2 text-center">
                      <button
                        onClick={() => setHistoryLimit(prev => prev + 4)}
                        disabled={loadingHistory}
                        className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full py-1"
                      >
                        {loadingHistory ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                        {t('common.load_more', '載入更多')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-stone-400 text-xs italic border border-dashed border-stone-200 dark:border-stone-700 rounded-xl">
                  {t('raid.no_season_records', '尚無賽季紀錄')}
                </div>
              )
            )}
          </div>

          <div className="flex flex-wrap items-start gap-x-6 gap-y-6">
            {costumesByCharacter.map(({ character, costumes }) => (
              <div key={character?.id || 'unknown'} className="flex flex-col gap-3">
                <div className="text-sm font-bold text-stone-700 dark:text-stone-300 border-b border-stone-200 dark:border-stone-700 pb-1">
                  {character ? (i18n.language === 'en' ? (character.nameE || character.name) : character.name) : 'Unknown'}
                </div>
                <div className="flex flex-wrap gap-4">
                  {costumes.map(costume => {
                    const record = member.records[costume.id];
                    const rawLevel = record?.level;
                    const isOwned = record && rawLevel !== undefined && rawLevel !== null && Number(rawLevel) >= 0;
                    const level = isOwned ? Number(rawLevel) : -1;
                    const hasWeapon = member.exclusiveWeapons?.[costume.characterId];
                    
                    let levelColorClass = "bg-orange-400 text-stone-900";
                    if (level < 0) levelColorClass = "bg-stone-100 dark:bg-stone-800 text-stone-400";
                    else if (level === 0) levelColorClass = "bg-stone-300 text-stone-900";
                    else if (level === 1) levelColorClass = "bg-blue-300 text-stone-900";
                    else if (level === 2) levelColorClass = "bg-blue-400 text-stone-900";
                    else if (level === 3) levelColorClass = "bg-purple-300 text-stone-900";
                    else if (level === 4) levelColorClass = "bg-purple-400 text-stone-900";
                    else if (level >= 5) levelColorClass = "bg-orange-400 text-stone-900 font-black";

                    return (
                      <div key={costume.id} className={`w-24 bg-stone-50 dark:bg-stone-700/50 rounded-xl p-3 border border-stone-200 dark:border-stone-700 flex flex-col items-center gap-2 relative ${!isOwned ? 'opacity-60 grayscale' : ''}`}>
                        {costume.imageName && (
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-600">
                            <img
                              src={getImageUrl(costume.imageName)}
                              alt={i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        <div className="text-xs font-medium text-center truncate w-full text-stone-700 dark:text-stone-300" title={i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}>
                          {i18n.language === 'en' ? (costume.nameE || costume.name) : costume.name}
                        </div>
                        {isOwned && (
                          <div className="absolute -top-2 -right-2 flex flex-col items-center gap-1 z-10">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${levelColorClass}`}>
                              +{level}
                            </div>
                            {hasWeapon && (
                              <div className="w-6 h-6 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center shadow-sm">
                                <Swords className="w-3.5 h-3.5 text-amber-600" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {(!member.records || Object.keys(member.records).length === 0) && (
            <div className="text-center text-stone-500 py-8">
              {t('raid.no_stats', '尚無練度資料')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
