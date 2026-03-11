import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { Trophy, Plus, Edit2, Save, X, AlertCircle, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTierColor } from '@/shared/lib/utils';
import { toPng } from 'html-to-image';

interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
  description: string;
}

interface GuildRaidRecord {
  id: string;
  season_id: string;
  guild_id: string;
  score: number;
  rank: string;
}

export default function AllianceRaidRecord() {
  const { t } = useTranslation(['raid', 'translation']);
  const { db, currentUser } = useAppContext();

  const [seasons, setSeasons] = useState<RaidSeason[]>([]);
  const [records, setRecords] = useState<GuildRaidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [newSeason, setNewSeason] = useState({ season_number: 1, period_text: '', description: '' });

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadConfig, setDownloadConfig] = useState<{
    type: 'single' | 'consecutive' | 'all',
    singleSeasonId: string,
    startSeasonId: string,
    endSeasonId: string
  }>({
    type: 'single',
    singleSeasonId: '',
    startSeasonId: '',
    endSeasonId: ''
  });

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [editingCell, setEditingCell] = useState<{ guild_id: string, season_id: string } | null>(null);
  const [editRecordData, setEditRecordData] = useState<{ score: number | '', rank: string }>({ score: '', rank: '' });

  const userRole = currentUser ? db.users[currentUser]?.role : null;
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

  useEffect(() => {
    if (seasons.length > 0) {
      setDownloadConfig(prev => ({
        ...prev,
        singleSeasonId: seasons[0].id,
        startSeasonId: seasons[1]?.id || seasons[0].id,
        endSeasonId: seasons[0].id
      }));
    }
  }, [seasons]);

  const handleSaveSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSeasonId) {
        const { error } = await supabase
          .from('raid_seasons')
          .update(newSeason)
          .eq('id', editingSeasonId);

        if (error) throw error;

        setSeasons(prev => prev.map(s => s.id === editingSeasonId ? { ...s, ...newSeason } : s).sort((a, b) => b.season_number - a.season_number));
      } else {
        const { data, error } = await supabase
          .from('raid_seasons')
          .insert([newSeason])
          .select();

        if (error) throw error;

        if (data && data.length > 0) {
          setSeasons(prev => [data[0], ...prev].sort((a, b) => b.season_number - a.season_number));
        }
      }
      setIsSeasonModalOpen(false);
      setEditingSeasonId(null);
      setNewSeason({ season_number: (seasons[0]?.season_number || 0) + 1, period_text: '', description: '' });
    } catch (err: any) {
      setError(`Error saving season: ${err.message}`);
    }
  };

  const handleSaveRecord = async (guild_id: string, season_id: string) => {
    try {
      const existingRecord = records.find(r => r.guild_id === guild_id && r.season_id === season_id);

      const scoreToSave = editRecordData.score === '' ? 0 : Number(editRecordData.score);
      const rankToSave = editRecordData.rank;

      if (existingRecord) {
        const { error } = await supabase
          .from('guild_raid_records')
          .update({ score: scoreToSave, rank: rankToSave })
          .eq('id', existingRecord.id);

        if (error) throw error;

        setRecords(prev => prev.map(r => r.id === existingRecord.id ? { ...r, score: scoreToSave, rank: rankToSave } : r));
      } else {
        const { data, error } = await supabase
          .from('guild_raid_records')
          .insert([{ guild_id, season_id, score: scoreToSave, rank: rankToSave }])
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
      rank: existingRecord ? existingRecord.rank : ''
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

  const getRecord = useMemo(() => (guild_id: string, season_id: string) => {
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

  const handleDownloadImage = async () => {
    if (!exportRef.current) return;
    setIsGeneratingImage(true);
    try {
      // Small delay to ensure rendering
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: '#1c1917', // stone-900
        pixelRatio: 2,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      const link = document.createElement('a');
      link.download = `raid-record-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
      setIsDownloadModalOpen(false);
    } catch (err) {
      console.error('Error generating image:', err);
      setError(t('alliance_raid.export_failed'));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const selectedSeasonsForExport = useMemo(() => {
    if (downloadConfig.type === 'all') return [...seasons].reverse();
    const sorted = [...seasons].sort((a, b) => a.season_number - b.season_number);

    if (downloadConfig.type === 'single') {
      return sorted.filter(s => s.id === downloadConfig.singleSeasonId);
    }

    if (downloadConfig.type === 'consecutive') {
      const start = sorted.find(s => s.id === downloadConfig.startSeasonId);
      const end = sorted.find(s => s.id === downloadConfig.endSeasonId);
      if (!start || !end) return [];

      const startNum = start.season_number;
      const endNum = end.season_number;

      const min = Math.min(startNum, endNum);
      const max = Math.max(startNum, endNum);

      return sorted.filter(s => s.season_number >= min && s.season_number <= max);
    }

    return sorted;
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
                    <th className="sticky left-0 z-20 bg-stone-100 dark:bg-stone-800 p-2 border-b border-r border-stone-200 dark:border-stone-700 font-bold text-stone-700 dark:text-stone-300 w-24 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs">
                      {/* 移除 "公會名稱" */}
                    </th>
                    {seasons.map(season => (
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
                        {canManage && (
                          <button
                            onClick={() => {
                              setEditingSeasonId(season.id);
                              setNewSeason({ season_number: season.season_number, period_text: season.period_text, description: season.description });
                              setIsSeasonModalOpen(true);
                            }}
                            className="absolute top-1 right-1 p-1 text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedGuilds.map((guild, index) => {
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
                        <td className={`sticky left-0 z-10 py-1 px-2 border-r border-stone-200 dark:border-stone-700 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-xs w-24 truncate ${guildColBg} ${textClasses}`}>
                          {guild.name}
                        </td>
                        {seasons.map(season => {
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
                                      className="flex-1 min-w-0 px-1 py-0.5 text-xs border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
                                      placeholder="Score"
                                    />
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleSaveRecord(guild.id, season.id)}
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
                                <div className="flex items-center gap-1.5 min-h-[20px] relative pr-6">
                                  {record ? (
                                    <>
                                      <div className={`text-sm font-bold leading-tight ${!record.rank.includes('%')
                                        ? 'bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] scale-110 transform origin-left'
                                        : 'text-amber-600 dark:text-amber-400'
                                        }`}>
                                        {record.rank}
                                      </div>
                                      {record.score > 0 && (
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

                                  {canManage && (
                                    <button
                                      onClick={() => startEditing(guild.id, season.id)}
                                      className="absolute top-1/2 -translate-y-1/2 right-0 p-1 text-stone-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
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

      {/* Add Season Modal */}
      {isSeasonModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700">
              <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100">{editingSeasonId ? t('alliance_raid.edit_season') : t('alliance_raid.add_season')}</h3>
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
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
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
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
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
                  className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
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
                  className="px-4 py-2 bg-stone-800 dark:bg-stone-600 text-white rounded-lg hover:bg-stone-700 dark:hover:bg-stone-500 transition-colors"
                >
                  {editingSeasonId ? t('common.save') : t('common.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Download Modal */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700">
              <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100">{t('alliance_raid.download_title')}</h3>
              <button
                onClick={() => setIsDownloadModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex gap-2 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg">
                {(['single', 'consecutive', 'all'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setDownloadConfig(prev => ({ ...prev, type }))}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${downloadConfig.type === type
                      ? 'bg-white dark:bg-stone-700 text-amber-600 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                      }`}
                  >
                    {type === 'single' ? t('alliance_raid.single_season') : type === 'consecutive' ? t('alliance_raid.consecutive_season') : t('alliance_raid.all_seasons')}
                  </button>
                ))}
              </div>

              {downloadConfig.type === 'single' && (
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1 uppercase">{t('alliance_raid.select_season')}</label>
                  <select
                    value={downloadConfig.singleSeasonId}
                    onChange={e => setDownloadConfig(prev => ({ ...prev, singleSeasonId: e.target.value }))}
                    className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-sm"
                  >
                    {seasons.map(s => (
                      <option key={s.id} value={s.id}>S{s.season_number} ({s.period_text})</option>
                    ))}
                  </select>
                </div>
              )}

              {downloadConfig.type === 'consecutive' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1 uppercase">{t('alliance_raid.start_season')}</label>
                    <select
                      value={downloadConfig.startSeasonId}
                      onChange={e => setDownloadConfig(prev => ({ ...prev, startSeasonId: e.target.value }))}
                      className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-sm"
                    >
                      {seasons.map(s => (
                        <option key={s.id} value={s.id}>S{s.season_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1 uppercase">{t('alliance_raid.end_season')}</label>
                    <select
                      value={downloadConfig.endSeasonId}
                      onChange={e => setDownloadConfig(prev => ({ ...prev, endSeasonId: e.target.value }))}
                      className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-sm"
                    >
                      {seasons.map(s => (
                        <option key={s.id} value={s.id}>S{s.season_number}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="pt-4">
                <button
                  onClick={handleDownloadImage}
                  disabled={isGeneratingImage}
                  className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingImage ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t('alliance_raid.generating')}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      <span>{t('alliance_raid.start_download')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Export View */}
      <div className="fixed -left-[9999px] top-0">
        <div
          ref={exportRef}
          className="bg-stone-900 p-12 text-stone-100"
          style={{ width: '1200px' }}
        >
          <div className="flex justify-between items-center mb-12 border-b border-stone-800 pb-8">
            <div className="flex items-center gap-4">
              <Trophy className="w-12 h-12 text-amber-500" />
              <div>
                <h1 className="text-4xl font-black tracking-tighter uppercase italic">{t('alliance_raid.history_title')}</h1>
                <p className="text-stone-500 font-mono text-sm tracking-widest uppercase">
                  {selectedSeasonsForExport.length === 1
                    ? `${t('alliance_raid.season_label')} ${selectedSeasonsForExport[0].season_number}`
                    : `${t('alliance_raid.seasons_label')} ${selectedSeasonsForExport[0]?.season_number} - ${selectedSeasonsForExport[selectedSeasonsForExport.length - 1]?.season_number}`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-stone-400">KAZRAN</div>
              <div className="text-xs text-stone-600 uppercase tracking-widest">{t('alliance_raid.generated_at')} {new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12">
            {/* Left Column */}
            <div className="space-y-8">
              {(() => {
                const uniqueTiers = Array.from(new Set(sortedGuilds.map(g => g.tier || 0))).sort((a, b) => a - b);
                const splitIndex = Math.ceil(uniqueTiers.length / 2);
                const leftTiers = uniqueTiers.slice(0, splitIndex);

                return leftTiers.map(tier => (
                  <div key={tier} className="space-y-3">
                    <div className="flex items-center gap-2 border-l-4 border-amber-500 pl-3">
                      <h2 className="text-xl font-black uppercase italic text-amber-500">Tier {tier}</h2>
                    </div>
                    <div className="space-y-2">
                      {sortedGuilds.filter(g => g.tier === tier).map(guild => (
                        <div key={guild.id} className="bg-stone-800/50 py-2 px-4 rounded-xl border border-stone-700/50 flex justify-between items-center">
                          <div className="font-bold text-lg">{guild.name}</div>
                          <div className="flex gap-6">
                            {selectedSeasonsForExport.map(season => {
                              const record = getRecord(guild.id, season.id);
                              return (
                                <div key={season.id} className="text-right w-[100px] min-w-[100px] max-w-[100px]">
                                  <div className="text-[10px] text-stone-500 uppercase font-bold">S{season.season_number}</div>
                                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                    <div className={`font-black text-lg leading-none ${record?.rank && !record.rank.includes('%')
                                      ? 'bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(245,158,11,0.6)] scale-110 transform origin-right'
                                      : 'text-amber-500'
                                      }`}>{record?.rank || '-'}</div>
                                    {record && record.score > 0 && <div className="text-[10px] text-stone-400 font-mono">({record.score.toLocaleString()})</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Right Column */}
            <div className="space-y-8">
              {(() => {
                const uniqueTiers = Array.from(new Set(sortedGuilds.map(g => g.tier || 0))).sort((a, b) => a - b);
                const splitIndex = Math.ceil(uniqueTiers.length / 2);
                const rightTiers = uniqueTiers.slice(splitIndex);

                return rightTiers.map(tier => (
                  <div key={tier} className="space-y-3">
                    <div className="flex items-center gap-2 border-l-4 border-amber-500 pl-3">
                      <h2 className="text-xl font-black uppercase italic text-amber-500">Tier {tier}</h2>
                    </div>
                    <div className="space-y-2">
                      {sortedGuilds.filter(g => g.tier === tier).map(guild => (
                        <div key={guild.id} className="bg-stone-800/50 py-2 px-4 rounded-xl border border-stone-700/50 flex justify-between items-center">
                          <div className="font-bold text-lg">{guild.name}</div>
                          <div className="flex gap-6">
                            {selectedSeasonsForExport.map(season => {
                              const record = getRecord(guild.id, season.id);
                              return (
                                <div key={season.id} className="text-right w-[100px] min-w-[100px] max-w-[100px]">
                                  <div className="text-[10px] text-stone-500 uppercase font-bold">S{season.season_number}</div>
                                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                    <div className={`font-black text-lg leading-none ${record?.rank && !record.rank.includes('%')
                                      ? 'bg-gradient-to-r from-amber-400 to-orange-600 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(245,158,11,0.6)] scale-110 transform origin-right'
                                      : 'text-amber-500'
                                      }`}>{record?.rank || '-'}</div>
                                    {record && record.score > 0 && <div className="text-[10px] text-stone-400 font-mono">({record.score.toLocaleString()})</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-stone-800 text-center text-stone-600 text-xs uppercase tracking-[0.5em]">
            Kazran Alliance Management System • Official Record
          </div>
        </div>
      </div>

    </div>
  );
}
