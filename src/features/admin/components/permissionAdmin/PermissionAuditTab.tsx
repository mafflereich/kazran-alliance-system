import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { permissionLabel, roleLabel, type AuditRow } from './shared';

interface AuditDetails {
  table?: string;
  op?: string;
  old?: Record<string, any> | null;
  new?: Record<string, any> | null;
}

interface ActorProfile {
  auth_id: string;
  display_name: string | null;
  discord_username: string | null;
  user_role: string | null;
}

const OP_LABELS: Record<string, { zh: string; en: string }> = {
  INSERT: { zh: '新增', en: 'Added' },
  UPDATE: { zh: '更新', en: 'Updated' },
  DELETE: { zh: '移除', en: 'Removed' },
};

/** system_logs.details 的欄位 → 人看得懂的名稱 */
const FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  role: { zh: '角色', en: 'Role' },
  permission: { zh: '權限', en: 'Permission' },
  scope: { zh: '允許範圍', en: 'Scope' },
  guild_id: { zh: '公會', en: 'Guild' },
  effect: { zh: '效果', en: 'Effect' },
  user_auth_id: { zh: '授權對象', en: 'Grantee' },
  expires_at: { zh: '到期時間', en: 'Expires' },
  reason: { zh: '原因', en: 'Reason' },
};

/** UPDATE 時不用顯示的欄位（沒有意義或永遠不變） */
const IGNORED_FIELDS = new Set(['id', 'created_at', 'updated_at']);

interface FormatContext {
  isZh: boolean;
  guildName: (guildId: string) => string;
  accountName: (authId: string) => string;
}

const fieldLabel = (key: string, isZh: boolean): string =>
  FIELD_LABELS[key] ? (isZh ? FIELD_LABELS[key].zh : FIELD_LABELS[key].en) : key;

const scopeText = (scope: string | null | undefined, isZh: boolean): string => {
  if (scope === 'managed') return isZh ? '只在自己管理的公會' : 'Managed guilds only';
  if (scope === 'global') return isZh ? '全站' : 'Global';
  return scope ?? '—';
};

const effectText = (effect: string | null | undefined, isZh: boolean): string => {
  if (effect === 'allow') return isZh ? '允許' : 'Allow';
  if (effect === 'deny') return isZh ? '拒絕' : 'Deny';
  return effect ?? '—';
};

/** 把單一欄位的值轉成人看得懂的字 */
const formatFieldValue = (key: string, value: unknown, ctx: FormatContext): string => {
  const { isZh } = ctx;

  if (value === null || value === undefined || value === '') {
    if (key === 'guild_id') return isZh ? '全站（所有公會）' : 'Global (all guilds)';
    if (key === 'expires_at') return isZh ? '永久' : 'Never';
    return '—';
  }

  switch (key) {
    case 'role':
      return roleLabel(String(value), isZh);
    case 'permission':
      return `${permissionLabel(String(value), isZh)}（${value}）`;
    case 'scope':
      return scopeText(String(value), isZh);
    case 'effect':
      return effectText(String(value), isZh);
    case 'guild_id':
      return ctx.guildName(String(value));
    case 'user_auth_id':
      return ctx.accountName(String(value));
    case 'expires_at': {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }
    default:
      return String(value);
  }
};

/** 一列變更的「人話標題＋摘要」 */
const describeChange = (
  details: AuditDetails,
  ctx: FormatContext,
  fallbackMessage?: string | null,
): { title: string; summary: string; raw: AuditDetails } => {
  const { isZh } = ctx;
  const before = details.old ?? null;
  const after = details.new ?? null;
  const record = (details.op === 'DELETE' ? before : after) ?? {};
  const opLabel = OP_LABELS[details.op ?? ''] ? (isZh ? OP_LABELS[details.op!].zh : OP_LABELS[details.op!].en) : details.op ?? '';

  if (details.table === 'role_grants') {
    const title = `${isZh ? '角色權限' : 'Role grant'}｜${roleLabel(record.role, isZh)} → ${permissionLabel(
      record.permission,
      isZh,
    )}`;

    const parts = [opLabel];
    if (details.op === 'UPDATE' && before && after && before.scope !== after.scope) {
      parts.push(
        `${isZh ? '允許範圍' : 'Scope'}：${scopeText(before.scope, isZh)} → ${scopeText(after.scope, isZh)}`,
      );
    } else if (details.op !== 'UPDATE') {
      parts.push(`${isZh ? '允許範圍' : 'Scope'}：${scopeText(record.scope, isZh)}`);
    }

    return { title, summary: parts.filter(Boolean).join(' · '), raw: details };
  }

  if (details.table === 'user_grants') {
    const title = `${isZh ? '例外授權' : 'Override'}｜${ctx.accountName(record.user_auth_id ?? '')} → ${permissionLabel(
      record.permission,
      isZh,
    )}`;

    const parts = [opLabel, effectText(record.effect, isZh)];
    parts.push(`${isZh ? '範圍' : 'Scope'}：${record.guild_id ? ctx.guildName(record.guild_id) : isZh ? '全站' : 'Global'}`);
    if (record.expires_at) {
      const date = new Date(record.expires_at);
      parts.push(
        `${isZh ? '到期' : 'Expires'}：${Number.isNaN(date.getTime()) ? record.expires_at : date.toLocaleString()}`,
      );
    }
    if (record.reason) parts.push(`${isZh ? '原因' : 'Reason'}：${record.reason}`);

    return { title, summary: parts.filter(Boolean).join(' · '), raw: details };
  }

  return {
    title: details.table ?? fallbackMessage ?? (isZh ? '未知變更' : 'Unknown change'),
    summary: opLabel,
    raw: details,
  };
};

/** 展開後要顯示的欄位差異（UPDATE 只列真正改變的欄位） */
const diffFields = (details: AuditDetails): string[] => {
  const before = details.old ?? {};
  const after = details.new ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  return Array.from(keys)
    .filter(key => !IGNORED_FIELDS.has(key))
    .filter(key => {
      if (details.op !== 'UPDATE') return true;
      return JSON.stringify(before[key]) !== JSON.stringify(after[key]);
    });
};


export default function PermissionAuditTab() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const isZh = i18n.language.startsWith('zh');
  const { db, showToast } = useAppContext();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [accounts, setAccounts] = useState<Record<string, ActorProfile>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const run = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from('system_logs')
        .select('created_at, level, message, action, user_id, details')
        .eq('source', 'permissions')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Failed to load permission audit logs:', error);
        showToast(t('permissions.load_failed', '無法讀取權限設定'), 'error');
        setLoading(false);
        return;
      }

      const list = (data as AuditRow[]) || [];
      setRows(list);

      // 操作者與被授權者都是 auth uuid，這裡一次查出顯示名稱
      const ids = new Set<string>();
      list.forEach(row => {
        if (row.user_id) ids.add(row.user_id);
        const details = (row.details || {}) as AuditDetails;
        const record = (details.op === 'DELETE' ? details.old : details.new) ?? {};
        if (details.table === 'user_grants' && record.user_auth_id) ids.add(String(record.user_auth_id));
      });

      if (ids.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('auth_id, display_name, discord_username, user_role')
          .in('auth_id', Array.from(ids));

        const map: Record<string, ActorProfile> = {};
        ((profiles as ActorProfile[]) || []).forEach(profile => {
          if (profile.auth_id) map[profile.auth_id] = profile;
        });
        setAccounts(map);
      }

      setLoading(false);
    };

    void run();
  }, []);

  const accountName = (authId: string | null | undefined): string => {
    if (!authId) return '—';
    const profile = accounts[authId];
    if (!profile) return authId.slice(0, 8);
    return (
      profile.display_name ||
      (profile.discord_username ? `@${profile.discord_username}` : '') ||
      authId.slice(0, 8)
    );
  };

  const formatContext: FormatContext = useMemo(
    () => ({
      isZh,
      guildName: (guildId: string) => db.guilds[guildId]?.name ?? guildId,
      accountName,
    }),
    [isZh, db.guilds, accounts],
  );

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

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleRaw = (key: string) => setShowRaw(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {t(
          'permissions.audit_hint',
          '只記錄「由使用者操作」造成的 role_grants / user_grants 變更（最近 50 筆）；點右側箭頭可看完整的前後差異。',
        )}
      </p>
      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-stone-500 dark:text-stone-400 text-xs">
              <th className="text-left px-4 py-2 font-medium">{t('permissions.col_time', '時間')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('permissions.col_change', '變更')}</th>
              <th className="text-left px-4 py-2 font-medium">{t('permissions.col_actor', '操作者')}</th>
              <th className="px-2 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = `${row.created_at}-${index}`;
              const details = (row.details || {}) as AuditDetails;
              const change = describeChange(details, formatContext, row.message);
              const fields = diffFields(details);
              const actor = row.user_id ? accounts[row.user_id] : null;
              const isExpanded = !!expanded[key];

              return (
                <Fragment key={key}>
                  <tr className="border-t border-stone-100 dark:border-stone-700 align-top">
                    <td className="px-4 py-2 text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-stone-800 dark:text-stone-100 break-words">
                        {change.title}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 break-words">
                        {change.summary}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <div className="text-stone-700 dark:text-stone-200">
                        {actor ? accountName(actor.auth_id) : '—'}
                      </div>
                      <div className="text-[11px] text-stone-400 dark:text-stone-500">
                        {actor
                          ? roleLabel(actor.user_role, isZh)
                          : row.user_id
                            ? row.user_id.slice(0, 8)
                            : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={isExpanded}
                        aria-label={isZh ? '展開變更內容' : 'Show details'}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-stone-50 dark:bg-stone-900/40">
                      <td colSpan={4} className="px-4 py-3">
                        {fields.length === 0 ? (
                          <p className="text-xs text-stone-500 dark:text-stone-400">
                            {isZh ? '這次操作沒有欄位差異。' : 'No field changes in this entry.'}
                          </p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-stone-500 dark:text-stone-400">
                                <th className="text-left py-1 pr-3 font-medium w-32">
                                  {isZh ? '欄位' : 'Field'}
                                </th>
                                <th className="text-left py-1 pr-3 font-medium">
                                  {isZh ? '變更前' : 'Before'}
                                </th>
                                <th className="text-left py-1 font-medium">{isZh ? '變更後' : 'After'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fields.map(field => (
                                <tr key={field} className="border-t border-stone-200 dark:border-stone-700">
                                  <td className="py-1 pr-3 text-stone-600 dark:text-stone-300">
                                    {fieldLabel(field, isZh)}
                                  </td>
                                  <td className="py-1 pr-3 text-stone-500 dark:text-stone-400 break-words">
                                    {details.op === 'INSERT'
                                      ? '—'
                                      : formatFieldValue(field, details.old?.[field], formatContext)}
                                  </td>
                                  <td className="py-1 text-stone-800 dark:text-stone-100 break-words">
                                    {details.op === 'DELETE'
                                      ? '—'
                                      : formatFieldValue(field, details.new?.[field], formatContext)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleRaw(key)}
                          className="mt-2 text-[11px] text-stone-500 dark:text-stone-400 underline decoration-dotted hover:text-amber-600 dark:hover:text-amber-400"
                        >
                          {showRaw[key]
                            ? isZh
                              ? '收起原始紀錄'
                              : 'Hide raw entry'
                            : isZh
                              ? '顯示原始紀錄（JSON）'
                              : 'Show raw entry (JSON)'}
                        </button>

                        {showRaw[key] && (
                          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-stone-900 text-stone-100 text-[11px] leading-relaxed p-3 whitespace-pre-wrap break-all">
                            {JSON.stringify(details, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

