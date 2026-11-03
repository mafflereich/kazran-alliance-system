import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { PERMISSIONS } from '@/shared/lib/permissions';
import type { ProfileRow, UserGrantRow } from './shared';

export default function PermissionOverridesTab() {
  const { t } = useTranslation(['admin', 'translation']);
  const { showToast } = useAppContext();

  const [rows, setRows] = useState<UserGrantRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    authId: string;
    permission: string;
    effect: 'allow' | 'deny';
    guildId: string;
    expiresAt: string;
  }>({
    authId: '',
    permission: PERMISSIONS[0].key,
    effect: 'allow',
    guildId: '',
    expiresAt: '',
  });

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [grants, profs] = await Promise.all([
        supabase.from('user_grants').select('*').order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('auth_id, display_name, user_role')
          .not('auth_id', 'is', null)
          .order('display_name'),
      ]);
      setRows((grants.data as UserGrantRow[]) || []);
      setProfiles((profs.data as ProfileRow[]) || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = (authId: string) =>
    profiles.find(p => p.auth_id === authId)?.display_name || authId.slice(0, 8);

  const add = async () => {
    if (!supabase || !form.authId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('user_grants').insert({
        user_auth_id: form.authId,
        permission: form.permission,
        effect: form.effect,
        guild_id: form.guildId || null,
        expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      if (error) throw error;
      showToast(t('common.update_success'), 'success');
      setForm(prev => ({ ...prev, guildId: '', expiresAt: '' }));
      await load();
    } catch (error: any) {
      showToast(t('permissions.save_failed', '儲存失敗') + `: ${error?.message ?? ''}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('user_grants').delete().eq('id', id);
    if (error) {
      showToast(t('permissions.save_failed', '儲存失敗'), 'error');
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const inputClass =
    'w-full px-2 py-1.5 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100';

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {t('permissions.overrides_hint', '例外授權：deny 優先於 allow；留空公會 = 全站；可設定到期時間。')}
      </p>

      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4 grid gap-3 md:grid-cols-5">
        <select
          className={inputClass}
          value={form.authId}
          onChange={e => setForm(prev => ({ ...prev, authId: e.target.value }))}
        >
          <option value="">{t('permissions.pick_user', '選擇使用者')}</option>
          {profiles.map(p => (
            <option key={p.auth_id} value={p.auth_id}>
              {p.display_name || p.auth_id.slice(0, 8)}（{p.user_role || '-'}）
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={form.permission}
          onChange={e => setForm(prev => ({ ...prev, permission: e.target.value }))}
        >
          {PERMISSIONS.map(p => (
            <option key={p.key} value={p.key}>
              {p.key}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={form.effect}
          onChange={e => setForm(prev => ({ ...prev, effect: e.target.value as 'allow' | 'deny' }))}
        >
          <option value="allow">allow</option>
          <option value="deny">deny</option>
        </select>
        <input
          className={inputClass}
          placeholder={t('permissions.guild_optional', '公會 ID（選填）')}
          value={form.guildId}
          onChange={e => setForm(prev => ({ ...prev, guildId: e.target.value }))}
        />
        <input
          type="datetime-local"
          className={inputClass}
          value={form.expiresAt}
          onChange={e => setForm(prev => ({ ...prev, expiresAt: e.target.value }))}
        />
        <button
          onClick={() => void add()}
          disabled={saving || !form.authId}
          className="md:col-span-5 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t('permissions.add_override', '新增例外')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t('permissions.no_overrides', '目前沒有例外授權')}
        </p>
      ) : (
        <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-stone-500 dark:text-stone-400 text-xs">
                <th className="text-left px-4 py-2 font-medium">{t('permissions.col_user', '使用者')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('permissions.col_permission', '權限')}</th>
                <th className="px-3 py-2 font-medium">effect</th>
                <th className="text-left px-3 py-2 font-medium">{t('permissions.col_scope', '範圍')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('permissions.col_expires', '到期')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-t border-stone-100 dark:border-stone-700">
                  <td className="px-4 py-2">{displayName(row.user_auth_id)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{row.permission}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        row.effect === 'allow'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      }`}
                    >
                      {row.effect}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.guild_id || 'global'}</td>
                  <td className="px-3 py-2 text-xs">{row.expires_at ? row.expires_at.slice(0, 10) : '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => void remove(row.id)}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
