import { useState, useEffect } from 'react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import type { RaidSeason, MemberRaidRecord, GuildRaidRecord } from '../types';

interface Options {
  selectedSeasonId: string;
  seasons: RaidSeason[];
  setSeasons: React.Dispatch<React.SetStateAction<RaidSeason[]>>;
  setSelectedSeasonId: React.Dispatch<React.SetStateAction<string>>;
  records: Record<string, MemberRaidRecord>;
  setRecords: React.Dispatch<React.SetStateAction<Record<string, MemberRaidRecord>>>;
  updateGuildMedian: (guildId: string, customRecords?: Record<string, MemberRaidRecord>) => Promise<void>;
  fetchRecords: (isBackground?: boolean) => Promise<void>;
}

export function useSeasonManager({
  selectedSeasonId,
  seasons,
  setSeasons,
  setSelectedSeasonId,
  records,
  setRecords,
  updateGuildMedian,
  fetchRecords,
}: Options) {
  const { db } = useAppContext();

  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const [isSeasonPanelOpen, setIsSeasonPanelOpen] = useState(false);
  const [activeSeasonTab, setActiveSeasonTab] = useState<'add' | 'archive' | 'delete'>('add');
  const [newSeason, setNewSeason] = useState({ season_number: 1, period_text: '', description: '', even_rounds: false });
  const [keepScores, setKeepScores] = useState(true);
  const [keepSeasonNotes, setKeepSeasonNotes] = useState(false);

  // Keep newSeason.season_number in sync with latest season
  useEffect(() => {
    if (seasons.length > 0) {
      const maxSeason = Math.max(...seasons.map(s => s.season_number));
      setNewSeason(prev => ({ ...prev, season_number: maxSeason + 1 }));
    }
  }, [seasons]);

  const handleSaveSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('raid_seasons')
        .insert([newSeason])
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const createdSeason = data[0];
        setSeasons(prev => [createdSeason, ...prev].sort((a, b) => b.season_number - a.season_number));
        setSelectedSeasonId(String(createdSeason.id));

        // Copy previous season's guild notes
        const previousSeason = seasons.length > 0 ? seasons[0] : null;
        if (previousSeason) {
          const { data: prevGuildRecords, error: prevRecordsError } = await supabase
            .from('guild_raid_records')
            .select('guild_id, note')
            .eq('season_id', previousSeason.id);

          if (!prevRecordsError && prevGuildRecords && prevGuildRecords.length > 0) {
            const newGuildRecords = prevGuildRecords
              .filter(r => r.note !== null && r.note !== '')
              .map(r => ({ season_id: createdSeason.id, guild_id: r.guild_id, note: r.note }));

            if (newGuildRecords.length > 0) {
              const { error: upsertError } = await supabase
                .from('guild_raid_records')
                .upsert(newGuildRecords, { onConflict: 'season_id,guild_id' });
              if (upsertError) console.error('Error copying previous season guild notes:', upsertError);
            }
          }

          // Copy previous season's member records if requested
          if (keepScores || keepSeasonNotes) {
            const { data: prevMemberRecords, error: prevMemberRecordsError } = await supabase
              .from('member_raid_records')
              .select('member_id, score, season_note')
              .eq('season_id', previousSeason.id);

            if (!prevMemberRecordsError && prevMemberRecords && prevMemberRecords.length > 0) {
              const newMemberRecords = prevMemberRecords
                .filter(r => (keepScores && r.score) || (keepSeasonNotes && r.season_note))
                .map(r => ({
                  season_id: createdSeason.id,
                  member_id: r.member_id,
                  score: keepScores ? r.score : 0,
                  season_note: keepSeasonNotes ? r.season_note : '',
                }));

              if (newMemberRecords.length > 0) {
                const { error: upsertMemberError } = await supabase
                  .from('member_raid_records')
                  .upsert(newMemberRecords, { onConflict: 'season_id,member_id' });
                if (upsertMemberError) console.error('Error copying previous season member records:', upsertMemberError);
              }
            }
          }
        }

        setIsSeasonPanelOpen(false);
        setNewSeason({ season_number: createdSeason.season_number + 1, period_text: '', description: '', even_rounds: false });
        setKeepScores(true);
        setKeepSeasonNotes(false);
      }
    } catch (err: any) {
      console.error('Error saving season:', err);
      setError(`Error saving season: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveSeason = async () => {
    if (!selectedSeasonId) return;
    setArchiving(true);
    try {
      // Collect members to archive: active members + archived members who have a record
      const membersToArchive = Object.values(db.members).filter(m =>
        m.status !== 'archived' || records[m.id!] !== undefined
      );

      const recordsToUpsert = membersToArchive.map(m => {
        const existing = records[m.id!];
        return {
          season_id: selectedSeasonId,
          member_id: m.id!,
          season_guild: m.guildId,
          score: existing?.score ?? 0,
          season_note: existing?.season_note ?? '',
        };
      });

      if (recordsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('member_raid_records')
          .upsert(recordsToUpsert, { onConflict: 'season_id, member_id' });
        if (upsertError) throw upsertError;
      }

      // Build next records for median calculation
      const nextRecords = { ...records };
      recordsToUpsert.forEach(r => { nextRecords[r.member_id] = r as MemberRaidRecord; });

      await Promise.all(
        Object.keys(db.guilds).map(guildId => updateGuildMedian(guildId, nextRecords))
      );

      const { error } = await supabase
        .from('raid_seasons')
        .update({ is_archived: true })
        .eq('id', selectedSeasonId);

      if (error) throw error;

      setRecords(nextRecords);
      setSeasons(prev =>
        prev.map(s => String(s.id) === String(selectedSeasonId).trim() ? { ...s, is_archived: true } : s)
      );
      setIsSeasonPanelOpen(false);

      fetchRecords();
    } catch (err: any) {
      console.error('Error archiving season:', err);
      setError(err.message);
    } finally {
      setArchiving(false);
    }
  };

  const handleDeleteRecords = async (type: 'score' | 'season_note') => {
    if (!selectedSeasonId) return;
    setIsDeleting(true);
    try {
      const updateData = type === 'score' ? { score: 0 } : { season_note: '' };
      const { error } = await supabase
        .from('member_raid_records')
        .update(updateData)
        .eq('season_id', selectedSeasonId);

      if (error) throw error;

      fetchRecords();
    } catch (err: any) {
      console.error('Error deleting records:', err);
      setError(`Error deleting records: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    saving,
    archiving,
    isDeleting,
    error,
    isSeasonPanelOpen,
    setIsSeasonPanelOpen,
    activeSeasonTab,
    setActiveSeasonTab,
    newSeason,
    setNewSeason,
    keepScores,
    setKeepScores,
    keepSeasonNotes,
    setKeepSeasonNotes,
    handleSaveSeason,
    handleArchiveSeason,
    handleDeleteRecords,
  };
}
