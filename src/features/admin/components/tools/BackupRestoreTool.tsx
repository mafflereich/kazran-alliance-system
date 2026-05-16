import React, { useRef } from 'react';
import { useAppContext } from '@/store';
import { Download, Upload, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';
import { useRestoreDiff } from '../../hooks/useRestoreDiff';
import RestorePreviewModal from '../RestorePreviewModal';

export default function BackupRestoreTool({
  isProcessing,
  setIsProcessing,
}: {
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
}) {
  const { t } = useTranslation(['admin', 'translation']);
  const { fetchAllMembers, showToast } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isDiffing,
    isRestoring,
    diffSummary,
    isModalOpen,
    calculateDiff,
    executeRestore,
    cancelRestore,
  } = useRestoreDiff();

  const fetchAllRows = async (tableName: string, filter?: { column: string; value: any }) => {
    const allData: any[] = [];
    let from = 0;
    const limit = 1000;

    while (true) {
      let query = supabase.from(tableName).select('*').range(from, from + limit - 1);
      if (filter) query = query.eq(filter.column, filter.value);

      const { data, error } = await query;

      if (error) throw error;
      if (!data || data.length === 0) break;

      allData.push(...data);
      if (data.length < limit) break;

      from += limit;
    }

    return allData;
  };

  const triggerJsonDownload = (data: Record<string, any>, filename: string) => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const link = document.createElement('a');
    link.href = jsonString;
    link.download = filename;
    link.click();
  };

  const createBackup = async (tables: string[], filename: string) => {
    setIsProcessing(true);
    try {
      const results = await Promise.all(tables.map(table => fetchAllRows(table)));
      const backupData = Object.fromEntries(tables.map((table, i) => [table, results[i]]));
      triggerJsonDownload(backupData, filename);
    } catch (error) {
      console.error('Backup failed:', error);
      showToast(t('backup.backup_failed'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBackup = async () => {
    await createBackup(
      ['apply_mail', 'characters', 'costumes', 'guilds', 'member_notes', 'members', 'members_archive_history', 'ghost_records', 'profiles'],
      `kazran_backup_${new Date().toISOString().split('T')[0]}.json`
    );
  };

  const handleRaidBackup = async () => {
    setIsProcessing(true);
    try {
      const [raidSeasons, guildRaidRecords] = await Promise.all([
        fetchAllRows('raid_seasons'),
        fetchAllRows('guild_raid_records'),
      ]);

      // Fetch member_raid_records sequentially per season with pagination to avoid
      // concurrent full-table scans causing statement timeout (PG error 57014)
      const memberRaidRecords: any[] = [];
      for (const season of raidSeasons) {
        const records = await fetchAllRows('member_raid_records', { column: 'season_id', value: season.id });
        memberRaidRecords.push(...records);
      }

      triggerJsonDownload(
        { guild_raid_records: guildRaidRecords, member_raid_records: memberRaidRecords, raid_seasons: raidSeasons },
        `kazran_raid_backup_${new Date().toISOString().split('T')[0]}.json`
      );
    } catch (error) {
      console.error('Raid backup failed:', error);
      showToast(t('backup.backup_failed'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text === 'string') {
          const restoredDb = JSON.parse(text);
          if (typeof restoredDb === 'object' && restoredDb !== null) {
            await calculateDiff(restoredDb);
          } else {
            showToast(t('backup.invalid_format'), 'error');
          }
        }
      } catch (error) {
        console.error("Restore failed:", error);
        showToast(t('backup.restore_failed'), 'error');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    try {
      await executeRestore();
      showToast(t('backup.restore_success'), 'success');
      await fetchAllMembers();
    } catch (error) {
      showToast(t('backup.restore_failed'), 'error');
    }
  };

  return (
    <>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-full text-blue-600 mb-4">
            <Download className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('backup.download_backup')}</h3>
          <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
            {t('backup.download_desc')}
          </p>
          <button
            onClick={handleBackup}
            disabled={isProcessing}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? t('common.processing') : t('backup.download_btn')}
          </button>
        </div>

        <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-purple-100 dark:bg-purple-900/50 rounded-full text-purple-600 mb-4">
            <Download className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('backup.download_raid_backup')}</h3>
          <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
            {t('backup.download_raid_desc')}
          </p>
          <button
            onClick={handleRaidBackup}
            disabled={isProcessing}
            className="px-8 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? t('common.processing') : t('backup.download_raid_btn')}
          </button>
        </div>

        <div className="bg-stone-50 dark:bg-stone-700 p-8 rounded-2xl border border-stone-200 dark:border-stone-600 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-green-100 dark:bg-green-900/50 rounded-full text-green-600 mb-4">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-800 dark:text-stone-200 mb-2">{t('backup.restore_from_file')}</h3>
          <p className="text-stone-500 dark:text-stone-400 mb-6 max-w-md">
            {t('backup.restore_desc')}
          </p>
          <input type="file" accept=".json" onChange={handleRestore} ref={fileInputRef} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isDiffing || isRestoring}
            className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDiffing ? t('common.processing') : t('backup.restore_btn')}
          </button>
        </div>
      </div>

      <div className="mt-6 bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-400 dark:border-amber-600 p-4 rounded-r-lg">
        <div className="flex">
          <div className="py-1"><AlertCircle className="h-5 w-5 text-amber-500 mr-3" /></div>
          <div>
            <p className="font-bold text-amber-800 dark:text-amber-200">{t('backup.important_notice')}</p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t('backup.important_desc')}
            </p>
          </div>
        </div>
      </div>

      <RestorePreviewModal
        isOpen={isModalOpen}
        isRestoring={isRestoring}
        diffSummary={diffSummary}
        onConfirm={handleConfirmRestore}
        onCancel={cancelRestore}
      />
    </>
  );
}
