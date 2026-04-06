import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/shared/api/supabase';
import type { RaidSeason, MemberRaidRecord, GuildRaidRecord } from '../types';

const ENABLE_DEBUG_LOGS = true; // Toggle this to true/false to enable/disable detailed fetch error logs

export function useRaidData(
  fetchAllMembers: () => void,
  updateMemberNote: (memberId: string, payload: Record<string, any>) => void,
) {
  const [seasons, setSeasons] = useState<RaidSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [records, setRecords] = useState<Record<string, MemberRaidRecord>>({});
  const [guildRaidRecords, setGuildRaidRecords] = useState<Record<string, GuildRaidRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [highlightedMemberIds, setHighlightedMemberIds] = useState<Set<string>>(new Set());

  const recordsRef = useRef(records);
  useEffect(() => { recordsRef.current = records; }, [records]);

  const fetchTokenRef = useRef(0);

  // Stable ref for updateMemberNote — avoids adding the prop to subscription effect deps
  // (same pattern as fetchAllMembers; callers must ensure the function is stable)
  const updateMemberNoteRef = useRef(updateMemberNote);
  updateMemberNoteRef.current = updateMemberNote;

  const flashMember = useCallback((memberId: string) => {
    setHighlightedMemberIds(prev => { const next = new Set(prev); next.add(memberId); return next; });
    setTimeout(() => {
      setHighlightedMemberIds(prev => { const next = new Set(prev); next.delete(memberId); return next; });
    }, 2000);
  }, []);

  const fetchSeasons = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('raid_seasons')
        .select('*')
        .order('season_number', { ascending: false });
      if (error) throw error;
      setSeasons(data || []);
      if (data && data.length > 0) setSelectedSeasonId(String(data[0].id));
    } catch (err: any) {
      console.error('Error fetching seasons:', err);
      setError(err.message);
    }
  }, []);

  const fetchRecords = useCallback(async (isBackground = false) => {
    const token = ++fetchTokenRef.current;
    const seasonId = selectedSeasonId;
    if (!seasonId) {
      if (!isBackground) setLoading(false);
      return;
    }
    if (!isBackground) setLoading(true);
    try {
      const [recordsRes, guildRecordsRes] = await Promise.all([
        supabase.from('member_raid_records').select('*').eq('season_id', seasonId),
        supabase.from('guild_raid_records').select('*').eq('season_id', seasonId),
      ]);

      if (token !== fetchTokenRef.current) return;

      if (recordsRes.error && recordsRes.error.code !== '42P01') throw recordsRes.error;
      if (guildRecordsRes.error && guildRecordsRes.error.code !== '42P01') throw guildRecordsRes.error;

      const recordsMap: Record<string, MemberRaidRecord> = {};
      (recordsRes.data || []).forEach(r => { recordsMap[r.member_id] = r; });
      setRecords(recordsMap);

      const guildRecordsMap: Record<string, GuildRaidRecord> = {};
      (guildRecordsRes.data || []).forEach(r => { guildRecordsMap[r.guild_id] = r; });
      setGuildRaidRecords(guildRecordsMap);
    } catch (err: any) {
      if (token !== fetchTokenRef.current) return;
      console.error('Error fetching records:', err);
      if (ENABLE_DEBUG_LOGS) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          console.error("=== DETAILED ERROR LOG FOR RECORDS FETCH (useRaidData) ===", JSON.stringify({
            errorDetails: err,
            errorMessage: err.message,
            errorCode: err.code,
            errorDetails2: err.details,
            errorHint: err.hint,
            userSession: session?.user ? {
              id: session.user.id,
              email: session.user.email,
              role: session.user.role,
              app_metadata: session.user.app_metadata,
              user_metadata: session.user.user_metadata
            } : null,
            seasonId: selectedSeasonId
          }, null, 2));
        });
      }
      if (err.code !== '42P01') setError(err.message);
    } finally {
      // Foreground fetches always clear loading regardless of token —
      // background fetches never set loading=true so they don't clear it either.
      if (!isBackground) setLoading(false);
    }
  }, [selectedSeasonId]);

  // Initial load
  useEffect(() => {
    fetchSeasons();
    fetchAllMembers();
  }, []);

  // Reload on season change
  useEffect(() => {
    fetchRecords(false);
  }, [selectedSeasonId]);

  // Real-time subscriptions
  useEffect(() => {
    if (!selectedSeasonId) return;

    const memberRaidRecordsChannel = supabase
      .channel(`member_raid_records_${selectedSeasonId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_raid_records' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newRecord = payload.new as MemberRaidRecord;
          if (String(newRecord.season_id) !== String(selectedSeasonId)) return;
          flashMember(newRecord.member_id);
          setRecords(prev => ({ ...prev, [newRecord.member_id]: newRecord }));
        } else if (payload.eventType === 'DELETE') {
          const oldRecord = payload.old as MemberRaidRecord;
          if (String(oldRecord.season_id) !== String(selectedSeasonId)) return;
          setRecords(prev => { const next = { ...prev }; delete next[oldRecord.member_id]; return next; });
        }
      })
      .subscribe((status) => { console.log(`Member raid records subscription status for ${selectedSeasonId}:`, status); });

    const guildRaidRecordsChannel = supabase
      .channel(`guild_raid_records_${selectedSeasonId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_raid_records' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newRecord = payload.new as GuildRaidRecord;
          if (String(newRecord.season_id) !== String(selectedSeasonId)) return;
          setGuildRaidRecords(prev => ({ ...prev, [newRecord.guild_id]: newRecord }));
        }
      })
      .subscribe((status) => { console.log(`Guild raid records subscription status for ${selectedSeasonId}:`, status); });

    const memberNotesChannel = supabase
      .channel('member_notes_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_notes' }, (payload) => {
        const memberId = (payload.new as any)?.member_id || (payload.old as any)?.member_id;
        if (!memberId) return;
        flashMember(memberId);
        if (payload.eventType === 'DELETE') {
          updateMemberNoteRef.current(memberId, { note: '', is_reserved: false, archive_remark: '' });
        } else {
          updateMemberNoteRef.current(memberId, payload.new as Record<string, any>);
        }
      })
      .subscribe((status) => { console.log('Member notes subscription status:', status); });

    return () => {
      console.log('Cleaning up real-time subscriptions for season:', selectedSeasonId);
      supabase.removeChannel(memberRaidRecordsChannel);
      supabase.removeChannel(guildRaidRecordsChannel);
      supabase.removeChannel(memberNotesChannel);
    };
  }, [selectedSeasonId]);

  const selectedSeason = seasons.find(s => String(s.id) === String(selectedSeasonId).trim());
  const isSelectedSeasonArchived = !!selectedSeason?.is_archived;

  return {
    seasons,
    setSeasons,
    selectedSeasonId,
    setSelectedSeasonId,
    selectedSeason,
    isSelectedSeasonArchived,
    records,
    setRecords,
    recordsRef,
    guildRaidRecords,
    setGuildRaidRecords,
    loading,
    highlightedMemberIds,
    fetchSeasons,
    fetchRecords,
    error,
  };
}
