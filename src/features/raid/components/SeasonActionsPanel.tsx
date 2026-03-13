import React from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ManagerActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'add' | 'archive' | 'delete';
  onTabChange: (tab: 'add' | 'archive' | 'delete') => void;
  newSeason: { season_number: number; period_text: string; description: string };
  setNewSeason: React.Dispatch<React.SetStateAction<{ season_number: number; period_text: string; description: string }>>;
  keepScores: boolean;
  setKeepScores: (val: boolean) => void;
  keepSeasonNotes: boolean;
  setKeepSeasonNotes: (val: boolean) => void;
  handleSaveSeason: (e: React.FormEvent) => void;
  handleArchiveSeason: () => void;
  handleDeleteRecords: (type: 'score' | 'season_note') => void;
  saving: boolean;
  archiving: boolean;
  isDeleting: boolean;
  isSelectedSeasonArchived: boolean;
}

const SeasonActionsPanel: React.FC<ManagerActionsModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  newSeason,
  setNewSeason,
  keepScores,
  setKeepScores,
  keepSeasonNotes,
  setKeepSeasonNotes,
  handleSaveSeason,
  handleArchiveSeason,
  handleDeleteRecords,
  saving,
  archiving,
  isDeleting,
  isSelectedSeasonArchived,
}) => {
  const { t } = useTranslation(['raid', 'translation']);
  const [confirmType, setConfirmType] = React.useState<'archive' | 'delete_score' | 'delete_note' | null>(null);

  if (!isOpen) return null;

  const handleConfirmAction = () => {
    if (confirmType === 'archive') {
      handleArchiveSeason();
    } else if (confirmType === 'delete_score') {
      handleDeleteRecords('score');
    } else if (confirmType === 'delete_note') {
      handleDeleteRecords('season_note');
    }
    setConfirmType(null);
  };

  return (
    <div className="mb-6 bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-700 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/20">
        <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100">
          {t('raid.season_actions_title', '賽季操作')}
        </h3>
        <button
          onClick={() => {
            setConfirmType(null);
            onClose();
          }}
          className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200 dark:border-stone-700">
        <button
          onClick={() => {
            setConfirmType(null);
            onTabChange('add');
          }}
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'add'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          {t('raid.tab_add_season', '新增賽季')}
        </button>
        <button
          onClick={() => {
            setConfirmType(null);
            onTabChange('archive');
          }}
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'archive'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          {t('raid.tab_archive_season', '封存賽季')}
        </button>
        <button
          onClick={() => {
            setConfirmType(null);
            onTabChange('delete');
          }}
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'delete'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          {t('raid.tab_delete_records', '刪除記錄')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {confirmType ? (
          <div className="py-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className={`p-4 rounded-full mb-4 ${confirmType === 'archive' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
              <AlertCircle className="w-12 h-12" />
            </div>
            <h4 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-2">
              {confirmType === 'archive'
                ? t('raid.archive_season_confirm_title', '確認封存賽季？')
                : t('raid.delete_records_confirm_title', '確認刪除記錄？')}
            </h4>
            <p className="text-stone-500 dark:text-stone-400 text-sm mb-8 max-w-xs">
              {confirmType === 'archive'
                ? t('raid.archive_season_confirm_desc', '封存後將無法再修改本賽季的成績記錄。此操作無法復原。')
                : t('raid.delete_records_confirm_desc', '此操作將會永久刪除所選的數據，無法復原。')}
            </p>
            <div className="flex gap-3 w-full max-w-xs">
              <button
                onClick={() => setConfirmType(null)}
                className="flex-1 px-4 py-2 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors font-bold"
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                onClick={handleConfirmAction}
                className={`flex-1 px-4 py-2 text-white rounded-xl transition-colors font-bold ${
                  confirmType === 'archive' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {t('common.confirm', '確認執行')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'add' && (
              <form onSubmit={handleSaveSeason} className="space-y-4 max-w-md mx-auto">
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
                    className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
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
                    className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
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
                    className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepScores}
                      onChange={(e) => setKeepScores(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-stone-300 focus:ring-indigo-500 dark:border-stone-600 dark:bg-stone-700"
                    />
                    <span className="text-sm text-stone-700 dark:text-stone-300">
                      {t('raid.keep_scores_label', '保留分數')}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepSeasonNotes}
                      onChange={(e) => setKeepSeasonNotes(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-stone-300 focus:ring-indigo-500 dark:border-stone-600 dark:bg-stone-700"
                    />
                    <span className="text-sm text-stone-700 dark:text-stone-300">
                      {t('raid.keep_season_notes_label', '保留賽季備註')}
                    </span>
                  </label>
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
                    disabled={saving}
                    className="px-4 py-2 bg-stone-800 dark:bg-stone-600 text-white rounded-lg hover:bg-stone-700 dark:hover:bg-stone-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {t('common.add')}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'archive' && (
              <div className="space-y-4 max-w-md mx-auto">
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">
                        {t('raid.archive_warning_title')}
                      </h4>
                      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                        {t('raid.archive_warning_desc')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
                  >
                    {t('common.cancel', '取消')}
                  </button>
                  <button
                    onClick={() => setConfirmType('archive')}
                    disabled={archiving || isSelectedSeasonArchived}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {archiving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t('common.saving', '儲存中...')}
                      </>
                    ) : (
                      isSelectedSeasonArchived ? t('raid.season_archived', '已封存') : t('raid.archive_season', '封存賽季')
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'delete' && (
              <div className="space-y-6 max-w-md mx-auto">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">
                        {t('raid.danger_zone_title', '危險操作')}
                      </h4>
                      <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                        {t('raid.danger_zone_desc', '以下操作將會清空當前賽季的所有相關記錄，請謹慎操作。')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-900/50 rounded-lg border border-stone-200 dark:border-stone-700">
                    <div>
                      <div className="text-sm font-bold text-stone-800 dark:text-stone-200">
                        {t('raid.delete_scores_title', '刪除當前賽季分數')}
                      </div>
                      <div className="text-xs text-stone-500">
                        {t('raid.delete_scores_desc', '將所有成員的分數重置為 0')}
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmType('delete_score')}
                      disabled={isDeleting || isSelectedSeasonArchived}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-bold disabled:opacity-50"
                    >
                      {t('raid.delete_scores_button', '刪除分數')}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-900/50 rounded-lg border border-stone-200 dark:border-stone-700">
                    <div>
                      <div className="text-sm font-bold text-stone-800 dark:text-stone-200">
                        {t('raid.delete_notes_title', '刪除當前賽季備註')}
                      </div>
                      <div className="text-xs text-stone-500">
                        {t('raid.delete_notes_desc', '將所有成員的賽季備註清空')}
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmType('delete_note')}
                      disabled={isDeleting || isSelectedSeasonArchived}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-bold disabled:opacity-50"
                    >
                      {t('raid.delete_notes_button', '刪除備註')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SeasonActionsPanel;
