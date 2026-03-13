import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';

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
  member_score_median?: number;
}

export function useAllianceRaid() {
  const { t } = useTranslation(['raid', 'translation']);
  const { db, currentUser } = useAppContext();

  const [seasons, setSeasons] = useState<RaidSeason[]>([]);
  const [records, setRecords] = useState<GuildRaidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [newSeason, setNewSeason] = useState({ season_number: 1, period_text: '', description: '' });

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadConfig, setDownloadConfig] = useState<{ singleSeasonId: string }>({ singleSeasonId: '' });
  const [includeScore, setIncludeScore] = useState(false);

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [editingCell, setEditingCell] = useState<{ guild_id: string, season_id: string } | null>(null);
  const [editRecordData, setEditRecordData] = useState<{ score: number | '', rank: string }>({ score: '', rank: '' });

  const userRole = currentUser ? db.users[currentUser]?.role : null;
  const canManage = userRole === 'manager' || userRole === 'admin' || userRole === 'creator';

  const fetchRaidData = async () => {
    setLoading(true);
    try {
      const [seasonsRes, recordsRes] = await Promise.all([
        supabase.from('raid_seasons').select('*').order('season_number', { ascending: false }),
        supabase.from('guild_raid_records').select('*')
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

  useEffect(() => {
    fetchRaidData();
  }, []);

  useEffect(() => {
    if (seasons.length > 0) {
      setDownloadConfig({ singleSeasonId: seasons[0].id });
    }
  }, [seasons]);

  const handleSaveSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSeasonId) {
        const { error } = await supabase
          .from('raid_seasons')
          .update(newSeason)
          .eq('id', editingSeasonId);

        if (error) throw error;

        setSeasons(prev => prev.map(s => s.id === editingSeasonId ? { ...s, ...newSeason } : s).sort((a, b) => b.season_number - a.season_number));
      } else {
        const { data, error } = await supabase
          .from('raid_seasons')
          .insert([newSeason])
          .select();

        if (error) throw error;

        if (data && data.length > 0) {
          const createdSeason = data[0];
          setSeasons(prev => [createdSeason, ...prev].sort((a, b) => b.season_number - a.season_number));

          const previousSeason = seasons.length > 0 ? seasons[0] : null;
          if (previousSeason) {
            const { data: prevGuildRecords, error: prevRecordsError } = await supabase
              .from('guild_raid_records')
              .select('guild_id, note')
              .eq('season_id', previousSeason.id);

            if (!prevRecordsError && prevGuildRecords && prevGuildRecords.length > 0) {
              const newGuildRecords = prevGuildRecords
                .filter(record => record.note !== null && record.note !== '')
                .map(record => ({
                  season_id: createdSeason.id,
                  guild_id: record.guild_id,
                  note: record.note
                }));

              if (newGuildRecords.length > 0) {
                const { error: upsertError } = await supabase
                  .from('guild_raid_records')
                  .upsert(newGuildRecords, { onConflict: 'season_id,guild_id' });
                
                if (upsertError) {
                  console.error('Error copying previous season guild notes:', upsertError);
                }
              }
            }
          }
        }
      }
      setIsSeasonModalOpen(false);
      setEditingSeasonId(null);
      setNewSeason({ season_number: (seasons[0]?.season_number || 0) + 1, period_text: '', description: '' });
    } catch (err: any) {
      setError(`Error saving season: ${err.message}`);
    }
  };

  const handleSaveRecord = async (guild_id: string, season_id: string) => {
    try {
      const existingRecord = records.find(r => r.guild_id === guild_id && r.season_id === season_id);

      const scoreToSave = editRecordData.score === '' ? 0 : Number(editRecordData.score);
      const rankToSave = editRecordData.rank;

      if (existingRecord) {
        const { error } = await supabase
          .from('guild_raid_records')
          .update({ score: scoreToSave, rank: rankToSave })
          .eq('id', existingRecord.id);

        if (error) throw error;

        setRecords(prev => prev.map(r => r.id === existingRecord.id ? { ...r, score: scoreToSave, rank: rankToSave } : r));
      } else {
        const { data, error } = await supabase
          .from('guild_raid_records')
          .insert([{ guild_id, season_id, score: scoreToSave, rank: rankToSave }])
          .select();

        if (error) throw error;

        if (data && data.length > 0) {
          setRecords(prev => [...prev, data[0]]);
        }
      }
      setEditingCell(null);
    } catch (err: any) {
      setError(`Error saving record: ${err.message}`);
    }
  };

  const startEditing = (guild_id: string, season_id: string) => {
    const existingRecord = records.find(r => r.guild_id === guild_id && r.season_id === season_id);
    setEditRecordData({
      score: existingRecord ? existingRecord.score : '',
      rank: existingRecord ? existingRecord.rank : ''
    });
    setEditingCell({ guild_id, season_id });
  };

  const sortedGuilds = useMemo(() => {
    return Object.values(db.guilds)
      .filter(g => g.isDisplay !== false)
      .sort((a, b) => {
        const tierA = a.tier || 99;
        const tierB = b.tier || 99;
        if (tierA !== tierB) return tierA - tierB;
        const orderA = a.orderNum || 99;
        const orderB = b.orderNum || 99;
        return orderA - orderB;
      });
  }, [db.guilds]);

  const getRecord = useMemo(() => (guild_id: string, season_id: string) => {
    return records.find(r => r.guild_id === guild_id && r.season_id === season_id);
  }, [records]);

  const handleDownloadImage = async () => {
    if (!exportRef.current) return;
    setIsGeneratingImage(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: '#1c1917',
        pixelRatio: 2,
        skipFonts: true,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      const link = document.createElement('a');
      link.download = `raid-record-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
      setIsDownloadModalOpen(false);
    } catch (err) {
      console.error('Error generating image:', err);
      setError(t('alliance_raid.export_failed'));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return {
    seasons,
    records,
    loading,
    error,
    isSeasonModalOpen,
    setIsSeasonModalOpen,
    editingSeasonId,
    setEditingSeasonId,
    newSeason,
    setNewSeason,
    isDownloadModalOpen,
    setIsDownloadModalOpen,
    downloadConfig,
    setDownloadConfig,
    includeScore,
    setIncludeScore,
    isGeneratingImage,
    exportRef,
    editingCell,
    setEditingCell,
    editRecordData,
    setEditRecordData,
    canManage,
    handleSaveSeason,
    handleSaveRecord,
    startEditing,
    sortedGuilds,
    getRecord,
    handleDownloadImage,
    setError
  };
}
