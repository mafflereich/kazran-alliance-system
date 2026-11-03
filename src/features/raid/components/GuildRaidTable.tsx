import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Pencil, ArrowDownWideNarrow, ArrowDownNarrowWide, Copy, Check, Ghost, X, ListPlus, ClipboardCheck, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Member, Guild } from '@/entities/member/types';
import { deduceScore } from '../utils/scoreDeduction';
import { getPrevGuildName, getCustomNote, setNoteSegment, removeNoteSegment, PREV_GUILD_TAG, CHECK_IN_TAG, getNoteSegment } from '@/shared/lib/noteUtils';
import GhostRecordModal from './GhostRecordModal';
import BulkScoreFillModal from './BulkScoreFillModal';
import CheckInTracker from './CheckInTracker';
import CheckInAnnounceModal from './CheckInAnnounceModal';
import ConfirmModal from '@/shared/ui/ConfirmModal';
import type { MemberRaidRecord, GuildRaidRecord } from '../types';

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
  evenRounds?: boolean;
  loading: boolean;
  saving: boolean;
  sortConfig: { key: 'default' | 'score', order: 'asc' | 'desc' };
  onSort: (key: 'default' | 'score') => void;
  onRecordChange: (memberId: string, field: 'score' | 'note' | 'season_note' | 'overkill', value: string | number | null) => void;
  onGuildNoteChange?: (guildId: string, note: string) => void;
  /** 切換簽到記號（1~3 = 簽到回合，4 = 死） */
  onCheckInChange?: (memberId: string, marks: number[]) => Promise<void> | void;
  /** 重置本公會所有成員的簽到記號 */
  onResetCheckIns?: (guildId: string, keepDead: boolean, memberIds: string[]) => Promise<void> | void;
  /** 是否有 raid.checkin.write（與 raid.score.write 分開） */
  canCheckIn?: boolean;
  onBlur: (memberId: string, guildId: string) => void;
  onBulkScoreFill?: (guildId: string, score: number, memberIds: string[]) => Promise<boolean>;
  onClearAllPrevGuildTags?: (entries: { id: string; note: string }[], guildId: string) => Promise<void>;
  /** Editor error, forwarded to BulkScoreFillModal — the page banner is hidden behind its overlay. */
  editorError?: string;
  onMemberClick: (member: Member) => void;
  rowHeights?: Record<number, number>;
  onRowHeightChange?: (index: number, height: number) => void;
  headerHeight?: number;
  onHeaderHeightChange?: (height: number) => void;
  theadHeight?: number;
  onTheadHeightChange?: (height: number) => void;
  highlightedMemberIds?: Set<string>;
  ghostRecords?: Record<string, any[]>;
  onFetchGhostRecords?: (memberId: string) => void;
  onAddGhostRecord?: (memberId: string) => void;
  onDeleteGhostRecord?: (memberId: string, record: any) => void;
  showOverkill?: boolean;
  scoreThreshold?: number | null;
  forceHideOverkill?: boolean;
  /** 唯讀模式（例如 manager 只能看自己公會）：保留表格與排序，但不能修改 */
  readOnly?: boolean;
}

function GuildRaidTable({
  guildId,
  guild,
  sortedMembers,
  records,
  draftRecords,
  guildRaidRecord,
  isComparisonMode,
  isArchived,
  seasonId,
  evenRounds = true,
  loading,
  saving,
  sortConfig,
  onSort,
  onRecordChange,
  onGuildNoteChange,
  onCheckInChange,
  onResetCheckIns,
  canCheckIn,
  onBlur,
  onBulkScoreFill,
  onClearAllPrevGuildTags,
  editorError,
  onMemberClick,
  rowHeights,
  onRowHeightChange,
  headerHeight,
  onHeaderHeightChange,
  theadHeight,
  onTheadHeightChange,
  highlightedMemberIds,
  ghostRecords = {},
  onFetchGhostRecords,
  onAddGhostRecord,
  onDeleteGhostRecord,
  showOverkill = false,
  scoreThreshold = null,
  forceHideOverkill = true,
  readOnly = false,
}: GuildRaidTableProps) {
  const { t } = useTranslation(['raid', 'translation']);
  const guildName = guild?.name || '';
  const guildSerial = guild?.serial ? `${t('common.guild_serial', { serial: guild.serial })} ` : '';
  const displayGuildName = `${guildSerial}${guildName}`;
  // 封存賽季與唯讀模式共用「不可編輯」的渲染路徑
  const locked = isArchived === true || readOnly;
  // 簽到權限與分數編輯分開：有 raid.checkin.write 但沒有 raid.score.write 也能簽到。
  const allowCheckIn = canCheckIn ?? !readOnly;
  const checkInLocked = isArchived === true || !allowCheckIn;

  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const headerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);

  const [isEditingGuildNote, setIsEditingGuildNote] = useState(false);
  const [guildNoteInput, setGuildNoteInput] = useState('');
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);
  const [ghostModalMember, setGhostModalMember] = useState<Member | null>(null);
  const [isBulkFillOpen, setIsBulkFillOpen] = useState(false);
  const [isCheckInAnnounceOpen, setIsCheckInAnnounceOpen] = useState(false);
  const [isResetCheckInOpen, setIsResetCheckInOpen] = useState(false);
  /** 重置時是否保留 4（死／永久失聯）；預設保留，避免清掉黑名單。 */
  const [keepDeadOnReset, setKeepDeadOnReset] = useState(true);
  const displayGuildNote = guildRaidRecord?.note || '';

  /** 表格目前顯示的完整備註（草稿優先，才能保留尚未送出的編輯）。 */
  const noteOf = (member: Member) => draftRecords[member.id!]?.note ?? member.note ?? '';

  const handleResetCheckIns = () => {
    if (checkInLocked || !onResetCheckIns) return;
    setIsResetCheckInOpen(false);
    const memberIds = sortedMembers
      .map(member => member.id)
      .filter((id): id is string => !!id);
    void onResetCheckIns(guildId, keepDeadOnReset, memberIds);
  };

  const checkInAnnounceMembers = useMemo(
    () => sortedMembers
      .filter(member => !!member.id)
      .map(member => ({ id: member.id!, name: member.name, note: noteOf(member) })),
    [sortedMembers, draftRecords],
  );

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

  const handleClearAllPrevGuildTags = () => {
    if (locked || isComparisonMode || !onClearAllPrevGuildTags) return;
    const entries = sortedMembers
      .map((member) => {
        if (!member.id) return null;
        const noteValue = draftRecords[member.id]?.note ?? member.note ?? '';
        if (!getPrevGuildName(noteValue)) return null;
        return { id: member.id, note: removeNoteSegment(noteValue, PREV_GUILD_TAG) };
      })
      .filter((e): e is { id: string; note: string } => e !== null);
    if (entries.length > 0) {
      onClearAllPrevGuildTags(entries, guildId);
    }
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
                  {!locked && (
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
        {!isComparisonMode && !isArchived && (
          <button
            onClick={handleClearAllPrevGuildTags}
            className="shrink-0 flex items-center gap-1 text-xs font-normal px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors"
            title={t('raid.clear_all_prev_guild', '清除全部前公會標籤')}
          >
            <X className="w-3 h-3" />
            {t('raid.clear_all_prev_guild', '清除全部前公會標籤')}
          </button>
        )}
      </div>
      {!isComparisonMode && !isArchived && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-2 dark:border-stone-700 dark:bg-stone-800">
          <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t('raid.checkin_legend', '1-3 = 簽到回合，4 = 死（永久失聯）')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsCheckInAnnounceOpen(true)}
              disabled={!allowCheckIn}
              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-indigo-700/50 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
              title={t('raid.checkin_announce_title', '簽到催辦名單')}
            >
              <ClipboardCheck className="h-3 w-3" />
              {t('raid.checkin_announce', '簽到催辦名單')}
            </button>
            <label
              className="inline-flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400"
              title={t('raid.checkin_reset_keep_dead_hint', '勾選時重置只清除 1/2/3，保留 4（死／永久失聯）')}
            >
              <input
                type="checkbox"
                checked={keepDeadOnReset}
                onChange={(event) => setKeepDeadOnReset(event.target.checked)}
                className="h-3 w-3 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 dark:border-stone-600"
              />
              {t('raid.checkin_reset_keep_dead', '保留死')}
            </label>
            <button
              type="button"
              onClick={() => setIsResetCheckInOpen(true)}
              disabled={checkInLocked || !onResetCheckIns}
              className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-700/40 dark:text-stone-300 dark:hover:bg-stone-700"
              title={t('raid.checkin_reset', '重置簽到記號')}
            >
              <RotateCcw className="h-3 w-3" />
              {t('raid.checkin_reset', '重置簽到記號')}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-stone-500">{t('common.loading', '載入中...')}</div>
        ) : (
          <table className="w-full text-left border-collapse table-fixed max-md:min-w-[560px]">
            {isComparisonMode ? (
              <colgroup>
                <col />
                <col style={{ width: '80px' }} />
              </colgroup>
            ) : (
              <colgroup>
                <col />
                <col style={{ width: '80px' }} />
                <col style={{ width: '150px' }} />
                {showOverkill && scoreThreshold != null && !forceHideOverkill && <col style={{ width: '92px' }} />}
                {/* 簽到欄：4 顆 24px 按鈕 + 3 個 2px 間距 + 14px 骷髏頭保留位 + 左右各 8px padding = 132px，
                    留一點餘裕避免瀏覽器四捨五入又壓縮按鈕 */}
                <col style={{ width: '136px' }} />
                <col />
                <col />
              </colgroup>
            )}
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
                  className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600"
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
                  <th className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600">
                    {t('raid.column_deduction', '推算')}
                  </th>
                )}
                {!isComparisonMode && showOverkill && scoreThreshold != null && !forceHideOverkill && (
                  <th
                    className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600"
                    onClick={() => onSort('score')}
                  >
                    <div className="flex items-center gap-1">
                      {t('raid.column_overkill', '超殺')}
                      {sortConfig.key === 'score' && (
                        sortConfig.order === 'asc'
                          ? <ArrowDownWideNarrow className="w-3.5 h-3.5 text-indigo-500" />
                          : <ArrowDownNarrowWide className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                    </div>
                  </th>
                )}
                {!isComparisonMode && (
                  <th
                    className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600"
                    title={t('raid.checkin_legend', '1-3 = 簽到回合，4 = 死（永久失聯）')}
                  >
                    {t('raid.column_checkin', '簽到')}
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
                const record = draftRecords[member.id!] || records[member.id!] || { score: 0, season_note: '', overkill: null };
                const noteValue = draftRecords[member.id!]?.note ?? member.note ?? '';
                const isDirty = !!draftRecords[member.id!];
                const isHighlighted = highlightedMemberIds?.has(member.id!);

                return (
                  <tr 
                    key={member.id} 
                    ref={el => { rowRefs.current[index] = el; }}
                    style={isComparisonMode && rowHeights?.[index] ? { height: `${rowHeights[index]}px` } : {}}
                    className={`border-b border-stone-100 dark:border-stone-700/50 even:bg-stone-50 dark:even:bg-stone-700/30 hover:bg-stone-100 dark:hover:bg-stone-700/60 transition-colors ${isDirty ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''} ${isHighlighted ? 'animate-flash-orange' : ''}`}
                  >
                    <td className="py-0.5 px-2">
                      <div className="flex items-center gap-2 group/member">
                        <button 
                          onClick={() => onMemberClick(member)}
                          className="flex items-center gap-2 text-xs font-medium text-stone-800 dark:text-stone-200 hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                        >
                          <Search className="w-3.5 h-3.5 text-stone-400" />
                          <span className={`truncate max-w-[160px] ${
                            member.role === 'leader'
                              ? 'px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              : member.role === 'coleader'
                                ? 'px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : ''
                          }`}>{member.name}</span>
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
                          disabled={locked}
                          onClick={() => { setGhostModalMember(member); onFetchGhostRecords?.(member.id!); }}
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
                      {(!locked && !isComparisonMode) ? (
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={record.score || ''}
                          onChange={(e) => onRecordChange(member.id!, 'score', e.target.value)}
                          onBlur={() => onBlur(member.id!, guildId)}
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
                        <div className="px-2 py-0.5 text-xs font-medium text-stone-800 dark:text-stone-200 whitespace-pre-line leading-tight">
                          {deduceScore(record.score || 0, t, evenRounds, parseInt(seasonId) <= 7)}
                        </div>
                      </td>
                    )}
                    {!isComparisonMode && showOverkill && scoreThreshold != null && !forceHideOverkill && (
                      <td className="py-0.5 px-2">
                        {!locked ? (
                          (record.score || 0) >= scoreThreshold ? (
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={record.overkill != null ? String(record.overkill) : ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!/^[0-9.]*$/.test(v)) return;
                                  if ((v.match(/\./g) || []).length > 1) return;
                                  if (v.length > 6) return;
                                  onRecordChange(member.id!, 'overkill', v === '' ? null : v);
                                }}
                                onBlur={() => onBlur(member.id!, guildId)}
                                className={`w-full pl-2 pr-5 py-0.5 text-xs border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDirty ? 'border-amber-300 dark:border-amber-600' : 'border-stone-300 dark:border-stone-600'}`}
                              />
                              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-stone-400 dark:text-stone-500 select-none">E</span>
                            </div>
                          ) : (
                            <div className="px-2 py-0.5 text-xs text-stone-400 dark:text-stone-600 select-none">—</div>
                          )
                        ) : (
                          <div className="px-2 py-0.5 text-xs text-stone-800 dark:text-stone-200">
                            {record.overkill != null ? `${record.overkill}E` : ''}
                          </div>
                        )}
                      </td>
                    )}
                      {!isComparisonMode && (
                        <td className="py-0.5 px-2">
                          <CheckInTracker
                            note={noteValue}
                            disabled={checkInLocked || !onCheckInChange}
                            onChange={(marks) => { void onCheckInChange?.(member.id!, marks); }}
                          />
                        </td>
                      )}
                      {!isComparisonMode && (
                        <td className="py-0.5 px-2">
                          {!locked ? (
                            <div className="flex items-center gap-1">
                              {(() => {
                                const prevGuild = getPrevGuildName(noteValue);
                                return prevGuild ? (
                                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded border border-amber-200 dark:border-amber-700/50 whitespace-nowrap group/badge">
                                    <span>↑{prevGuild}</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const cleaned = removeNoteSegment(noteValue, PREV_GUILD_TAG);
                                        onRecordChange(member.id!, 'note', cleaned);
                                        onBlur(member.id!, guildId);
                                      }}
                                      className="p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800/50 opacity-0 group-hover/badge:opacity-100 transition-opacity"
                                      title="移除原公會標籤"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                ) : null;
                              })()}
                              <input
                                type="text"
                                value={getCustomNote(noteValue)}
                                onChange={(e) => {
                                  const prevGuild = getPrevGuildName(noteValue);
                                  const checkInSegment = getNoteSegment(noteValue, CHECK_IN_TAG);
                                  let fullNote = e.target.value;
                                  if (prevGuild) {
                                    fullNote = `${setNoteSegment('', PREV_GUILD_TAG, prevGuild)}${fullNote ? '\n' + fullNote : ''}`;
                                  }
                                  // 保留簽到記號，避免編輯成員備註時把 1/2/3/4 清掉
                                  if (checkInSegment) {
                                    fullNote = setNoteSegment(fullNote, CHECK_IN_TAG, checkInSegment);
                                  }
                                  onRecordChange(member.id!, 'note', fullNote);
                                }}
                                onBlur={() => onBlur(member.id!, guildId)}
                                className={`flex-1 min-w-0 px-2 py-0.5 text-xs border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none ${isDirty ? 'border-amber-300 dark:border-amber-600' : 'border-stone-300 dark:border-stone-600'}`}
                              />
                            </div>
                          ) : (
                            <div className="px-2 py-0.5 text-xs text-stone-800 dark:text-stone-200 truncate">
                              {(() => {
                                const prevGuild = getPrevGuildName(noteValue);
                                const customNote = getCustomNote(noteValue);
                                return (
                                  <>
                                    {prevGuild && <span className="text-amber-600 dark:text-amber-400">↑{prevGuild} </span>}
                                    {customNote}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                      )}
                      {!isComparisonMode && (
                        <td className="py-0.5 px-2">
                          {!locked ? (
                            <input
                              type="text"
                              value={record.season_note || ''}
                              onChange={(e) => onRecordChange(member.id!, 'season_note', e.target.value)}
                              onBlur={() => onBlur(member.id!, guildId)}
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
                {!isComparisonMode && <td colSpan={showOverkill && scoreThreshold != null && !forceHideOverkill ? 5 : 4}></td>}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {!isArchived && !isComparisonMode && onBulkScoreFill && (
        <div className="px-4 py-2 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800">
          <button
            onClick={() => setIsBulkFillOpen(true)}
            disabled={loading || locked}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ListPlus className="w-3.5 h-3.5" />
            {t('raid.bulk_fill_button', '一鍵輸入分數')}
          </button>
        </div>
      )}

      {isBulkFillOpen && onBulkScoreFill && (
        <BulkScoreFillModal
          guildId={guildId}
          guildDisplayName={displayGuildName}
          members={sortedMembers}
          records={records}
          draftRecords={draftRecords}
          error={editorError}
          onConfirm={onBulkScoreFill}
          onClose={() => setIsBulkFillOpen(false)}
        />
      )}

      {ghostModalMember && (
        <GhostRecordModal
          member={ghostModalMember}
          ghostRecords={ghostRecords}
          onAddGhostRecord={onAddGhostRecord}
          onDeleteGhostRecord={onDeleteGhostRecord}
          onClose={() => setGhostModalMember(null)}
        />
      )}

      {isCheckInAnnounceOpen && (
        <CheckInAnnounceModal
          guildId={guildId}
          guildName={displayGuildName}
          members={checkInAnnounceMembers}
          onClose={() => setIsCheckInAnnounceOpen(false)}
        />
      )}

      <ConfirmModal
        isOpen={isResetCheckInOpen}
        title={t('raid.checkin_reset_confirm_title', '確認重置簽到記號？')}
        message={t(
          keepDeadOnReset ? 'raid.checkin_reset_confirm_desc' : 'raid.checkin_reset_confirm_desc_all',
          {
            guild: displayGuildName,
            defaultValue: keepDeadOnReset
              ? '將清除【{{guild}}】所有成員的簽到 1/2/3 記號；4（死／永久失聯）會保留。成員備註與其他公會的記號不受影響。'
              : '將清除【{{guild}}】所有成員的簽到 1/2/3/4 記號。成員備註與其他公會的記號不受影響。',
          },
        )}
        confirmText={t('raid.checkin_reset', '重置簽到記號')}
        onConfirm={handleResetCheckIns}
        onCancel={() => setIsResetCheckInOpen(false)}
        isDanger
      />
    </div>
  );
}

export default React.memo(GuildRaidTable);
