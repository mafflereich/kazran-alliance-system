import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/shared/api/supabase';
import { isDebugMode } from '@/shared/api/debugMode';

export function useGhostRecords() {
  const [ghostRecords, setGhostRecords] = useState<Record<string, any[]>>({});
  const fetchedMemberIds = useRef<Set<string>>(new Set());

  const fetchGhostRecords = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ghost_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (error && error.code !== '42P01') throw error;

      const map: Record<string, any[]> = {};
      if (data) {
        data.forEach(record => {
          if (!map[record.member_id]) map[record.member_id] = [];
          map[record.member_id].push(record);
        });
      }
      setGhostRecords(map);
    } catch (err) {
      console.error('Error fetching ghost records:', err);
    }
  }, []);

  const fetchGhostRecordsForMember = useCallback(async (memberId: string) => {
    if (fetchedMemberIds.current.has(memberId)) return;
    fetchedMemberIds.current.add(memberId);
    try {
      const { data, error } = await supabase
        .from('ghost_records')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });

      if (error && error.code !== '42P01') throw error;

      setGhostRecords(prev => ({ ...prev, [memberId]: data || [] }));
    } catch (err: any) {
      fetchedMemberIds.current.delete(memberId); // allow retry on error
      console.error('Error fetching ghost records for member:', err);
      isDebugMode().then(enabled => {
        if (!enabled) return;
        supabase.auth.getSession().then(({ data: { session } }) => {
          console.error("=== DETAILED ERROR LOG FOR GHOST RECORDS FETCH ===", JSON.stringify({
            errorDetails: err,
            errorMessage: err.message,
            errorCode: err.code,
            userSession: session?.user ? {
              id: session.user.id,
              email: session.user.email,
              role: session.user.role
            } : null,
            memberId: memberId
          }, null, 2));
        });
      });
    }
  }, []);

  const handleAddGhostRecord = useCallback(async (memberId: string, seasonNumber?: number) => {
    try {
      const { data, error } = await supabase
        .from('ghost_records')
        .insert([{ member_id: memberId, season_number: seasonNumber }])
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
  }, []);

  const fetchGhostRecordsForMembers = useCallback(async (memberIds: string[]) => {
    const unfetched = memberIds.filter(id => !fetchedMemberIds.current.has(id));
    if (unfetched.length === 0) return;

    unfetched.forEach(id => fetchedMemberIds.current.add(id));
    try {
      const { data, error } = await supabase
        .from('ghost_records')
        .select('*')
        .in('member_id', unfetched)
        .order('created_at', { ascending: false });

      if (error && error.code !== '42P01') throw error;

      setGhostRecords(prev => {
        const next = { ...prev };
        unfetched.forEach(id => { next[id] = next[id] ?? []; });
        (data || []).forEach(record => {
          if (!next[record.member_id]) next[record.member_id] = [];
          next[record.member_id].push(record);
        });
        return next;
      });
    } catch (err: any) {
      unfetched.forEach(id => fetchedMemberIds.current.delete(id));
      console.error('Error fetching ghost records for members:', err);
      isDebugMode().then(enabled => {
        if (!enabled) return;
        supabase.auth.getSession().then(({ data: { session } }) => {
          console.error("=== DETAILED ERROR LOG FOR GHOST RECORDS FETCH (MULTIPLE) ===", JSON.stringify({
            errorDetails: err,
            errorMessage: err.message,
            errorCode: err.code,
            userSession: session?.user ? {
              id: session.user.id,
              email: session.user.email,
              role: session.user.role
            } : null,
            memberIds: unfetched
          }, null, 2));
        });
      });
    }
  }, []);

  const handleDeleteGhostRecord = useCallback(async (memberId: string, record: any) => {
    try {
      let query = supabase.from('ghost_records').delete();

      if (record.id) {
        query = query.eq('id', record.id);
      } else if (record.uid) {
        query = query.eq('uid', record.uid);
      } else if (record.created_at) {
        query = query.eq('member_id', memberId).eq('created_at', record.created_at);
      } else {
        console.error('Cannot delete ghost record: no unique identifier found');
        return;
      }

      const { error } = await query;
      if (error) throw error;

      setGhostRecords(prev => ({
        ...prev,
        [memberId]: (prev[memberId] || []).filter(r => {
          if (record.id) return r.id !== record.id;
          if (record.uid) return r.uid !== record.uid;
          return r.created_at !== record.created_at;
        })
      }));
    } catch (err) {
      console.error('Error deleting ghost record:', err);
    }
  }, []);

  return {
    ghostRecords,
    fetchGhostRecords,
    fetchGhostRecordsForMember,
    fetchGhostRecordsForMembers,
    handleAddGhostRecord,
    handleDeleteGhostRecord,
  };
}
