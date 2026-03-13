import React from 'react';
import { Edit2, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTierColor } from '@/shared/lib/utils';

interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
  description: string;
}

interface GuildRaidRecord {
  id: string;
  season_id: string;
  guild_id: string;
  score: number;
  rank: string;
}

interface AllianceRaidTableProps {
  seasons: RaidSeason[];
  sortedGuilds: any[];
  records: GuildRaidRecord[];
  getRecord: (guild_id: string, season_id: string) => GuildRaidRecord | undefined;
  canManage: boolean;
  editingCell: { guild_id: string, season_id: string } | null;
  editRecordData: { score: number | '', rank: string };
  setEditRecordData: React.Dispatch<React.SetStateAction<{ score: number | '', rank: string }>>;
  setEditingCell: (cell: { guild_id: string, season_id: string } | null) => void;
  startEditing: (guild_id: string, season_id: string) => void;
  handleSaveRecord: (guild_id: string, season_id: string) => void;
  setEditingSeasonId: (id: string) => void;
  setNewSeason: (season: { season_number: number, period_text: string, description: string }) => void;
  setIsSeasonModalOpen: (open: boolean) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
  handleMouseUp: () => void;
  handleMouseMove: (e: React.MouseEvent) => void;
}

const AllianceRaidTable: React.FC<AllianceRaidTableProps> = ({
  seasons,
  sortedGuilds,
  records,
  getRecord,
  canManage,
  editingCell,
  editRecordData,
  setEditRecordData,
  setEditingCell,
  startEditing,
  handleSaveRecord,
  setEditingSeasonId,
  setNewSeason,
  setIsSeasonModalOpen,
  scrollRef,
  handleMouseDown,
  handleMouseLeave,
  handleMouseUp,
  handleMouseMove,
}) => {
  const { t } = useTranslation(['raid', 'translation']);

  return (
    <div
      ref={scrollRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      className="overflow-x-auto cursor-grab active:cursor-grabbing select-none"
    >
      <table className="w-full text-left border-collapse min-w-max">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-stone-100 dark:bg-stone-800 p-2 border-b border-r border-stone-200 dark:border-stone-700 font-bold text-stone-700 dark:text-stone-300 w-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs">
              {/* 會數 */}
            </th>
            <th className="sticky left-12 z-20 bg-stone-100 dark:bg-stone-800 p-2 border-b border-r border-stone-200 dark:border-stone-700 font-bold text-stone-700 dark:text-stone-300 w-24 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs">
              {/* 公會名稱 */}
            </th>
            {seasons.map(season => (
              <th key={season.id} className="p-2 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 w-[110px] min-w-[110px] max-w-[110px] align-top relative group">
                <div className="flex flex-col gap-0.5">
                  <div className="font-bold text-stone-800 dark:text-stone-200 text-xs leading-tight">
                    S{season.season_number}
                  </div>
                  <div className="text-[10px] text-stone-600 dark:text-stone-300 font-medium leading-tight">
                    {season.period_text}
                  </div>
                  <div className="text-[9px] text-stone-500 dark:text-stone-400 font-normal leading-tight">
                    {season.description}
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => {
                      setEditingSeasonId(season.id);
                      setNewSeason({ season_number: season.season_number, period_text: season.period_text, description: season.description });
                      setIsSeasonModalOpen(true);
                    }}
                    className="absolute top-1 right-1 p-1 text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedGuilds.map((guild, index) => {
            const tierClasses = getTierColor(guild.tier || 0);
            const bgClasses = tierClasses.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('dark:bg-')).join(' ');
            const textClasses = tierClasses.split(' ').filter(c => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ');
            const guildColBg = `${bgClasses.replace(/\/30/g, '')} dark:bg-stone-800`;

            return (
              <tr key={guild.id} className={`border-b border-stone-100 dark:border-stone-700/50 hover:brightness-95 dark:hover:brightness-110 transition-all ${bgClasses}`}>
                <td className={`sticky left-0 z-10 py-1 px-2 border-r border-stone-200 dark:border-stone-700 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs w-12 truncate ${guildColBg} ${textClasses}`}>
                  {guild.serial ? `${guild.serial} 會` : '-'}
                </td>
                <td className={`sticky left-12 z-10 py-1 px-2 border-r border-stone-200 dark:border-stone-700 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs w-24 truncate ${guildColBg} ${textClasses}`}>
                  {guild.name}
                </td>
                {seasons.map(season => {
                  const record = getRecord(guild.id, season.id);
                  const isEditing = editingCell?.guild_id === guild.id && editingCell?.season_id === season.id;

                  return (
                    <td key={season.id} className="py-1 px-2 relative group border-r border-stone-200 dark:border-stone-700/50 w-[110px] min-w-[110px] max-w-[110px] align-middle">
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1 w-full">
                            <input
                              type="text"
                              value={editRecordData.rank}
                              onChange={e => setEditRecordData(prev => ({ ...prev, rank: e.target.value }))}
                              className="w-10 min-w-0 px-1 py-0.5 text-xs border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
                              placeholder="Rank"
                            />
                            <input
                              type="number"
                              max="1000000"
                              value={editRecordData.score}
                              onChange={e => setEditRecordData(prev => ({ ...prev, score: e.target.value ? Number(e.target.value) : '' }))}
                              className="flex-1 min-w-0 px-1 py-0.5 text-xs border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="Score"
                            />
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSaveRecord(guild.id, season.id)}
                              className="flex-1 py-0.5 bg-green-100 text-green-700 hover:bg-green-200 rounded flex items-center justify-center transition-colors"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingCell(null)}
                              className="flex-1 py-0.5 bg-stone-200 text-stone-700 hover:bg-stone-300 rounded flex items-center justify-center transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 min-h-[20px] relative pr-6">
                          {record ? (
                            <>
                              <div className={`text-sm font-bold leading-tight ${record.rank && !record.rank.includes('%')
                                ? 'bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] scale-110 transform origin-left'
                                : 'text-amber-600 dark:text-amber-400'
                                }`}>
                                {record.rank}
                              </div>
                              {record.score > 0 && (
                                <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-tight">
                                  ({record.score.toLocaleString()})
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-sm text-stone-400 dark:text-stone-600 italic">
                              -
                            </div>
                          )}

                          {canManage && (
                            <button
                              onClick={() => startEditing(guild.id, season.id)}
                              className="absolute top-1/2 -translate-y-1/2 right-0 p-1 text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default AllianceRaidTable;
