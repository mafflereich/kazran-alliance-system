import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/shared/api/supabase';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import type { RaidSeason, GuildRaidLeaderboardRecord } from '../types';

export type EditRecordData = { score: number | ''; rank: string; overkill: number | null };

export function useAllianceRaidRecord() {
  const { t } = useTranslation(['raid']);
  const { showToast } = useAppContext();

  const [seasons, setSeasons] = useState<RaidSeason[]>([]);
  const [records, setRecords] = useState<GuildRaidLeaderboardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingCell, setEditingCell] = useState<{ guild_id: string; season_id: string } | null>(null);
  const [editRecordData, setEditRecordData] = useState<EditRecordData>({ score: '', rank: '', overkill: null });

  const fetchRaidData = async () => {
    setLoading(true);
    try {
      const [seasonsRes, recordsRes] = await Promise.all([
        supabase.from('raid_seasons').select('*').order('season_number', { ascending: false }),
        supabase.from('guild_raid_records').select('*'),
      ]);
      if (seasonsRes.error) throw seasonsRes.error;
      if (recordsRes.error) throw recordsRes.error;
      setSeasons(seasonsRes.data || []);
      setRecords(recordsRes.data || []);
    } catch (err: any) {
      console.error('Error fetching raid data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRaidData(); }, []);

  const handleSaveRecord = async (guild_id: string, season_id: string) => {
    if (editRecordData.rank && !/(%|st|nd|rd|th)$/i.test(editRecordData.rank.trim())) {
      showToast(t('alliance_raid.invalid_rank_format'), 'error');
      return;
    }
    try {
      const existingRecord = records.find(r => r.guild_id === guild_id && r.season_id === season_id);
      const scoreToSave = editRecordData.score === '' ? 0 : Number(editRecordData.score);
      const rankToSave = editRecordData.rank;
      const overkillToSave = (editRecordData.rank && /[a-zA-Z]/.test(editRecordData.rank)) ? editRecordData.overkill : null;

      if (existingRecord) {
        const { error } = await supabase
          .from('guild_raid_records')
          .update({ score: scoreToSave, rank: rankToSave, overkill: overkillToSave })
          .eq('id', existingRecord.id);
        if (error) throw error;
        setRecords(prev => prev.map(r =>
          r.id === existingRecord.id ? { ...r, score: scoreToSave, rank: rankToSave, overkill: overkillToSave } : r
        ));
      } else {
        const { data, error } = await supabase
          .from('guild_raid_records')
          .insert([{ guild_id, season_id, score: scoreToSave, rank: rankToSave, overkill: overkillToSave }])
          .select();
        if (error) throw error;
        if (data && data.length > 0) setRecords(prev => [...prev, data[0]]);
      }
      setEditingCell(null);
    } catch (err: any) {
      setError(`Error saving record: ${err.message}`);
    }
  };

  const startEditing = (guild_id: string, season_id: string) => {
    const existing = records.find(r => r.guild_id === guild_id && r.season_id === season_id);
    setEditRecordData({
      score: existing ? existing.score : '',
      rank: existing?.rank ?? '',
      overkill: existing?.overkill ?? null,
    });
    setEditingCell({ guild_id, season_id });
  };

  const getRecord = useMemo(
    () => (guild_id: string | undefined, season_id: string) => {
      if (!guild_id) return undefined;
      return records.find(r => r.guild_id === guild_id && r.season_id === season_id);
    },
    [records]
  );

  return {
    seasons, records, loading, error,
    editingCell, setEditingCell,
    editRecordData, setEditRecordData,
    handleSaveRecord, startEditing, getRecord,
  };
}
