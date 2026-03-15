import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { Trophy, AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GuildRaidTable from '../components/GuildRaidTable';
import MemberStatsModal from '../components/MemberStatsModal';
import TopControlBar from '../components/TopControlBar';
import GuildSelection from '../components/GuildSelection';
import SeasonActionsPanel from '../components/SeasonActionsPanel';

interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
  description: string;
  even_rounds: boolean;
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

export default function GuildRaidManager() {
  const { t } = useTranslation(['raid', 'translation']);
  const navigate = useNavigate();
  const { db, currentUser, updateMember, fetchAllMembers } = useAppContext();

  const [seasons, setSeasons] = useState<RaidSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [records, setRecords] = useState<Record<string, MemberRaidRecord>>({}); // key: member_id
  const recordsRef = React.useRef(records);
  const dbRef = React.useRef(db);
  
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const [draftRecords, setDraftRecords] = useState<Record<string, MemberRaidRecord>>({});
  const [guildRaidRecords, setGuildRaidRecords] = useState<Record<string, GuildRaidRecord>>({}); // key: guild_id
  const [ghostRecords, setGhostRecords] = useState<Record<string, any[]>>({});
  const [highlightedMemberIds, setHighlightedMemberIds] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  
  const [sortConfig, setSortConfig] = useState<{ key: 'default' | 'score', order: 'asc' | 'desc' }>({ key: 'default', order: 'asc' });
  const [selectedMemberStats, setSelectedMemberStats] = useState<any>(null);
  const [archiving, setArchiving] = useState(false);

  const [isSeasonPanelOpen, setIsSeasonPanelOpen] = useState(false);
  const [activeSeasonTab, setActiveSeasonTab] = useState<'add' | 'archive' | 'delete'>('add');
  const [newSeason, setNewSeason] = useState({ season_number: 1, period_text: '', description: '', even_rounds: false });
  const [keepScores, setKeepScores] = useState(true);
  const [keepSeasonNotes, setKeepSeasonNotes] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [theadHeight, setTheadHeight] = useState<number>(0);

  const handleRowHeightChange = (index: number, height: number) => {
    setRowHeights(prev => {
      if ((prev[index] || 0) < height) {
        return { ...prev, [index]: height };
      }
      return prev;
    });
  };

  const handleHeaderHeightChange = (height: number) => {
    setHeaderHeight(prev => Math.max(prev, height));
  };

  const handleTheadHeightChange = (height: number) => {
    setTheadHeight(prev => Math.max(prev, height));
  };

  // Reset row heights when context changes
  useEffect(() => {
    setRowHeights({});
    setHeaderHeight(0);
    setTheadHeight(0);
  }, [selectedSeasonId, isComparisonMode, sortConfig]);

  const userRole = currentUser ? db.users[currentUser]?.role : null;
  const canManage = userRole === 'manager' || userRole === 'admin' || userRole === 'creator';
  const userGuildId = !canManage && currentUser ? Object.entries(db.guilds).find(([_, g]) => g.username === currentUser)?.[0] : null;

  // Get guilds in the same tier
  const adminGuild = userGuildId ? db.guilds[userGuildId] : null;
  const targetTier = adminGuild?.tier || 1; // Default to tier 1 if admin has no guild

  const availableGuilds = useMemo(() => {
    return Object.values(db.guilds)
      .filter(g => canManage || g.tier === targetTier)
      .sort((a, b) => {
        if ((a.tier || 1) !== (b.tier || 1)) return (a.tier || 1) - (b.tier || 1);
        return (a.orderNum || 99) - (b.orderNum || 99);
      });
  }, [db.guilds, canManage, targetTier]);

  const guildsByTier = useMemo(() => {
    const grouped: Record<number, typeof availableGuilds> = {};
    availableGuilds.forEach(g => {
      const tier = g.tier || 1;
      if (!grouped[tier]) grouped[tier] = [];
      grouped[tier].push(g);
    });
    return grouped;
  }, [availableGuilds]);

  const guildMemberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(db.members).forEach(m => {
      if (m.guildId && m.status !== 'archived') {
        counts[m.guildId] = (counts[m.guildId] || 0) + 1;
      }
    });
    return counts;
  }, [db.members]);

  const getTierColorActive = (tier: number) => {
    switch (tier) {
      case 1: return 'bg-orange-500 text-white border-orange-600 shadow-md';
      case 2: return 'bg-blue-500 text-white border-blue-600 shadow-md';
      case 3: return 'bg-stone-500 text-white border-stone-600 shadow-md';
      case 4: return 'bg-green-500 text-white border-green-600 shadow-md';
      default: return 'bg-stone-500 text-white border-stone-600 shadow-md';
    }
  };

  useEffect(() => {
    if (availableGuilds.length > 0 && selectedGuildIds.length === 0) {
      setSelectedGuildIds([availableGuilds[0].id!]);
    }
  }, [availableGuilds]);

  const fetchSeasons = async () => {
    try {
      const { data, error } = await supabase.from('raid_seasons').select('*').order('season_number', { ascending: false });
      if (error) throw error;
      setSeasons(data || []);
      if (data && data.length > 0) {
        setSelectedSeasonId(String(data[0].id));
      }
    } catch (err: any) {
      console.error('Error fetching seasons:', err);
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchSeasons();
    fetchAllMembers();
  }, []);

  useEffect(() => {
    if (!selectedSeasonId || !supabase) return;

    console.log('Initializing real-time subscriptions for season:', selectedSeasonId);

    const memberRaidRecordsChannel = supabase
      .channel(`member_raid_records_${selectedSeasonId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_raid_records'
        },
        (payload) => {
          console.log('Member raid record change received:', payload);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRecord = payload.new as MemberRaidRecord;
            if (String(newRecord.season_id) !== String(selectedSeasonId)) return;
            
            // Trigger flash effect
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

            setRecords(prev => ({
              ...prev,
              [newRecord.member_id]: newRecord
            }));
          } else if (payload.eventType === 'DELETE') {
            const oldRecord = payload.old as MemberRaidRecord;
            if (String(oldRecord.season_id) !== String(selectedSeasonId)) return;
            setRecords(prev => {
              const next = { ...prev };
              delete next[oldRecord.member_id];
              return next;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log(`Member raid records subscription status for ${selectedSeasonId}:`, status);
      });

    const guildRaidRecordsChannel = supabase
      .channel(`guild_raid_records_${selectedSeasonId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guild_raid_records'
        },
        (payload) => {
          console.log('Guild raid record change received:', payload);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newRecord = payload.new as GuildRaidRecord;
            if (String(newRecord.season_id) !== String(selectedSeasonId)) return;
            setGuildRaidRecords(prev => ({
              ...prev,
              [newRecord.guild_id]: newRecord
            }));
          }
        }
      )
      .subscribe((status) => {
        console.log(`Guild raid records subscription status for ${selectedSeasonId}:`, status);
      });

    const memberNotesChannel = supabase
      .channel('member_notes_all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_notes'
        },
        (payload) => {
          console.log('Member note change received:', payload);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
            const memberId = (payload.new as any)?.member_id || (payload.old as any)?.member_id;
            if (memberId) {
              setHighlightedMemberIds(prev => {
                const next = new Set(prev);
                next.add(memberId);
                return next;
              });
              setTimeout(() => {
                setHighlightedMemberIds(prev => {
                  const next = new Set(prev);
                  next.delete(memberId);
                  return next;
                });
              }, 2000);
            }
            fetchAllMembers();
          }
        }
      )
      .subscribe((status) => {
        console.log('Member notes subscription status:', status);
      });

    return () => {
      console.log('Cleaning up real-time subscriptions for season:', selectedSeasonId);
      supabase.removeChannel(memberRaidRecordsChannel);
      supabase.removeChannel(guildRaidRecordsChannel);
      supabase.removeChannel(memberNotesChannel);
    };
  }, [selectedSeasonId, supabase]);

  const fetchRecords = async (isBackground = false) => {
    if (!selectedSeasonId) return;
    if (!isBackground) setLoading(true);
    try {
      const currentSeason = seasons.find(s => String(s.id) === String(selectedSeasonId));
      const previousSeason = seasons.find(s => currentSeason && s.season_number < currentSeason.season_number);

      const promises = [
        supabase
          .from('member_raid_records')
          .select('*')
          .eq('season_id', selectedSeasonId),
        supabase
          .from('guild_raid_records')
          .select('*')
          .eq('season_id', selectedSeasonId)
      ];

      const results = await Promise.all(promises);
      const recordsRes = results[0];
      const guildRecordsRes = results[1];

      if (recordsRes.error && recordsRes.error.code !== '42P01') throw recordsRes.error;
      if (guildRecordsRes.error && guildRecordsRes.error.code !== '42P01') throw guildRecordsRes.error;

      const recordsMap: Record<string, MemberRaidRecord> = {};
      (recordsRes.data || []).forEach(r => {
        recordsMap[r.member_id] = r;
      });
      setRecords(recordsMap);

      const guildRecordsMap: Record<string, GuildRaidRecord> = {};
      (guildRecordsRes.data || []).forEach(r => {
        guildRecordsMap[r.guild_id] = r;
      });
      setGuildRaidRecords(guildRecordsMap);

      if (!isBackground) {
        setDraftRecords({});
      }
    } catch (err: any) {
      console.error('Error fetching records:', err);
      // Don't show error if table doesn't exist yet
      if (err.code !== '42P01') {
        setError(err.message);
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const fetchGhostRecords = async () => {
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
  };

  useEffect(() => {
    fetchRecords(false);
    fetchGhostRecords();
  }, [selectedSeasonId]);

  useEffect(() => {
    if (selectedSeasonId && selectedGuildIds.length > 0) {
      fetchRecords(true);
      fetchAllMembers();
    }
  }, [selectedGuildIds]);

  const handleGuildToggle = (guildId: string) => {
    if (isComparisonMode) {
      setSelectedGuildIds(prev => {
        if (prev.includes(guildId)) {
          if (prev.length === 1) return prev; // Keep at least one
          return prev.filter(id => id !== guildId);
        }
        if (prev.length >= 4) return prev; // Max 4
        return [...prev, guildId];
      });
    } else {
      setSelectedGuildIds([guildId]);
    }
  };

  useEffect(() => {
    if (!isComparisonMode && selectedGuildIds.length > 1) {
      setSelectedGuildIds([selectedGuildIds[0]]);
    }
  }, [isComparisonMode]);

  const handleRecordChange = (memberId: string, field: 'score' | 'note' | 'season_note', value: string | number) => {
    setDraftRecords(prev => {
      const existingRecord = prev[memberId] || records[memberId] || { season_id: selectedSeasonId, member_id: memberId, score: 0, season_note: '' };
      
      let finalValue = value;
      if (field === 'score') {
        finalValue = Math.min(Math.max(Number(value) || 0, 0), 10000);
      }

      return {
        ...prev,
        [memberId]: {
          ...existingRecord,
          note: prev[memberId]?.note ?? db.members[memberId]?.note ?? '',
          [field]: finalValue
        }
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

    const currentScores = guildMembers.map(m => currentRecords[m.id!]?.score ?? 0).filter(s => s > 0);
    const sorted = [...currentScores].sort((a, b) => a - b);
    let median = 0;
    if (sorted.length > 0) {
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 !== 0) {
        median = sorted[mid];
      } else {
        median = (sorted[mid - 1] + sorted[mid]) / 2;
      }
    }
    const roundedMedian = Math.floor(median);

    const guildRecord: GuildRaidRecord = {
      ...guildRaidRecords[guildId],
      season_id: selectedSeasonId,
      guild_id: guildId,
      member_score_median: roundedMedian
    };

    const { error: guildError } = await supabase
      .from('guild_raid_records')
      .upsert(guildRecord, { onConflict: 'season_id, guild_id' });
    
    if (guildError) throw guildError;

    setGuildRaidRecords(prev => ({
      ...prev,
      [guildId]: guildRecord
    }));
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
      setDraftRecords(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      return;
    }

    setSaving(true);
    try {
      const { note, ...raidRecord } = draft;
      
      const { error } = await supabase
        .from('member_raid_records')
        .upsert(raidRecord, { onConflict: 'season_id, member_id' });

      if (error) throw error;

      if (noteChanged) {
        await updateMember(memberId, { note: note });
      }

      const nextRecords = {
        ...recordsRef.current,
        [memberId]: raidRecord as MemberRaidRecord
      };

      setRecords(nextRecords);

      setDraftRecords(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });

      if (scoreChanged) {
        await updateGuildMedian(guildId, nextRecords);
      }
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
        .upsert({
          season_id: selectedSeasonId,
          guild_id: guildId,
          note: note
        }, { onConflict: 'season_id, guild_id' });

      if (error) throw error;
      
      setGuildRaidRecords(prev => ({
        ...prev,
        [guildId]: {
          ...prev[guildId],
          season_id: selectedSeasonId,
          guild_id: guildId,
          note: note
        }
      }));
    } catch (err: any) {
      console.error('Error updating guild note:', err);
      setError(err.message);
    }
  };

  const getSortedMembers = (guildId: string) => {
    const guildMembers = Object.values(db.members).filter(m => {
      if (isSelectedSeasonArchived) {
        return records[m.id!]?.season_guild === guildId;
      }
      return m.guildId === guildId;
    });
    
    return guildMembers.sort((a, b) => {
      if (sortConfig.key === 'score') {
        const scoreA = draftRecords[a.id!]?.score ?? records[a.id!]?.score ?? 0;
        const scoreB = draftRecords[b.id!]?.score ?? records[b.id!]?.score ?? 0;
        if (scoreA !== scoreB) {
          return sortConfig.order === 'desc' ? scoreB - scoreA : scoreA - scoreB;
        }
      }

      // Default sort: role then name
      const roleOrder: Record<string, number> = { 'leader': 1, 'coleader': 2, 'member': 3 };
      const orderA = roleOrder[a.role] || 99;
      const orderB = roleOrder[b.role] || 99;
      
      if (orderA !== orderB) {
        return sortConfig.order === 'desc' ? orderB - orderA : orderA - orderB;
      }
      
      const nameCompare = a.name.localeCompare(b.name);
      return sortConfig.order === 'desc' ? -nameCompare : nameCompare;
    });
  };

  const handleSort = (key: 'default' | 'score') => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, order: prev.order === 'asc' ? 'desc' : 'asc' };
      }
      return { key, order: key === 'score' ? 'desc' : 'asc' };
    });
  };

  // Auto-cancel draft records when context changes
  useEffect(() => {
    if (Object.keys(draftRecords).length > 0) {
      setDraftRecords({});
    }
  }, [selectedSeasonId, isComparisonMode]);

  const handleArchiveSeason = async () => {
    if (!selectedSeasonId) return;
    setArchiving(true);
    try {
      // 1. Get all members to archive (active members + archived members who have a record)
      const membersToArchive = Object.values(db.members).filter(m => 
        m.status !== 'archived' || records[m.id!] !== undefined
      );

      // 2. Prepare records to upsert with current guild_id as season_guild
      const recordsToUpsert = membersToArchive.map(m => {
        const existing = records[m.id!];
        return {
          season_id: selectedSeasonId,
          member_id: m.id!,
          season_guild: m.guildId,
          score: existing?.score ?? 0,
          note: existing?.note ?? '',
          season_note: existing?.season_note ?? ''
        };
      });

      // 3. Upsert the records
      if (recordsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('member_raid_records')
          .upsert(recordsToUpsert, { onConflict: 'season_id, member_id' });
        
        if (upsertError) throw upsertError;
      }

      // 4. Update all guild medians to ensure they are synced with the final state
      const nextRecords = { ...records };
      recordsToUpsert.forEach(r => {
        nextRecords[r.member_id] = r as MemberRaidRecord;
      });
      
      await Promise.all(
        Object.keys(db.guilds).map(guildId => updateGuildMedian(guildId, nextRecords))
      );

      // 5. Mark season as archived
      const { error } = await supabase
        .from('raid_seasons')
        .update({ is_archived: true })
        .eq('id', selectedSeasonId);

      if (error) throw error;

      // Update records locally to prevent UI flickering before fetchRecords completes
      setRecords(nextRecords);
      
      setSeasons(prev => prev.map(s => String(s.id) === String(selectedSeasonId).trim() ? { ...s, is_archived: true } : s));
      setIsSeasonPanelOpen(false);
      
      // Refresh records to ensure sync with server
      fetchRecords();
    } catch (err: any) {
      console.error('Error archiving season:', err);
      setError(err.message);
    } finally {
      setArchiving(false);
    }
  };

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

          // Copy previous season's member records if requested
          if (keepScores || keepSeasonNotes) {
            const { data: prevMemberRecords, error: prevMemberRecordsError } = await supabase
              .from('member_raid_records')
              .select('member_id, score, season_note')
              .eq('season_id', previousSeason.id);

            if (!prevMemberRecordsError && prevMemberRecords && prevMemberRecords.length > 0) {
              const newMemberRecords = prevMemberRecords
                .filter(record => (keepScores && record.score) || (keepSeasonNotes && record.season_note))
                .map(record => ({
                  season_id: createdSeason.id,
                  member_id: record.member_id,
                  score: keepScores ? record.score : 0,
                  season_note: keepSeasonNotes ? record.season_note : ''
                }));

              if (newMemberRecords.length > 0) {
                const { error: upsertMemberError } = await supabase
                  .from('member_raid_records')
                  .upsert(newMemberRecords, { onConflict: 'season_id,member_id' });
                
                if (upsertMemberError) {
                  console.error('Error copying previous season member records:', upsertMemberError);
                }
              }
            }
          }
        }

        setIsSeasonPanelOpen(false);
        const nextSeasonNumber = createdSeason.season_number + 1;
        setNewSeason({ season_number: nextSeasonNumber, period_text: '', description: '', even_rounds: false });
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

  const handleDeleteRecords = async (type: 'score' | 'season_note') => {
    if (!selectedSeasonId) return;
    
    const confirmMessage = type === 'score' 
      ? '確定要刪除當前賽季所有成員的分數嗎？此操作無法復原。' 
      : '確定要刪除當前賽季所有成員的賽季備註嗎？此操作無法復原。';
    
    setIsDeleting(true);
    try {
      const updateData = type === 'score' ? { score: 0 } : { season_note: '' };
      const { error } = await supabase
        .from('member_raid_records')
        .update(updateData)
        .eq('season_id', selectedSeasonId);

      if (error) throw error;
      
      // Refresh records
      fetchRecords();
    } catch (err: any) {
      console.error('Error deleting records:', err);
      setError(`Error deleting records: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (seasons.length > 0) {
      const maxSeason = Math.max(...seasons.map(s => s.season_number));
      setNewSeason(prev => ({ ...prev, season_number: maxSeason + 1 }));
    }
  }, [seasons]);
  const selectedSeason = seasons.find(s => String(s.id) === String(selectedSeasonId).trim());
  const isSelectedSeasonArchived = !!selectedSeason?.is_archived;
  const isArchivedRef = React.useRef(isSelectedSeasonArchived);
  useEffect(() => {
    isArchivedRef.current = isSelectedSeasonArchived;
  }, [isSelectedSeasonArchived]);

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

  const handleDeleteGhostRecord = async (memberId: string, record: any) => {
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
  };

  if (!canManage) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-stone-100 dark:bg-stone-900">
          <div className="text-center p-8 bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 max-w-md">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('errors.permission')}</h2>
            <p className="text-stone-500 dark:text-stone-400 mb-6">{t('dashboard.no_permission')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900 flex flex-col">
      <main className="max-w-7xl mx-auto p-4 sm:p-6 flex-1 w-full flex flex-col">
        
        <TopControlBar
          selectedSeasonId={selectedSeasonId}
          setSelectedSeasonId={setSelectedSeasonId}
          seasons={seasons}
          isComparisonMode={isComparisonMode}
          setIsComparisonMode={setIsComparisonMode}
          userRole={userRole}
          onToggleSeasonPanel={() => {
            setIsSeasonPanelOpen(!isSeasonPanelOpen);
          }}
          onNavigateToRaid={() => navigate('/raid')}
          onNavigateToTeamAssign={() => navigate('/team')}
        />

        <SeasonActionsPanel
          isOpen={isSeasonPanelOpen}
          onClose={() => setIsSeasonPanelOpen(false)}
          activeTab={activeSeasonTab}
          onTabChange={setActiveSeasonTab}
          newSeason={newSeason}
          setNewSeason={setNewSeason}
          keepScores={keepScores}
          setKeepScores={setKeepScores}
          keepSeasonNotes={keepSeasonNotes}
          setKeepSeasonNotes={setKeepSeasonNotes}
          handleSaveSeason={handleSaveSeason}
          handleArchiveSeason={handleArchiveSeason}
          handleDeleteRecords={handleDeleteRecords}
          saving={saving}
          archiving={archiving}
          isDeleting={isDeleting}
          isSelectedSeasonArchived={isSelectedSeasonArchived}
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <GuildSelection
          guildsByTier={guildsByTier}
          selectedGuildIds={selectedGuildIds}
          handleGuildToggle={handleGuildToggle}
          isComparisonMode={isComparisonMode}
          getTierColorActive={getTierColorActive}
          guildMemberCounts={guildMemberCounts}
        />

        {/* Tables Area */}
        <div className={`flex-1 grid gap-4 ${isComparisonMode ? `grid-cols-1 md:grid-cols-${Math.min(selectedGuildIds.length, 4)}` : 'grid-cols-1'}`}>
          {selectedGuildIds.map(guildId => {
            const guild = db.guilds[guildId];
            const sortedMembers = getSortedMembers(guildId);

            return (
              <GuildRaidTable
                key={guildId}
                guildId={guildId}
                guild={guild}
                sortedMembers={sortedMembers}
                records={records}
                draftRecords={draftRecords}
                guildRaidRecord={guildRaidRecords[guildId]}
                isComparisonMode={isComparisonMode}
                isArchived={isSelectedSeasonArchived}
                seasonId={selectedSeasonId}
                evenRounds={selectedSeason?.even_rounds ?? true}
                loading={loading}
                saving={saving}
                sortConfig={sortConfig}
                onSort={handleSort}
                onRecordChange={handleRecordChange}
                onGuildNoteChange={handleGuildNoteChange}
                onBlur={(memberId) => handleAutoSave(memberId, guildId)}
                onMemberClick={setSelectedMemberStats}
                rowHeights={rowHeights}
                onRowHeightChange={handleRowHeightChange}
                headerHeight={headerHeight}
                onHeaderHeightChange={handleHeaderHeightChange}
                theadHeight={theadHeight}
                onTheadHeightChange={handleTheadHeightChange}
                highlightedMemberIds={highlightedMemberIds}
                ghostRecords={ghostRecords}
                onAddGhostRecord={handleAddGhostRecord}
                onDeleteGhostRecord={handleDeleteGhostRecord}
              />
            );
          })}
        </div>

      </main>

      {/* Member Stats Modal */}
      {selectedMemberStats && (
        <MemberStatsModal 
          key={selectedMemberStats.id}
          member={selectedMemberStats} 
          onClose={() => setSelectedMemberStats(null)} 
        />
      )}


    </div>
  );
}
