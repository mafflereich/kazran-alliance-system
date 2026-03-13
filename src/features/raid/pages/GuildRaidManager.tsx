import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/store';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GuildRaidTable from '../components/GuildRaidTable';
import MemberStatsModal from '../components/MemberStatsModal';
import TopControlBar from '../components/TopControlBar';
import GuildSelection from '../components/GuildSelection';
import SeasonActionsModal from '../components/SeasonActionsModal';
import { useRaidManager } from '../hooks/useRaidManager';

export default function GuildRaidManager() {
  const { t } = useTranslation(['raid', 'translation']);
  const navigate = useNavigate();
  const { db, currentUser } = useAppContext();
  const userRole = currentUser ? db.users[currentUser]?.role : null;
  const canManage = userRole === 'admin' || userRole === 'creator';

  const {
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
  } = useRaidManager();

  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [selectedMemberStats, setSelectedMemberStats] = useState<any>(null);
  const [isSeasonPanelOpen, setIsSeasonPanelOpen] = useState(false);
  const [activeSeasonTab, setActiveSeasonTab] = useState<'add' | 'archive' | 'delete'>('add');
  const [newSeason, setNewSeason] = useState({ season_number: 1, period_text: '', description: '' });
  const [keepScores, setKeepScores] = useState(true);
  const [keepSeasonNotes, setKeepSeasonNotes] = useState(false);
  React.useEffect(() => {
    if (seasons.length > 0) {
      const latestSeasonNumber = seasons[0].season_number;
      setNewSeason(prev => ({ ...prev, season_number: latestSeasonNumber + 1 }));
    }
  }, [seasons]);

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

  const availableGuilds = useMemo(() => {
    return Object.values(db.guilds).sort((a, b) => Number(a.serial || 0) - Number(b.serial || 0));
  }, [db.guilds]);

  const guildsByTier = useMemo(() => {
    const grouped: Record<number, any[]> = {};
    availableGuilds.forEach(g => {
      const tier = g.tier || 1;
      if (!grouped[tier]) grouped[tier] = [];
      grouped[tier].push(g);
    });
    return grouped;
  }, [availableGuilds]);

  React.useEffect(() => {
    if (availableGuilds.length > 0 && selectedGuildIds.length === 0) {
      setSelectedGuildIds([availableGuilds[0].id!]);
    }
  }, [availableGuilds]);

  const handleGuildToggle = (guildId: string) => {
    if (isComparisonMode) {
      setSelectedGuildIds(prev => 
        prev.includes(guildId) 
          ? prev.filter(id => id !== guildId) 
          : [...prev, guildId]
      );
    } else {
      setSelectedGuildIds([guildId]);
    }
  };

  const getSortedMembers = (guildId: string) => {
    const guildMembers = Object.values(db.members).filter(m => m.guildId === guildId);
    
    if (sortConfig.key === 'score') {
      return [...guildMembers].sort((a, b) => {
        const scoreA = draftRecords[a.id!]?.score ?? records[a.id!]?.score ?? 0;
        const scoreB = draftRecords[b.id!]?.score ?? records[b.id!]?.score ?? 0;
        return sortConfig.order === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      });
    }
    
    return [...guildMembers].sort((a, b) => {
      const roleA = a.role === 'leader' ? 0 : a.role === 'coleader' ? 1 : 2;
      const roleB = b.role === 'leader' ? 0 : b.role === 'coleader' ? 1 : 2;
      if (roleA !== roleB) return roleA - roleB;
      return a.name.localeCompare(b.name);
    });
  };

  const handleSort = (key: 'default' | 'score') => {
    setSortConfig(prev => ({
      key,
      order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  const onSaveSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleSaveSeason(newSeason, keepScores, keepSeasonNotes);
    if (success) {
      setIsSeasonPanelOpen(false);
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
          onToggleSeasonPanel={() => setIsSeasonPanelOpen(true)}
          onNavigateToRaid={() => navigate('/raid')}
          onNavigateToTeamAssign={() => navigate('/team')}
        />

        <SeasonActionsModal
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
          handleSaveSeason={onSaveSeason}
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
