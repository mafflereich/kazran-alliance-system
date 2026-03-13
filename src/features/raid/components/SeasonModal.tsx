import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SeasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSeasonId: string | null;
  newSeason: {
    season_number: number;
    period_text: string;
    description: string;
  };
  setNewSeason: React.Dispatch<React.SetStateAction<{
    season_number: number;
    period_text: string;
    description: string;
  }>>;
  onSave: (e: React.FormEvent) => void;
}

const SeasonModal: React.FC<SeasonModalProps> = ({
  isOpen,
  onClose,
  editingSeasonId,
  newSeason,
  setNewSeason,
  onSave,
}) => {
  const { t } = useTranslation(['raid', 'translation']);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700">
          <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {editingSeasonId ? t('alliance_raid.edit_season') : t('alliance_raid.add_season')}
          </h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-4 space-y-4">
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
              onClick={onClose}
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
  );
};

export default SeasonModal;
