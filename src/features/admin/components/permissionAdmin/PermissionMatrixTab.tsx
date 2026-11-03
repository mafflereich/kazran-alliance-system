import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronRight, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import {
  ACCESS_ROLES_V2,
  PERMISSION_ACCESS_LABELS,
  PERMISSION_DOMAIN_LABELS,
  PERMISSION_DOMAIN_ORDER,
  PERMISSION_ENFORCEMENT_LABELS,
  PERMISSIONS,
  type AccessRoleV2,
  type PermissionAccess,
  type PermissionDefinition,
  type PermissionDomain,
} from '@/shared/lib/permissions';
import { permissionDescription, permissionLabel, roleLabel, type GrantMap } from './shared';

type AccessFilter = 'all' | PermissionAccess;
type DomainFilter = 'all' | PermissionDomain;
type WiredFilter = 'all' | 'wired' | 'unwired';

const BADGE = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold leading-4';
const ACCESS_BADGE: Record<PermissionAccess, string> = {
  read: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  write: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

/**
 * 權限總表（單一控制面）。
 *
 * 設計重點：
 *   - 一律以 src/shared/lib/permissions.ts 為唯一來源（不得在 UI 另寫權限清單）。
 *   - 「讀取」與「操作」分開顯示，不放在同一列混淆。
 *   - 可用中文／英文／key／功能說明搜尋，並用分類、讀寫、接線狀態篩選。
 *   - 每一列都直接寫出實際功能與「目前由哪裡檢查」，避免勾了不知道效果。
 */
export default function PermissionMatrixTab() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const { showToast } = useAppContext();
  const isZh = i18n.language.startsWith('zh');

  const [grants, setGrants] = useState<GrantMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [wiredFilter, setWiredFilter] = useState<WiredFilter>('all');
  const [onlyGranted, setOnlyGranted] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return PERMISSIONS.filter(permission => {
      if (domainFilter !== 'all' && permission.domain !== domainFilter) return false;
      if (accessFilter !== 'all' && permission.access !== accessFilter) return false;

      const wired = permission.enforcedBy.length > 0;
      if (wiredFilter === 'wired' && !wired) return false;
      if (wiredFilter === 'unwired' && wired) return false;

      if (onlyGranted && Object.keys(grants[permission.key] || {}).length === 0) return false;

      if (!normalizedQuery) return true;
      const domainLabel = PERMISSION_DOMAIN_LABELS[permission.domain];
      const accessLabel = PERMISSION_ACCESS_LABELS[permission.access];
      const haystack = [
        permission.key,
        permission.label.zh,
        permission.label.en,
        permission.description.zh,
        permission.description.en,
        domainLabel.zh,
        domainLabel.en,
        accessLabel.zh,
        accessLabel.en,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [accessFilter, domainFilter, grants, normalizedQuery, onlyGranted, wiredFilter]);

  const groups = useMemo(
    () =>
      PERMISSION_DOMAIN_ORDER.map(domain => {
        const items = filtered.filter(permission => permission.domain === domain);
        return {
          domain,
          read: items.filter(permission => permission.access === 'read'),
          write: items.filter(permission => permission.access === 'write'),
          total: items.length,
        };
      }).filter(group => group.total > 0),
    [filtered],
  );

  const wiredCount = useMemo(
    () => PERMISSIONS.filter(permission => permission.enforcedBy.length > 0).length,
    [],
  );

  const toggleCollapse = (domain: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const resetFilters = () => {
    setQuery('');
    setDomainFilter('all');
    setAccessFilter('all');
    setWiredFilter('all');
    setOnlyGranted(false);
  };

  const hasFilters =
    query.trim() !== '' ||
    domainFilter !== 'all' ||
    accessFilter !== 'all' ||
    wiredFilter !== 'all' ||
    onlyGranted;


  const renderRow = (permission: PermissionDefinition) => {
    const row = grants[permission.key] || {};
    const wired = permission.enforcedBy.length > 0;

    return (
      <tr key={permission.key} className="border-t border-stone-100 align-top dark:border-stone-700">
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-stone-700 dark:text-stone-200">
              {permissionLabel(permission.key, isZh)}
            </span>
            <span className={`${BADGE} ${ACCESS_BADGE[permission.access]}`}>
              {PERMISSION_ACCESS_LABELS[permission.access][isZh ? 'zh' : 'en']}
            </span>
            {permission.needsGuild && (
              <span
                className={`${BADGE} border-stone-200 bg-stone-100 text-stone-600 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300`}
                title={t('permissions.needs_guild_hint', 'managed 授權只在自己管理的公會生效')}
              >
                {t('permissions.needs_guild', '需指定公會')}
              </span>
            )}
            {wired ? (
              permission.enforcedBy.map(source => (
                <span
                  key={source}
                  className={`${BADGE} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300`}
                >
                  {PERMISSION_ENFORCEMENT_LABELS[source][isZh ? 'zh' : 'en']}
                </span>
              ))
            ) : (
              <span
                className={`${BADGE} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300`}
                title={t(
                  'permissions.not_wired_hint',
                  '目前沒有任何畫面或資料庫檢查讀取這個權限，切換後不會改變行為。',
                )}
              >
                {PERMISSION_ENFORCEMENT_LABELS.none[isZh ? 'zh' : 'en']}
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-stone-400 dark:text-stone-500">
            {permission.key}
          </div>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            {permissionDescription(permission.key, isZh)}
          </p>
        </td>
        {ACCESS_ROLES_V2.map(role => {
          const locked = role === 'admin';
          const checked = locked || !!row[role];
          return (
            <td key={role} className="px-3 py-3 text-center">
              <button
                type="button"
                disabled={locked || saving}
                onClick={() => toggle(permission.key, role)}
                aria-pressed={checked}
                aria-label={`${permission.key} · ${role}`}
                title={locked ? t('permissions.admin_locked', 'admin 一律放行，不需設定') : permission.key}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                  checked
                    ? locked
                      ? 'cursor-not-allowed border-stone-300 bg-stone-200 text-stone-500 dark:border-stone-500 dark:bg-stone-600 dark:text-stone-300'
                      : 'border-amber-600 bg-amber-600 text-white'
                    : 'border-stone-300 hover:border-amber-500 dark:border-stone-600'
                }`}
              >
                {checked ? <Check className="h-4 w-4" /> : null}
              </button>
              {role === 'officer' && row.officer && (
                <span className="mt-0.5 block text-[10px] font-bold text-stone-400 dark:text-stone-500">
                  {row.officer === 'managed'
                    ? t('permissions.scope_managed', '自己公會')
                    : t('permissions.scope_global', '全站')}
                </span>
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }


  const SELECT_CLASS =
    'rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {t('permissions.stat_total', '全部')} {PERMISSIONS.length}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
            {PERMISSION_ACCESS_LABELS.read[isZh ? 'zh' : 'en']}{' '}
            {PERMISSIONS.filter(permission => permission.access === 'read').length}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {PERMISSION_ACCESS_LABELS.write[isZh ? 'zh' : 'en']}{' '}
            {PERMISSIONS.filter(permission => permission.access === 'write').length}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            {t('permissions.stat_wired', '已接線')} {wiredCount}
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
            {t('permissions.stat_unwired', '尚未接線')} {PERMISSIONS.length - wiredCount}
          </span>
          {saving && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('common.saving', '儲存中')}
            </span>
          )}
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('common.refresh', '重新整理')}
        </button>
      </div>

      <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t(
                'permissions.search_placeholder',
                '搜尋權限：中文名稱、英文、key 或功能說明（例：賽季、簽到、mailbox）',
              )}
              className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-9 text-sm text-stone-700 placeholder:text-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('common.clear', '清除')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>


          <select
            value={domainFilter}
            onChange={event => setDomainFilter(event.target.value as DomainFilter)}
            aria-label={t('permissions.filter_domain', '分類')}
            className={SELECT_CLASS}
          >
            <option value="all">{t('permissions.filter_all_domains', '全部分類')}</option>
            {PERMISSION_DOMAIN_ORDER.map(domain => (
              <option key={domain} value={domain}>
                {PERMISSION_DOMAIN_LABELS[domain][isZh ? 'zh' : 'en']}
              </option>
            ))}
          </select>

          <select
            value={accessFilter}
            onChange={event => setAccessFilter(event.target.value as AccessFilter)}
            aria-label={t('permissions.filter_access', '讀取／操作')}
            className={SELECT_CLASS}
          >
            <option value="all">{t('permissions.filter_all_access', '讀取＋操作')}</option>
            <option value="read">{PERMISSION_ACCESS_LABELS.read[isZh ? 'zh' : 'en']}</option>
            <option value="write">{PERMISSION_ACCESS_LABELS.write[isZh ? 'zh' : 'en']}</option>
          </select>

          <select
            value={wiredFilter}
            onChange={event => setWiredFilter(event.target.value as WiredFilter)}
            aria-label={t('permissions.filter_status', '接線狀態')}
            className={SELECT_CLASS}
          >
            <option value="all">{t('permissions.filter_all_status', '全部狀態')}</option>
            <option value="wired">{t('permissions.stat_wired', '已接線')}</option>
            <option value="unwired">{t('permissions.stat_unwired', '尚未接線')}</option>
          </select>

          <button
            type="button"
            onClick={() => setOnlyGranted(prev => !prev)}
            aria-pressed={onlyGranted}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
              onlyGranted
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-stone-300 text-stone-600 hover:border-amber-500 dark:border-stone-600 dark:text-stone-300'
            }`}
          >
            {t('permissions.only_granted', '只看已開啟')}
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg px-2 py-2 text-xs font-bold text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            >
              {t('permissions.clear_filters', '清除篩選')}
            </button>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
          {t('permissions.matrix_hint', '勾選 = 該角色擁有此能力；admin 一律放行。實際生效範圍與檢查點請看每一列的說明與標籤。')}{' '}
          {t('permissions.showing', '顯示')} {filtered.length} / {PERMISSIONS.length}
        </p>
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-600 dark:text-stone-400">
          {t('permissions.no_match', '沒有符合條件的權限。')}
          <button
            type="button"
            onClick={resetFilters}
            className="ml-2 font-bold text-amber-600 hover:underline dark:text-amber-400"
          >
            {t('permissions.clear_filters', '清除篩選')}
          </button>
        </div>
      )}


      {groups.map(group => {
        const isCollapsed = collapsed.has(group.domain);
        return (
          <section
            key={group.domain}
            className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800"
          >
            <button
              type="button"
              onClick={() => toggleCollapse(group.domain)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center justify-between gap-2 bg-stone-50 px-4 py-2.5 text-left dark:bg-stone-700/50"
            >
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-300">
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {PERMISSION_DOMAIN_LABELS[group.domain][isZh ? 'zh' : 'en']}
              </span>
              <span className="text-[11px] font-bold text-stone-400 dark:text-stone-400">
                {group.read.length} {PERMISSION_ACCESS_LABELS.read[isZh ? 'zh' : 'en']} ·{' '}
                {group.write.length} {PERMISSION_ACCESS_LABELS.write[isZh ? 'zh' : 'en']}
              </span>
            </button>

            {!isCollapsed && (
              <div>
                {(['read', 'write'] as const).map(access => {
                  const items = access === 'read' ? group.read : group.write;
                  if (items.length === 0) return null;
                  return (
                    <div key={access}>
                      <div className="flex items-center gap-2 border-t border-stone-100 bg-white px-4 py-2 dark:border-stone-700 dark:bg-stone-800">
                        <span className={`${BADGE} ${ACCESS_BADGE[access]}`}>
                          {PERMISSION_ACCESS_LABELS[access][isZh ? 'zh' : 'en']}
                        </span>
                        <span className="text-xs text-stone-500 dark:text-stone-400">
                          {access === 'read'
                            ? t('permissions.read_hint', '看得到：只影響檢視與能否進入頁面')
                            : t('permissions.write_hint', '改得動：會實際寫入資料或執行操作')}
                        </span>
                        <span className="ml-auto text-[11px] font-bold text-stone-400">{items.length}</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-stone-500 dark:text-stone-400">
                            <th className="px-4 py-2 text-left font-medium">
                              {t('permissions.col_permission', '權限／實際功能')}
                            </th>
                            {ACCESS_ROLES_V2.map(role => (
                              <th key={role} className="w-24 px-3 py-2 font-medium">
                                {roleLabel(role, isZh)}
                                <span className="block font-mono text-[10px] font-normal opacity-70">{role}</span>
                                {role === 'officer' && (
                                  <span className="block font-mono text-[10px] font-normal opacity-70">
                                    managed / global
                                  </span>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>{items.map(renderRow)}</tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}


      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
        <span>
          <span className={`${BADGE} ${ACCESS_BADGE.read}`}>{PERMISSION_ACCESS_LABELS.read[isZh ? 'zh' : 'en']}</span>{' '}
          {t('permissions.legend_read', '只影響看得到什麼，不代表能修改。')}
        </span>
        <span>
          <span className={`${BADGE} ${ACCESS_BADGE.write}`}>{PERMISSION_ACCESS_LABELS.write[isZh ? 'zh' : 'en']}</span>{' '}
          {t('permissions.legend_write', '會實際寫入資料或執行操作。')}
        </span>
        <span>
          <span className={`${BADGE} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300`}>
            {PERMISSION_ENFORCEMENT_LABELS.frontend[isZh ? 'zh' : 'en']}
          </span>
          {t('permissions.legend_frontend', '畫面或路由會擋。')}
        </span>
        <span>
          <span className={`${BADGE} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300`}>
            {PERMISSION_ENFORCEMENT_LABELS.database[isZh ? 'zh' : 'en']}
          </span>
          {t('permissions.legend_database', '資料庫 RLS／RPC 會擋。')}
        </span>
        <span>
          <span className={`${BADGE} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300`}>
            {PERMISSION_ENFORCEMENT_LABELS.none[isZh ? 'zh' : 'en']}
          </span>
          {t('permissions.legend_none', '目前切換不會改變行為（待接線）。')}
        </span>
      </div>
    </div>
  );
}

