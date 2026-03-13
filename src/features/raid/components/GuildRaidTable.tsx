import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Pencil, Save, X, ArrowDownWideNarrow, ArrowDownNarrowWide, Copy, Check, Ghost } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Member, Guild } from '@/entities/member/types';
import { deduceScore } from '../utils/scoreDeduction';

interface MemberRaidRecord {
  id?: string;
  season_id: string;
  member_id: string;
  score: number;
  note: string;
  season_note?: string;
  season_guild?: string;
}

interface GuildRaidRecord {
  season_id: string;
  guild_id: string;
  member_score_median: number;
  note?: string;
}

interface GuildRaidTableProps {
  guildId: string;
  guild: Guild;
  sortedMembers: Member[];
  records: Record<string, MemberRaidRecord>;
  draftRecords: Record<string, MemberRaidRecord>;
  guildRaidRecord?: GuildRaidRecord;
  isComparisonMode: boolean;
  isArchived?: boolean;
  seasonId: string;
  loading: boolean;
  saving: boolean;
  sortConfig: { key: 'default' | 'score', order: 'asc' | 'desc' };
  onSort: (key: 'default' | 'score') => void;
  onRecordChange: (memberId: string, field: 'score' | 'note' | 'season_note', value: string | number) => void;
  onGuildNoteChange?: (guildId: string, note: string) => void;
  onBlur: (memberId: string) => void;
  onMemberClick: (member: Member) => void;
  rowHeights?: Record<number, number>;
  onRowHeightChange?: (index: number, height: number) => void;
  headerHeight?: number;
  onHeaderHeightChange?: (height: number) => void;
  theadHeight?: number;
  onTheadHeightChange?: (height: number) => void;
  highlightedMemberIds?: Set<string>;
  ghostRecords?: Record<string, any[]>;
  onAddGhostRecord?: (memberId: string) => void;
}

export default function GuildRaidTable({
  guildId,
  guild,
  sortedMembers,
  records,
  draftRecords,
  guildRaidRecord,
  isComparisonMode,
  isArchived,
  seasonId,
  loading,
  saving,
  sortConfig,
  onSort,
  onRecordChange,
  onGuildNoteChange,
  onBlur,
  onMemberClick,
  rowHeights,
  onRowHeightChange,
  headerHeight,
  onHeaderHeightChange,
  theadHeight,
  onTheadHeightChange,
  highlightedMemberIds,
  ghostRecords = {},
  onAddGhostRecord
}: GuildRaidTableProps) {
  const { t } = useTranslation(['raid', 'translation']);
  const guildName = guild?.name || '';
  const guildSerial = guild?.serial ? `${guild.serial} 會 ` : '';
  const displayGuildName = `${guildSerial}${guildName}`;

  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const headerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);

  const [isEditingGuildNote, setIsEditingGuildNote] = useState(false);
  const [guildNoteInput, setGuildNoteInput] = useState('');
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);
  const [ghostModalMember, setGhostModalMember] = useState<Member | null>(null);

  const displayGuildNote = guildRaidRecord?.note || '';

  const handleCopyName = (e: React.MouseEvent, name: string, memberId: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(name);
    setCopiedMemberId(memberId);
    setTimeout(() => {
      setCopiedMemberId(null);
    }, 2000);
  };

  const handleGuildNoteEdit = () => {
    if (isArchived) return;
    setGuildNoteInput(displayGuildNote);
    setIsEditingGuildNote(true);
  };

  const handleGuildNoteSave = () => {
    if (onGuildNoteChange) {
      onGuildNoteChange(guildId, guildNoteInput);
    }
    setIsEditingGuildNote(false);
  };

  const handleGuildNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGuildNoteSave();
    } else if (e.key === 'Escape') {
      setIsEditingGuildNote(false);
    }
  };

  useEffect(() => {
    if (!isComparisonMode) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === headerRef.current && onHeaderHeightChange) {
          onHeaderHeightChange(entry.borderBoxSize[0]?.blockSize || entry.contentRect.height);
        } else if (entry.target === theadRef.current && onTheadHeightChange) {
          onTheadHeightChange(entry.borderBoxSize[0]?.blockSize || entry.contentRect.height);
        } else if (onRowHeightChange) {
          const index = rowRefs.current.indexOf(entry.target as HTMLTableRowElement);
          if (index !== -1) {
            const height = entry.borderBoxSize[0]?.blockSize || entry.contentRect.height;
            onRowHeightChange(index, height);
          }
        }
      }
    });

    if (headerRef.current) observer.observe(headerRef.current);
    if (theadRef.current) observer.observe(theadRef.current);
    rowRefs.current.forEach(row => {
      if (row) observer.observe(row);
    });

    return () => observer.disconnect();
  }, [isComparisonMode, onRowHeightChange, onHeaderHeightChange, onTheadHeightChange, sortedMembers]);

  // Calculate median score
  const medianScore = useMemo(() => {
    const validScores = sortedMembers
      .map(member => draftRecords[member.id!]?.score ?? records[member.id!]?.score)
      .filter((score): score is number => typeof score === 'number' && score > 0);

    if (validScores.length === 0) return 0;
    
    const sorted = [...validScores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 !== 0) {
      return Math.floor(sorted[mid]);
    } else {
      return Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
    }
  }, [sortedMembers, records, draftRecords]);

  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 flex flex-col overflow-hidden">
      <div 
        ref={headerRef}
        style={isComparisonMode && headerHeight ? { height: `${headerHeight}px` } : {}}
        className="bg-stone-50 dark:bg-stone-700 px-4 py-3 border-b border-stone-200 dark:border-stone-600 font-bold text-stone-800 dark:text-stone-200 flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <span>{displayGuildName}</span>
          <span className="text-xs font-normal text-stone-500 dark:text-stone-400">({sortedMembers.length} {t('common.member', '成員')})</span>
          {!isComparisonMode && (
            <div className="ml-4 flex items-center gap-2">
              {isEditingGuildNote ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={guildNoteInput}
                    onChange={(e) => setGuildNoteInput(e.target.value)}
                    onKeyDown={handleGuildNoteKeyDown}
                    onBlur={handleGuildNoteSave}
                    autoFocus
                    className="px-2 py-0.5 text-xs font-normal border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none border-stone-300 dark:border-stone-600 w-48"
                    placeholder={t('raid.guild_note_placeholder', '公會備註...')}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {displayGuildNote && (
                    <span className="text-xs font-normal px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-100 dark:border-indigo-800/50">
                      {displayGuildNote}
                    </span>
                  )}
                  {!isArchived && (
                    <button
                      onClick={handleGuildNoteEdit}
                      className="p-1 text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title={t('common.edit', '編輯')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-stone-500">{t('common.loading', '載入中...')}</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead 
              ref={theadRef}
              style={isComparisonMode && theadHeight ? { height: `${theadHeight}px` } : {}}
              className="sticky top-0 bg-stone-50 dark:bg-stone-700 z-10 shadow-sm"
            >
              <tr>
                <th 
                  className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600"
                  onClick={() => onSort('default')}
                >
                  <div className="flex items-center gap-1">
                    {t('common.member', '成員')}
                    {sortConfig.key === 'default' && (
                      sortConfig.order === 'asc' 
                        ? <ArrowDownWideNarrow className="w-3.5 h-3.5 text-indigo-500" />
                        : <ArrowDownNarrowWide className="w-3.5 h-3.5 text-indigo-500" />
                    )}
                  </div>
                </th>
                <th 
                  className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600 w-24"
                  onClick={() => onSort('score')}
                >
                  <div className="flex items-center gap-1">
                    {t('raid.column_score', '個人總分')}
                    {sortConfig.key === 'score' && (
                      sortConfig.order === 'asc' 
                        ? <ArrowDownWideNarrow className="w-3.5 h-3.5 text-indigo-500" />
                        : <ArrowDownNarrowWide className="w-3.5 h-3.5 text-indigo-500" />
                    )}
                  </div>
                </th>
                {!isComparisonMode && (
                  <th className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600 w-32">
                    {t('raid.column_deduction', '推算')}
                  </th>
                )}
                {!isComparisonMode && (
                  <th className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600">
                    {t('raid.column_note', '成員備註')}
                  </th>
                )}
                {!isComparisonMode && (
                  <th className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600">
                    {t('raid.column_season_note', '賽季備註')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((member, index) => {
                const record = draftRecords[member.id!] || records[member.id!] || { score: 0, season_note: '' };
                const noteValue = draftRecords[member.id!]?.note ?? member.note ?? '';
                const isDirty = !!draftRecords[member.id!];
                const isHighlighted = highlightedMemberIds?.has(member.id!);

                return (
                  <tr 
                    key={member.id} 
                    ref={el => { rowRefs.current[index] = el; }}
                    style={isComparisonMode && rowHeights?.[index] ? { height: `${rowHeights[index]}px` } : {}}
                    className={`border-b border-stone-100 dark:border-stone-700/50 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors ${isDirty ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''} ${isHighlighted ? 'animate-flash-orange' : ''}`}
                  >
                    <td className="py-0.5 px-2">
                      <div className="flex items-center gap-2 group/member">
                        <button 
                          onClick={() => onMemberClick(member)}
                          className="flex items-center gap-2 text-xs font-medium text-stone-800 dark:text-stone-200 hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                        >
                          <Search className="w-3.5 h-3.5 text-stone-400" />
                          <span className="truncate max-w-[120px]">{member.name}</span>
                        </button>
                        <button
                          onClick={(e) => handleCopyName(e, member.name, member.id!)}
                          className={`p-1 rounded-md transition-all ${
                            copiedMemberId === member.id 
                              ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' 
                              : 'text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-100 dark:hover:bg-stone-700 opacity-0 group-hover/member:opacity-100'
                          }`}
                          title={t('common.copy', '複製')}
                        >
                          {copiedMemberId === member.id ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={() => setGhostModalMember(member)}
                          className={`p-1 rounded-md transition-all flex items-center gap-1 ${
                            (ghostRecords[member.id!]?.length || 0) > 0
                              ? 'text-amber-500 hover:bg-stone-100 dark:hover:bg-stone-700 opacity-100'
                              : 'text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-stone-100 dark:hover:bg-stone-700 opacity-0 group-hover/member:opacity-100'
                          }`}
                          title={t('raid.ghost_log_tooltip', '招魂紀錄')}
                        >
                          <Ghost className="w-3 h-3" />
                          {(ghostRecords[member.id!]?.length || 0) > 0 && (
                            <span className="text-[10px] font-bold">
                              {ghostRecords[member.id!].length}
                            </span>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-0.5 px-2">
                      {(!isArchived && !isComparisonMode) ? (
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={record.score || ''}
                          onChange={(e) => onRecordChange(member.id!, 'score', e.target.value)}
                          onBlur={() => onBlur(member.id!)}
                          className={`w-full px-2 py-0.5 text-xs border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDirty ? 'border-amber-300 dark:border-amber-600' : 'border-stone-300 dark:border-stone-600'}`}
                        />
                      ) : (
                        <div className="px-2 py-0.5 text-xs text-stone-800 dark:text-stone-200">
                          {record.score || 0}
                        </div>
                      )}
                    </td>
                    {!isComparisonMode && (
                      <td className="py-0.5 px-2">
                        <div className="px-2 py-0.5 text-[10px] text-stone-600 dark:text-stone-400 font-mono whitespace-pre-line leading-tight">
                          {deduceScore(record.score || 0, t)}
                        </div>
                      </td>
                    )}
                      {!isComparisonMode && (
                        <td className="py-0.5 px-2">
                          {!isArchived ? (
                            <input
                              type="text"
                              value={noteValue}
                              onChange={(e) => onRecordChange(member.id!, 'note', e.target.value)}
                              onBlur={() => onBlur(member.id!)}
                              className={`w-full px-2 py-0.5 text-xs border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none ${isDirty ? 'border-amber-300 dark:border-amber-600' : 'border-stone-300 dark:border-stone-600'}`}
                            />
                          ) : (
                            <div className="px-2 py-0.5 text-xs text-stone-800 dark:text-stone-200 truncate">
                              {noteValue || ''}
                            </div>
                          )}
                        </td>
                      )}
                      {!isComparisonMode && (
                        <td className="py-0.5 px-2">
                          {!isArchived ? (
                            <input
                              type="text"
                              value={record.season_note || ''}
                              onChange={(e) => onRecordChange(member.id!, 'season_note', e.target.value)}
                              onBlur={() => onBlur(member.id!)}
                              className={`w-full px-2 py-0.5 text-xs border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none ${isDirty ? 'border-amber-300 dark:border-amber-600' : 'border-stone-300 dark:border-stone-600'}`}
                            />
                          ) : (
                            <div className="px-2 py-0.5 text-xs text-stone-800 dark:text-stone-200 truncate">
                              {record.season_note || ''}
                            </div>
                          )}
                        </td>
                      )}
                  </tr>
                );
              })}
              {/* Median Row */}
              <tr className="bg-stone-50 dark:bg-stone-700/30 font-bold border-t-2 border-stone-200 dark:border-stone-600">
                <td className="py-1 px-3 text-right text-xs text-stone-500 dark:text-stone-400">
                  {t('raid.median', '中位數')}：
                </td>
                <td className="py-1 px-3 text-xs text-stone-500 dark:text-stone-400">
                  {medianScore}
                </td>
                {!isComparisonMode && <td colSpan={3}></td>}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Ghost Modal */}
      {ghostModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-stone-200 dark:border-stone-700">
            <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-stone-700">
              <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100 flex items-center gap-2">
                <Ghost className="w-5 h-5 text-amber-500" />
                {ghostModalMember.name} - {t('raid.ghost_log_title', '招魂紀錄')}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAddGhostRecord?.(ghostModalMember.id!)}
                  className="px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1"
                >
                  <Ghost className="w-4 h-4" />
                  {t('raid.ghost_log_button', '招魂')}
                </button>
                <button
                  onClick={() => setGhostModalMember(null)}
                  className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {ghostRecords[ghostModalMember.id!]?.length ? (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-700">
                      <th className="py-2 font-medium text-stone-500 dark:text-stone-400">
                        {t('alliance_raid.season_label', '賽季')}
                      </th>
                      <th className="py-2 font-medium text-stone-500 dark:text-stone-400">
                        {t('common.date', '日期')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...ghostRecords[ghostModalMember.id!]]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((record, idx) => (
                        <tr key={record.uid || idx} className="border-b border-stone-100 dark:border-stone-700/50">
                          <td className="py-2 text-stone-800 dark:text-stone-200">
                            {record.season_number ? `S${record.season_number}` : '-'}
                          </td>
                          <td className="py-2 text-stone-600 dark:text-stone-400">
                            {new Date(record.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-stone-500 dark:text-stone-400">
                  <Ghost className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>{t('raid.ghost_log_empty', '目前沒有招魂紀錄')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
