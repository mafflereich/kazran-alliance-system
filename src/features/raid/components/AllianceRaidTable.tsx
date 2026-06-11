import React from 'react';
import { Edit2, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTierColor } from '@/shared/lib/utils';
import type { Guild } from '@/entities/member/types';
import type { RaidSeason, GuildRaidLeaderboardRecord } from '../types';
import type { EditRecordData } from '../hooks/useAllianceRaidRecord';

interface Props {
  visibleSeasons: RaidSeason[];
  displayedGuilds: Guild[];
  getRecord: (guild_id: string | undefined, season_id: string) => GuildRaidLeaderboardRecord | undefined;
  hideScoreInTable: boolean;
  hideOverkillInTable: boolean;
  hideSeasonDesc: boolean;
  editingCell: { guild_id: string; season_id: string } | null;
  editRecordData: EditRecordData;
  setEditRecordData: React.Dispatch<React.SetStateAction<EditRecordData>>;
  canManage: boolean;
  handleSaveRecord: (guild_id: string, season_id: string) => Promise<void>;
  startEditing: (guild_id: string, season_id: string) => void;
  setEditingCell: (cell: { guild_id: string; season_id: string } | null) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
  handleMouseUp: () => void;
  handleMouseMove: (e: React.MouseEvent) => void;
}

export default function AllianceRaidTable({
  visibleSeasons, displayedGuilds, getRecord,
  hideScoreInTable, hideOverkillInTable, hideSeasonDesc,
  editingCell, editRecordData, setEditRecordData,
  canManage, handleSaveRecord, startEditing, setEditingCell,
  scrollRef, handleMouseDown, handleMouseLeave, handleMouseUp, handleMouseMove,
}: Props) {
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
            <th className="sticky left-0 z-20 bg-stone-100 dark:bg-stone-800 p-2 border-b border-r border-stone-200 dark:border-stone-700 font-bold text-stone-700 dark:text-stone-300 w-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs" />
            <th className="sticky left-12 z-20 bg-stone-100 dark:bg-stone-800 p-2 border-b border-r border-stone-200 dark:border-stone-700 font-bold text-stone-700 dark:text-stone-300 w-24 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs" />
            {visibleSeasons.map(season => (
              <th key={season.id} className="p-2 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 w-[110px] min-w-[110px] max-w-[110px] align-top">
                <div className="flex flex-col gap-0.5">
                  <div className="font-bold text-stone-800 dark:text-stone-200 text-xs leading-tight">
                    S{season.season_number}
                  </div>
                  <div className="text-[10px] text-stone-600 dark:text-stone-300 font-medium leading-tight">
                    {season.period_text}
                  </div>
                  {!hideSeasonDesc && (
                    <div className="text-[9px] text-stone-500 dark:text-stone-400 font-normal leading-tight">
                      {season.description}
                    </div>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayedGuilds.map((guild) => {
            const tierClasses = getTierColor(guild.tier || 0);
            const bgClasses = tierClasses.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('dark:bg-')).join(' ');
            const textClasses = tierClasses.split(' ').filter(c => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ');
            const guildColBg = `${bgClasses.replace(/\/30/g, '')} dark:bg-stone-800`;

            return (
              <tr key={guild.id} className={`border-b border-stone-100 dark:border-stone-700/50 hover:brightness-95 dark:hover:brightness-110 transition-all ${bgClasses}`}>
                <td className={`sticky left-0 z-10 py-1 px-2 border-r border-stone-200 dark:border-stone-700 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs w-12 truncate ${guildColBg} ${textClasses}`}>
                  {guild.serial ? t('common.guild_serial', { serial: guild.serial }) : '-'}
                </td>
                <td className={`sticky left-12 z-10 py-1 px-2 border-r border-stone-200 dark:border-stone-700 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs w-24 truncate ${guildColBg} ${textClasses}`}>
                  {guild.name}
                </td>
                {visibleSeasons.map(season => {
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
                          {season.score_threshold != null && typeof editRecordData.score === 'number' && editRecordData.score >= season.score_threshold * 30 && (
                            <input
                              type="number"
                              min="0"
                              value={editRecordData.overkill ?? ''}
                              onChange={e => setEditRecordData(prev => ({ ...prev, overkill: e.target.value ? Number(e.target.value) : null }))}
                              className="w-full px-1 py-0.5 text-xs border border-violet-300 dark:border-violet-700 rounded bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="Overkill"
                            />
                          )}
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSaveRecord(guild.id!, season.id)}
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
                        <div
                          className={`flex flex-col gap-0.5 min-h-[20px] relative sm:pr-6 ${canManage ? 'cursor-pointer sm:cursor-default' : ''}`}
                          onClick={canManage ? () => { if (window.innerWidth < 640) startEditing(guild.id!, season.id); } : undefined}
                        >
                          <div className="flex items-center gap-1.5">
                            {record && record.rank ? (
                              <>
                                <div className={`text-sm font-bold leading-tight ${record.rank && !record.rank.includes('%')
                                  ? 'bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] scale-110 transform origin-left'
                                  : 'text-amber-600 dark:text-amber-400'
                                }`}>
                                  {record.rank}
                                </div>
                                {record.score > 0 && !hideScoreInTable && (
                                  <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-tight">
                                    ({record.score.toLocaleString()})
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-sm text-stone-400 dark:text-stone-600 italic">-</div>
                            )}
                          </div>
                          {!hideOverkillInTable && record?.overkill != null && season.score_threshold != null && record.score >= season.score_threshold * 30 && (
                            <div className="text-[10px] text-violet-500 dark:text-violet-400 font-medium leading-tight">
                              {record.overkill.toLocaleString()}
                            </div>
                          )}
                          {canManage && (
                            <button
                              onClick={(e) => { e.stopPropagation(); startEditing(guild.id!, season.id); }}
                              className="hidden sm:block absolute top-0.5 right-0 p-1 text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
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
}
