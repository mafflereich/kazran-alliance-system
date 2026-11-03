import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2, UserRound } from 'lucide-react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import type { MyAccess } from '@/shared/lib/permissions';
import { fetchGrantableProfiles, permissionLabel, roleLabel, type ProfileRow } from './shared';
import UserPickerModal from './UserPickerModal';

export default function PermissionPreviewTab() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const { db, showToast } = useAppContext();
  const isZh = i18n.language.startsWith('zh');

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [authId, setAuthId] = useState('');
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        setProfiles(await fetchGrantableProfiles());
      } catch (error) {
        console.error('Failed to load profiles for permission preview:', error);
      } finally {
        setLoadingProfiles(false);
      }
    };
    void run();
  }, []);

  const selectedProfile = profiles.find(profile => profile.auth_id === authId);
  const guildName = (guildId: string) => db.guilds[guildId]?.name ?? guildId;

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
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={loadingProfiles}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 min-w-[240px] text-left hover:border-amber-500 transition-colors disabled:opacity-50"
        >
          <UserRound className="w-4 h-4 text-stone-400 shrink-0" />
          <span className={`truncate ${selectedProfile ? '' : 'text-stone-400 dark:text-stone-500'}`}>
            {selectedProfile
              ? selectedProfile.display_name ||
                (selectedProfile.discord_username ? `@${selectedProfile.discord_username}` : '') ||
                selectedProfile.auth_id.slice(0, 8)
              : t('permissions.pick_user', '選擇使用者')}
          </span>
          <ChevronDown className="w-4 h-4 text-stone-400 ml-auto shrink-0" />
        </button>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
      </div>

      <UserPickerModal
        isOpen={pickerOpen}
        profiles={profiles}
        selectedAuthId={authId}
        title={t('permissions.pick_user', '選擇使用者')}
        onSelect={profile => {
          setAuthId(profile.auth_id);
          void preview(profile.auth_id);
        }}
        onClose={() => setPickerOpen(false)}
      />

      {!access ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t('permissions.preview_empty', '選一個使用者就會顯示他實際會看到的權限。')}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-stone-500 dark:text-stone-400 mr-2">{isZh ? '角色' : 'Roles'}</span>
              {access.roles.length ? access.roles.map(r => chip(roleLabel(r, isZh), 'indigo')) : '—'}
            </div>
            <div>
              <span className="text-stone-500 dark:text-stone-400 mr-2">
                {isZh ? '全站管理員' : 'Site admin'}
              </span>
              <span className={access.isAdmin ? 'text-amber-600 font-bold' : 'text-stone-400'}>
                {access.isAdmin ? (isZh ? '是（一律放行）' : 'Yes (all permissions)') : isZh ? '否' : 'No'}
              </span>
            </div>
            <div>
              <span className="text-stone-500 dark:text-stone-400 mr-2">
                {isZh ? '可管理的公會' : 'Managed guilds'}
              </span>
              {access.managedGuildIds.length
                ? access.managedGuildIds.map(g => <span key={g} title={g}>{chip(guildName(g), 'amber')}</span>)
                : '—'}
            </div>
            <div>
              <span className="text-stone-500 dark:text-stone-400 mr-2">
                {isZh ? '所屬公會' : 'Member guilds'}
              </span>
              {access.memberGuildIds.length
                ? access.memberGuildIds.map(g => <span key={g} title={g}>{chip(guildName(g))}</span>)
                : '—'}
            </div>
          </div>

          <section className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              {isZh ? '全站權限' : 'Global permissions'}（{access.globalPermissions.length}）
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {access.globalPermissions.length
                ? access.globalPermissions.map(p => chip(permissionLabel(p, isZh)))
                : '—'}
            </div>
          </section>

          <section className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              {isZh ? '公會權限（只在管理的公會生效）' : 'Guild-scoped permissions'}（{access.managedPermissions.length}）
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
