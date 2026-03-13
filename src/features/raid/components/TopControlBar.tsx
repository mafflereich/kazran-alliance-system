import React from 'react';
import { Trophy, Settings, Scale, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TopControlBarProps {
  selectedSeasonId: string;
  setSelectedSeasonId: (id: string) => void;
  seasons: any[];
  isComparisonMode: boolean;
  setIsComparisonMode: (val: boolean) => void;
  userRole: string | null;
  onToggleSeasonPanel: () => void;
  onNavigateToRaid: () => void;
  onNavigateToTeamAssign: () => void;
}

const TopControlBar: React.FC<TopControlBarProps> = ({
  selectedSeasonId,
  setSelectedSeasonId,
  seasons,
  isComparisonMode,
  setIsComparisonMode,
  userRole,
  onToggleSeasonPanel,
  onNavigateToRaid,
  onNavigateToTeamAssign,
}) => {
  const { t } = useTranslation(['raid', 'translation', 'header']);

  const canManage = userRole === 'admin' || userRole === 'creator';

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
          <Trophy className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
            {t('raid.title_guild_manager', '公會聯合戰管理')}
          </h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onNavigateToTeamAssign}
          disabled={!canManage}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
            !canManage
              ? 'bg-stone-200 dark:bg-stone-800 text-stone-400 dark:text-stone-600 cursor-not-allowed'
              : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t('raid.button_team_assign', '成員調配')}</span>
        </button>

        <button
          onClick={onToggleSeasonPanel}
          disabled={!canManage}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
            !canManage
              ? 'bg-stone-200 dark:bg-stone-800 text-stone-400 dark:text-stone-600 cursor-not-allowed'
              : 'bg-stone-800 dark:bg-stone-700 text-white hover:bg-stone-700 dark:hover:bg-stone-600'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>{t('raid.season_actions_title', '賽季操作')}</span>
        </button>

        <button
          onClick={onNavigateToRaid}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          <Trophy className="w-4 h-4" />
          <span className="hidden sm:inline">{t('header.alliance_raid_record')}</span>
        </button>

        <select
          value={selectedSeasonId}
          onChange={e => setSelectedSeasonId(e.target.value)}
          className="px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {seasons.map(s => (
            <option key={s.id} value={s.id}>S{s.season_number} ({s.period_text})</option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-stone-800 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm">
          <Scale className="w-4 h-4 text-stone-500 dark:text-stone-400" />
          <span className="text-sm font-medium text-stone-700 dark:text-stone-300">{t('raid.comparison_mode', '並列模式')}</span>
          <div className="relative flex items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={isComparisonMode}
              onChange={(e) => setIsComparisonMode(e.target.checked)}
            />
            <div className="w-10 h-6 bg-stone-200 dark:bg-stone-600 rounded-full peer peer-checked:bg-indigo-500 transition-colors shadow-inner"></div>
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-md"></div>
          </div>
        </label>
      </div>
    </div>
  );
};

export default TopControlBar;
