import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import type { MyAccess } from '@/shared/lib/permissions';
import { permissionLabel, type ProfileRow } from './shared';

export default function PermissionPreviewTab() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const { showToast } = useAppContext();
  const isZh = i18n.language.startsWith('zh');

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [authId, setAuthId] = useState('');
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('profiles')
        .select('auth_id, display_name, user_role')
        .not('auth_id', 'is', null)
        .order('display_name');
      setProfiles((data as ProfileRow[]) || []);
      setLoadingProfiles(false);
    };
    void run();
  }, []);

  const preview = async (id: string) => {
    if (!supabase || !id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('preview_access', { p_auth_id: id });
      if (error) throw error;
      setAccess(data as MyAccess);
    } catch (error: any) {
      showToast(t('permissions.preview_failed', '預覽失敗') + `: ${error?.message ?? ''}`, 'error');
      setAccess(null);
    } finally {
      setLoading(false);
    }
  };

  const chip = (text: string, tone: 'amber' | 'indigo' | 'stone' = 'stone') => (
    <span
      key={text}
      className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
        tone === 'amber'
          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
          : tone === 'indigo'
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800'
            : 'bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'
      }`}
    >
      {text}
    </span>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {t('permissions.preview_hint', '以某個使用者的身分計算權限（不會真的登入）。')}
      </p>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="px-2 py-1.5 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 min-w-[240px]"
          value={authId}
          onChange={e => {
            setAuthId(e.target.value);
            void preview(e.target.value);
          }}
          disabled={loadingProfiles}
        >
          <option value="">{t('permissions.pick_user', '選擇使用者')}</option>
          {profiles.map(p => (
            <option key={p.auth_id} value={p.auth_id}>
              {p.display_name || p.auth_id.slice(0, 8)}（{p.user_role || '-'}）
            </option>
          ))}
        </select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
      </div>

      {!access ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t('permissions.preview_empty', '選一個使用者就會顯示他實際會看到的權限。')}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-stone-500 dark:text-stone-400 mr-2">roles</span>
              {access.roles.length ? access.roles.map(r => chip(r, 'indigo')) : '—'}
            </div>
            <div>
              <span className="text-stone-500 dark:text-stone-400 mr-2">isAdmin</span>
              <span className={access.isAdmin ? 'text-amber-600 font-bold' : 'text-stone-400'}>
                {String(access.isAdmin)}
              </span>
            </div>
            <div>
              <span className="text-stone-500 dark:text-stone-400 mr-2">managed</span>
              {access.managedGuildIds.length ? access.managedGuildIds.map(g => chip(g, 'amber')) : '—'}
            </div>
            <div>
              <span className="text-stone-500 dark:text-stone-400 mr-2">member</span>
              {access.memberGuildIds.length ? access.memberGuildIds.map(g => chip(g)) : '—'}
            </div>
          </div>

          <section className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              global（{access.globalPermissions.length}）
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {access.globalPermissions.length
                ? access.globalPermissions.map(p => chip(permissionLabel(p, isZh)))
                : '—'}
            </div>
          </section>

          <section className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              managed（{access.managedPermissions.length}）
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {access.managedPermissions.length
                ? access.managedPermissions.map(p => chip(permissionLabel(p, isZh), 'amber'))
                : '—'}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
