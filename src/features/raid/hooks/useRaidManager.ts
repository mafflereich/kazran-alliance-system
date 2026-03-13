import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { useTranslation } from 'react-i18next';

interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
  description: string;
  is_archived?: boolean;
}

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

export function useRaidManager() {
  const { t } = useTranslation(['raid', 'translation']);
  const { db, updateMember, fetchAllMembers } = useAppContext();

  const [seasons, setSeasons] = useState<RaidSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [records, setRecords] = useState<Record<string, MemberRaidRecord>>({});
  const [draftRecords, setDraftRecords] = useState<Record<string, MemberRaidRecord>>({});
  const [guildRaidRecords, setGuildRaidRecords] = useState<Record<string, GuildRaidRecord>>({});
  const [ghostRecords, setGhostRecords] = useState<Record<string, any[]>>({});
  const [highlightedMemberIds, setHighlightedMemberIds] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [sortConfig, setSortConfig] = useState<{ key: 'default' | 'score', order: 'asc' | 'desc' }>({ key: 'default', order: 'asc' });

  const recordsRef = useRef(records);
  const dbRef = useRef(db);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const selectedSeason = useMemo(() => seasons.find(s => s.id === selectedSeasonId), [seasons, selectedSeasonId]);
  const isSelectedSeasonArchived = selectedSeason?.is_archived || false;

  const fetchSeasons = async () => {
    try {
      const { data, error } = await supabase
        .from('raid_seasons')
        .select('*')
        .order('season_number', { ascending: false });
      if (error) throw error;
      setSeasons(data || []);
      if (data && data.length > 0 && !selectedSeasonId) {
        setSelectedSeasonId(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching seasons:', err);
      setError(t('errors.fetch_failed'));
    }
  };

  const fetchRecords = async (seasonId: string) => {
    if (!seasonId) return;
    setLoading(true);
    try {
      const [recordsRes, guildRecordsRes, ghostRes] = await Promise.all([
        supabase.from('member_raid_records').select('*').eq('season_id', seasonId),
        supabase.from('guild_raid_records').select('*').eq('season_id', seasonId),
        supabase.from('ghost_records').select('*')
      ]);

      if (recordsRes.error) throw recordsRes.error;
      if (guildRecordsRes.error) throw guildRecordsRes.error;
      if (ghostRes.error) throw ghostRes.error;

      const recordsMap: Record<string, MemberRaidRecord> = {};
      recordsRes.data?.forEach(r => {
        recordsMap[r.member_id] = r;
      });
      setRecords(recordsMap);
      setDraftRecords({});

      const guildRecordsMap: Record<string, GuildRaidRecord> = {};
      guildRecordsRes.data?.forEach(r => {
        guildRecordsMap[r.guild_id] = r;
      });
      setGuildRaidRecords(guildRecordsMap);

      const ghostMap: Record<string, any[]> = {};
      ghostRes.data?.forEach(r => {
        if (!ghostMap[r.member_id]) ghostMap[r.member_id] = [];
        ghostMap[r.member_id].push(r);
      });
      setGhostRecords(ghostMap);
    } catch (err) {
      console.error('Error fetching records:', err);
      setError(t('errors.fetch_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeasonId) {
      fetchRecords(selectedSeasonId);

      const recordsSub = supabase
        .channel('member_raid_records_changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'member_raid_records',
          filter: `season_id=eq.${selectedSeasonId}`
        }, (payload) => {
          const newRecord = payload.new as MemberRaidRecord;
          const oldRecord = payload.old as MemberRaidRecord;
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setRecords(prev => ({ ...prev, [newRecord.member_id]: newRecord }));
            setHighlightedMemberIds(prev => {
              const next = new Set(prev);
              next.add(newRecord.member_id);
              return next;
            });
            setTimeout(() => {
              setHighlightedMemberIds(prev => {
                const next = new Set(prev);
                next.delete(newRecord.member_id);
                return next;
              });
            }, 2000);
          } else if (payload.eventType === 'DELETE') {
            // We only have the ID on delete, but we need member_id to update state
            // This is a limitation of Supabase real-time delete payload if not configured
          }
        })
        .subscribe();

      const guildRecordsSub = supabase
        .channel('guild_raid_records_changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'guild_raid_records',
          filter: `season_id=eq.${selectedSeasonId}`
        }, (payload) => {
          const newRecord = payload.new as GuildRaidRecord;
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setGuildRaidRecords(prev => ({ ...prev, [newRecord.guild_id]: newRecord }));
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(recordsSub);
        supabase.removeChannel(guildRecordsSub);
      };
    }
  }, [selectedSeasonId]);

  const handleRecordChange = (memberId: string, field: 'score' | 'note' | 'season_note', value: string | number) => {
    if (isSelectedSeasonArchived) return;

    const currentRecord = records[memberId] || { season_id: selectedSeasonId, member_id: memberId, score: 0, note: '', season_note: '' };
    const currentDraft = draftRecords[memberId] || { ...currentRecord };
    
    const updatedDraft = { ...currentDraft, [field]: value };
    setDraftRecords(prev => ({ ...prev, [memberId]: updatedDraft }));
  };

  const updateGuildMedian = async (guildId: string) => {
    const guildMembers = Object.values(dbRef.current.members).filter(m => m.guildId === guildId);
    const validScores = guildMembers
      .map(m => draftRecords[m.id!]?.score ?? recordsRef.current[m.id!]?.score)
      .filter((score): score is number => typeof score === 'number' && score > 0);

    let median = 0;
    if (validScores.length > 0) {
      const sorted = [...validScores].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      median = sorted.length % 2 !== 0 ? Math.floor(sorted[mid]) : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
    }

    try {
      const { error } = await supabase
        .from('guild_raid_records')
        .upsert({
          season_id: selectedSeasonId,
          guild_id: guildId,
          member_score_median: median
        }, { onConflict: 'season_id,guild_id' });
      if (error) throw error;
    } catch (err) {
      console.error('Error updating guild median:', err);
    }
  };

  const handleAutoSave = async (memberId: string, guildId: string) => {
    const draft = draftRecords[memberId];
    if (!draft) return;

    try {
      if ('note' in draft) {
        const { note, ...rest } = draft;
        await updateMember(memberId, { note });
        if (Object.keys(rest).length === 2) { // only member_id and season_id left
          setDraftRecords(prev => {
            const next = { ...prev };
            delete next[memberId];
            return next;
          });
          return;
        }
      }

      const { note, ...recordToSave } = draft;
      const { error } = await supabase
        .from('member_raid_records')
        .upsert(recordToSave, { onConflict: 'season_id,member_id' });
      
      if (error) throw error;
      
      setDraftRecords(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });

      updateGuildMedian(guildId);
    } catch (err) {
      console.error('Error auto-saving record:', err);
      setError(t('errors.save_failed'));
    }
  };

  const handleGuildNoteChange = async (guildId: string, note: string) => {
    if (isSelectedSeasonArchived) return;
    try {
      const { error } = await supabase
        .from('guild_raid_records')
        .upsert({
          season_id: selectedSeasonId,
          guild_id: guildId,
          note: note,
          member_score_median: guildRaidRecords[guildId]?.member_score_median || 0
        }, { onConflict: 'season_id,guild_id' });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving guild note:', err);
      setError(t('errors.save_failed'));
    }
  };

  const handleArchiveSeason = async () => {
    if (!selectedSeasonId || archiving) return;
    setArchiving(true);
    try {
      const { error } = await supabase
        .from('raid_seasons')
        .update({ is_archived: true })
        .eq('id', selectedSeasonId);
      if (error) throw error;
      setSeasons(prev => prev.map(s => s.id === selectedSeasonId ? { ...s, is_archived: true } : s));
    } catch (err) {
      console.error('Error archiving season:', err);
      setError(t('errors.save_failed'));
    } finally {
      setArchiving(false);
    }
  };

  const handleSaveSeason = async (newSeason: any, keepScores: boolean, keepSeasonNotes: boolean) => {
    setSaving(true);
    try {
      const { data: seasonData, error: seasonError } = await supabase
        .from('raid_seasons')
        .insert([newSeason])
        .select();

      if (seasonError) throw seasonError;
      const nextSeason = seasonData[0];

      const currentRecords = Object.values(records);
      if (currentRecords.length > 0) {
        const newRecords = currentRecords.map(r => ({
          season_id: nextSeason.id,
          member_id: r.member_id,
          score: keepScores ? r.score : 0,
          note: '',
          season_note: keepSeasonNotes ? r.season_note : '',
          season_guild: r.season_guild
        }));

        const { error: recordsError } = await supabase
          .from('member_raid_records')
          .insert(newRecords);
        if (recordsError) throw recordsError;
      }

      setSeasons([nextSeason, ...seasons]);
      setSelectedSeasonId(nextSeason.id);
      return true;
    } catch (err) {
      console.error('Error saving season:', err);
      setError(t('errors.save_failed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecords = async (type: 'score' | 'season_note') => {
    if (!selectedSeasonId || isDeleting) return;
    setIsDeleting(true);
    try {
      const updates = type === 'score' ? { score: 0 } : { season_note: '' };
      const { error } = await supabase
        .from('member_raid_records')
        .update(updates)
        .eq('season_id', selectedSeasonId);
      if (error) throw error;
      
      setRecords(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(memberId => {
          next[memberId] = { ...next[memberId], ...updates };
        });
        return next;
      });
    } catch (err) {
      console.error('Error deleting records:', err);
      setError(t('errors.save_failed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddGhostRecord = async (memberId: string) => {
    try {
      const { data, error } = await supabase
        .from('ghost_records')
        .insert([{ member_id: memberId, season_number: selectedSeason?.season_number }])
        .select();
      if (error) throw error;
      if (data && data.length > 0) {
        setGhostRecords(prev => ({
          ...prev,
          [memberId]: [data[0], ...(prev[memberId] || [])]
        }));
      }
    } catch (err) {
      console.error('Error adding ghost record:', err);
    }
  };

  return {
    seasons,
    selectedSeasonId,
    setSelectedSeasonId,
    selectedSeason,
    records,
    draftRecords,
    guildRaidRecords,
    ghostRecords,
    highlightedMemberIds,
    loading,
    saving,
    error,
    archiving,
    isDeleting,
    isSelectedSeasonArchived,
    sortConfig,
    setSortConfig,
    handleRecordChange,
    handleAutoSave,
    handleGuildNoteChange,
    handleArchiveSeason,
    handleSaveSeason,
    handleDeleteRecords,
    handleAddGhostRecord,
    setError
  };
}
