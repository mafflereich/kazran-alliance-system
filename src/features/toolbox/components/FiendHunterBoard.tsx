import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '@/store';
import { supabase } from '@/shared/api/supabase';
import { calculateFiendHunterStats } from '../utils';
import { Settings, Plus, Droplet, Download } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { FiendHunterAddSeasonModal } from './FiendHunterAddSeasonModal';
import { FiendHunterEditSeasonModal } from './FiendHunterEditSeasonModal';
import { FiendHunterManageBossesModal } from './FiendHunterManageBossesModal';

export interface FiendHunterSeason {
  id?: string;
  season: number;
  days: number;
  name: string;
}

export interface FiendHunterBoss {
  season: number;
  difficulty: number;
  hp: number;
}

const formatDamageParts = (damage: number) => {
  const roundedDamage = Math.ceil(damage);
  const baseStr = roundedDamage.toLocaleString();
  
  if (damage < 10000) {
    return { baseStr, bracketStr: '' };
  } else if (damage < 100000000) {
    const wan = Math.ceil(damage / 10000);
    return { baseStr, bracketStr: `(${wan}萬)` };
  } else {
    const yi = (Math.ceil(damage / 10000000) / 10).toFixed(1);
    return { baseStr, bracketStr: `(${yi}億)` };
  }
};

export const FiendHunterBoard: React.FC = () => {
  const { userRole, showToast } = useAppContext();
  const [seasons, setSeasons] = useState<FiendHunterSeason[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<FiendHunterSeason | null>(null);
  const [bosses, setBosses] = useState<FiendHunterBoss[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [isAddSeasonModalOpen, setIsAddSeasonModalOpen] = useState(false);
  const [isEditSeasonModalOpen, setIsEditSeasonModalOpen] = useState(false);
  const [isBossModalOpen, setIsBossModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const boardRef = useRef<HTMLDivElement>(null);

  const isAdmin = userRole === 'manager' || userRole === 'admin' || userRole === 'creator';

  const fetchSeasons = async () => {
    try {
      const { data, error } = await supabase
        .from('fiend_hunter_seasons')
        .select('*')
        .order('season', { ascending: false });

      if (error) throw error;
      setSeasons(data || []);
      
      if (data && data.length > 0) {
        // Only set default if not already selected
        setSelectedSeason(prev => prev || data[0]);
      }
    } catch (error: any) {
      console.error('Error fetching seasons:', error);
      showToast('讀取賽季資料失敗', 'error');
    }
  };

  const fetchBosses = async () => {
    if (!selectedSeason) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('fiend_hunter_bosses')
        .select('season, difficulty, hp')
        .eq('season', selectedSeason.season)
        .order('difficulty', { ascending: true });

      if (error) throw error;
      setBosses(data || []);
    } catch (error: any) {
      console.error('Error fetching bosses:', error);
      showToast('讀取魔獸資料失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchBosses();
    }
  }, [selectedSeason]);

  const handleAddSeasonSuccess = async (seasonNumber: number) => {
    const { data } = await supabase
      .from('fiend_hunter_seasons')
      .select('*')
      .order('season', { ascending: false });
    if (data) {
      setSeasons(data);
      const updated = data.find(s => s.season === seasonNumber);
      if (updated) {
        setSelectedSeason(updated);
      }
    }
  };

  const handleEditSeasonSuccess = async () => {
    const { data } = await supabase
      .from('fiend_hunter_seasons')
      .select('*')
      .order('season', { ascending: false });
    if (data) {
      setSeasons(data);
      if (selectedSeason) {
        const updated = data.find(s => s.season === selectedSeason.season);
        if (updated) setSelectedSeason(updated);
      }
    }
  };

  const handleBossesSuccess = () => {
    fetchBosses();
  };

  const handleExportImage = async () => {
    if (!boardRef.current) return;
    setIsExporting(true);
    
    // Wait for state to update and render the poster layout
    setTimeout(async () => {
      try {
        const node = boardRef.current!;
        const dataUrl = await htmlToImage.toPng(node, {
          backgroundColor: document.documentElement.classList.contains('dark') ? '#1c1917' : '#fafaf9',
          pixelRatio: 2,
          fontEmbedCSS: '', // Skip font embedding to avoid "trim" error
          style: {
            margin: '0',
            transform: 'none',
          }
        });
        const link = document.createElement('a');
        link.download = `fiend_hunter_season_${selectedSeason?.season || 'export'}.png`;
        link.href = dataUrl;
        link.click();
      } catch (error) {
        console.error('Error exporting image:', error);
        showToast('匯出圖片失敗', 'error');
      } finally {
        setIsExporting(false);
      }
    }, 150);
  };

  if (isLoading && !selectedSeason) {
    return <div className="p-4 text-center text-stone-500 dark:text-stone-400">載入中...</div>;
  }

  const maxDifficulty = bosses.length;
  const nextSeasonNumber = seasons.length > 0 ? Math.max(...seasons.map(s => s.season)) + 1 : 1;

  return (
    <div className="space-y-8 relative">
      {/* Results Table */}
      <div 
        ref={boardRef}
        className={
          isExporting 
            ? "bg-stone-50 dark:bg-stone-900 p-8 w-max" 
            : "bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden w-fit"
        }
      >
        {isExporting ? (
          <div className="flex justify-between items-end mb-4 border-b border-stone-200 dark:border-stone-700 pb-2">
            <div>
              <h1 className="text-3xl font-bold text-stone-800 dark:text-stone-100 tracking-tight">
                魔獸討伐戰
              </h1>
              <div className="text-lg text-stone-500 dark:text-stone-400 mt-2 flex items-center gap-2">
                <span className="font-semibold text-stone-700 dark:text-stone-300">賽季 {selectedSeason?.season}</span>
                <span>|</span>
                <span>{selectedSeason?.name}</span>
              </div>
            </div>
            <div className="text-[10px] text-stone-300 dark:text-stone-600 italic font-medium">
              Created by 爽世@Kazran
            </div>
          </div>
        ) : (
          <div className="py-1.5 px-2 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <select
                value={selectedSeason?.season || ''}
                onChange={(e) => {
                  const s = seasons.find(x => x.season === Number(e.target.value));
                  if (s) setSelectedSeason(s);
                }}
                className="px-2 py-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 text-stone-800 dark:text-stone-100 font-medium"
              >
                {seasons.map(s => (
                  <option key={s.season} value={s.season}>賽季 {s.season}</option>
                ))}
              </select>
              {selectedSeason && (
                <span className="text-lg font-semibold text-stone-800 dark:text-stone-100">
                  {selectedSeason.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <button
                    onClick={() => setIsAddSeasonModalOpen(true)}
                    className="p-2 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                    title="新增賽季"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsEditSeasonModalOpen(true)}
                    className="p-2 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                    title="編輯賽季"
                    disabled={!selectedSeason}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsBossModalOpen(true)}
                    className="p-2 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                    title="管理魔獸血量"
                    disabled={!selectedSeason}
                  >
                    <Droplet className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={handleExportImage}
                className="p-2 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                title="下載圖片"
                disabled={!selectedSeason}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div className={isExporting ? "bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden min-w-max" : "overflow-x-auto"}>
          <table className="w-auto text-left text-sm text-stone-600 dark:text-stone-300 border-collapse">
            <thead className="bg-stone-100 dark:bg-stone-900/50 text-stone-700 dark:text-stone-200">
              <tr>
                <th className="px-3 py-0.5 font-medium whitespace-nowrap border border-stone-200 dark:border-stone-700">難度</th>
                <th className="px-3 py-0.5 font-medium whitespace-nowrap text-center border border-stone-200 dark:border-stone-700">血量</th>
                <th className="px-3 py-0.5 font-medium whitespace-nowrap text-center border border-stone-200 dark:border-stone-700 border-r-2 border-r-stone-400 dark:border-r-stone-500">一刀傷害要求</th>
                {Array.from({ length: maxDifficulty }).map((_, i) => (
                  <th key={i} className={`px-1 py-0.5 font-medium whitespace-nowrap text-center border border-stone-200 dark:border-stone-700 w-6 min-w-[1.5rem] ${(i + 1) % 5 === 0 ? 'border-r-2 border-r-stone-400 dark:border-r-stone-500' : ''}`}>{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bosses.length === 0 ? (
                <tr>
                  <td colSpan={3 + maxDifficulty} className="px-3 py-4 text-center text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
                    尚無魔獸資料
                  </td>
                </tr>
              ) : (
                bosses.map((boss, index) => {
                  const currentHps = bosses.slice(0, index + 1).map(b => b.hp * 1000);
                  const stats = calculateFiendHunterStats(currentHps, selectedSeason?.days || 5);
                  
                  const actualRequiredPerLevel = currentHps.map((hp, i) => hp / stats.strikesPerLevel[i]);
                  const maxReq = Math.max(...actualRequiredPerLevel);

                  const { baseStr, bracketStr } = formatDamageParts(stats.requiredDamage);
                  const rowBorderClass = boss.difficulty % 5 === 0 ? 'border-b-2 border-b-stone-400 dark:border-b-stone-500' : '';

                  return (
                    <tr key={`${boss.season}-${boss.difficulty}`} className="hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                      <td className={`px-3 py-0.5 whitespace-nowrap font-medium text-stone-800 dark:text-stone-100 border border-stone-200 dark:border-stone-700 ${rowBorderClass}`}>Lv.{boss.difficulty}</td>
                      <td className={`px-3 py-0.5 whitespace-nowrap text-right border border-stone-200 dark:border-stone-700 ${rowBorderClass}`}>{(boss.hp * 1000).toLocaleString()}</td>
                      <td className={`px-3 py-0.5 whitespace-nowrap tabular-nums text-blue-600 dark:text-blue-400 border border-stone-200 dark:border-stone-700 border-r-2 border-r-stone-400 dark:border-r-stone-500 ${rowBorderClass}`}>
                        <div className="text-right">
                          <span>{baseStr}</span>
                          <span className="inline-block w-16 text-left ml-1">{bracketStr}</span>
                        </div>
                      </td>
                      {Array.from({ length: maxDifficulty }).map((_, i) => {
                        const colBorderClass = (i + 1) % 5 === 0 ? 'border-r-2 border-r-stone-400 dark:border-r-stone-500' : '';
                        if (i > index) {
                          return <td key={i} className={`px-1 py-0.5 whitespace-nowrap text-stone-500 dark:text-stone-400 text-center border border-stone-200 dark:border-stone-700 w-6 min-w-[1.5rem] ${colBorderClass} ${rowBorderClass}`}></td>;
                        }
                        const strikes = stats.strikesPerLevel[i];
                        const isBottleneck = actualRequiredPerLevel[i] >= maxReq - 0.01;
                        const displayStrikes = (i < 9 && strikes === 1 && !isBottleneck) ? '' : strikes;
                        
                        return (
                          <td 
                            key={i} 
                            className={`px-1 py-0.5 whitespace-nowrap text-center border border-stone-200 dark:border-stone-700 w-6 min-w-[1.5rem] ${colBorderClass} ${rowBorderClass} ${
                              isBottleneck 
                                ? 'bg-amber-100/50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-bold' 
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {displayStrikes}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className={`text-sm text-stone-500 dark:text-stone-400 flex items-center gap-2 ${isExporting ? 'mt-4' : 'p-1.5 bg-stone-50 dark:bg-stone-800/50 border-t border-stone-200 dark:border-stone-700'}`}>
          <span className="inline-block w-4 h-4 bg-amber-100/50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded"></span>
          <span>高亮標示：需要在此難度達成最低一刀傷害要求</span>
        </div>
      </div>

      {isAdmin && (
        <>
          <FiendHunterAddSeasonModal
            isOpen={isAddSeasonModalOpen}
            onClose={() => setIsAddSeasonModalOpen(false)}
            onSuccess={handleAddSeasonSuccess}
            nextSeasonNumber={nextSeasonNumber}
          />
          <FiendHunterEditSeasonModal
            isOpen={isEditSeasonModalOpen}
            onClose={() => setIsEditSeasonModalOpen(false)}
            onSuccess={handleEditSeasonSuccess}
            season={selectedSeason}
          />
          <FiendHunterManageBossesModal
            isOpen={isBossModalOpen}
            onClose={() => setIsBossModalOpen(false)}
            onSuccess={handleBossesSuccess}
            season={selectedSeason}
            initialBosses={bosses}
          />
        </>
      )}
    </div>
  );
};

