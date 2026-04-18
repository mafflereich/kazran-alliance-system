import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/store';
import { supabase } from '@/shared/api/supabase';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GuildRaidTable from '../components/GuildRaidTable';
import MemberStatsModal from '../components/MemberStatsModal';
import TopControlBar from '../components/TopControlBar';
import GuildSelection from '../components/GuildSelection';
import SeasonActionsPanel from '../components/SeasonActionsPanel';
import RaidMemberSearchModal from '../components/RaidMemberSearchModal';
import { useGhostRecords } from '../hooks/useGhostRecords';
import { useRaidData } from '../hooks/useRaidData';
import { useRaidRecordEditor } from '../hooks/useRaidRecordEditor';
import { useSeasonManager } from '../hooks/useSeasonManager';
import { useGuildStats } from '../hooks/useGuildStats';
import { useTableLayout } from '../hooks/useTableLayout';
import type { Member } from '@/entities/member/types';

export default function GuildRaidManager() {
  const { t } = useTranslation(['raid', 'translation']);
  const navigate = useNavigate();
  const { db, setDb, userRole, userGuildRoles, fetchAllMembers } = useAppContext();

  const canManage = userRole === 'manager' || userRole === 'admin' || userRole === 'creator';
  const userGuilds = userGuildRoles.length > 0
    ? Object.entries(db.guilds).filter(([_, g]) => userGuildRoles.includes(g.username || '') || userGuildRoles.includes(g.name || ''))
    : [];
  const userGuildId = userGuilds.length > 0 ? userGuilds[0][0] : null;
  const adminGuild = userGuildId ? db.guilds[userGuildId] : null;
  const targetTier = adminGuild?.tier || 1;

  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: 'default' | 'score'; order: 'asc' | 'desc' }>({ key: 'default', order: 'asc' });
  const [selectedMemberStats, setSelectedMemberStats] = useState<any>(null);
  const [isFindMemberOpen, setIsFindMemberOpen] = useState(false);
  const [nextSeasonRecords, setNextSeasonRecords] = useState<Record<string, any>>({});

  const { ghostRecords, fetchGhostRecordsForMember, fetchGhostRecordsForMembers, handleAddGhostRecord: addGhostRecord, handleDeleteGhostRecord } = useGhostRecords();
  const { availableGuilds, guildsByTier, guildMemberCounts } = useGuildStats(canManage, targetTier);

  const updateMemberNote = useCallback((memberId: string, payload: Record<string, any>) => {
    setDb(prev => {
      const member = prev.members[memberId];
      if (!member) return prev;
      return {
        ...prev,
        members: {
          ...prev.members,
          [memberId]: {
            ...member,
            ...(payload.note !== undefined && { note: payload.note }),
            ...(payload.is_reserved !== undefined && { isReserved: payload.is_reserved }),
            ...(payload.archive_remark !== undefined && { archiveRemark: payload.archive_remark }),
          },
        },
      };
    });
  }, [setDb]);

  const raidData = useRaidData(fetchAllMembers, updateMemberNote);

  const editor = useRaidRecordEditor({
    selectedSeasonId: raidData.selectedSeasonId,
    isSelectedSeasonArchived: raidData.isSelectedSeasonArchived,
    isComparisonMode,
    records: raidData.records,
    setRecords: raidData.setRecords,
    recordsRef: raidData.recordsRef,
    guildRaidRecords: raidData.guildRaidRecords,
    setGuildRaidRecords: raidData.setGuildRaidRecords,
  });

  const seasonManager = useSeasonManager({
    selectedSeasonId: raidData.selectedSeasonId,
    seasons: raidData.seasons,
    setSeasons: raidData.setSeasons,
    setSelectedSeasonId: raidData.setSelectedSeasonId,
    records: raidData.records,
    setRecords: raidData.setRecords,
    updateGuildMedian: editor.updateGuildMedian,
    fetchRecords: raidData.fetchRecords,
  });

  const layout = useTableLayout(raidData.selectedSeasonId, isComparisonMode, sortConfig);

  // Fetch next season records when current season is archived
  useEffect(() => {
    if (!raidData.isSelectedSeasonArchived || !raidData.selectedSeason) {
      setNextSeasonRecords({});
      return;
    }

    const fetchNextSeasonRecords = async () => {
      // Get next season number
      const currentSeasonNum = raidData.selectedSeason?.season_number;
      if (!currentSeasonNum) {
        setNextSeasonRecords({});
        return;
      }

      const nextSeasonNum = currentSeasonNum + 1;

      try {
        // First, find the next season in the list
        let nextSeason = raidData.seasons.find(s => s.season_number === nextSeasonNum);

        // If not found in seasons list, fetch it directly from database
        if (!nextSeason) {
          const { data: seasonData, error: seasonError } = await supabase
            .from('raid_seasons')
            .select('*')
            .eq('season_number', nextSeasonNum)
            .single();

          if (seasonError || !seasonData) {
            console.warn(`Next season S${nextSeasonNum} not found`);
            setNextSeasonRecords({});
            return;
          }

          nextSeason = seasonData;
        }

        // Now fetch the records for next season
        const { data, error } = await supabase
          .from('member_raid_records')
          .select('*')
          .eq('season_id', nextSeason.id);

        if (error) throw error;

        const recordsMap: Record<string, any> = {};
        (data || []).forEach(r => {
          recordsMap[r.member_id] = r;
        });

        setNextSeasonRecords(recordsMap);
      } catch (err) {
        console.error('Failed to fetch next season records:', err);
        setNextSeasonRecords({});
      }
    };

    fetchNextSeasonRecords();
  }, [raidData.isSelectedSeasonArchived, raidData.selectedSeason?.season_number, raidData.selectedSeason?.id]);

  // Initialise guild selection
  useEffect(() => {
    if (availableGuilds.length > 0 && selectedGuildIds.length === 0) {
      setSelectedGuildIds([availableGuilds[0].id!]);
    }
  }, [availableGuilds]);

  // Background refresh when guild selection changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (raidData.selectedSeasonId && selectedGuildIds.length > 0) {
      raidData.fetchRecords(true);
      fetchAllMembers();
    }
  }, [selectedGuildIds]);

  // Bulk-fetch ghost counts whenever the visible member list changes
  // (fires after guild switch AND after fetchAllMembers resolves)
  const selectedGuildMemberIds = useMemo(() =>
    selectedGuildIds.flatMap(guildId =>
      Object.values(db.members)
        .filter(m => m.guildId === guildId)
        .map(m => m.id!)
        .filter(Boolean)
    ),
    [selectedGuildIds, db.members]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedGuildMemberIds.length > 0) fetchGhostRecordsForMembers(selectedGuildMemberIds);
  }, [selectedGuildMemberIds]);

  // Collapse to single guild when leaving comparison mode
  useEffect(() => {
    if (!isComparisonMode && selectedGuildIds.length > 1) {
      setSelectedGuildIds([selectedGuildIds[0]]);
    }
  }, [isComparisonMode]);

  const handleGuildToggle = useCallback((guildId: string) => {
    if (isComparisonMode) {
      setSelectedGuildIds(prev => {
        if (prev.includes(guildId)) {
          if (prev.length === 1) return prev;
          return prev.filter(id => id !== guildId);
        }
        if (prev.length >= 4) return prev;
        return [...prev, guildId];
      });
    } else {
      setSelectedGuildIds([guildId]);
    }
  }, [isComparisonMode]);

  const handleSort = useCallback((key: 'default' | 'score') => {
    setSortConfig(prev => {
      if (prev.key === key) return { key, order: prev.order === 'asc' ? 'desc' : 'asc' };
      return { key, order: key === 'score' ? 'desc' : 'asc' };
    });
  }, []);

  const sortedMembersMap = useMemo(() => {
    const map: Record<string, Member[]> = {};
    for (const guildId of selectedGuildIds) {
      const guildMembers = Object.values(db.members).filter(m => {
        if (raidData.isSelectedSeasonArchived) {
          return raidData.records[m.id!]?.season_guild === guildId;
        }
        return m.guildId === guildId;
      });
      map[guildId] = guildMembers.sort((a, b) => {
        if (sortConfig.key === 'score') {
          const scoreA = editor.draftRecords[a.id!]?.score ?? raidData.records[a.id!]?.score ?? 0;
          const scoreB = editor.draftRecords[b.id!]?.score ?? raidData.records[b.id!]?.score ?? 0;
          if (scoreA !== scoreB) {
            return sortConfig.order === 'desc' ? scoreB - scoreA : scoreA - scoreB;
          }
        }
        const roleOrder: Record<string, number> = { leader: 1, coleader: 2, member: 3 };
        const orderA = roleOrder[a.role] || 99;
        const orderB = roleOrder[b.role] || 99;
        if (orderA !== orderB) return sortConfig.order === 'desc' ? orderB - orderA : orderA - orderB;
        const nameCompare = a.name.localeCompare(b.name);
        return sortConfig.order === 'desc' ? -nameCompare : nameCompare;
      });
    }
    return map;
  }, [selectedGuildIds, db.members, raidData.records, raidData.isSelectedSeasonArchived, sortConfig, editor.draftRecords]);

  const handleAddGhostRecord = useCallback(async (memberId: string) => {
    await addGhostRecord(memberId, raidData.selectedSeason?.season_number);
  }, [addGhostRecord, raidData.selectedSeason?.season_number]);

  const getTierColorActive = (tier: number) => {
    switch (tier) {
      case 1: return 'bg-orange-500 text-white border-orange-600 shadow-md';
      case 2: return 'bg-blue-500 text-white border-blue-600 shadow-md';
      case 3: return 'bg-stone-500 text-white border-stone-600 shadow-md';
      case 4: return 'bg-green-500 text-white border-green-600 shadow-md';
      default: return 'bg-stone-500 text-white border-stone-600 shadow-md';
    }
  };

  const error = raidData.error || editor.error || seasonManager.error;

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
          selectedSeasonId={raidData.selectedSeasonId}
          setSelectedSeasonId={raidData.setSelectedSeasonId}
          seasons={raidData.seasons}
          isComparisonMode={isComparisonMode}
          setIsComparisonMode={setIsComparisonMode}
          userRole={userRole}
          onToggleSeasonPanel={() => seasonManager.setIsSeasonPanelOpen(!seasonManager.isSeasonPanelOpen)}
          onNavigateToRaid={() => navigate('/raid')}
          onNavigateToTeamAssign={() => navigate('/team')}
        />

        <SeasonActionsPanel
          isOpen={seasonManager.isSeasonPanelOpen}
          onClose={() => seasonManager.setIsSeasonPanelOpen(false)}
          activeTab={seasonManager.activeSeasonTab}
          onTabChange={seasonManager.setActiveSeasonTab}
          newSeason={seasonManager.newSeason}
          setNewSeason={seasonManager.setNewSeason}
          keepScores={seasonManager.keepScores}
          setKeepScores={seasonManager.setKeepScores}
          keepSeasonNotes={seasonManager.keepSeasonNotes}
          setKeepSeasonNotes={seasonManager.setKeepSeasonNotes}
          handleSaveSeason={seasonManager.handleSaveSeason}
          handleArchiveSeason={seasonManager.handleArchiveSeason}
          handleDeleteRecords={seasonManager.handleDeleteRecords}
          saving={seasonManager.saving}
          archiving={seasonManager.archiving}
          isDeleting={seasonManager.isDeleting}
          isSelectedSeasonArchived={raidData.isSelectedSeasonArchived}
          members={Object.values(db.members)}
          guilds={Object.values(db.guilds)}
          archivedSeasonRecords={raidData.records}
          nextSeasonRecords={nextSeasonRecords}
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
          disabled={raidData.loading}
          onFindMember={() => setIsFindMemberOpen(true)}
        />

        <RaidMemberSearchModal
          isOpen={isFindMemberOpen}
          onClose={() => setIsFindMemberOpen(false)}
          season={raidData.selectedSeason}
          isSeasonArchived={raidData.isSelectedSeasonArchived}
          records={raidData.records}
          onSelectGuild={(guildId) => setSelectedGuildIds([guildId])}
        />

        <div className={`flex-1 grid gap-4 ${isComparisonMode ? `grid-cols-1 md:grid-cols-${Math.min(selectedGuildIds.length, 4)}` : 'grid-cols-1'}`}>
          {selectedGuildIds.map(guildId => (
            <GuildRaidTable
              key={guildId}
              guildId={guildId}
              guild={db.guilds[guildId]}
              sortedMembers={sortedMembersMap[guildId] ?? []}
              records={raidData.records}
              draftRecords={editor.draftRecords}
              guildRaidRecord={raidData.guildRaidRecords[guildId]}
              isComparisonMode={isComparisonMode}
              isArchived={raidData.isSelectedSeasonArchived}
              seasonId={raidData.selectedSeasonId}
              evenRounds={raidData.selectedSeason?.even_rounds ?? true}
              loading={raidData.loading}
              saving={editor.saving}
              sortConfig={sortConfig}
              onSort={handleSort}
              onRecordChange={editor.handleRecordChange}
              onGuildNoteChange={editor.handleGuildNoteChange}
              onBlur={editor.handleAutoSave}
              onMemberClick={setSelectedMemberStats}
              rowHeights={layout.rowHeights}
              onRowHeightChange={layout.handleRowHeightChange}
              headerHeight={layout.headerHeight}
              onHeaderHeightChange={layout.handleHeaderHeightChange}
              theadHeight={layout.theadHeight}
              onTheadHeightChange={layout.handleTheadHeightChange}
              highlightedMemberIds={raidData.highlightedMemberIds}
              ghostRecords={ghostRecords}
              onFetchGhostRecords={fetchGhostRecordsForMember}
              onAddGhostRecord={handleAddGhostRecord}
              onDeleteGhostRecord={handleDeleteGhostRecord}
            />
          ))}
        </div>

      </main>

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
