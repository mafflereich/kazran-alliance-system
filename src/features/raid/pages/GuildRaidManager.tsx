import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { Trophy, Save, AlertCircle, Plus, Archive, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GuildRaidTable from '../components/GuildRaidTable';
import MemberStatsModal from '../components/MemberStatsModal';
import ScoreCalculator from '@/features/toolbox/components/ScoreCalculator';

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
  const [highlightedMemberIds, setHighlightedMemberIds] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  
  const [sortConfig, setSortConfig] = useState<{ key: 'default' | 'score', order: 'asc' | 'desc' }>({ key: 'default', order: 'asc' });
  const [selectedMemberStats, setSelectedMemberStats] = useState<any>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
  const [newSeason, setNewSeason] = useState({ season_number: 1, period_text: '', description: '' });

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
      const [recordsRes, guildRecordsRes] = await Promise.all([
        supabase
          .from('member_raid_records')
          .select('*')
          .eq('season_id', selectedSeasonId),
        supabase
          .from('guild_raid_records')
          .select('*')
          .eq('season_id', selectedSeasonId)
      ]);

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

  useEffect(() => {
    fetchRecords(false);
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
      setIsArchiveModalOpen(false);
      
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
        setIsSeasonModalOpen(false);
        setNewSeason({ season_number: createdSeason.season_number + 1, period_text: '', description: '' });
      }
    } catch (err: any) {
      console.error('Error saving season:', err);
      setError(`Error saving season: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedSeason = seasons.find(s => String(s.id) === String(selectedSeasonId).trim());
  const isSelectedSeasonArchived = !!selectedSeason?.is_archived;
  const isArchivedRef = React.useRef(isSelectedSeasonArchived);
  useEffect(() => {
    isArchivedRef.current = isSelectedSeasonArchived;
  }, [isSelectedSeasonArchived]);

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
        
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
              <Trophy className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
                {t('raid.title_guild_manager', '公會聯合戰管理')}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/raid')}
              className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
            >
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">{t('header.alliance_raid_record')}</span>
            </button>

            <select
              value={selectedSeasonId}
              onChange={e => setSelectedSeasonId(e.target.value)}
              className="px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>S{s.season_number} ({s.period_text})</option>
              ))}
            </select>

            <button
              onClick={() => {
                setNewSeason({ 
                  season_number: (seasons[0]?.season_number || 0) + 1, 
                  period_text: '', 
                  description: '' 
                });
                setIsSeasonModalOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-stone-800 dark:bg-stone-700 text-white rounded-lg hover:bg-stone-700 dark:hover:bg-stone-600 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t('alliance_raid.add_season', '新增賽季')}</span>
            </button>

            <button
              onClick={() => {
                if (Object.keys(draftRecords).length > 0) {
                  setDraftRecords({});
                }
                setIsArchiveModalOpen(true);
              }}
              disabled={isSelectedSeasonArchived}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                isSelectedSeasonArchived
                  ? 'bg-stone-200 dark:bg-stone-800 text-stone-400 dark:text-stone-600 cursor-not-allowed'
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}
            >
              <Archive className="w-4 h-4" />
              <span className="hidden sm:inline">{isSelectedSeasonArchived ? t('raid.season_archived', '已封存') : t('raid.archive_season', '封存賽季')}</span>
            </button>

            <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-stone-800 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm">
              <span className="text-sm font-medium text-stone-700 dark:text-stone-300">⚖️ {t('raid.comparison_mode', '並列模式')}</span>
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={isComparisonMode}
                  onChange={(e) => setIsComparisonMode(e.target.checked)}
                />
                <div className="w-10 h-6 bg-stone-200 dark:bg-stone-600 rounded-full peer peer-checked:bg-indigo-500 transition-colors shadow-inner"></div>
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-md"></div>
              </div>
            </label>


          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Guild Selection */}
        <div className="mb-4">
          <div className="space-y-1">
            {Object.entries(guildsByTier).sort(([a], [b]) => Number(a) - Number(b)).map(([tierStr, guilds]) => {
              const tier = Number(tierStr);
              return (
                <div key={tier} className="flex items-center gap-2">
                  <div className="w-6 flex-shrink-0 text-[10px] font-bold text-stone-400 dark:text-stone-500">
                    T{tier}
                  </div>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {guilds.map(guild => {
                      const isSelected = selectedGuildIds.includes(guild.id!);
                      return (
                        <button
                          key={guild.id}
                          onClick={() => handleGuildToggle(guild.id!)}
                          className={`px-2.5 py-1 rounded text-[12px] font-medium transition-all border ${
                            isSelected
                              ? getTierColorActive(tier)
                              : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                          }`}
                        >
                          {isComparisonMode && (
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              readOnly 
                              className="mr-1.5 w-3.5 h-3.5"
                            />
                          )}
                          {guild.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
                isComparisonMode={isComparisonMode}
                isArchived={isSelectedSeasonArchived}
                seasonId={selectedSeasonId}
                loading={loading}
                saving={saving}
                sortConfig={sortConfig}
                onSort={handleSort}
                onRecordChange={handleRecordChange}
                onBlur={(memberId) => handleAutoSave(memberId, guildId)}
                onMemberClick={setSelectedMemberStats}
                rowHeights={rowHeights}
                onRowHeightChange={handleRowHeightChange}
                headerHeight={headerHeight}
                onHeaderHeightChange={handleHeaderHeightChange}
                theadHeight={theadHeight}
                onTheadHeightChange={handleTheadHeightChange}
                highlightedMemberIds={highlightedMemberIds}
              />
            );
          })}
        </div>

      </main>

      {/* Member Stats Modal */}
      <MemberStatsModal 
        member={selectedMemberStats} 
        onClose={() => setSelectedMemberStats(null)} 
      />

      {/* Archive Confirmation Modal */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-stone-200 dark:border-stone-700">
            <div className="p-6">
              <h3 className="text-xl font-bold text-stone-800 dark:text-stone-100 mb-2">
                {t('raid.archive_season_confirm_title', '確認封存賽季？')}
              </h3>
              <p className="text-stone-600 dark:text-stone-400 mb-6">
                {t('raid.archive_season_confirm_desc', '封存後，此賽季的成績將無法再被修改。您確定要封存嗎？')}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsArchiveModalOpen(false)}
                  className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
                  disabled={archiving}
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  onClick={handleArchiveSeason}
                  disabled={archiving}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {archiving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t('common.saving', '儲存中...')}
                    </>
                  ) : (
                    t('raid.archive_season', '封存賽季')
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Season Modal */}
      {isSeasonModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700">
              <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100">{t('alliance_raid.add_season')}</h3>
              <button
                onClick={() => setIsSeasonModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSeason} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('alliance_raid.season_number')}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newSeason.season_number}
                  onChange={e => setNewSeason(prev => ({ ...prev, season_number: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('alliance_raid.period')}
                </label>
                <input
                  type="text"
                  required
                  value={newSeason.period_text}
                  onChange={e => setNewSeason(prev => ({ ...prev, period_text: e.target.value }))}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  {t('alliance_raid.description')}
                </label>
                <input
                  type="text"
                  value={newSeason.description}
                  onChange={e => setNewSeason(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsSeasonModalOpen(false)}
                  className="px-4 py-2 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-stone-800 dark:bg-stone-600 text-white rounded-lg hover:bg-stone-700 dark:hover:bg-stone-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {t('common.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
