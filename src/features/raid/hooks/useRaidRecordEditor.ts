import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/shared/api/supabase';
import { writeQuery } from '@/shared/api/http';
import { useAppContext } from '@/store';
import { Logger } from '@/shared/utils/logger';
import type { MemberRaidRecord, GuildRaidRecord } from '../types';

/** 同一次編輯動作的合併寫入窗口（毫秒） */
const FLUSH_DELAY_MS = 600;
/** 單次 flush 最多寫入幾位成員（避免 payload 過大） */
const MAX_BATCH_SIZE = 100;

const clampScore = (value: unknown): number =>
  Math.min(Math.max(Number(value) || 0, 0), 10000);

const normalizeOverkill = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

type GuildMedianRow = { guild_id: string; member_score_median: number };

/** RPC 尚未建立（migration 未套用）時的錯誤碼 */
const isMissingRpcError = (error: any): boolean => {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  return code === 'PGRST202'
    || code === '42883'
    || /could not find the function|function .* does not exist|schema cache/i.test(message);
};

/** 自動重試上限，避免持續失敗時無限輪詢 */
const MAX_SAVE_RETRIES = 3;


interface Options {
  selectedSeasonId: string;
  isSelectedSeasonArchived: boolean;
  isComparisonMode: boolean;
  records: Record<string, MemberRaidRecord>;
  setRecords: React.Dispatch<React.SetStateAction<Record<string, MemberRaidRecord>>>;
  recordsRef: React.MutableRefObject<Record<string, MemberRaidRecord>>;
  guildRaidRecords: Record<string, GuildRaidRecord>;
  setGuildRaidRecords: React.Dispatch<React.SetStateAction<Record<string, GuildRaidRecord>>>;
}

export function useRaidRecordEditor({
  selectedSeasonId,
  isSelectedSeasonArchived,
  isComparisonMode,
  records,
  setRecords,
  recordsRef,
  guildRaidRecords,
  setGuildRaidRecords,
}: Options) {
  const { db, setDb, updateMembersNotes } = useAppContext();

  const [draftRecords, setDraftRecords] = useState<Record<string, MemberRaidRecord>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Mutable refs for stable callbacks — updated on every render
  const draftRecordsRef = useRef(draftRecords);
  draftRecordsRef.current = draftRecords;
  const dbMembersRef = useRef(db.members);
  dbMembersRef.current = db.members;
  const guildRaidRecordsRef = useRef(guildRaidRecords);
  guildRaidRecordsRef.current = guildRaidRecords;

  /** 待寫入的成員：memberId → guildId（決定中位數要重算哪個公會） */
  const dirtyRef = useRef<Map<string, string>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 自動儲存連續失敗次數（成功後歸零） */
  const retryCountRef = useRef(0);

  // Clear drafts when switching season or comparison mode
  useEffect(() => {
    if (Object.keys(draftRecordsRef.current).length > 0) setDraftRecords({});
  }, [selectedSeasonId, isComparisonMode]);

  // 離頁 / 元件卸載時，把還沒送出的變更寫出去（best effort）
  const flushRef = useRef<() => Promise<void>>(async () => { });
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      void flushRef.current();
    };
  }, []);

  const handleRecordChange = useCallback((memberId: string, field: 'score' | 'note' | 'season_note' | 'overkill', value: string | number | null) => {
    setDraftRecords(prev => {
      const existingRecord = prev[memberId] || recordsRef.current[memberId] || {
        season_id: selectedSeasonId,
        member_id: memberId,
        score: 0,
        season_note: '',
      };

      let finalValue = value;
      if (field === 'score') {
        finalValue = Math.min(Math.max(Number(value) || 0, 0), 10000);
      }

      return {
        ...prev,
        [memberId]: {
          ...existingRecord,
          note: prev[memberId]?.note ?? dbMembersRef.current[memberId]?.note ?? '',
          [field]: finalValue,
        },
      };
    });
  }, [selectedSeasonId]); // recordsRef/dbMembersRef are stable refs

  const updateGuildMedian = useCallback(async (guildId: string, customRecords?: Record<string, MemberRaidRecord>) => {
    const currentRecords = customRecords || recordsRef.current;
    const guildMembers = Object.values(dbMembersRef.current).filter(m => {
      if (isSelectedSeasonArchived) {
        return currentRecords[m.id!]?.season_guild === guildId;
      }
      return m.guildId === guildId;
    });

    const scores = guildMembers.map(m => currentRecords[m.id!]?.score ?? 0).filter(s => s > 0);
    const sorted = [...scores].sort((a, b) => a - b);
    let median = 0;
    if (sorted.length > 0) {
      const mid = Math.floor(sorted.length / 2);
      median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    const guildRecord: GuildRaidRecord = {
      ...guildRaidRecordsRef.current[guildId],
      season_id: selectedSeasonId,
      guild_id: guildId,
      member_score_median: Math.floor(median),
    };

    const { error } = await supabase
      .from('guild_raid_records')
      .upsert(guildRecord, { onConflict: 'season_id, guild_id' });

    if (error) throw error;

    setGuildRaidRecords(prev => ({ ...prev, [guildId]: guildRecord }));
  }, [isSelectedSeasonArchived, selectedSeasonId]); // recordsRef/dbMembersRef/guildRaidRecordsRef are stable refs

  /**
   * 把 dirty 名單合併成「一次 RPC」寫入。
   *
   * 舊版：每改一格 → debounce 300ms → 4~5 個 request
   *       （member_raid_records upsert + members update + member_notes upsert
   *        + guild_raid_records upsert + system_logs insert）
   * 新版：600ms 內的編輯合併成 1 個 `save_raid_records_bulk`，
   *       分數 / 備註 / 中位數在同一個 transaction 內完成。
   */
  const flushDirty = useCallback(async (): Promise<void> => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const dirty = dirtyRef.current;
    if (dirty.size === 0 || !selectedSeasonId) return;

    const batch = [...dirty.entries()].slice(0, MAX_BATCH_SIZE);
    batch.forEach(([id]) => dirty.delete(id));

    const unchangedIds: string[] = [];
    const changed = batch.flatMap(([memberId, guildId]) => {
      const draft = draftRecordsRef.current[memberId];
      if (!draft) return [];

      const committed = recordsRef.current[memberId];
      const originalNote = dbMembersRef.current[memberId]?.note || '';

      const score = clampScore(draft.score);
      const seasonNote = draft.season_note || '';
      const overkill = normalizeOverkill(draft.overkill);
      const note = draft.note ?? '';

      const scoreChanged = score !== (committed?.score ?? 0);
      const seasonNoteChanged = seasonNote !== (committed?.season_note || '');
      const noteChanged = note !== originalNote;
      const overkillChanged = overkill !== (committed?.overkill ?? null);

      if (!scoreChanged && !seasonNoteChanged && !noteChanged && !overkillChanged) {
        unchangedIds.push(memberId);
        return [];
      }

      return [{
        memberId,
        guildId,
        score,
        seasonNote,
        overkill,
        note,
        noteChanged,
        seasonGuild: draft.season_guild ?? committed?.season_guild ?? null,
      }];
    });

    const dropDrafts = (ids: string[]) => {
      if (ids.length === 0) return;
      setDraftRecords(prev => {
        const next = { ...prev };
        ids.forEach(id => { delete next[id]; });
        return next;
      });
    };

    if (changed.length === 0) {
      dropDrafts(unchangedIds);
      return;
    }

    setSaving(true);
    try {
      const rows = changed.map(c => ({
        member_id: c.memberId,
        score: c.score,
        season_note: c.seasonNote,
        overkill: c.overkill,
        season_guild: c.seasonGuild,
        ...(c.noteChanged ? { note: c.note } : {}),
      }));

      // 內容全部是 upsert（idempotent），timeout 時可安全重試一次
      const { data, error: rpcError } = await writeQuery<GuildMedianRow[]>(
        () => supabase.rpc('save_raid_records_bulk', {
          p_season_id: Number(selectedSeasonId),
          p_rows: rows,
        }),
        { retries: 1 },
      );

      if (rpcError) throw rpcError;

      retryCountRef.current = 0;

      // 1) 更新已提交的 records
      const nextRecords = { ...recordsRef.current };
      rows.forEach(row => {
        const { note: _note, ...recordFields } = row;
        nextRecords[row.member_id] = {
          ...recordsRef.current[row.member_id],
          ...recordFields,
          season_id: selectedSeasonId,
        } as MemberRaidRecord;
      });
      setRecords(nextRecords);

      // 2) 中位數由 DB 在同一個 transaction 算好回傳，前端不必再打一次 upsert
      if (data && data.length > 0) {
        setGuildRaidRecords(prev => {
          const next = { ...prev };
          data.forEach(row => {
            next[row.guild_id] = {
              ...prev[row.guild_id],
              season_id: selectedSeasonId,
              guild_id: row.guild_id,
              member_score_median: row.member_score_median,
            };
          });
          return next;
        });
      }

      // 3) 同步本地 db.members 的 note，避免 noteChanged 之後一直成立
      const noteUpdates = changed.filter(c => c.noteChanged).map(c => ({ id: c.memberId, note: c.note }));
      if (noteUpdates.length > 0) {
        const now = Date.now();
        setDb(prev => {
          const members = { ...prev.members };
          noteUpdates.forEach(({ id, note }) => {
            if (members[id]) members[id] = { ...members[id], note, updatedAt: now };
          });
          return { ...prev, members };
        });
      }

      // 4) 清掉已寫入的草稿
      dropDrafts([...changed.map(c => c.memberId), ...unchangedIds]);

      Logger.info({
        source: 'raid_manager',
        action: 'auto_save_member_records',
        message: '自動儲存成員戰記（批次）',
        details: { seasonId: selectedSeasonId, count: rows.length, memberIds: rows.map(r => r.member_id) },
      });
    } catch (err: any) {
      console.error('Auto-save failed:', err);

      // 若 RPC 尚未建立（例如 migration 還沒套用），不要無限重試，
      // 直接保留草稿並給出明確訊息，避免使用者誤以為已存檔。
      if (isMissingRpcError(err)) {
        setError('資料庫尚未套用 save_raid_records_bulk，請先執行 supabase/migrations 內的 SQL 後重新整理');
        Logger.error({
          source: 'raid_manager',
          action: 'auto_save_member_records',
          message: '自動儲存失敗：save_raid_records_bulk 不存在（migration 未套用）',
          details: { seasonId: selectedSeasonId, count: changed.length },
        });
        return;
      }

      retryCountRef.current += 1;
      if (retryCountRef.current <= MAX_SAVE_RETRIES) {
        // 放回佇列並保留草稿，下一輪自動重試（不讓資料默默消失）
        changed.forEach(c => dirtyRef.current.set(c.memberId, c.guildId));
      } else {
        setError(err?.message
          ? `自動儲存失敗（已重試 ${MAX_SAVE_RETRIES} 次）：${err.message}`
          : `自動儲存失敗（已重試 ${MAX_SAVE_RETRIES} 次）`);
      }

      Logger.error({
        source: 'raid_manager',
        action: 'auto_save_member_records',
        message: '自動儲存成員戰記失敗',
        details: {
          seasonId: selectedSeasonId,
          count: changed.length,
          attempt: retryCountRef.current,
          error: err?.message,
        },
      });
    } finally {
      setSaving(false);
      if (dirtyRef.current.size > 0) scheduleFlush();
    }
  }, [selectedSeasonId, setDb, setGuildRaidRecords, setRecords]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flushDirty();
    }, FLUSH_DELAY_MS);
  }, [flushDirty]);

  // 讓卸載時的 cleanup 能呼叫到最新版的 flushDirty
  flushRef.current = flushDirty;

  /**
   * Write the same score to many members at once.
   * Single upsert + single median recompute. Returns true on success.
   */
  const handleBulkScoreFill = useCallback(async (
    guildId: string,
    score: number,
    memberIds: string[],
  ): Promise<boolean> => {
    if (!selectedSeasonId || memberIds.length === 0) return false;

    const clamped = clampScore(score);

    // 先把等待中的編輯寫下去，避免它們在批次填入後才落地、把分數蓋回去。
    await flushDirty();
    memberIds.forEach(id => { dirtyRef.current.delete(id); });

    setSaving(true);
    try {
      // Member notes live in member_notes, not member_raid_records. Since we drop these
      // members' drafts below, any unsaved note edit has to be flushed separately —
      // otherwise cancelling their timers above would silently discard it.
      const pendingNotes = memberIds
        .map(id => ({ id, note: draftRecordsRef.current[id]?.note }))
        .filter((n): n is { id: string; note: string } =>
          n.note != null && n.note !== (dbMembersRef.current[n.id]?.note || ''));

      // PostgREST requires every row of a batch upsert to carry the SAME set of columns —
      // any column missing from one row is sent as NULL for that row. So build a fixed
      // shape, and never include `id`: members without an existing record have none, which
      // would make PostgREST send id=NULL and violate the not-null constraint. `onConflict`
      // resolves insert-vs-update without it.
      const payloads = memberIds.map(memberId => {
        const committed = recordsRef.current[memberId];
        const draft = draftRecordsRef.current[memberId];
        // `note` lives in member_notes, so it is never read from either source here.
        const overkill = draft?.overkill ?? committed?.overkill ?? null;

        return {
          season_id: selectedSeasonId,
          member_id: memberId,
          score: clamped,
          season_note: draft?.season_note ?? committed?.season_note ?? '',
          overkill: overkill != null && !isNaN(Number(overkill)) ? Number(overkill) : null,
          season_guild: draft?.season_guild ?? committed?.season_guild ?? null,
        };
      });

      const { error: upsertError } = await writeQuery(() =>
        supabase
          .from('member_raid_records')
          .upsert(payloads, { onConflict: 'season_id, member_id' })
      );

      if (upsertError) throw upsertError;

      // 批次寫入備註（單一請求，取代原本逐人 updateMember 的 N 次請求）
      if (pendingNotes.length > 0) {
        await updateMembersNotes(pendingNotes);
      }

      // Merge onto the existing record so the row's `id` (absent from the payload) survives.
      const nextRecords = { ...recordsRef.current };
      payloads.forEach(p => {
        nextRecords[p.member_id] = { ...recordsRef.current[p.member_id], ...p } as MemberRaidRecord;
      });
      setRecords(nextRecords);

      setDraftRecords(prev => {
        const next = { ...prev };
        memberIds.forEach(id => { delete next[id]; });
        return next;
      });

      // The scores are already committed at this point, so a median failure must not
      // report the whole operation as failed — surface it but keep the write.
      try {
        await updateGuildMedian(guildId, nextRecords);
      } catch (medianErr: any) {
        console.error('Bulk score fill: median update failed:', medianErr);
        setError(medianErr.message);
      }

      return true;
    } catch (err: any) {
      console.error('Bulk score fill failed:', err);
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedSeasonId, updateGuildMedian, updateMembersNotes, flushDirty]); // recordsRef/draftRecordsRef/dbMembersRef are stable refs

  const handleClearAllPrevGuildTags = useCallback(async (
    entries: { id: string; note: string }[],
    guildId: string,
  ): Promise<void> => {
    if (entries.length === 0) return;

    const ids = entries.map(e => e.id);

    // 取消這些成員既有的延遲自動儲存，避免其在批次寫入後又落地覆蓋。
    ids.forEach(id => { dirtyRef.current.delete(id); });

    setSaving(true);
    try {
      await updateMembersNotes(entries);

      // 清掉這些成員的草稿，並以已提交內容更新 records（note 不存於 records）。
      const nextRecords = { ...recordsRef.current };
      setRecords(nextRecords);
      setDraftRecords(prev => {
        const next = { ...prev };
        ids.forEach(id => { delete next[id]; });
        return next;
      });

      Logger.info({ source: 'raid_manager', action: 'clear_all_prev_guild_tags', message: '清除全部前公會標籤', details: { guildId, count: entries.length } });
    } catch (err: any) {
      console.error('Clear all prev guild tags failed:', err);
      Logger.error({ source: 'raid_manager', action: 'clear_all_prev_guild_tags', message: '清除全部前公會標籤失敗', details: { guildId, count: entries.length, error: err.message } });
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [updateMembersNotes]); // recordsRef/draftRecordsRef/saveTimersRef are stable refs

  /** 標記某位成員需要寫入；實際寫入由 600ms 後的批次 flush 完成。 */
  const handleAutoSave = useCallback((memberId: string, guildId: string) => {
    dirtyRef.current.set(memberId, guildId);
    scheduleFlush();
  }, [scheduleFlush]);

  const handleGuildNoteChange = useCallback(async (guildId: string, note: string) => {
    if (!selectedSeasonId) return;
    try {
      const { error } = await supabase
        .from('guild_raid_records')
        .upsert({ season_id: selectedSeasonId, guild_id: guildId, note }, { onConflict: 'season_id, guild_id' });

      if (error) throw error;

      Logger.info({ source: 'raid_manager', action: 'update_guild_note', message: '更新公會戰記備註', details: { guildId, seasonId: selectedSeasonId, note } });

      setGuildRaidRecords(prev => ({
        ...prev,
        [guildId]: { ...prev[guildId], season_id: selectedSeasonId, guild_id: guildId, note },
      }));
    } catch (err: any) {
      console.error('Error updating guild note:', err);
      Logger.error({ source: 'raid_manager', action: 'update_guild_note', message: '更新公會戰記備註失敗', details: { guildId, seasonId: selectedSeasonId, error: err.message } });
      setError(err.message);
    }
  }, [selectedSeasonId]);

  return {
    draftRecords,
    saving,
    error,
    handleRecordChange,
    handleAutoSave,
    handleBulkScoreFill,
    handleClearAllPrevGuildTags,
    updateGuildMedian,
    handleGuildNoteChange,
  };
}
