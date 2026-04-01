import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { supabaseUpsert, supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { FiendHunterSeason, FiendHunterBoss } from './FiendHunterBoard';
import { useTranslation } from 'react-i18next';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  season: FiendHunterSeason | null;
  initialBosses: FiendHunterBoss[];
}

export const FiendHunterManageBossesModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, season, initialBosses }) => {
  const { t } = useTranslation(['toolbox']);
  const { showToast } = useAppContext();
  const [draftBosses, setDraftBosses] = useState<{ difficulty: number; hp: number | '' }[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (initialBosses.length > 0) {
        setDraftBosses(initialBosses.map(b => ({ difficulty: b.difficulty, hp: b.hp })));
      } else {
        setDraftBosses([{ difficulty: 1, hp: '' }]);
      }
    }
  }, [isOpen, initialBosses]);

  if (!isOpen || !season) return null;

  const handleAddDraftBoss = () => {
    const nextDiff = draftBosses.length > 0 ? Math.max(...draftBosses.map(b => b.difficulty)) + 1 : 1;
    setDraftBosses([...draftBosses, { difficulty: nextDiff, hp: '' }]);
  };

  const handleRemoveDraftBoss = (index: number) => {
    setDraftBosses(draftBosses.filter((_, i) => i !== index));
  };

  const handleDraftBossChange = (index: number, field: 'difficulty' | 'hp', value: number | '') => {
    const newDrafts = [...draftBosses];
    if (field === 'difficulty') {
      newDrafts[index].difficulty = Number(value) || 0;
    } else {
      newDrafts[index].hp = value;
    }
    setDraftBosses(newDrafts);
  };

  const handleSaveBosses = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter out invalid entries
    const validDrafts = draftBosses.filter(b => b.difficulty > 0 && b.hp !== '' && Number(b.hp) > 0);
    
    if (validDrafts.length === 0) {
      showToast(t('toolbox:fiend_hunter.invalid_boss_data'), 'warning');
      return;
    }

    try {
      const payload = validDrafts.map(b => ({
        season: season.season,
        difficulty: b.difficulty,
        hp: Number(b.hp)
      }));

      // Find bosses that were deleted
      const originalDifficulties = initialBosses.map(b => b.difficulty);
      const newDifficulties = validDrafts.map(b => b.difficulty);
      const deletedDifficulties = originalDifficulties.filter(d => !newDifficulties.includes(d));

      if (deletedDifficulties.length > 0) {
        const { error: deleteError } = await supabase
          .from('fiend_hunter_bosses')
          .delete()
          .eq('season', season.season)
          .in('difficulty', deletedDifficulties);
          
        if (deleteError) throw deleteError;
      }

      const { error } = await supabaseUpsert('fiend_hunter_bosses', payload, { onConflict: 'season,difficulty' });

      if (error) throw error;
      showToast(t('toolbox:fiend_hunter.boss_update_success'), 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error upserting boss:', error);
      showToast(t('toolbox:fiend_hunter.boss_update_error'), 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-stone-800 rounded-xl shadow-xl w-full max-w-lg border border-stone-200 dark:border-stone-700 flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700 shrink-0">
          <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-100">
            {t('toolbox:fiend_hunter.manage_bosses_title', { season: season.season })}
          </h3>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          <div className="flex gap-2 px-2 mb-1">
            <div className="w-20 text-xs font-medium text-stone-500 dark:text-stone-400 text-center">{t('toolbox:fiend_hunter.difficulty')}</div>
            <div className="flex-1 text-xs font-medium text-stone-500 dark:text-stone-400 text-right pr-8">{t('toolbox:fiend_hunter.hp')}</div>
            <div className="w-8"></div>
          </div>
          <form id="boss-form" onSubmit={handleSaveBosses} className="space-y-2">
            {draftBosses.map((boss, index) => (
              <div key={index} className="flex items-center gap-2 bg-stone-50 dark:bg-stone-900/50 p-2 rounded-lg border border-stone-100 dark:border-stone-700/50">
                <div className="w-20">
                  <input
                    type="number"
                    min="1"
                    value={boss.difficulty}
                    onChange={(e) => handleDraftBossChange(index, 'difficulty', Number(e.target.value))}
                    className="w-full px-2 py-1 text-sm bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 text-stone-800 dark:text-stone-100 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    required
                  />
                </div>
                <div className="flex-1 relative flex items-center">
                  <input
                    type="number"
                    min="1"
                    value={boss.hp}
                    onChange={(e) => handleDraftBossChange(index, 'hp', e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full pl-2 pr-10 py-1 text-sm bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 text-stone-800 dark:text-stone-100 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0"
                    required
                  />
                  <span className="absolute right-2 text-sm text-stone-500 dark:text-stone-400 pointer-events-none select-none">
                    ,000
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDraftBoss(index)}
                  className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                  title={t('toolbox:fiend_hunter.remove_difficulty')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={handleAddDraftBoss}
              className="w-full py-2 mt-2 flex items-center justify-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-300 border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('toolbox:fiend_hunter.add_difficulty')}
            </button>
          </form>
        </div>
        
        <div className="p-4 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3 bg-stone-50 dark:bg-stone-800/50 shrink-0 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-md transition-colors"
          >
            {t('toolbox:fiend_hunter.cancel')}
          </button>
          <button
            type="submit"
            form="boss-form"
            className="px-4 py-2 text-sm bg-stone-800 dark:bg-stone-700 text-white rounded-md hover:bg-stone-700 dark:hover:bg-stone-600 transition-colors"
          >
            {t('toolbox:fiend_hunter.save_all_bosses')}
          </button>
        </div>
      </div>
    </div>
  );
};
