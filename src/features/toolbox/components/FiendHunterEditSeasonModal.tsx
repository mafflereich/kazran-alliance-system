import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabaseUpsert } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { FiendHunterSeason } from './FiendHunterBoard';
import { useTranslation } from 'react-i18next';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  season: FiendHunterSeason | null;
}

export const FiendHunterEditSeasonModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, season }) => {
  const { t } = useTranslation(['toolbox']);
  const { showToast } = useAppContext();
  const [editSeasonNumber, setEditSeasonNumber] = useState(1);
  const [editFiendName, setEditFiendName] = useState('');
  const [editSeasonDays, setEditSeasonDays] = useState(7);

  useEffect(() => {
    if (isOpen && season) {
      setEditSeasonNumber(season.season);
      setEditFiendName(season.name);
      setEditSeasonDays(season.days);
    }
  }, [isOpen, season]);

  if (!isOpen || !season) return null;

  const handleUpsertSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabaseUpsert('fiend_hunter_seasons', {
        season: editSeasonNumber,
        name: editFiendName,
        days: editSeasonDays
      }, { onConflict: 'season' });

      if (error) throw error;

      showToast(t('toolbox:fiend_hunter.season_update_success'), 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error upserting season:', error);
      showToast(t('toolbox:fiend_hunter.season_update_error'), 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-stone-800 rounded-xl shadow-xl w-full max-w-md border border-stone-200 dark:border-stone-700 flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700 shrink-0">
          <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-100">{t('toolbox:fiend_hunter.edit_season')}</h3>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-6">
          <form id="edit-season-form" onSubmit={handleUpsertSeason} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{t('toolbox:fiend_hunter.season_label')}</label>
                <input
                  type="number"
                  value={editSeasonNumber}
                  className="w-full px-3 py-2 bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-md text-stone-500 dark:text-stone-400 cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{t('toolbox:fiend_hunter.days')}</label>
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
              <label className="block text-sm text-stone-500 dark:text-stone-400 mb-1">{t('toolbox:fiend_hunter.season_name')}</label>
              <input
                type="text"
                value={editFiendName}
                onChange={(e) => setEditFiendName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 text-stone-800 dark:text-stone-100"
                required
              />
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3 bg-stone-50 dark:bg-stone-800/50 shrink-0 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-md transition-colors"
          >
            {t('toolbox:fiend_hunter.cancel')}
          </button>
          <button
            type="submit"
            form="edit-season-form"
            className="px-4 py-2 bg-stone-800 dark:bg-stone-700 text-white rounded-md hover:bg-stone-700 dark:hover:bg-stone-600 transition-colors"
          >
            {t('toolbox:fiend_hunter.save')}
          </button>
        </div>
      </div>
    </div>
  );
};
