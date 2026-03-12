import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Pencil, Save, X, ArrowDownWideNarrow, ArrowDownNarrowWide } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Member } from '@/entities/member/types';
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

interface GuildRaidTableProps {
  guildId: string;
  guildName: string;
  sortedMembers: Member[];
  records: Record<string, MemberRaidRecord>;
  draftRecords: Record<string, MemberRaidRecord>;
  savedMedian?: number;
  isComparisonMode: boolean;
  isArchived?: boolean;
  seasonId: string;
  loading: boolean;
  saving: boolean;
  sortConfig: { key: 'default' | 'score', order: 'asc' | 'desc' };
  onSort: (key: 'default' | 'score') => void;
  onRecordChange: (memberId: string, field: 'score' | 'note' | 'season_note', value: string | number) => void;
  onMemberClick: (member: Member) => void;
  onSave: (guildId: string) => Promise<void>;
  onCancel: (guildId: string) => void;
  rowHeights?: Record<number, number>;
  onRowHeightChange?: (index: number, height: number) => void;
  headerHeight?: number;
  onHeaderHeightChange?: (height: number) => void;
  theadHeight?: number;
  onTheadHeightChange?: (height: number) => void;
}

export default function GuildRaidTable({
  guildId,
  guildName,
  sortedMembers,
  records,
  draftRecords,
  savedMedian,
  isComparisonMode,
  isArchived,
  seasonId,
  loading,
  saving,
  sortConfig,
  onSort,
  onRecordChange,
  onMemberClick,
  onSave,
  onCancel,
  rowHeights,
  onRowHeightChange,
  headerHeight,
  onHeaderHeightChange,
  theadHeight,
  onTheadHeightChange
}: GuildRaidTableProps) {
  const { t } = useTranslation(['raid', 'translation']);

  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const headerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);

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

  const guildMemberIds = sortedMembers.map(m => m.id!);
  const hasChanges = guildMemberIds.some(id => !!draftRecords[id]);

  const handleSave = async () => {
    await onSave(guildId);
  };

  const handleCancel = () => {
    onCancel(guildId);
  };

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
        className="bg-stone-50 dark:bg-stone-700 px-4 py-3 border-b border-stone-200 dark:border-stone-600 font-bold text-stone-800 dark:text-stone-200 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span>{guildName}</span>
          <span className="text-xs font-normal text-stone-500 dark:text-stone-400">({sortedMembers.length} {t('common.member', '成員')})</span>
        </div>
        {!isComparisonMode && (
          <div className="flex items-center gap-2">
            <button 
              onClick={handleCancel} 
              disabled={!hasChanges || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-stone-200 dark:bg-stone-600 text-stone-700 dark:text-stone-200 rounded hover:bg-stone-300 dark:hover:bg-stone-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
              {t('raid.restore', '還原')}
            </button>
            <button 
              onClick={handleSave} 
              disabled={!hasChanges || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {saving ? t('common.saving', '儲存中...') : t('common.save', '儲存')}
            </button>
          </div>
        )}
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

                return (
                  <tr 
                    key={member.id} 
                    ref={el => { rowRefs.current[index] = el; }}
                    style={isComparisonMode && rowHeights?.[index] ? { height: `${rowHeights[index]}px` } : {}}
                    className={`border-b border-stone-100 dark:border-stone-700/50 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors ${isDirty ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
                  >
                    <td className="py-0.5 px-2">
                      <button 
                        onClick={() => onMemberClick(member)}
                        className="flex items-center gap-2 text-xs font-medium text-stone-800 dark:text-stone-200 hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                      >
                        <Search className="w-3.5 h-3.5 text-stone-400" />
                        <span className="truncate max-w-[120px]">{member.name}</span>
                      </button>
                    </td>
                    <td className="py-0.5 px-2">
                      {(!isArchived && !isComparisonMode) ? (
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={record.score || ''}
                          onChange={(e) => onRecordChange(member.id!, 'score', e.target.value)}
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
                  {Object.keys(draftRecords).length > 0 ? medianScore : (savedMedian ?? medianScore)}
                </td>
                {!isComparisonMode && <td colSpan={3}></td>}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
