import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Download, Undo2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SeasonModal from '../components/SeasonModal';
import DownloadRaidModal from '../components/DownloadRaidModal';
import AllianceRaidTable from '../components/AllianceRaidTable';
import AllianceExportView from '../components/AllianceExportView';
import { useAllianceRaid } from '../hooks/useAllianceRaid';

export default function AllianceRaidRecord() {
  const { t } = useTranslation(['raid', 'translation']);
  const navigate = useNavigate();
  
  const {
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
    handleDownloadImage
  } = useAllianceRaid();

  // Drag to scroll logic
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [startX, setStartX] = React.useState(0);
  const [scrollLeft, setScrollLeft] = React.useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const selectedSeasonsForExport = React.useMemo(() => {
    const sorted = [...seasons].sort((a, b) => a.season_number - b.season_number);
    return sorted.filter(s => s.id === downloadConfig.singleSeasonId);
  }, [seasons, downloadConfig]);

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-900 flex flex-col">
      <main className="max-w-7xl mx-auto p-4 sm:p-6 flex-1 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
              <Trophy className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
                {t('alliance_raid.title')}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDownloadModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{t('alliance_raid.download_record')}</span>
            </button>
            <button
              onClick={() => navigate('/raid-manager')}
              className="flex items-center justify-center p-2 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors"
              title={t('header.guild_raid_manager', '公會聯合戰管理')}
            >
              <Undo2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden flex flex-col">
          {loading ? (
            <div className="p-12 text-center text-stone-500 dark:text-stone-400">
              {t('common.loading', '載入中...')}
            </div>
          ) : seasons.length === 0 ? (
            <div className="p-12 text-center text-stone-500 dark:text-stone-400">
              {t('alliance_raid.no_records')}
            </div>
          ) : (
            <AllianceRaidTable
              seasons={seasons}
              sortedGuilds={sortedGuilds}
              records={records}
              getRecord={getRecord}
              canManage={canManage}
              editingCell={editingCell}
              editRecordData={editRecordData}
              setEditRecordData={setEditRecordData}
              setEditingCell={setEditingCell}
              startEditing={startEditing}
              handleSaveRecord={handleSaveRecord}
              setEditingSeasonId={setEditingSeasonId}
              setNewSeason={setNewSeason}
              setIsSeasonModalOpen={setIsSeasonModalOpen}
              scrollRef={scrollRef}
              handleMouseDown={handleMouseDown}
              handleMouseLeave={handleMouseLeave}
              handleMouseUp={handleMouseUp}
              handleMouseMove={handleMouseMove}
            />
          )}
        </div>
      </main>

      <SeasonModal
        isOpen={isSeasonModalOpen}
        onClose={() => setIsSeasonModalOpen(false)}
        editingSeasonId={editingSeasonId}
        newSeason={newSeason}
        setNewSeason={setNewSeason}
        onSave={handleSaveSeason}
      />

      <DownloadRaidModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        seasons={seasons}
        downloadConfig={downloadConfig}
        setDownloadConfig={setDownloadConfig}
        includeScore={includeScore}
        setIncludeScore={setIncludeScore}
        onDownload={handleDownloadImage}
        isGeneratingImage={isGeneratingImage}
      />

      <AllianceExportView
        exportRef={exportRef}
        sortedGuilds={sortedGuilds}
        selectedSeasonsForExport={selectedSeasonsForExport}
        getRecord={getRecord}
        includeScore={includeScore}
      />
    </div>
  );
}
