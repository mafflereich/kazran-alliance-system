import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/shared/api/supabase';
import type { AuditRow } from './shared';

export default function PermissionAuditTab() {
  const { t } = useTranslation(['admin', 'translation']);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('system_logs')
        .select('created_at, level, message, user_id, details')
        .eq('source', 'permissions')
        .order('created_at', { ascending: false })
        .limit(50);
      setRows((data as AuditRow[]) || []);
      setLoading(false);
    };
    void run();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-stone-500 dark:text-stone-400">
        {t('permissions.no_audit', '目前沒有權限變更紀錄。')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {t('permissions.audit_hint', '只記錄「由使用者操作」造成的 role_grants / user_grants 變更（最近 50 筆）。')}
      </p>
      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-stone-500 dark:text-stone-400 text-xs">
              <th className="text-left px-4 py-2 font-medium">{t('permissions.col_time', '時間')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('permissions.col_change', '變更')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('permissions.col_actor', '操作者')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.created_at}-${index}`} className="border-t border-stone-100 dark:border-stone-700">
                <td className="px-4 py-2 text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <div className="text-stone-700 dark:text-stone-200">{row.message}</div>
                  <div className="text-[11px] font-mono text-stone-400 dark:text-stone-500 truncate max-w-[520px]">
                    {JSON.stringify(row.details)}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs font-mono text-stone-500 dark:text-stone-400">
                  {row.user_id ? row.user_id.slice(0, 8) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
