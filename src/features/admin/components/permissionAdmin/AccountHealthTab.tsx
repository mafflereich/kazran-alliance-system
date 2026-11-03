import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Download, Loader2, RefreshCw, Save, Search, Trash2, Unlink, X } from 'lucide-react';
import { supabase, fetchAllPaginated } from '@/shared/api/supabase';
import ConfirmModal from '@shared/ui/ConfirmModal';
import FilterSelect from '@shared/ui/FilterSelect';
import { useAppContext } from '@/store';
import {
  fetchDiscordMembers,
  guildNamesOf,
  systemRoleOf,
  type DiscordMemberEntry,
  type DiscordMemberSnapshot,
} from './discordMembersApi';
import { fetchAllProfilesForAudit, roleLabel, type ProfileRow } from './shared';

interface MemberLite {
  id: string;
  name: string;
  status: string | null;
  guild_id: string | null;
}

type IssueKind = 'ok' | 'unbound' | 'archived' | 'dangling' | 'never_synced';

interface HealthRow {
  profile: ProfileRow;
  /** profiles.id 內記錄的成員 id（逗號字串拆開） */
  boundIds: string[];
  /** 指向已不存在成員的 id（成員被刪除後留下的殘留） */
  danglingIds: string[];
  archivedMembers: MemberLite[];
  activeMembers: MemberLite[];
  /** 這個帳號涉及的公會 id（成員所屬 ∪ profiles.user_guilds 對到的公會） */
  guildIds: string[];
  guildNames: string[];
  issues: IssueKind[];
  key: string;
}

type DiscordStatus = 'unknown' | 'no_discord' | 'left' | 'in_server' | 'global_admin';

interface DiscordDiff {
  status: DiscordStatus;
  member: DiscordMemberEntry | null;
  nextRole: string | null;
  roleChanged: boolean;
  nextGuilds: string | null;
  guildsChanged: boolean;
  hasChanges: boolean;
  /** 不在 Discord 伺服器（非管理員者會在套用時刪除 profile） */
  leftServer: boolean;
}

const ISSUE_LABELS: Record<IssueKind, { zh: string; en: string }> = {
  ok: { zh: '正常', en: 'OK' },
  unbound: { zh: '未綁定成員', en: 'No member' },
  archived: { zh: '綁到已封存成員', en: 'Archived member' },
  dangling: { zh: '殘留綁定', en: 'Stale binding' },
  never_synced: { zh: '從未登入', en: 'Never synced' },
};

const ISSUE_TONES: Record<IssueKind, string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  unbound: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
  archived: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  dangling: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  never_synced: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

/**
 * 帳號健檢：把「登入帳號（profiles）」與「遊戲成員（members）」對照，
 * 再用貝拉（GSD_Bella）的 `GET /api/discordMembers` **抓一次**伺服器成員名單，
 * 在本機比對角色與公會身分組，最後一次把差異套回 profiles。
 *
 * 為什麼不逐一呼叫 sync-discord-roles：每個帳號要打 2 次 Discord API，
 * 幾百個帳號會非常慢又容易撞 rate limit；抓一次名單只需 1 次請求。
 *
 * 刻意「不」提供刪除 profile：例外授權（user_grants）綁的是 auth_id，
 * 誤刪會連授權與稽核紀錄一起失去意義。需要刪帳號請走「身分綁定」頁。
 * 也不會自動變更 creator / admin 的角色（避免把管理員降級）。
 */
export default function AccountHealthTab() {
  const { t, i18n } = useTranslation(['admin', 'translation']);
  const isZh = i18n.language.startsWith('zh');
  const { db, showToast } = useAppContext();

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [members, setMembers] = useState<Record<string, MemberLite>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'issues' | 'pending' | IssueKind>('all');

  /** 各欄位篩選：關鍵字 / 角色 / 公會 / Discord 狀態 */
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [guildFilter, setGuildFilter] = useState('');
  const [discordFilter, setDiscordFilter] = useState('');
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<DiscordMemberSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [fetchingSnapshot, setFetchingSnapshot] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<Record<string, 'ok' | 'failed' | 'deleted'>>({});

  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<HealthRow | null>(null);

  const load = async (preserveResults = false) => {
    if (!preserveResults) setLoading(true);
    try {
      const [profileRows, memberRows] = await Promise.all([
        fetchAllProfilesForAudit(),
        fetchAllPaginated<MemberLite>('members', 'id, name, status, guild_id', undefined, { pageSize: 500 }),
      ]);

      const memberMap: Record<string, MemberLite> = {};
      memberRows.forEach(member => {
        if (member.id) memberMap[member.id] = member;
      });

      setProfiles(profileRows);
      setMembers(memberMap);
      if (!preserveResults) setApplied({});
    } catch (error: any) {
      console.error('Failed to load account health data:', error);
      showToast(t('permissions.load_failed', '無法讀取權限設定') + `: ${error?.message ?? ''}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const healthRows = useMemo<HealthRow[]>(() => {
    return profiles.map(profile => {
      const boundIds = (profile.id ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

      const knownMembers = boundIds
        .map(memberId => members[memberId])
        .filter((member): member is MemberLite => !!member);

      const danglingIds = boundIds.filter(memberId => !members[memberId]);
      const archivedMembers = knownMembers.filter(member => member.status === 'archived');
      const activeMembers = knownMembers.filter(member => member.status !== 'archived' && !!member.guild_id);

      // 公會來源有兩個：成員實際所屬 + profiles.user_guilds（Discord 身分組字串）。
      // 兩邊都保留，才找得到「成員沒載入／已封存但 Discord 還在某公會」的帳號。
      const memberGuildIds = activeMembers.map(member => member.guild_id!).filter(Boolean);
      const userGuildNames = (profile.user_guilds ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      const userGuildIds = userGuildNames
        .map(name => Object.entries(db.guilds).find(([, guild]) => guild.name === name)?.[0])
        .filter((id): id is string => !!id);

      const guildIds = Array.from(new Set([...memberGuildIds, ...userGuildIds]));
      const guildNames = guildIds.map(id => db.guilds[id]?.name ?? id);

      const issues: IssueKind[] = [];
      if (!profile.auth_id) issues.push('never_synced');
      if (boundIds.length === 0) issues.push('unbound');
      if (danglingIds.length > 0) issues.push('dangling');
      if (archivedMembers.length > 0) issues.push('archived');
      if (issues.length === 0) issues.push('ok');

      return {
        profile,
        boundIds,
        danglingIds,
        archivedMembers,
        activeMembers,
        guildIds,
        guildNames,
        issues,
        key: profile.auth_id || `discord:${profile.discord_id ?? profile.display_name ?? ''}`,
      };
    });
  }, [profiles, members, db.guilds]);

  /**
   * 本機比對：把 profiles 跟一次抓回的 Discord 名單對照，算出每個帳號的差異。
   * creator / admin 一律標成 global_admin 並跳過，避免把管理員降級。
   */
  const diffByKey = useMemo<Record<string, DiscordDiff>>(() => {
    const result: Record<string, DiscordDiff> = {};
    if (!snapshot) return result;

    const byDiscordId = new Map<string, DiscordMemberEntry>();
    snapshot.members.forEach(member => {
      if (member.id) byDiscordId.set(member.id, member);
    });

    healthRows.forEach(row => {
      const { profile } = row;
      const base: DiscordDiff = {
        status: 'unknown',
        member: null,
        nextRole: null,
        roleChanged: false,
        nextGuilds: null,
        guildsChanged: false,
        hasChanges: false,
        leftServer: false,
      };

      const currentRole = profile.user_role ?? null;
      const isGlobalAdmin = currentRole === 'creator' || currentRole === 'admin';

      if (!profile.discord_id) {
        result[row.key] = { ...base, status: 'no_discord' };
        return;
      }

      const member = byDiscordId.get(profile.discord_id) ?? null;
      if (!member) {
        // 不在伺服器：非管理員的帳號會在「套用」時直接刪除 profile；
        // creator / admin 一律保留（避免把自己鎖在門外）。
        result[row.key] = {
          ...base,
          status: isGlobalAdmin ? 'global_admin' : 'left',
          leftServer: true,
        };
        return;
      }

      const nextRole = systemRoleOf(member);
      const nextGuilds = guildNamesOf(member).join(',') || null;
      const roleChanged = nextRole !== currentRole;
      const guildsChanged = (profile.user_guilds || '') !== (nextGuilds || '');

      result[row.key] = {
        status: isGlobalAdmin ? 'global_admin' : 'in_server',
        member,
        nextRole,
        roleChanged: !isGlobalAdmin && roleChanged,
        nextGuilds,
        guildsChanged: !isGlobalAdmin && guildsChanged,
        hasChanges: !isGlobalAdmin && (roleChanged || guildsChanged),
        leftServer: false,
      };
    });

    return result;
  }, [snapshot, healthRows]);

  /** 需要更新角色/公會的帳號 */
  const updateRows = useMemo(
    () => healthRows.filter(row => diffByKey[row.key]?.hasChanges),
    [healthRows, diffByKey],
  );

  /** 已離開伺服器、套用時要刪除 profile 的帳號（不含 creator / admin） */
  const deleteRows = useMemo(
    () => healthRows.filter(row => diffByKey[row.key]?.status === 'left' && !!row.profile.discord_id),
    [healthRows, diffByKey],
  );

  const pendingRows = useMemo(() => [...updateRows, ...deleteRows], [updateRows, deleteRows]);

  /** 角色選項（只列實際存在的角色） */
  const roleOptions = useMemo(
    () =>
      Array.from(new Set(profiles.map(profile => profile.user_role).filter((role): role is string => !!role)))
        .sort((a, b) => a.localeCompare(b))
        .map(role => ({ value: role, label: roleLabel(role, isZh) })),
    [profiles, isZh],
  );

  /**
   * 公會 chip 列：只列「目前清單裡真的有帳號」的公會並帶數量。
   * 公會數量多時直式下拉很難掃，改成可橫向捲動的 chips（點表格內公會名稱也能篩選）。
   */
  const guildChips = useMemo(() => {
    const counts = new Map<string, number>();
    healthRows.forEach(row => {
      row.guildIds.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
    });

    return Object.entries(db.guilds)
      .filter(([id]) => (counts.get(id) ?? 0) > 0)
      .sort((a, b) => {
        const tierA = a[1].tier ?? 99;
        const tierB = b[1].tier ?? 99;
        if (tierA !== tierB) return tierA - tierB;
        const orderA = a[1].orderNum ?? 99;
        const orderB = b[1].orderNum ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return a[1].name.localeCompare(b[1].name);
      })
      .map(([id, guild]) => ({
        id,
        name: guild.name,
        tier: guild.tier ?? null,
        count: counts.get(id) ?? 0,
      }));
  }, [healthRows, db.guilds]);

  /** Discord 狀態選項 */
  const discordStatusOptions = useMemo(
    () => [
      { value: 'left', label: isZh ? '不在伺服器' : 'Left server' },
      { value: 'in_server', label: isZh ? '在伺服器' : 'In server' },
      { value: 'no_discord', label: isZh ? '無 Discord 帳號' : 'No Discord account' },
      { value: 'global_admin', label: isZh ? '全域管理員（略過）' : 'Global admin (skipped)' },
      { value: 'unknown', label: isZh ? '尚未抓取名單' : 'No snapshot yet' },
    ],
    [isZh],
  );

  /** 關鍵字 + 欄位篩選（角色 / 公會 / Discord 狀態） */
  const searchedRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return healthRows.filter(row => {
      const { profile } = row;

      if (normalized) {
        const haystack = [
          profile.display_name,
          profile.discord_username,
          profile.discord_id,
          profile.auth_id,
          profile.user_guilds,
          ...row.boundIds,
          ...row.activeMembers.map(member => member.name),
          ...row.archivedMembers.map(member => member.name),
          ...row.guildNames,
          ...row.danglingIds,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(normalized)) return false;
      }

      if (roleFilter && (profile.user_role ?? '') !== roleFilter) return false;

      if (guildFilter && !row.guildIds.includes(guildFilter)) return false;

      if (discordFilter) {
        const diff = diffByKey[row.key];
        const status: string = !diff ? 'unknown' : diff.leftServer ? 'left' : diff.status;
        if (status !== discordFilter) return false;
      }

      return true;
    });
  }, [healthRows, query, roleFilter, guildFilter, discordFilter, db.guilds, diffByKey]);

  const visibleRows = useMemo(() => {
    if (filter === 'all') return searchedRows;
    if (filter === 'issues') return searchedRows.filter(row => row.issues[0] !== 'ok');
    if (filter === 'pending') {
      return searchedRows.filter(row => {
        const diff = diffByKey[row.key];
        return !!diff?.hasChanges || diff?.status === 'left';
      });
    }
    return searchedRows.filter(row => row.issues.includes(filter));
  }, [searchedRows, filter, diffByKey]);

  const closeFilter = useCallback(() => setOpenFilterId(null), []);
  const hasFieldFilters = !!query || !!roleFilter || !!guildFilter || !!discordFilter;
  const clearFieldFilters = () => {
    setQuery('');
    setRoleFilter('');
    setGuildFilter('');
    setDiscordFilter('');
    setOpenFilterId(null);
  };

  const counts = useMemo(() => {
    const result: Record<string, number> = { total: healthRows.length };
    (Object.keys(ISSUE_LABELS) as IssueKind[]).forEach(kind => {
      result[kind] = healthRows.filter(row => row.issues.includes(kind)).length;
    });
    result.issues = healthRows.filter(row => row.issues[0] !== 'ok').length;
    result.pending = pendingRows.length;
    result.updates = updateRows.length;
    result.deletes = deleteRows.length;
    result.left = Object.values(diffByKey).filter(diff => diff.leftServer).length;
    return result;
  }, [healthRows, pendingRows, updateRows, deleteRows, diffByKey]);


  /** 抓一次 Discord 成員名單（bot 端有 DB + 記憶體快取） */
  const loadSnapshot = async (force = false) => {
    setFetchingSnapshot(true);
    setSnapshotError(null);
    try {
      const data = await fetchDiscordMembers({ refresh: force });
      setSnapshot(data);
      setApplied({});

      if (data.throttled) {
        showToast(
          isZh
            ? `名單才剛更新（${data.cacheAgeSeconds ?? 0} 秒前），已沿用快取以避免觸發 Discord rate limit`
            : `Snapshot is ${data.cacheAgeSeconds ?? 0}s old; reused cache to avoid Discord rate limits`,
          'info',
        );
      } else if (data.stale) {
        showToast(
          isZh ? 'Discord 暫時無法更新，目前顯示上次的名單' : 'Discord is unavailable; showing the last snapshot',
          'warning',
        );
      } else {
        showToast(
          isZh
            ? `已取得 ${data.memberCount} 位有 profile 的成員（${new Date(data.fetchedAt).toLocaleString()}）`
            : `Fetched ${data.memberCount} members with profiles`,
          'success',
        );
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      console.error('Failed to fetch Discord members:', error);
      setSnapshotError(message);
      showToast(`${isZh ? '取得 Discord 名單失敗' : 'Failed to fetch Discord members'}: ${message}`, 'error');
    } finally {
      setFetchingSnapshot(false);
    }
  };

  /**
   * 把比對結果套用回資料庫：
   *   1) 角色／公會 → 只更新有變動的欄位
   *   2) 已離開伺服器（非 creator/admin）→ 刪除 profile，並先清掉它的例外授權
   *      （user_grants 沒有 FK，不先刪會留下孤兒授權；profile_members 由 DB trigger 清）
   */
  const applyRows = async (rows: HealthRow[]) => {
    if (!supabase) return;

    const updateTargets = rows.filter(row => diffByKey[row.key]?.hasChanges && row.profile.discord_id);
    const deleteTargets = rows.filter(
      row => diffByKey[row.key]?.status === 'left' && row.profile.discord_id,
    );

    if (updateTargets.length === 0 && deleteTargets.length === 0) {
      setConfirmApply(false);
      return;
    }

    setApplying(true);
    const results: Record<string, 'ok' | 'failed' | 'deleted'> = {};
    const CHUNK_SIZE = 10;

    for (let index = 0; index < updateTargets.length; index += CHUNK_SIZE) {
      const chunk = updateTargets.slice(index, index + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async row => {
          const diff = diffByKey[row.key];
          const payload: Record<string, string | null> = {};
          if (diff.roleChanged) payload.user_role = diff.nextRole;
          if (diff.guildsChanged) payload.user_guilds = diff.nextGuilds;

          if (Object.keys(payload).length === 0) {
            results[row.key] = 'ok';
            return;
          }

          const { error } = await supabase
            .from('profiles')
            .update(payload)
            .eq('discord_id', row.profile.discord_id!);

          results[row.key] = error ? 'failed' : 'ok';
          if (error) console.error('Failed to apply discord diff:', error, row.profile.discord_id);
        }),
      );
    }

    for (let index = 0; index < deleteTargets.length; index += CHUNK_SIZE) {
      const chunk = deleteTargets.slice(index, index + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async row => {
          const { profile } = row;

          try {
            const { data, error } = await supabase
              .from('profiles')
              .delete()
              .eq('discord_id', profile.discord_id!)
              .select('discord_id');

            if (error) throw error;

            // RLS 沒報錯但實際 0 列（沒有刪除權限）→ 視為失敗，且不動它的例外授權
            const deleted = Array.isArray(data) && data.length > 0;
            if (!deleted) {
              console.error('Profile delete affected 0 rows (RLS?):', profile.discord_id);
              results[row.key] = 'failed';
              return;
            }

            // profile 刪掉後才清例外授權：user_grants.user_auth_id 沒有 FK，
            // 不主動刪會留下永遠不會再被套用的孤兒授權。
            if (profile.auth_id) {
              const { error: grantError } = await supabase
                .from('user_grants')
                .delete()
                .eq('user_auth_id', profile.auth_id);
              if (grantError) {
                console.warn('Profile deleted but failed to clear user_grants:', grantError, profile.auth_id);
              }
            }

            results[row.key] = 'deleted';
          } catch (error) {
            console.error('Failed to delete profile:', error, profile.discord_id);
            results[row.key] = 'failed';
          }
        }),
      );
    }

    setApplied(results);
    setApplying(false);
    setConfirmApply(false);

    const values = Object.values(results);
    const failed = values.filter(value => value === 'failed').length;
    const deleted = values.filter(value => value === 'deleted').length;
    const updated = values.length - failed - deleted;

    const summary = isZh
      ? `已更新 ${updated} 筆、刪除 ${deleted} 個帳號${failed > 0 ? `，失敗 ${failed} 筆（詳見 console）` : ''}`
      : `Updated ${updated}, deleted ${deleted}${failed > 0 ? `, ${failed} failed` : ''}`;
    showToast(summary, failed > 0 ? 'error' : 'success');

    await load(true);
  };

  const clearDangling = async (row: HealthRow) => {
    if (!supabase || !row.profile.discord_id) return;
    const remaining = row.boundIds.filter(memberId => !row.danglingIds.includes(memberId));

    const { error } = await supabase
      .from('profiles')
      .update({ id: remaining.length > 0 ? remaining.join(',') : null })
      .eq('discord_id', row.profile.discord_id);

    if (error) {
      showToast(`${t('permissions.save_failed', '儲存失敗')}: ${error.message}`, 'error');
      return;
    }

    showToast(isZh ? '已清除殘留綁定' : 'Stale bindings cleared', 'success');
    setConfirmUnlink(null);
    await load(true);
  };


  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  const chip = (id: 'all' | 'issues' | 'pending' | IssueKind, text: string, tone: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
        filter === id
          ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200'
          : `border-transparent ${tone}`
      }`}
    >
      {text}
    </button>
  );

  const guildChipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
      active
        ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200'
        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
    }`;

  const cacheAgeText = (seconds?: number | null) => {
    if (seconds === null || seconds === undefined) return '';
    if (seconds < 120) return isZh ? ` ${Math.max(1, Math.round(seconds))} 秒前` : ` ${Math.max(1, Math.round(seconds))}s ago`;
    return isZh ? ` ${Math.round(seconds / 60)} 分前` : ` ${Math.round(seconds / 60)}m ago`;
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
        {isZh
          ? '流程：①按「抓取 Discord 名單」呼叫貝拉（GSD_Bella）的 /api/discordMembers：名單只包含系統裡有 profile 的人（伺服器其他幾千位成員不回傳），bot 端有 DB + 記憶體快取（10 分鐘），強制刷新最短間隔 2 分鐘 → ②在本機比對角色與公會身分組 → ③按「套用差異」寫回有變動的 profiles，並刪除已離開伺服器的帳號（會先清掉該帳號的例外授權；creator / admin 一律保留）。殘留綁定＝profiles.id 指向已刪除成員；綁到已封存＝該成員 status 是 archived；從未登入＝profile 存在但 auth_id 為空。'
          : "Flow: (1) fetch the snapshot from Bella's /api/discordMembers — it only returns members that already have a profile (the rest of the server is not sent); cached in the bot DB + memory for 10 min, forced refresh at most every 2 min (2) diff roles/guilds locally (3) apply real differences and delete accounts that left the server (their overrides are removed first; creator/admin are always kept)."}
      </p>

      {counts.dangling > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {isZh
              ? `有 ${counts.dangling} 個帳號的 profiles.id 還指向已刪除的成員，可用右側「解除殘留綁定」清掉。`
              : `${counts.dangling} accounts still reference deleted members; use the unlink action on the right to clear them.`}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={
              isZh
                ? '搜尋帳號、Discord、成員、公會或 UUID…'
                : 'Search account, Discord, member, guild or UUID…'
            }
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={isZh ? '清除關鍵字' : 'Clear search'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <FilterSelect
          filter={{
            id: 'role',
            label: isZh ? '全部角色' : 'All roles',
            shortLabel: isZh ? '角色' : 'Role',
            options: roleOptions,
          }}
          value={roleFilter}
          isOpen={openFilterId === 'role'}
          onToggle={() => setOpenFilterId(current => (current === 'role' ? null : 'role'))}
          onClose={closeFilter}
          onChange={setRoleFilter}
        />

        <FilterSelect
          filter={{
            id: 'discord',
            label: isZh ? '全部 Discord 狀態' : 'All Discord states',
            shortLabel: isZh ? 'Discord' : 'Discord',
            options: discordStatusOptions,
          }}
          value={discordFilter}
          isOpen={openFilterId === 'discord'}
          onToggle={() => setOpenFilterId(current => (current === 'discord' ? null : 'discord'))}
          onClose={closeFilter}
          onChange={setDiscordFilter}
        />

        {hasFieldFilters && (
          <button
            type="button"
            onClick={clearFieldFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700"
          >
            <X className="w-3.5 h-3.5" />
            {isZh ? '清除篩選' : 'Clear'}
          </button>
        )}
      </div>

      {guildChips.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-bold text-stone-500 dark:text-stone-400">
            {isZh ? '公會' : 'Guild'}
          </span>
          <div className="flex-1 overflow-x-auto">
            <div className="flex w-max items-center gap-1.5 pb-1">
              <button type="button" onClick={() => setGuildFilter('')} className={guildChipClass(!guildFilter)}>
                {isZh ? '全部公會' : 'All guilds'} {healthRows.length}
              </button>
              {guildChips.map(guild => (
                <button
                  key={guild.id}
                  type="button"
                  onClick={() => setGuildFilter(current => (current === guild.id ? '' : guild.id))}
                  title={guild.name}
                  className={guildChipClass(guildFilter === guild.id)}
                >
                  {guild.name}
                  {guild.tier ? ` T${guild.tier}` : ''}
                  <span className="ml-1 opacity-60">{guild.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {chip('all', `${isZh ? '全部' : 'All'} ${counts.total}`, 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300')}
        {chip('issues', `${isZh ? '需處理' : 'Needs attention'} ${counts.issues}`, 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}
        {chip('pending', `${isZh ? '待同步' : 'Pending sync'} ${counts.pending}`, 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300')}
        {chip('dangling', `${ISSUE_LABELS.dangling[isZh ? 'zh' : 'en']} ${counts.dangling}`, ISSUE_TONES.dangling)}
        {chip('archived', `${ISSUE_LABELS.archived[isZh ? 'zh' : 'en']} ${counts.archived}`, ISSUE_TONES.archived)}
        {chip('unbound', `${ISSUE_LABELS.unbound[isZh ? 'zh' : 'en']} ${counts.unbound}`, ISSUE_TONES.unbound)}
        {chip('never_synced', `${ISSUE_LABELS.never_synced[isZh ? 'zh' : 'en']} ${counts.never_synced}`, ISSUE_TONES.never_synced)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={applying || fetchingSnapshot}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {isZh ? '重新掃描' : 'Rescan'}
        </button>

        <button
          type="button"
          onClick={() => void loadSnapshot(!!snapshot)}
          disabled={fetchingSnapshot || applying}
          title={
            isZh
              ? '向貝拉取得名單；名單快取 10 分鐘，強制刷新最短間隔 2 分鐘'
              : 'Fetch the snapshot from Bella; cached 10 min, forced refresh at most every 2 min'
          }
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {fetchingSnapshot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {snapshot ? (isZh ? '重新抓取名單' : 'Refresh snapshot') : isZh ? '抓取 Discord 名單' : 'Fetch Discord snapshot'}
        </button>

        <button
          type="button"
          onClick={() => setConfirmApply(true)}
          disabled={applying || pendingRows.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isZh ? `套用差異（${pendingRows.length}）` : `Apply changes (${pendingRows.length})`}
        </button>

        {snapshot && (
          <span
            className={`text-xs ${
              snapshot.stale ? 'font-bold text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            {isZh
              ? `名單：${snapshot.memberCount} 位有 profile${
                  snapshot.serverMemberCount ? `（伺服器 ${snapshot.serverMemberCount} 位）` : ''
                } · ${new Date(snapshot.fetchedAt).toLocaleString()}${
                  snapshot.cached
                    ? `（快取${cacheAgeText(snapshot.cacheAgeSeconds)}）`
                    : '（剛更新）'
                }${snapshot.stale ? ' · Discord 更新失敗，顯示舊名單' : ''}`
              : `Snapshot: ${snapshot.memberCount} with profiles${
                  snapshot.serverMemberCount ? ` (server ${snapshot.serverMemberCount})` : ''
                } · ${new Date(snapshot.fetchedAt).toLocaleString()}${
                  snapshot.cached ? ` (cached ${cacheAgeText(snapshot.cacheAgeSeconds)})` : ' (fresh)'
                }${snapshot.stale ? ' · Discord refresh failed, showing stale snapshot' : ''}`}
          </span>
        )}

        {snapshotError && (
          <span className="text-xs text-red-600 dark:text-red-400">{snapshotError}</span>
        )}

        <span className="ml-auto text-xs text-stone-500 dark:text-stone-400">
          {isZh ? `顯示 ${visibleRows.length} / ${healthRows.length}` : `Showing ${visibleRows.length} / ${healthRows.length}`}
        </span>
      </div>


      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[1040px]">
          <thead>
            <tr className="text-stone-500 dark:text-stone-400 text-xs">
              <th className="text-left px-4 py-2 font-medium">{isZh ? '帳號' : 'Account'}</th>
              <th className="text-left px-3 py-2 font-medium">{isZh ? '角色' : 'Role'}</th>
              <th className="text-left px-3 py-2 font-medium">{isZh ? '綁定成員' : 'Bound members'}</th>
              <th className="text-left px-3 py-2 font-medium">{isZh ? '公會' : 'Guilds'}</th>
              <th className="text-left px-3 py-2 font-medium">{isZh ? '健檢' : 'Health'}</th>
              <th className="text-left px-3 py-2 font-medium">{isZh ? 'Discord 差異' : 'Discord diff'}</th>
              <th className="px-3 py-2 font-medium text-right">{isZh ? '動作' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const { profile } = row;
              const diff = diffByKey[row.key];
              const appliedResult = applied[row.key];
              const willDelete = diff?.status === 'left';
              const actionable = willDelete || !!diff?.hasChanges;
              const displayName =
                profile.display_name ||
                (profile.discord_username ? `@${profile.discord_username}` : '') ||
                (profile.auth_id ? profile.auth_id.slice(0, 8) : isZh ? '未登入帳號' : 'Never signed in');

              return (
                <tr key={row.key} className="border-t border-stone-100 dark:border-stone-700 align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium text-stone-800 dark:text-stone-100">{displayName}</div>
                    <div className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">
                      {profile.auth_id ? profile.auth_id.slice(0, 8) : isZh ? '尚未登入' : 'never signed in'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-600 dark:text-stone-300">
                    {roleLabel(profile.user_role, isZh)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.boundIds.length === 0 ? (
                      <span className="text-stone-400 dark:text-stone-500">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {row.activeMembers.map(member => (
                          <div key={member.id} className="text-stone-700 dark:text-stone-200">
                            {member.name}
                          </div>
                        ))}
                        {row.archivedMembers.map(member => (
                          <div key={member.id} className="text-amber-600 dark:text-amber-400">
                            {member.name}
                            <span className="text-[10px]">（{isZh ? '已封存' : 'archived'}）</span>
                          </div>
                        ))}
                        {row.danglingIds.map(memberId => (
                          <div key={memberId} className="text-red-600 dark:text-red-400 font-mono text-[11px]">
                            {isZh ? '找不到成員 ' : 'missing '}
                            {memberId.slice(0, 8)}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-600 dark:text-stone-300">
                    {row.guildIds.length > 0 ? (
                      <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                        {row.guildIds.map(guildId => (
                          <button
                            key={guildId}
                            type="button"
                            onClick={() => setGuildFilter(current => (current === guildId ? '' : guildId))}
                            title={isZh ? '點擊以此公會篩選' : 'Filter by this guild'}
                            className={`underline decoration-dotted hover:text-amber-600 dark:hover:text-amber-400 ${
                              guildFilter === guildId ? 'font-bold text-amber-600 dark:text-amber-400' : ''
                            }`}
                          >
                            {db.guilds[guildId]?.name ?? guildId}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-stone-400 dark:text-stone-500">—</span>
                    )}
                    {profile.user_guilds && !row.guildIds.length && (
                      <div className="text-[11px] text-stone-400 dark:text-stone-500">
                        {isZh ? 'profiles.user_guilds：' : 'profiles.user_guilds: '}
                        {profile.user_guilds}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.issues.map(issue => (
                        <span
                          key={issue}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ISSUE_TONES[issue]}`}
                        >
                          {ISSUE_LABELS[issue][isZh ? 'zh' : 'en']}
                        </span>
                      ))}
                      {appliedResult && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            appliedResult === 'failed' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {appliedResult === 'ok'
                            ? isZh
                              ? '已套用'
                              : 'Applied'
                            : appliedResult === 'deleted'
                              ? isZh
                                ? '已刪除'
                                : 'Deleted'
                              : isZh
                                ? '失敗'
                                : 'Failed'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {!diff ? (
                      <span className="text-stone-400 dark:text-stone-500">
                        {isZh ? '尚未抓取名單' : 'No snapshot yet'}
                      </span>
                    ) : diff.status === 'no_discord' ? (
                      <span className="text-stone-400 dark:text-stone-500">
                        {isZh ? '無 Discord 帳號' : 'No Discord account'}
                      </span>
                    ) : diff.status === 'left' ? (
                      <span className="text-red-600 dark:text-red-400 font-bold">
                        {isZh ? '不在伺服器（套用時刪除）' : 'Left server (deleted on apply)'}
                      </span>
                    ) : diff.status === 'global_admin' ? (
                      <span className="text-indigo-600 dark:text-indigo-400">
                        {diff.leftServer
                          ? isZh
                            ? '不在伺服器（全域管理員，保留）'
                            : 'Left server (global admin, kept)'
                          : isZh
                            ? '全域管理員（不自動變更）'
                            : 'Global admin (skipped)'}
                      </span>
                    ) : diff.hasChanges ? (
                      <div className="space-y-0.5">
                        {diff.roleChanged && (
                          <div className="text-amber-600 dark:text-amber-400">
                            {isZh ? '角色' : 'Role'}：{roleLabel(profile.user_role, isZh)} →{' '}
                            {roleLabel(diff.nextRole, isZh)}
                          </div>
                        )}
                        {diff.guildsChanged && (
                          <div className="text-amber-600 dark:text-amber-400 break-words">
                            {isZh ? '公會' : 'Guilds'}：{profile.user_guilds || '—'} → {diff.nextGuilds || '—'}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">{isZh ? '一致' : 'In sync'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => void applyRows([row])}
                        disabled={applying || !actionable}
                        title={
                          willDelete
                            ? isZh
                              ? '刪除這個 profile（已離開伺服器，連同例外授權）'
                              : 'Delete this profile (left the server; overrides removed too)'
                            : diff?.hasChanges
                              ? isZh
                                ? '把這筆差異寫回 profiles'
                                : 'Apply this diff to profiles'
                              : isZh
                                ? '沒有差異或尚未抓取名單'
                                : 'No diff to apply'
                        }
                        className={`p-1.5 rounded-lg disabled:opacity-30 ${
                          willDelete
                            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'text-stone-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                        }`}
                      >
                        {willDelete ? <Trash2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmUnlink(row)}
                        disabled={applying || row.danglingIds.length === 0 || !profile.discord_id}
                        title={isZh ? '清除指向已刪除成員的綁定' : 'Remove bindings to deleted members'}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30"
                      >
                        <Unlink className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                  {isZh ? '沒有符合條件的帳號。' : 'No matching accounts.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>


      <ConfirmModal
        isOpen={confirmApply}
        isDanger={deleteRows.length > 0}
        title={isZh ? '套用 Discord 差異？' : 'Apply Discord differences?'}
        message={
          <div className="space-y-2 text-sm">
            <p>
              {isZh
                ? `會更新 ${updateRows.length} 個帳號的 profiles.user_role / user_guilds（只寫真正有變動的欄位）。`
                : `Updates profiles.user_role / user_guilds for ${updateRows.length} accounts (only changed fields).`}
            </p>
            {deleteRows.length > 0 && (
              <p className="font-bold text-red-600 dark:text-red-400">
                {isZh
                  ? `⚠️ 另外會刪除 ${deleteRows.length} 個「已離開伺服器」的 profile，連同它們的例外授權；此動作無法復原。`
                  : `⚠️ Also deletes ${deleteRows.length} profile(s) of accounts that left the server, together with their overrides. This cannot be undone.`}
              </p>
            )}
            {deleteRows.length > 0 && (
              <p className="text-xs text-stone-500 dark:text-stone-400 break-words">
                {deleteRows
                  .slice(0, 8)
                  .map(row => row.profile.display_name || row.profile.discord_username || row.profile.discord_id)
                  .join(isZh ? '、' : ', ')}
                {deleteRows.length > 8
                  ? isZh
                    ? ` 等 ${deleteRows.length} 個`
                    : ` +${deleteRows.length - 8} more`
                  : ''}
              </p>
            )}
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {isZh
                ? `名單時間 ${snapshot ? new Date(snapshot.fetchedAt).toLocaleString() : '—'}；creator / admin 一律保留，不會被刪除。`
                : `Snapshot ${snapshot ? new Date(snapshot.fetchedAt).toLocaleString() : '—'}; creator/admin are always kept.`}
            </p>
          </div>
        }
        confirmText={isZh ? '套用' : 'Apply'}
        onConfirm={() => {
          void applyRows(pendingRows);
        }}
        onCancel={() => setConfirmApply(false)}
      />

      <ConfirmModal
        isOpen={!!confirmUnlink}
        isDanger
        title={isZh ? '清除殘留綁定？' : 'Clear stale bindings?'}
        message={
          <div className="space-y-2 text-sm">
            <p>
              {isZh
                ? `會把 ${confirmUnlink?.danglingIds.length ?? 0} 個「已不存在的成員 id」從這個帳號的 profiles.id 移除，其他綁定不受影響。`
                : `Removes ${confirmUnlink?.danglingIds.length ?? 0} member ids that no longer exist from profiles.id.`}
            </p>
            <p className="font-mono text-xs text-stone-500 dark:text-stone-400 break-all">
              {confirmUnlink?.danglingIds.join(', ')}
            </p>
          </div>
        }
        confirmText={isZh ? '清除' : 'Clear'}
        onConfirm={() => {
          if (confirmUnlink) void clearDangling(confirmUnlink);
        }}
        onCancel={() => setConfirmUnlink(null)}
      />
    </div>
  );
}

