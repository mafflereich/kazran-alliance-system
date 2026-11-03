import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe2, Loader2, Plus, ShieldCheck, ShieldX, Trash2, UserRound, X } from 'lucide-react';
import { supabase } from '@/shared/api/supabase';
import { useAppContext } from '@/store';
import { PERMISSIONS } from '@/shared/lib/permissions';
import {
  fetchGrantableProfiles,
  permissionDescription,
  permissionLabel,
  roleLabel,
  type ProfileRow,
  type UserGrantRow,
} from './shared';
import UserPickerModal from './UserPickerModal';
import PermissionPickerModal from './PermissionPickerModal';
import GuildPickerModal from './GuildPickerModal';

type OverrideForm = {
  authId: string;
  permission: string;
  effect: 'allow' | 'deny';
  guildId: string;
  expiresAt: string;
  reason: string;
};

const EMPTY_FORM: OverrideForm = {
  authId: '',
  permission: PERMISSIONS[0].key,
  effect: 'allow',
  guildId: '',
  expiresAt: '',
  reason: '',
};

const toIsoOrNull = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export default function PermissionOverridesTab() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const isZh = i18n.language.startsWith('zh');
  const { db, showToast } = useAppContext();

  const [rows, setRows] = useState<UserGrantRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<'user' | 'permission' | 'guild' | null>(null);
  const [form, setForm] = useState<OverrideForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profilesPromise = fetchGrantableProfiles();
      let grants: UserGrantRow[] = [];

      if (supabase) {
        const { data, error } = await supabase
          .from('user_grants')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        grants = (data as UserGrantRow[]) || [];
      }

      setRows(grants);
      setProfiles(await profilesPromise);
    } catch (error: any) {
      showToast(t('permissions.load_failed', '無法讀取權限設定') + `: ${error?.message ?? ''}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileByAuthId = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    profiles.forEach(profile => map.set(profile.auth_id, profile));
    return map;
  }, [profiles]);

  const memberNamesOf = useCallback(
    (profile: ProfileRow | undefined): string[] => {
      if (!profile?.id) return [];
      const ids = profile.id
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      return Array.from(
        new Set(ids.map(memberId => db.members[memberId]?.name).filter((name): name is string => !!name)),
      );
    },
    [db.members],
  );

  const displayUserName = useCallback(
    (authId: string): string => {
      const profile = profileByAuthId.get(authId);
      if (!profile) return authId.slice(0, 8);
      return (
        profile.display_name ||
        (profile.discord_username ? `@${profile.discord_username}` : '') ||
        authId.slice(0, 8)
      );
    },
    [profileByAuthId],
  );

  const selectedUser = form.authId ? profileByAuthId.get(form.authId) : undefined;
  const selectedGuildName = form.guildId ? db.guilds[form.guildId]?.name ?? form.guildId : '';

  const add = async () => {
    if (!supabase || !form.authId) return;

    // guild_id 為 NULL 時 Postgres 的 unique 不會擋重複，先在客戶端擋一次。
    const duplicated = rows.some(
      row =>
        row.user_auth_id === form.authId &&
        row.permission === form.permission &&
        row.effect === form.effect &&
        (row.guild_id ?? '') === (form.guildId || ''),
    );
    if (duplicated) {
      showToast(
        isZh
          ? '這位使用者已經有相同「權限／效果／範圍」的例外授權了。'
          : 'This user already has an identical override (permission / effect / scope).',
        'error',
      );
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('user_grants').insert({
        user_auth_id: form.authId,
        permission: form.permission,
        effect: form.effect,
        guild_id: form.guildId || null,
        expires_at: toIsoOrNull(form.expiresAt),
        reason: form.reason.trim() || null,
      });
      if (error) throw error;
      showToast(t('common.update_success'), 'success');
      setForm(prev => ({ ...prev, guildId: '', expiresAt: '', reason: '' }));
      await load();
    } catch (error: any) {
      const message =
        error?.code === '23505'
          ? isZh
            ? '這位使用者已經有相同「權限／效果／範圍」的例外授權了。'
            : 'This user already has an identical override (permission / effect / scope).'
          : error?.message ?? '';
      showToast(t('permissions.save_failed', '儲存失敗') + `: ${message}`, 'error');
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
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const fieldLabel = (text: string) => (
    <span className="block text-xs font-bold text-stone-500 dark:text-stone-400 mb-1">{text}</span>
  );

  const triggerClass =
    'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-left transition-colors hover:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500';
  const inputClass =
    'w-full px-2 py-1.5 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100';
  const hintClass = 'block mt-1 text-[11px] text-stone-500 dark:text-stone-400';

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
        {isZh
          ? '例外授權＝在角色權限之外，單獨對某個人開放或關閉某一項權限。拒絕（deny）優先於允許（allow）；「全站」對所有公會生效，指定公會則只在該公會生效；到期時間留空代表永久。'
          : 'Overrides add or remove a single permission for one person on top of role grants. Deny beats allow; “Global” applies everywhere while a specific guild only applies inside that guild; leave expiry empty for permanent.'}
      </p>

      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            {fieldLabel(isZh ? '使用者（必填）' : 'User (required)')}
            <button type="button" onClick={() => setPicker('user')} className={triggerClass}>
              <UserRound className="w-4 h-4 text-stone-400 shrink-0" />
              <span
                className={`truncate ${
                  selectedUser ? 'text-stone-800 dark:text-stone-100' : 'text-stone-400 dark:text-stone-500'
                }`}
              >
                {selectedUser ? displayUserName(selectedUser.auth_id) : isZh ? '點我選擇使用者…' : 'Select a user…'}
              </span>
            </button>
            <span className={hintClass}>
              {selectedUser
                ? [roleLabel(selectedUser.user_role, isZh), ...memberNamesOf(selectedUser)].filter(Boolean).join(' · ')
                : isZh
                  ? '支援搜尋 Discord 名稱、遊戲成員名稱與公會。'
                  : 'Search by Discord name, in-game member name or guild.'}
            </span>
          </div>

          <div>
            {fieldLabel(isZh ? '權限（必填）' : 'Permission (required)')}
            <button type="button" onClick={() => setPicker('permission')} className={triggerClass}>
              <ShieldCheck className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-stone-800 dark:text-stone-100">
                  {permissionLabel(form.permission, isZh)}
                </span>
                <span className="block truncate font-mono text-[11px] text-stone-400">{form.permission}</span>
              </span>
            </button>
            <span className={hintClass}>{permissionDescription(form.permission, isZh)}</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            {fieldLabel(isZh ? '授權效果' : 'Effect')}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, effect: 'allow' }))}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                  form.effect === 'allow'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-emerald-500'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {isZh ? '允許（allow）' : 'Allow'}
              </button>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, effect: 'deny' }))}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                  form.effect === 'deny'
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-red-500'
                }`}
              >
                <ShieldX className="w-3.5 h-3.5" />
                {isZh ? '拒絕（deny）' : 'Deny'}
              </button>
            </div>
            <span className={hintClass}>
              {isZh ? '「拒絕」會蓋過任何允許，包含角色權限。' : 'Deny overrides every allow, including role grants.'}
            </span>
          </div>

          <div>
            {fieldLabel(isZh ? '適用範圍' : 'Scope')}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, guildId: '' }))}
                className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                  form.guildId === ''
                    ? 'bg-amber-600 border-amber-600 text-white'
                    : 'border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-amber-500'
                }`}
              >
                <Globe2 className="w-3.5 h-3.5" />
                {isZh ? '全站' : 'Global'}
              </button>
              <button type="button" onClick={() => setPicker('guild')} className={`${triggerClass} flex-1`}>
                <span
                  className={`truncate ${
                    form.guildId ? 'text-stone-800 dark:text-stone-100' : 'text-stone-400 dark:text-stone-500'
                  }`}
                >
                  {form.guildId ? selectedGuildName || form.guildId : isZh ? '指定公會…' : 'Specific guild…'}
                </span>
              </button>
            </div>
            <span className={hintClass}>
              {form.guildId
                ? isZh
                  ? '只在這個公會內生效。'
                  : 'Applies inside this guild only.'
                : isZh
                  ? '不指定公會＝全站生效；公會用名稱搜尋，不用貼 ID。'
                  : 'No guild = global; search guilds by name, no ID needed.'}
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            {fieldLabel(isZh ? '到期時間（選填）' : 'Expires at (optional)')}
            <div className="flex gap-2">
              <input
                type="datetime-local"
                className={inputClass}
                value={form.expiresAt}
                onChange={event => setForm(prev => ({ ...prev, expiresAt: event.target.value }))}
              />
              {form.expiresAt && (
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, expiresAt: '' }))}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  aria-label={isZh ? '清除到期時間' : 'Clear expiry'}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <span className={hintClass}>
              {isZh ? '留空＝永久有效；時間到之後這筆例外授權就不再生效。' : 'Empty = permanent; after this time the override stops applying.'}
            </span>
          </div>

          <div>
            {fieldLabel(isZh ? '原因／備註（選填）' : 'Reason (optional)')}
            <input
              type="text"
              className={inputClass}
              placeholder={isZh ? '例如：期間限定協助賽季管理' : 'e.g. temporary help with season management'}
              maxLength={200}
              value={form.reason}
              onChange={event => setForm(prev => ({ ...prev, reason: event.target.value }))}
            />
            <span className={hintClass}>
              {isZh ? '寫下原因，之後回頭看才知道為什麼開這個權限。' : 'Write down why, so future you understands this override.'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void add()}
          disabled={saving || !form.authId}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {isZh ? '新增例外授權' : 'Add override'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {isZh ? '目前沒有例外授權。' : 'No overrides yet.'}
        </p>
      ) : (
        <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-stone-500 dark:text-stone-400 text-xs">
                <th className="text-left px-4 py-2 font-medium">{isZh ? '使用者' : 'User'}</th>
                <th className="text-left px-4 py-2 font-medium">{isZh ? '權限' : 'Permission'}</th>
                <th className="px-3 py-2 font-medium">{isZh ? '效果' : 'Effect'}</th>
                <th className="text-left px-3 py-2 font-medium">{isZh ? '範圍' : 'Scope'}</th>
                <th className="text-left px-3 py-2 font-medium">{isZh ? '到期' : 'Expires'}</th>
                <th className="text-left px-3 py-2 font-medium">{isZh ? '原因' : 'Reason'}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const rowProfile = profileByAuthId.get(row.user_auth_id);
                const memberNames = memberNamesOf(rowProfile);
                const expired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;

                return (
                  <tr key={row.id} className="border-t border-stone-100 dark:border-stone-700">
                    <td className="px-4 py-2">
                      <div className="font-medium text-stone-800 dark:text-stone-100">
                        {displayUserName(row.user_auth_id)}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400">
                        {[roleLabel(rowProfile?.user_role, isZh), ...memberNames].filter(Boolean).join(' · ') ||
                          row.user_auth_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-2 max-w-[280px]">
                      <div className="text-stone-800 dark:text-stone-100">
                        {permissionLabel(row.permission, isZh)}
                      </div>
                      <div
                        className="text-[11px] text-stone-500 dark:text-stone-400 truncate"
                        title={permissionDescription(row.permission, isZh)}
                      >
                        {permissionDescription(row.permission, isZh)}
                      </div>
                      <div
                        className="font-mono text-[10px] text-stone-400 dark:text-stone-500 truncate"
                        title={row.permission}
                      >
                        {row.permission}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          row.effect === 'allow'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {row.effect === 'allow' ? (isZh ? '允許' : 'Allow') : isZh ? '拒絕' : 'Deny'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.guild_id ? (
                        <span className="text-stone-700 dark:text-stone-200">
                          {db.guilds[row.guild_id]?.name ?? row.guild_id}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-stone-500 dark:text-stone-400">
                          <Globe2 className="w-3.5 h-3.5" />
                          {isZh ? '全站' : 'Global'}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-xs ${expired ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                      {row.expires_at
                        ? `${new Date(row.expires_at).toLocaleString()}${expired ? (isZh ? '（已過期）' : ' (expired)') : ''}`
                        : isZh
                          ? '永久'
                          : 'Never'}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-600 dark:text-stone-300 max-w-[180px] truncate" title={row.reason ?? ''}>
                      {row.reason || '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => void remove(row.id)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        aria-label={isZh ? '刪除例外授權' : 'Delete override'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <UserPickerModal
        isOpen={picker === 'user'}
        profiles={profiles}
        selectedAuthId={form.authId}
        onSelect={profile => setForm(prev => ({ ...prev, authId: profile.auth_id }))}
        onClose={() => setPicker(null)}
      />
      <PermissionPickerModal
        isOpen={picker === 'permission'}
        selectedPermission={form.permission}
        onSelect={permission => setForm(prev => ({ ...prev, permission }))}
        onClose={() => setPicker(null)}
      />
      <GuildPickerModal
        isOpen={picker === 'guild'}
        selectedGuildId={form.guildId}
        onSelect={guildId => setForm(prev => ({ ...prev, guildId }))}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}
