import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, RefreshCw, UserCheck, X } from 'lucide-react';
import { useAppContext } from '@/store';
import { supabase } from '@/shared/api/supabase';
import { readQuery, writeQuery } from '@/shared/api/http';

interface PendingClaim {
  member_id: string;
  member_name: string | null;
  member_role: string | null;
  guild_name: string | null;
  discord_id: string;
  discord_username: string | null;
  display_name: string | null;
  requested_at: string | null;
}

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * 「認領申請」待審清單。
 *
 * 玩家在未綁定時可以自己搜尋遊戲名稱並送出認領申請（BindingErrorModal），
 * 這裡讓管理者 / 該公會幹部一鍵核准或駁回，核准後就會寫入 profile_members。
 * 沒有待審資料時整個區塊不顯示。
 */
export default function PendingClaimsPanel() {
  const { t } = useTranslation('admin');
  const { showToast } = useAppContext();

  const [rows, setRows] = useState<PendingClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    // 單一 RPC 回傳審核所需的所有欄位（成員 / 公會 / 角色 / 申請者 Discord / 時間）
    const { data, error } = await readQuery<any[]>(() => supabase.rpc('list_pending_claims'));
    if (error) console.error('[PendingClaimsPanel] 讀取待審申請失敗:', error);
    setRows(((data || []) as any[]).map(row => ({
      member_id: row.member_id,
      member_name: row.member_name ?? null,
      member_role: row.member_role ?? null,
      guild_name: row.guild_name ?? null,
      discord_id: row.discord_id,
      discord_username: row.discord_username ?? null,
      display_name: row.display_name ?? null,
      requested_at: row.requested_at ?? null,
    })));
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleReview = async (memberId: string, approve: boolean) => {
    setBusyId(memberId);
    try {
      const { error } = await writeQuery(() =>
        approve
          ? supabase.rpc('approve_member_claim', { p_member_id: memberId })
          : supabase.rpc('reject_member_claim', { p_member_id: memberId })
      );
      if (error) {
        console.error('[PendingClaimsPanel] 審核失敗:', error);
        showToast(t('binding.claim_review_failed', '審核失敗，請稍後再試'), 'error');
        return;
      }
      showToast(
        approve
          ? t('binding.claim_approved', '已核准，該成員現在可以登入')
          : t('binding.claim_rejected', '已駁回申請'),
        'success'
      );
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const roleLabel = (role: string | null) => {
    switch (role) {
      case 'leader': return t('binding.role_leader', '會長');
      case 'coleader': return t('binding.role_coleader', '副會長');
      case 'member': return t('binding.role_member', '成員');
      default: return role || '—';
    }
  };

  if (!isLoading && rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h3 className="font-bold text-stone-800 dark:text-stone-100">
            {t('binding.pending_claims', '待審核的認領申請')}
            {rows.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-600 text-white">{rows.length}</span>
            )}
          </h3>
        </div>
        <button
          onClick={() => void load()}
          disabled={isLoading}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-indigo-600 rounded"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh', '重新整理')}
        </button>
      </div>

      {isLoading && rows.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">{t('common.loading', '載入中...')}</p>
      ) : (
        <ul className="divide-y divide-amber-200 dark:divide-amber-800">
          {rows.map(row => (
            <li key={row.member_id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 space-y-0.5">
                <p className="font-bold text-stone-800 dark:text-stone-100 truncate">
                  {row.member_name || row.member_id}
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 align-middle">
                    {roleLabel(row.member_role)}
                  </span>
                </p>
                <p className="text-xs text-stone-600 dark:text-stone-400 truncate">
                  {t('binding.claim_guild', '公會')}：{row.guild_name || '—'}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  {t('binding.claim_discord', 'Discord')}：{row.discord_username || row.display_name || '—'}（{row.discord_id}）
                </p>
                <p className="text-xs text-stone-400 dark:text-stone-500">
                  {t('binding.claim_requested_at', '申請時間')}：{formatDateTime(row.requested_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => void handleReview(row.member_id, true)}
                  disabled={busyId !== null}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-400 text-white rounded-lg text-sm font-bold"
                >
                  <Check className="w-4 h-4" />
                  {t('binding.claim_approve', '核准')}
                </button>
                <button
                  onClick={() => void handleReview(row.member_id, false)}
                  disabled={busyId !== null}
                  className="flex items-center gap-1 px-3 py-1.5 bg-stone-200 hover:bg-stone-300 dark:bg-stone-700 dark:hover:bg-stone-600 disabled:opacity-50 text-stone-700 dark:text-stone-200 rounded-lg text-sm font-bold"
                >
                  <X className="w-4 h-4" />
                  {t('binding.claim_reject', '駁回')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
