import React from 'react';
import { AlertCircle, Check, Database, Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TableDiffSummary } from '../hooks/useRestoreDiff';

interface RestorePreviewModalProps {
  isOpen: boolean;
  isRestoring: boolean;
  diffSummary: TableDiffSummary[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function RestorePreviewModal({
  isOpen,
  isRestoring,
  diffSummary,
  onConfirm,
  onCancel
}: RestorePreviewModalProps) {
  const { t } = useTranslation(['admin', 'translation']);

  if (!isOpen) return null;

  const totalChanges = diffSummary.reduce((acc, curr) => acc + curr.addCount + curr.updateCount + curr.deleteCount, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-stone-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-6 border-b border-stone-200 dark:border-stone-700 flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full text-amber-600">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-200">
              {t('backup.restore_preview', 'Restore Preview')}
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('backup.restore_preview_desc', 'Please review the changes before executing the restore.')}
            </p>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {diffSummary.length === 0 ? (
            <div className="text-center text-stone-500 py-8">
              {t('backup.no_tables_found', 'No valid tables found in the backup file.')}
            </div>
          ) : totalChanges === 0 ? (
            <div className="text-center text-stone-500 py-8 flex flex-col items-center gap-2">
              <Check className="w-12 h-12 text-emerald-500 mb-2" />
              <p className="text-lg font-medium text-stone-800 dark:text-stone-200">
                {t('backup.no_changes_needed', 'No changes needed.')}
              </p>
              <p className="text-sm">
                {t('backup.no_changes_desc', 'The database is already identical to the backup file.')}
              </p>
            </div>
          ) : (
            diffSummary.map((table) => {
              const hasChanges = table.addCount > 0 || table.updateCount > 0 || table.deleteCount > 0;
              if (!hasChanges) return null;

              return (
                <div key={table.tableName} className="bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-700 p-4">
                  <h3 className="text-lg font-bold text-stone-800 dark:text-stone-200 mb-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-stone-400" />
                    {table.tableName}
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-lg">
                      <Plus className="w-4 h-4" />
                      <span className="font-medium">{t('common.add', 'Add')}: {table.addCount}</span>
                    </div>
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
                      <Edit2 className="w-4 h-4" />
                      <span className="font-medium">{t('common.edit', 'Edit')}: {table.updateCount}</span>
                    </div>
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                      <span className="font-medium">{t('common.delete', 'Delete')}: {table.deleteCount}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          
          {totalChanges > 0 && (
            <div className="mt-6 bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-400 dark:border-amber-600 p-4 rounded-r-lg">
              <div className="flex">
                <div className="py-1"><AlertCircle className="h-5 w-5 text-amber-500 mr-3" /></div>
                <div>
                  <p className="font-bold text-amber-800 dark:text-amber-200">{t('backup.important_notice')}</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t('backup.restore_warning')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-stone-200 dark:border-stone-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isRestoring}
            className="px-6 py-2 rounded-xl font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isRestoring || totalChanges === 0}
            className="px-6 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isRestoring ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.processing')}
              </>
            ) : (
              t('backup.confirm_and_execute', 'Confirm & Execute')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
