import { useState, useEffect, useMemo } from 'react';
import { supabase, fetchAllPaginated } from '@/shared/api/supabase';
import { readQuery } from '@/shared/api/http';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import { Logger } from '@/shared/utils/logger';
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
      const [seasonsRes, recordsData] = await Promise.all([
        readQuery<any[]>(() =>
          supabase.from('raid_seasons').select('id, season_number, period_text, score_threshold, description, even_rounds, is_archived').order('season_number', { ascending: false })
        ),
        // 全表查詢一定要分頁，否則公會數 × 賽季數 > 1000 時會被靜默截斷
        fetchAllPaginated<any>('guild_raid_records', 'id, season_id, guild_id, note, member_score_median, score, rank, overkill'),
      ]);
      if (seasonsRes.error) throw seasonsRes.error;
      setSeasons((seasonsRes.data || []) as RaidSeason[]);
      setRecords(recordsData as GuildRaidLeaderboardRecord[]);
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
      Logger.info({ source: 'raid_manager', action: 'save_alliance_raid_record', message: '儲存同盟戰記', details: { guild_id, season_id, score: scoreToSave, rank: rankToSave, overkill: overkillToSave, isUpdate: !!existingRecord } });
      setEditingCell(null);
    } catch (err: any) {
      setError(`Error saving record: ${err.message}`);
      Logger.error({ source: 'raid_manager', action: 'save_alliance_raid_record', message: '儲存同盟戰記失敗', details: { guild_id, season_id, error: err.message } });
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
