import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { Trophy, Download, Undo2, AlertCircle, Edit2, Save, X, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTierColor } from '@/shared/lib/utils';
import { toPng } from 'html-to-image';

import AllianceRaidDownloadModal, { DownloadConfig } from '../components/AllianceRaidDownloadModal';
import AllianceRaidDisplayOptionsModal from '../components/AllianceRaidDisplayOptionsModal';
import AllianceRaidExportView from '../components/AllianceRaidExportView';

interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
  description: string;
  even_rounds: boolean;
  score_threshold: number | null;
}

interface GuildRaidRecord {
  id: string;
  season_id: string;
  guild_id: string;
  score: number;
  rank: string;
  member_score_median?: number;
  overkill?: number | null;
}

export default function AllianceRaidRecord() {
  const { t } = useTranslation(['raid', 'translation']);
  const navigate = useNavigate();
  const { db, userRole } = useAppContext();

  const [seasons, setSeasons] = useState<RaidSeason[]>([]);
  const [records, setRecords] = useState<GuildRaidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState<DownloadConfig | null>(null);
  const [hideScoreInTable, setHideScoreInTable] = useState(false);
  const [hideOverkillInTable, setHideOverkillInTable] = useState(false);
  const [hideLatestSeason, setHideLatestSeason] = useState(false);
  const [isDisplayOptionsModalOpen, setIsDisplayOptionsModalOpen] = useState(false);
  const [visibleGuildIds, setVisibleGuildIds] = useState<Set<string> | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);

  const [editingCell, setEditingCell] = useState<{ guild_id: string, season_id: string } | null>(null);
  const [editRecordData, setEditRecordData] = useState<{ score: number | '', rank: string, overkill: number | null }>({ score: '', rank: '', overkill: null });

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


  const handleSaveRecord = async (guild_id: string, season_id: string) => {
    try {
      const existingRecord = records.find(r => r.guild_id === guild_id && r.season_id === season_id);

      const scoreToSave = editRecordData.score === '' ? 0 : Number(editRecordData.score);
      const rankToSave = editRecordData.rank;
      const overkillToSave = (editRecordData.rank && /[a-zA-Z]/.test(editRecordData.rank)) ? editRecordData.overkill : null;

      if (existingRecord) {
        const { error } = await supabase
          .from('guild_raid_records')
          .update({ score: scoreToSave, rank: rankToSave, overkill: overkillToSave })
          .eq('id', existingRecord.id);

        if (error) throw error;

        setRecords(prev => prev.map(r => r.id === existingRecord.id ? { ...r, score: scoreToSave, rank: rankToSave, overkill: overkillToSave } : r));
      } else {
        const { data, error } = await supabase
          .from('guild_raid_records')
          .insert([{ guild_id, season_id, score: scoreToSave, rank: rankToSave, overkill: overkillToSave }])
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
      rank: existingRecord?.rank ?? '',
      overkill: existingRecord?.overkill ?? null,
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

  const displayedGuilds = useMemo(() => {
    if (visibleGuildIds === null) return sortedGuilds;
    return sortedGuilds.filter(g => g.id && visibleGuildIds.has(g.id));
  }, [sortedGuilds, visibleGuildIds]);

  const visibleSeasons = hideLatestSeason && seasons.length > 0 ? seasons.slice(1) : seasons;

  const exportSeasonsForView = useMemo(() => {
    if (!exportConfig) return [];
    // seasons is ordered descending by season_number; use index-based slicing
    const fromIdx = seasons.findIndex(s => s.id === exportConfig.seasonFrom);
    const toIdx = seasons.findIndex(s => s.id === exportConfig.seasonTo);
    if (fromIdx === -1 || toIdx === -1) return [];
    const minIdx = Math.min(fromIdx, toIdx);
    const maxIdx = Math.max(fromIdx, toIdx);
    return seasons.slice(minIdx, maxIdx + 1).reverse();
  }, [exportConfig, seasons]);

  const exportGuildsForView = useMemo(() => {
    if (!exportConfig) return [];
    return sortedGuilds.filter(g => g.id && exportConfig.selectedGuildIds.has(g.id));
  }, [exportConfig, sortedGuilds]);

  const getRecord = useMemo(() => (guild_id: string | undefined, season_id: string) => {
    if (!guild_id) return undefined;
    return records.find(r => r.guild_id === guild_id && r.season_id === season_id);
  }, [records]);

  // Drag to scroll logic
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

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

  const handleDownloadFromModal = async (config: DownloadConfig) => {
    setExportConfig(config);
    setIsDownloadModalOpen(false);
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!exportRef.current) return;
    try {
      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: '#1c1917',
        pixelRatio: 2,
        skipFonts: true,
      });
      const link = document.createElement('a');
      link.download = `raid-record-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating image:', err);
      setError(t('alliance_raid.export_failed'));
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
            <div>
              <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
                {t('alliance_raid.title')}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-stone-700 dark:text-stone-300 whitespace-nowrap">
                {t('alliance_raid.hide_latest_season')}
              </span>
              <button
                onClick={() => setHideLatestSeason(!hideLatestSeason)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  hideLatestSeason ? 'bg-amber-600' : 'bg-stone-300 dark:bg-stone-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    hideLatestSeason ? 'translate-x-[18px]' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="h-6 w-px bg-stone-300 dark:bg-stone-700 mx-1"></div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-stone-700 dark:text-stone-300 whitespace-nowrap">
                {t('alliance_raid.hide_score')}
              </span>
              <button
                onClick={() => setHideScoreInTable(!hideScoreInTable)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  hideScoreInTable ? 'bg-amber-600' : 'bg-stone-300 dark:bg-stone-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    hideScoreInTable ? 'translate-x-[18px]' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="h-6 w-px bg-stone-300 dark:bg-stone-700 mx-1"></div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-stone-700 dark:text-stone-300 whitespace-nowrap">
                {t('alliance_raid.hide_overkill')}
              </span>
              <button
                onClick={() => setHideOverkillInTable(!hideOverkillInTable)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  hideOverkillInTable ? 'bg-amber-600' : 'bg-stone-300 dark:bg-stone-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    hideOverkillInTable ? 'translate-x-[18px]' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="h-6 w-px bg-stone-300 dark:bg-stone-700 mx-1"></div>

            <button
              onClick={() => setIsDisplayOptionsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors text-sm font-medium"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>{t('alliance_raid.display_options')}</span>
            </button>

            <div className="h-6 w-px bg-stone-300 dark:bg-stone-700 mx-1"></div>

            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg transition-colors opacity-50 cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>{t('alliance_raid.download_record')}</span>
            </button>

            <button
              onClick={() => navigate('/raid-manager')}
              className="flex items-center justify-center p-2 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors ml-1"
              title={t('header.guild_raid_manager')}
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
              {t('common.loading')}
            </div>
          ) : seasons.length === 0 ? (
            <div className="p-12 text-center text-stone-500 dark:text-stone-400">
              {t('alliance_raid.no_records')}
            </div>
          ) : (
            <div
              ref={scrollRef}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              className="overflow-x-auto cursor-grab active:cursor-grabbing select-none"
            >
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-stone-100 dark:bg-stone-800 p-2 border-b border-r border-stone-200 dark:border-stone-700 font-bold text-stone-700 dark:text-stone-300 w-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs">
                      {/* 會數 */}
                    </th>
                    <th className="sticky left-12 z-20 bg-stone-100 dark:bg-stone-800 p-2 border-b border-r border-stone-200 dark:border-stone-700 font-bold text-stone-700 dark:text-stone-300 w-24 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs">
                      {/* 公會名稱 */}
                    </th>
                    {visibleSeasons.map(season => (
                      <th key={season.id} className="p-2 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 w-[110px] min-w-[110px] max-w-[110px] align-top relative group">
                        <div className="flex flex-col gap-0.5">
                          <div className="font-bold text-stone-800 dark:text-stone-200 text-xs leading-tight">
                            S{season.season_number}
                          </div>
                          <div className="text-[10px] text-stone-600 dark:text-stone-300 font-medium leading-tight">
                            {season.period_text}
                          </div>
                          <div className="text-[9px] text-stone-500 dark:text-stone-400 font-normal leading-tight">
                            {season.description}
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedGuilds.map((guild) => {
                    const tierClasses = getTierColor(guild.tier || 0);
                    // Extract background and text classes
                    const bgClasses = tierClasses.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('dark:bg-')).join(' ');
                    const textClasses = tierClasses.split(' ').filter(c => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ');

                    // For the sticky guild column, use a solid background
                    // In light mode, we use the tier's background (opaque)
                    // In dark mode, we use a consistent stone-800 for better readability
                    const guildColBg = `${bgClasses.replace(/\/30/g, '')} dark:bg-stone-800`;

                    return (
                      <tr key={guild.id} className={`border-b border-stone-100 dark:border-stone-700/50 hover:brightness-95 dark:hover:brightness-110 transition-all ${bgClasses}`}>
                        <td className={`sticky left-0 z-10 py-1 px-2 border-r border-stone-200 dark:border-stone-700 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs w-12 truncate ${guildColBg} ${textClasses}`}>
                          {guild.serial ? t('common.guild_serial', { serial: guild.serial }) : '-'}
                        </td>
                        <td className={`sticky left-12 z-10 py-1 px-2 border-r border-stone-200 dark:border-stone-700 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs w-24 truncate ${guildColBg} ${textClasses}`}>
                          {guild.name}
                        </td>
                        {visibleSeasons.map(season => {
                          const record = getRecord(guild.id, season.id);
                          const isEditing = editingCell?.guild_id === guild.id && editingCell?.season_id === season.id;

                          return (
                            <td key={season.id} className="py-1 px-2 relative group border-r border-stone-200 dark:border-stone-700/50 w-[110px] min-w-[110px] max-w-[110px] align-middle">
                              {isEditing ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex gap-1 w-full">
                                    <input
                                      type="text"
                                      value={editRecordData.rank}
                                      onChange={e => setEditRecordData(prev => ({ ...prev, rank: e.target.value }))}
                                      className="w-10 min-w-0 px-1 py-0.5 text-xs border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
                                      placeholder="Rank"
                                    />
                                    <input
                                      type="number"
                                      max="1000000"
                                      value={editRecordData.score}
                                      onChange={e => setEditRecordData(prev => ({ ...prev, score: e.target.value ? Number(e.target.value) : '' }))}
                                      className="flex-1 min-w-0 px-1 py-0.5 text-xs border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      placeholder="Score"
                                    />
                                  </div>
                                  {season.score_threshold != null && typeof editRecordData.score === 'number' && editRecordData.score >= season.score_threshold * 30 && (
                                    <input
                                      type="number"
                                      min="0"
                                      value={editRecordData.overkill ?? ''}
                                      onChange={e => setEditRecordData(prev => ({ ...prev, overkill: e.target.value ? Number(e.target.value) : null }))}
                                      className="w-full px-1 py-0.5 text-xs border border-violet-300 dark:border-violet-700 rounded bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      placeholder="Overkill"
                                    />
                                  )}
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleSaveRecord(guild.id!, season.id)}
                                      className="flex-1 py-0.5 bg-green-100 text-green-700 hover:bg-green-200 rounded flex items-center justify-center transition-colors"
                                    >
                                      <Save className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setEditingCell(null)}
                                      className="flex-1 py-0.5 bg-stone-200 text-stone-700 hover:bg-stone-300 rounded flex items-center justify-center transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5 min-h-[20px] relative pr-6">
                                  <div className="flex items-center gap-1.5">
                                    {record && record.rank ? (
                                      <>
                                        <div className={`text-sm font-bold leading-tight ${record.rank && !record.rank.includes('%')
                                          ? 'bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] scale-110 transform origin-left'
                                          : 'text-amber-600 dark:text-amber-400'
                                          }`}>
                                          {record.rank}
                                        </div>
                                        {record.score > 0 && !hideScoreInTable && (
                                          <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-tight">
                                            ({record.score.toLocaleString()})
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-sm text-stone-400 dark:text-stone-600 italic">
                                        -
                                      </div>
                                    )}
                                  </div>
                                  {!hideOverkillInTable && record?.overkill != null && season.score_threshold != null && record.score >= season.score_threshold * 30 && (
                                    <div className="text-[10px] text-violet-500 dark:text-violet-400 font-medium leading-tight">
                                      {record.overkill.toLocaleString()}
                                    </div>
                                  )}
                                  {canManage && (
                                    <button
                                      onClick={() => startEditing(guild.id!, season.id)}
                                      className="absolute top-0.5 right-0 p-1 text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
