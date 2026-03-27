import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabaseUpsert } from '@/shared/api/supabase';
import { useAppContext } from '@/store';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (seasonNumber: number) => void;
  nextSeasonNumber: number;
}

export const FiendHunterAddSeasonModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, nextSeasonNumber }) => {
  const { showToast } = useAppContext();
  const [editSeasonNumber, setEditSeasonNumber] = useState(nextSeasonNumber);
  const [editFiendName, setEditFiendName] = useState('');
  const [editSeasonDays, setEditSeasonDays] = useState(7);
  const [editBossHps, setEditBossHps] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEditSeasonNumber(nextSeasonNumber);
      setEditFiendName('');
      setEditSeasonDays(7);
      setEditBossHps('');
    }
  }, [isOpen, nextSeasonNumber]);

  if (!isOpen) return null;

  const rawValues = editBossHps.split(',').map(v => v.trim()).filter(v => v !== '');

  const handleUpsertSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let bossPayload: any[] = [];
    if (editBossHps.trim()) {
      const hasInvalidNumber = rawValues.some(v => isNaN(Number(v)) || Number(v) <= 0);
      const hasNewlinesWithoutCommas = editBossHps.includes('\n') && !editBossHps.includes(',');

      if (hasInvalidNumber || hasNewlinesWithoutCommas) {
        showToast('魔獸血量格式不正確，請確保輸入的都是數字並以逗號分隔', 'error');
        return;
      }

      bossPayload = rawValues.map((hpStr, index) => ({
        season: editSeasonNumber,
        difficulty: index + 1,
        hp: Number(hpStr)
      }));
    }

    try {
      const { error } = await supabaseUpsert('fiend_hunter_seasons', {
        season: editSeasonNumber,
        name: editFiendName,
        days: editSeasonDays
      }, { onConflict: 'season' });

      if (error) throw error;

      if (bossPayload.length > 0) {
        const { error: bossError } = await supabaseUpsert('fiend_hunter_bosses', bossPayload, { onConflict: 'season,difficulty' });
        if (bossError) throw bossError;
      }

      showToast('賽季資料更新成功', 'success');
      onSuccess(editSeasonNumber);
      onClose();
    } catch (error: any) {
      console.error('Error upserting season:', error);
      showToast('更新賽季資料失敗', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-stone-800 rounded-xl shadow-xl w-full max-w-3xl border border-stone-200 dark:border-stone-700 flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700 shrink-0">
          <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-100">新增賽季</h3>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-6">
          <form id="add-season-form" onSubmit={handleUpsertSeason}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">賽季 (Season)</label>
                    <input
                      type="number"
                      min="1"
                      value={editSeasonNumber}
                      onChange={(e) => setEditSeasonNumber(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 text-stone-800 dark:text-stone-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">限定天數</label>
                    <input
                      type="number"
                      min="1"
                      value={editSeasonDays}
                      onChange={(e) => setEditSeasonDays(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 text-stone-800 dark:text-stone-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">魔獸名稱</label>
                  <input
                    type="text"
                    value={editFiendName}
                    onChange={(e) => setEditFiendName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 text-stone-800 dark:text-stone-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">魔獸血量</label>
                  <textarea
                    value={editBossHps}
                    onChange={(e) => setEditBossHps(e.target.value)}
                    placeholder="以逗點分隔每一個等級血量，輸入時毋須輸入最後3個0，例子：&#10;33,&#10;5440,&#10;26400,&#10;..."
                    className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 text-stone-800 dark:text-stone-100 min-h-[200px] resize-y"
                  />
                </div>
              </div>
              
              {/* Preview Pane */}
              <div className="bg-stone-50 dark:bg-stone-900/50 rounded-lg p-4 border border-stone-200 dark:border-stone-700 flex flex-col h-full min-h-[250px]">
                <h4 className="font-medium text-stone-800 dark:text-stone-100 mb-3">血量預覽</h4>
                <div className="flex-1 overflow-y-auto pr-2">
                  {rawValues.length === 0 ? (
                    <div className="text-sm text-stone-500 dark:text-stone-400 text-center py-8">
                      請在左側輸入血量以查看預覽
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                          <th className="text-left py-2 font-medium">難度 (Lv)</th>
                          <th className="text-right py-2 font-medium">血量 (HP)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rawValues.map((hpStr, index) => {
                          const hp = Number(hpStr);
                          const isInvalid = isNaN(hp) || hp <= 0;
                          return (
                            <tr key={index} className="border-b border-stone-100 dark:border-stone-800/50 last:border-0">
                              <td className="py-2 text-stone-800 dark:text-stone-200">Lv.{index + 1}</td>
                              <td className="py-2 text-right text-stone-800 dark:text-stone-200">
                                {isInvalid ? (
                                  <span className="text-red-500">格式錯誤</span>
                                ) : (
                                  (hp * 1000).toLocaleString()
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3 bg-stone-50 dark:bg-stone-800/50 shrink-0 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-md transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            form="add-season-form"
            className="px-4 py-2 bg-stone-800 dark:bg-stone-700 text-white rounded-md hover:bg-stone-700 dark:hover:bg-stone-600 transition-colors"
          >
            新增賽季
          </button>
        </div>
      </div>
    </div>
  );
};
