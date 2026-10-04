import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/store';
import { Save, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// 將 epoch ms 轉為 <input type="datetime-local"> 可用的本地時間字串
const toDateTimeLocal = (ms?: number | null): string => {
  if (!ms || ms <= 0) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 將 <input type="datetime-local"> 的值轉回 epoch ms（空字串 → 0，表示停用高亮）
const fromDateTimeLocal = (value: string): number => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export default function SettingsManager() {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, updateSetting, showToast, fetchSettings, updateGuild } = useAppContext();
  const firstSettingId = db.settings && Object.keys(db.settings).length > 0 ? Object.keys(db.settings)[0] : 'default';
  const [bgmUrl, setBgmUrl] = useState(db.settings?.[firstSettingId]?.bgmUrl || '');
  const [bgmDefaultVolume, setBgmDefaultVolume] = useState(db.settings?.[firstSettingId]?.bgmDefaultVolume ?? 50);
  const [indexMessage, setIndexMessage] = useState(db.settings?.[firstSettingId]?.indexMessage || '');
  const [equipmentReminderAt, setEquipmentReminderAt] = useState<string>(
    toDateTimeLocal(db.settings?.[firstSettingId]?.equipmentReminderAt)
  );

  const getSafeIndexPercentType = (val?: string): 'empty' | 'new_costumes_owned' => {
    return val === 'new_costumes_owned' ? 'new_costumes_owned' : 'empty';
  };

  const [indexPercentType, setIndexPercentType] = useState<'empty' | 'new_costumes_owned'>(
    getSafeIndexPercentType(db.settings?.[firstSettingId]?.indexPercentType)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPercent, setIsUpdatingPercent] = useState(false);

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
      setEquipmentReminderAt(toDateTimeLocal(db.settings[id].equipmentReminderAt));
    }
  }, [db.settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSetting(firstSettingId, { bgmUrl, bgmDefaultVolume, indexMessage, indexPercentType, equipmentReminderAt: fromDateTimeLocal(equipmentReminderAt) });
      showToast(t('settings.save_success'), 'success');
    } catch (error: any) {
      console.error("Error saving settings:", error);
      showToast(`${t('settings.save_failed')}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePercentShown = async () => {
    setIsUpdatingPercent(true);
    try {
      if (indexPercentType === 'new_costumes_owned') {
        const newCostume = Object.values(db.costumes).find((costume) => costume.isNew);
        if (!newCostume) {
          showToast(t('settings.no_new_costume_found', '找不到新服裝'), 'error');
          setIsUpdatingPercent(false);
          return;
        }

        const updatePromises = Object.entries(db.guilds).map(async ([id]) => {
          const membersInGuild = Object.values(db.members).filter((member) => member.guildId === id && member.status === "active");
          
          if (membersInGuild.length === 0) {
            await updateGuild(id, { percentShown: 0 });
            return;
          }

          const ownedCount = membersInGuild.filter((member) =>
            member.records && member.records[newCostume.id] && (+member.records[newCostume.id].level) >= 0
          ).length;

          const rate = Math.round((ownedCount / membersInGuild.length) * 100);
          await updateGuild(id, { percentShown: rate });
        });

        await Promise.all(updatePromises);
        showToast(t('settings.update_percent_success', '成功更新公會百分比'), 'success');
      } else {
        const updatePromises = Object.entries(db.guilds).map(async ([id]) => {
          await updateGuild(id, { percentShown: 0 });
        });
        await Promise.all(updatePromises);
        showToast(t('settings.update_percent_success', '成功更新公會百分比'), 'success');
      }
    } catch (error: any) {
      console.error("Error updating percent shown:", error);
      showToast(`${t('settings.update_percent_failed', '更新失敗')}: ${error.message}`, 'error');
    } finally {
      setIsUpdatingPercent(false);
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
            <div className="flex gap-2">
              <select
                value={indexPercentType}
                onChange={(e) => setIndexPercentType(e.target.value as 'empty' | 'new_costumes_owned')}
                className="flex-1 p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
              >
                <option value="empty">{t('settings.none')}</option>
                <option value="new_costumes_owned">{t('settings.new_costume_ownership_rate')}</option>
              </select>
              <button
                onClick={handleUpdatePercentShown}
                disabled={isUpdatingPercent}
                className="px-4 py-2 bg-stone-200 dark:bg-stone-600 text-stone-800 dark:text-stone-200 rounded-lg font-bold hover:bg-stone-300 dark:hover:bg-stone-500 transition-all active:scale-95 shadow-sm disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
              >
                {isUpdatingPercent ? t('common.updating', '更新中...') : t('settings.update_values', '更新數值')}
              </button>
            </div>
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

          <div>
            <label className="block text-sm font-medium text-stone-600 dark:text-stone-400 mb-1">
              {t('settings.equipment_reminder_at', '裝備表更新基準時間')}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={equipmentReminderAt}
                onChange={(e) => setEquipmentReminderAt(e.target.value)}
                className="p-3 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-stone-800 dark:bg-stone-700 dark:text-stone-100"
              />
              <button
                type="button"
                onClick={() => setEquipmentReminderAt(toDateTimeLocal(Date.now()))}
                className="px-3 py-2 bg-stone-200 dark:bg-stone-600 text-stone-800 dark:text-stone-200 rounded-lg font-bold hover:bg-stone-300 dark:hover:bg-stone-500 transition-all active:scale-95 shadow-sm whitespace-nowrap"
              >
                {t('settings.set_to_now', '設為現在')}
              </button>
              {equipmentReminderAt && (
                <button
                  type="button"
                  onClick={() => setEquipmentReminderAt('')}
                  className="px-3 py-2 bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded-lg font-bold hover:bg-stone-200 dark:hover:bg-stone-600 transition-all active:scale-95 whitespace-nowrap"
                >
                  {t('settings.clear', '清除')}
                </button>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-2">
              {t('settings.equipment_reminder_at_hint', '裝備表更新時間早於此時間點的成員會被高亮標示，管理者可一鍵請貝拉在公會專區通知他們。留空表示停用高亮。')}
            </p>
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
