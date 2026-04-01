import React from 'react';
import { useTranslation } from 'react-i18next';

interface VersionUpdateToastProps {
  /**
   * 是否有新版本發布
   */
  hasNewVersion: boolean;
  /**
   * 點擊「立即更新」時觸發的函式
   */
  onReload: () => void;
}

/**
 * 全域更新提示元件
 * 當發現新版本時，在畫面右下角彈出提示卡片
 */
export const VersionUpdateToast: React.FC<VersionUpdateToastProps> = ({ hasNewVersion, onReload }) => {
  const { t } = useTranslation();

  if (!hasNewVersion) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-start gap-3 rounded-xl bg-white p-4 shadow-xl ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
          {t('common.new_version_title', '偵測到系統有新版本更新')}
        </p>
      </div>
      <button
        onClick={onReload}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
      >
        {t('common.update_now', '立即更新 (重整頁面)')}
      </button>
    </div>
  );
};

