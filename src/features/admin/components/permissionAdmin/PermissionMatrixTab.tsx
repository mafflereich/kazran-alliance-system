import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { ACCESS_ROLES_V2, PERMISSIONS, type AccessRoleV2 } from '@/shared/lib/permissions';
import { DOMAIN_LABELS, permissionLabel, type GrantMap } from './shared';

export default function PermissionMatrixTab() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const { showToast } = useAppContext();
  const isZh = i18n.language.startsWith('zh');

  const [grants, setGrants] = useState<GrantMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 合併佇列：連續點擊只送 1 次 bulk upsert + 每個角色 1 次 in() delete。
  // 以「最後意圖」為準；若連點回到原狀（enabled === initial）就不送。
  const pendingRef = useRef(
    new Map<string, { permission: string; role: AccessRoleV2; enabled: boolean; initial: boolean }>(),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('role_grants').select('role, permission, scope');
      if (error) throw error;
      const next: GrantMap = {};
      (data || []).forEach((row: any) => {
        const role = row.role as AccessRoleV2;
        next[row.permission] = { ...(next[row.permission] || {}), [role]: row.scope };
      });
      setGrants(next);
    } catch (error: any) {
      showToast(t('permissions.load_failed', '無法讀取權限設定') + `: ${error?.message ?? ''}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  const flush = useCallback(async () => {
    if (!supabase) return;
    const pending = [...pendingRef.current.values()];
    pendingRef.current.clear();
    if (pending.length === 0) return;

    const toAdd = pending.filter(p => p.enabled);
    const toRemove = pending.filter(p => !p.enabled);
    setSaving(true);
    try {
      if (toAdd.length > 0) {
        const rows = toAdd.map(p => ({
          role: p.role,
          permission: p.permission,
          scope: p.role === 'officer' ? 'managed' : 'global',
        }));
        const { error } = await supabase
          .from('role_grants')
          .upsert(rows, { onConflict: 'role,permission' });
        if (error) throw error;
      }

      for (const role of ACCESS_ROLES_V2) {
        const permissions = toRemove.filter(p => p.role === role).map(p => p.permission);
        if (permissions.length === 0) continue;
        const { error } = await supabase
          .from('role_grants')
          .delete()
          .eq('role', role)
          .in('permission', permissions);
        if (error) throw error;
      }
    } catch (error: any) {
      showToast(t('permissions.save_failed', '儲存失敗') + `: ${error?.message ?? ''}`, 'error');
      await load();
    } finally {
      setSaving(false);
    }
  }, [load, showToast, t]);
  flushRef.current = flush;

  useEffect(() => {
    void load();
  }, [load]);

  // 離開分頁時把還沒送出的變更送掉
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void flushRef.current();
  }, []);

  const toggle = (permission: string, role: AccessRoleV2) => {
    const enabled = !grants[permission]?.[role];
    const key = `${permission}:${role}`;
    const existing = pendingRef.current.get(key);
    const initial = existing ? existing.initial : !!grants[permission]?.[role];

    // 樂觀更新畫面
    setGrants(prev => {
      const row = { ...(prev[permission] || {}) };
      if (enabled) row[role] = role === 'officer' ? 'managed' : 'global';
      else delete row[role];
      return { ...prev, [permission]: row };
    });

    if (enabled === initial) pendingRef.current.delete(key);
    else pendingRef.current.set(key, { permission, role, enabled, initial });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), 500);
  };

  const grouped = useMemo(() => {
    const domains = [...new Set(PERMISSIONS.map(p => p.domain))];
    return domains.map(domain => ({ domain, items: PERMISSIONS.filter(p => p.domain === domain) }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {t(
            'permissions.matrix_hint',
            '勾選 = 該角色擁有此能力；officer 一律只在自己管理的公會生效；admin 一律放行。',
          )}
          {saving && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('common.saving', '儲存中')}
            </span>
          )}
        </p>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 text-xs font-bold hover:bg-stone-200 dark:hover:bg-stone-600"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('common.refresh', '重新整理')}
        </button>
      </div>

      {grouped.map(({ domain, items }) => (
        <section
          key={domain}
          className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden"
        >
          <div className="px-4 py-2 bg-stone-50 dark:bg-stone-700/50 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-300">
            {DOMAIN_LABELS[domain]?.[isZh ? 'zh' : 'en'] ?? domain}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-stone-500 dark:text-stone-400 text-xs">
                <th className="text-left px-4 py-2 font-medium">{t('permissions.col_permission', '權限')}</th>
                {ACCESS_ROLES_V2.map(role => (
                  <th key={role} className="px-3 py-2 font-medium w-24">
                    {role}
                    {role === 'officer' && (
                      <span className="block text-[10px] font-normal opacity-70">
                        {t('permissions.officer_scope', '僅自己公會')}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const row = grants[item.key] || {};
                return (
                  <tr key={item.key} className="border-t border-stone-100 dark:border-stone-700">
                    <td className="px-4 py-2">
                      <div className="font-medium text-stone-700 dark:text-stone-200">
                        {permissionLabel(item.key, isZh)}
                      </div>
                      <div className="text-[11px] font-mono text-stone-400 dark:text-stone-500">{item.key}</div>
                    </td>
                    {ACCESS_ROLES_V2.map(role => {
                      const locked = role === 'admin';
                      const checked = locked || !!row[role];
                      return (
                        <td key={role} className="px-3 py-2 text-center">
                          <button
                            type="button"
                            disabled={locked || saving}
                            onClick={() => toggle(item.key, role)}
                            aria-pressed={checked}
                            title={locked ? t('permissions.admin_locked', 'admin 一律放行，不需設定') : item.key}
                            className={`w-7 h-7 rounded-lg border inline-flex items-center justify-center transition-all ${
                              checked
                                ? locked
                                  ? 'bg-stone-200 dark:bg-stone-600 border-stone-300 dark:border-stone-500 text-stone-500 dark:text-stone-300 cursor-not-allowed'
                                  : 'bg-amber-600 border-amber-600 text-white'
                                : 'border-stone-300 dark:border-stone-600 hover:border-amber-500'
                            }`}
                          >
                            {checked ? <Check className="w-4 h-4" /> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

