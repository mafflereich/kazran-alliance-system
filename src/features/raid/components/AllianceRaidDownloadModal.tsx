import React from 'react';
import { X, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
  description: string;
}

interface AllianceRaidDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  seasons: RaidSeason[];
  downloadConfig: { singleSeasonId: string };
  setDownloadConfig: React.Dispatch<React.SetStateAction<{ singleSeasonId: string }>>;
  includeScore: boolean;
  setIncludeScore: React.Dispatch<React.SetStateAction<boolean>>;
  isGeneratingImage: boolean;
  handleDownloadImage: () => void;
}

export default function AllianceRaidDownloadModal({
  isOpen,
  onClose,
  seasons,
  downloadConfig,
  setDownloadConfig,
  includeScore,
  setIncludeScore,
  isGeneratingImage,
  handleDownloadImage
}: AllianceRaidDownloadModalProps) {
  const { t } = useTranslation(['raid', 'translation']);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-stone-700">
          <h3 className="text-lg font-bold text-stone-800 dark:text-stone-100">
            {t('alliance_raid.download_title')}
          </h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1 uppercase">
              {t('alliance_raid.select_season')}
            </label>
            <select
              value={downloadConfig.singleSeasonId}
              onChange={e => setDownloadConfig({ singleSeasonId: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-sm"
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  S{s.season_number} ({s.period_text})
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={includeScore}
              onChange={(e) => setIncludeScore(e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded border-stone-300 focus:ring-amber-500"
            />
            <span className="text-sm text-stone-700 dark:text-stone-300">
              {t('alliance_raid.include_score', '包含分數')}
            </span>
          </label>

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
  );
}
