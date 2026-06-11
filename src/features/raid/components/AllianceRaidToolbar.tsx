import React from 'react';
import { Download, Undo2, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  hideLatestSeason: boolean;
  setHideLatestSeason: (v: boolean) => void;
  hideSeasonDesc: boolean;
  setHideSeasonDesc: (v: boolean) => void;
  hideScoreInTable: boolean;
  setHideScoreInTable: (v: boolean) => void;
  hideOverkillInTable: boolean;
  setHideOverkillInTable: (v: boolean) => void;
  onOpenDisplayOptions: () => void;
  onNavigateBack: () => void;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-stone-700 dark:text-stone-300 whitespace-nowrap">{label}</span>
      <button
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
          value ? 'bg-amber-600' : 'bg-stone-300 dark:bg-stone-600'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-[18px]' : 'translate-x-1'
        }`} />
      </button>
    </div>
  );
}

function Divider() {
  return <div className="hidden sm:block h-6 w-px bg-stone-300 dark:bg-stone-700 mx-1" />;
}

export default function AllianceRaidToolbar({
  hideLatestSeason, setHideLatestSeason,
  hideSeasonDesc, setHideSeasonDesc,
  hideScoreInTable, setHideScoreInTable,
  hideOverkillInTable, setHideOverkillInTable,
  onOpenDisplayOptions,
  onNavigateBack,
}: Props) {
  const { t } = useTranslation(['raid', 'translation']);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <Toggle label={t('alliance_raid.hide_latest_season')} value={hideLatestSeason} onChange={() => setHideLatestSeason(!hideLatestSeason)} />
      <Divider />
      <Toggle label={t('alliance_raid.hide_season_desc')} value={hideSeasonDesc} onChange={() => setHideSeasonDesc(!hideSeasonDesc)} />
      <Divider />
      <Toggle label={t('alliance_raid.hide_score')} value={hideScoreInTable} onChange={() => setHideScoreInTable(!hideScoreInTable)} />
      <Divider />
      <Toggle label={t('alliance_raid.hide_overkill')} value={hideOverkillInTable} onChange={() => setHideOverkillInTable(!hideOverkillInTable)} />
      <Divider />
      <button
        onClick={onOpenDisplayOptions}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors text-sm font-medium"
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span>{t('alliance_raid.display_options')}</span>
      </button>
      <Divider />
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg transition-colors opacity-50 cursor-not-allowed"
      >
        <Download className="w-4 h-4" />
        <span>{t('alliance_raid.download_record')}</span>
      </button>
      <button
        onClick={onNavigateBack}
        className="flex items-center justify-center p-2 bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors ml-1"
        title={t('header.guild_raid_manager', { ns: 'translation' })}
      >
        <Undo2 className="w-5 h-5" />
      </button>
    </div>
  );
}
