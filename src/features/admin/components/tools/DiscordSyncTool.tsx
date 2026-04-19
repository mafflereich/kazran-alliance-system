import React, { useState } from 'react';
import { useAppContext } from '@/store';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function DiscordSyncTool({
  isProcessing,
  setIsProcessing,
}: {
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
}) {
  const { t } = useTranslation(['admin', 'translation']);
  const { db, showToast } = useAppContext();

  const handleSyncDiscordRole = async () => {
    setIsProcessing(true);
    try {
      const payload: Record<string, string[]> = {};

      Object.values(db.guilds)
        .filter(guild => guild.isDisplay !== false)
        .forEach(guild => {
          const membersInGuild = Object.values(db.members).filter(
            member => member.guildId === guild.id && member.status !== 'archived'
          );
          payload[guild.name] = membersInGuild.map(m => m.name);
        });

      const response = await fetch('https://chaosop.duckdns.org/api/syncDiscordRole', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      showToast(t('settings.sync_discord_success', '同步成功'), 'success');
      console.log('Discord role sync result:', result.results);
    } catch (error: any) {
      console.error('Error syncing Discord roles:', error);
      showToast(`${t('settings.sync_discord_failed', '同步失敗')}: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
      <div className="p-4 bg-indigo-100 dark:bg-indigo-900/50 rounded-full text-indigo-600 mb-4">
        <Users className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">
        {t('settings.sync_discord_role', '同步 Discord 身分組')}
      </h3>
      <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
        {t('settings.sync_discord_desc', '以系統成員清單同步 Discord 身分組')}
      </p>
      <button
        onClick={handleSyncDiscordRole}
        disabled={isProcessing}
        className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t('common.syncing', '同步中...')}
          </>
        ) : (
          t('tools.start_sync', '開始同步')
        )}
      </button>
    </div>
  );
}