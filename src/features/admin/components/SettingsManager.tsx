import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/store';
import { Save, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SettingsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, updateSetting, showToast, fetchSettings } = useAppContext();
  const firstSettingId = db.settings && Object.keys(db.settings).length > 0 ? Object.keys(db.settings)[0] : 'default';
  const [bgmUrl, setBgmUrl] = useState(db.settings?.[firstSettingId]?.bgmUrl || '');
  const [bgmDefaultVolume, setBgmDefaultVolume] = useState(db.settings?.[firstSettingId]?.bgmDefaultVolume ?? 50);
  const [indexMessage, setIndexMessage] = useState(db.settings?.[firstSettingId]?.indexMessage || '');

  const getSafeIndexPercentType = (val?: string): 'empty' | 'new_costumes_owned' => {
    return val === 'new_costumes_owned' ? 'new_costumes_owned' : 'empty';
  };

  const [indexPercentType, setIndexPercentType] = useState<'empty' | 'new_costumes_owned'>(
    getSafeIndexPercentType(db.settings?.[firstSettingId]?.indexPercentType)
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (db.settings && Object.keys(db.settings).length > 0) {
      const id = Object.keys(db.settings)[0];
      setBgmUrl(db.settings[id].bgmUrl || '');
      setBgmDefaultVolume(db.settings[id].bgmDefaultVolume ?? 50);
      setIndexMessage(db.settings[id].indexMessage || '');
      setIndexPercentType(getSafeIndexPercentType(db.settings[id].indexPercentType));
    }
  }, [db.settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSetting(firstSettingId, { bgmUrl, bgmDefaultVolume, indexMessage, indexPercentType });
      showToast(t('settings.save_success'), 'success');
    } catch (error: any) {
      console.error("Error saving settings:", error);
      showToast(`${t('settings.save_failed')}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
          <Settings className="w-6 h-6 text-amber-600" />
          {t('nav.settings')}
        </h2>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-all active:scale-95 shadow-sm disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving ? t('common.saving') : <><Save className="w-4 h-4" /> {t('common.save')}</>}
        </button>
      </div>

      <div className="bg-stone-50 dark:bg-stone-700 p-6 rounded-2xl border border-stone-200 dark:border-stone-600">
        <h3 className="text-lg font-bold text-stone-800 dark:text-stone-200 mb-4">{t('settings.main_page')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">
              {t('settings.guild_percentage_calculation')}
            </label>
            <select
              value={indexPercentType}
              onChange={(e) => setIndexPercentType(e.target.value as 'empty' | 'new_costumes_owned')}
              className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
            >
              <option value="empty">{t('settings.none')}</option>
              <option value="new_costumes_owned">{t('settings.new_costume_ownership_rate')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">
              {t('settings.message')}
            </label>
            <textarea
              value={indexMessage}
              onChange={(e) => setIndexMessage(e.target.value)}
              placeholder={t('settings.message_placeholder')}
              className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100 min-h-[100px]"
            />
          </div>
        </div>
      </div>

      <div className="bg-stone-50 dark:bg-stone-700 p-6 rounded-2xl border border-stone-200 dark:border-stone-600">
        <h3 className="text-lg font-bold text-stone-800 dark:text-stone-200 mb-4">{t('settings.bgm')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">
              {t('settings.bgm_url')}
            </label>
            <input
              type="text"
              value={bgmUrl}
              onChange={(e) => setBgmUrl(e.target.value)}
              placeholder="https://example.com/music.mp3"
              className="w-full p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
            />
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-2">
              {t('settings.bgm_hint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">
              {t('settings.bgm_default_volume')} ({bgmDefaultVolume}%)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={bgmDefaultVolume}
              onChange={(e) => setBgmDefaultVolume(Number(e.target.value))}
              className="w-full h-2 bg-stone-200 dark:bg-stone-600 rounded-lg appearance-none cursor-pointer accent-amber-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
