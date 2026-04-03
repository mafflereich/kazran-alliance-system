import { useState, useEffect } from 'react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import type { MemberRaidRecord, GuildRaidRecord } from '../types';

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
  const { db, updateMember } = useAppContext();

  const [draftRecords, setDraftRecords] = useState<Record<string, MemberRaidRecord>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Clear drafts when switching season or comparison mode
  useEffect(() => {
    if (Object.keys(draftRecords).length > 0) setDraftRecords({});
  }, [selectedSeasonId, isComparisonMode]);

  const handleRecordChange = (memberId: string, field: 'score' | 'note' | 'season_note', value: string | number) => {
    setDraftRecords(prev => {
      const existingRecord = prev[memberId] || records[memberId] || {
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
          note: prev[memberId]?.note ?? db.members[memberId]?.note ?? '',
          [field]: finalValue,
        },
      };
    });
  };

  const updateGuildMedian = async (guildId: string, customRecords?: Record<string, MemberRaidRecord>) => {
    const currentRecords = customRecords || records;
    const guildMembers = Object.values(db.members).filter(m => {
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
      ...guildRaidRecords[guildId],
      season_id: selectedSeasonId,
      guild_id: guildId,
      member_score_median: Math.floor(median),
    };

    const { error } = await supabase
      .from('guild_raid_records')
      .upsert(guildRecord, { onConflict: 'season_id, guild_id' });

    if (error) throw error;

    setGuildRaidRecords(prev => ({ ...prev, [guildId]: guildRecord }));
  };

  const handleAutoSave = async (memberId: string, guildId: string) => {
    const draft = draftRecords[memberId];
    if (!draft) return;

    const originalRecord = records[memberId];
    const originalNote = db.members[memberId]?.note || '';

    const scoreChanged = draft.score !== (originalRecord?.score ?? 0);
    const seasonNoteChanged = (draft.season_note || '') !== (originalRecord?.season_note || '');
    const noteChanged = (draft.note || '') !== originalNote;

    if (!scoreChanged && !seasonNoteChanged && !noteChanged) {
      setDraftRecords(prev => { const next = { ...prev }; delete next[memberId]; return next; });
      return;
    }

    setSaving(true);
    try {
      const { note, ...raidRecord } = draft;

      const { error } = await supabase
        .from('member_raid_records')
        .upsert(raidRecord, { onConflict: 'season_id, member_id' });

      if (error) throw error;

      if (noteChanged) await updateMember(memberId, { note });

      const nextRecords = { ...recordsRef.current, [memberId]: raidRecord as MemberRaidRecord };
      setRecords(nextRecords);

      setDraftRecords(prev => { const next = { ...prev }; delete next[memberId]; return next; });

      if (scoreChanged) await updateGuildMedian(guildId, nextRecords);
    } catch (err: any) {
      console.error('Auto-save failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGuildNoteChange = async (guildId: string, note: string) => {
    if (!selectedSeasonId) return;
    try {
      const { error } = await supabase
        .from('guild_raid_records')
        .upsert({ season_id: selectedSeasonId, guild_id: guildId, note }, { onConflict: 'season_id, guild_id' });

      if (error) throw error;

      setGuildRaidRecords(prev => ({
        ...prev,
        [guildId]: { ...prev[guildId], season_id: selectedSeasonId, guild_id: guildId, note },
      }));
    } catch (err: any) {
      console.error('Error updating guild note:', err);
      setError(err.message);
    }
  };

  return {
    draftRecords,
    saving,
    error,
    handleRecordChange,
    handleAutoSave,
    updateGuildMedian,
    handleGuildNoteChange,
  };
}
