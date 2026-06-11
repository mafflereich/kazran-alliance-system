import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';
import { useAppContext } from '@/store';

import AllianceRaidDownloadModal, { DownloadConfig } from '../components/AllianceRaidDownloadModal';
import AllianceRaidDisplayOptionsModal from '../components/AllianceRaidDisplayOptionsModal';
import AllianceRaidExportView from '../components/AllianceRaidExportView';
import AllianceRaidToolbar from '../components/AllianceRaidToolbar';
import AllianceRaidTable from '../components/AllianceRaidTable';
import { useAllianceRaidRecord } from '../hooks/useAllianceRaidRecord';
import { useDragScroll } from '../hooks/useDragScroll';

export default function AllianceRaidRecord() {
  const { t } = useTranslation(['raid', 'translation']);
  const navigate = useNavigate();
  const { db, userRole } = useAppContext();

  const {
    seasons, loading, error,
    editingCell, setEditingCell,
    editRecordData, setEditRecordData,
    handleSaveRecord, startEditing, getRecord,
  } = useAllianceRaidRecord();

  const dragScroll = useDragScroll();

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState<DownloadConfig | null>(null);
  const [hideScoreInTable, setHideScoreInTable] = useState(false);
  const [hideOverkillInTable, setHideOverkillInTable] = useState(false);
  const [hideLatestSeason, setHideLatestSeason] = useState(false);
  const [hideSeasonDesc, setHideSeasonDesc] = useState(false);
  const [isDisplayOptionsModalOpen, setIsDisplayOptionsModalOpen] = useState(false);
  const [visibleGuildIds, setVisibleGuildIds] = useState<Set<string> | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);

  const canManage = userRole === 'manager' || userRole === 'admin' || userRole === 'creator';

  const sortedGuilds = useMemo(() =>
    Object.values(db.guilds)
      .filter(g => g.isDisplay !== false)
      .sort((a, b) => {
        const tierA = a.tier || 99, tierB = b.tier || 99;
        if (tierA !== tierB) return tierA - tierB;
        return (a.orderNum || 99) - (b.orderNum || 99);
      }),
    [db.guilds]
  );

  const displayedGuilds = useMemo(() => {
    if (visibleGuildIds === null) return sortedGuilds;
    return sortedGuilds.filter(g => g.id && visibleGuildIds.has(g.id));
  }, [sortedGuilds, visibleGuildIds]);

  const visibleSeasons = hideLatestSeason && seasons.length > 0 ? seasons.slice(1) : seasons;

  const exportSeasonsForView = useMemo(() => {
    if (!exportConfig) return [];
    const fromIdx = seasons.findIndex(s => s.id === exportConfig.seasonFrom);
    const toIdx = seasons.findIndex(s => s.id === exportConfig.seasonTo);
    if (fromIdx === -1 || toIdx === -1) return [];
    const minIdx = Math.min(fromIdx, toIdx), maxIdx = Math.max(fromIdx, toIdx);
    return seasons.slice(minIdx, maxIdx + 1).reverse();
  }, [exportConfig, seasons]);

  const exportGuildsForView = useMemo(() =>
    exportConfig ? sortedGuilds.filter(g => g.id && exportConfig.selectedGuildIds.has(g.id)) : [],
    [exportConfig, sortedGuilds]
  );

  const handleDownloadFromModal = async (config: DownloadConfig) => {
    setExportConfig(config);
    setIsDownloadModalOpen(false);
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!exportRef.current) return;
    try {
      const dataUrl = await toPng(exportRef.current, { backgroundColor: '#1c1917', pixelRatio: 2, skipFonts: true });
      const link = document.createElement('a');
      link.download = `raid-record-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating image:', err);
    } finally {
      setExportConfig(null);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900 flex flex-col">
      <main className="max-w-7xl mx-auto p-4 sm:p-6 flex-1 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
              <Trophy className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
              {t('alliance_raid.title')}
            </h1>
          </div>
          <AllianceRaidToolbar
            hideLatestSeason={hideLatestSeason} setHideLatestSeason={setHideLatestSeason}
            hideSeasonDesc={hideSeasonDesc} setHideSeasonDesc={setHideSeasonDesc}
            hideScoreInTable={hideScoreInTable} setHideScoreInTable={setHideScoreInTable}
            hideOverkillInTable={hideOverkillInTable} setHideOverkillInTable={setHideOverkillInTable}
            onOpenDisplayOptions={() => setIsDisplayOptionsModalOpen(true)}
            onNavigateBack={() => navigate('/raid-manager')}
          />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden flex flex-col">
          {loading ? (
            <div className="p-12 text-center text-stone-500 dark:text-stone-400">{t('common.loading')}</div>
          ) : seasons.length === 0 ? (
            <div className="p-12 text-center text-stone-500 dark:text-stone-400">{t('alliance_raid.no_records')}</div>
          ) : (
            <AllianceRaidTable
              visibleSeasons={visibleSeasons}
              displayedGuilds={displayedGuilds}
              getRecord={getRecord}
              hideScoreInTable={hideScoreInTable}
              hideOverkillInTable={hideOverkillInTable}
              hideSeasonDesc={hideSeasonDesc}
              editingCell={editingCell}
              editRecordData={editRecordData}
              setEditRecordData={setEditRecordData}
              canManage={canManage}
              handleSaveRecord={handleSaveRecord}
              startEditing={startEditing}
              setEditingCell={setEditingCell}
              {...dragScroll}
            />
          )}
        </div>
      </main>

      <AllianceRaidDownloadModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        seasons={seasons}
        guilds={sortedGuilds}
        showScoreInTable={!hideScoreInTable}
        hideLatestSeason={hideLatestSeason}
        onDownload={handleDownloadFromModal}
      />

      <AllianceRaidDisplayOptionsModal
        isOpen={isDisplayOptionsModalOpen}
        onClose={() => setIsDisplayOptionsModalOpen(false)}
        guilds={sortedGuilds}
        initialSelectedIds={visibleGuildIds ?? new Set(sortedGuilds.map(g => g.id).filter(Boolean) as string[])}
        onApply={(ids) => {
          setVisibleGuildIds(ids.size === sortedGuilds.length ? null : ids);
          setIsDisplayOptionsModalOpen(false);
        }}
      />

      <AllianceRaidExportView
        ref={exportRef}
        selectedSeasonsForExport={exportSeasonsForView}
        sortedGuilds={exportGuildsForView}
        getRecord={getRecord}
        includeScore={exportConfig?.includeScore ?? false}
      />
    </div>
  );
}
