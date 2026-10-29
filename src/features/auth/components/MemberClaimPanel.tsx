import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Search, Send, UserCheck, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/shared/api/supabase';
import { readQuery, writeQuery } from '@/shared/api/http';

type BoundMember = {
  member_id: string;
  member_name: string;
  guild_name: string | null;
  role: string | null;
};

type ClaimRow = {
  member_id: string;
  member_name: string;
  guild_name: string | null;
  status: string;
  requested_at: string;
};

type ClaimableMember = {
  id: string;
  name: string;
  guild_name: string | null;
  role: string | null;
};

/**
 * 帳號認領 / 多重綁定面板。
 *
 * 一個 Discord 帳號可以綁定多個遊戲帳號（分身、轉服），所以這裡：
 *   * 列出「已綁定」與「申請中 / 已駁回」
 *   * 可以連續送出多筆認領申請（DB 端上限 5 筆待審）
 *
 * 使用位置：
 *   * BindingErrorModal（完全未綁定時擋住畫面）
 *   * MyAccountsModal（已綁定後，從 Header 的帳號區再新增）
 */
export default function MemberClaimPanel({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();

  const [bound, setBound] = useState<BoundMember[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClaimableMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const reload = useCallback(async () => {
    setIsLoading(true);
    const [boundRes, claimsRes] = await Promise.all([
      readQuery<any[]>(() => supabase.rpc('my_bound_members')),
      readQuery<any[]>(() => supabase.rpc('my_claims')),
    ]);
    setBound((boundRes.data || []) as BoundMember[]);
    setClaims((claimsRes.data || []) as ClaimRow[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // 已經申請中 / 已綁定的成員，列表上不再提供「認領」按鈕
  const pendingIds = useMemo(
    () => new Set(claims.filter(c => c.status === 'pending').map(c => c.member_id)),
    [claims]
  );
  const boundIds = useMemo(() => new Set(bound.map(b => b.member_id)), [bound]);

  // 遊戲名稱搜尋（350ms debounce；少於 2 字不查）
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await readQuery<any[]>(() =>
        supabase.rpc('search_claimable_members', { p_query: q })
      );
      setResults((data || []) as ClaimableMember[]);
      setIsSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const handleClaim = async (memberId: string) => {
    setSubmittingId(memberId);
    setErrorMessage('');
    try {
      const { error } = await writeQuery(() =>
        supabase.rpc('request_member_claim', { p_member_id: memberId })
      );
      if (error) {
        const msg = String((error as any)?.message || '');
        if (msg.includes('already_bound_to_you')) {
          setErrorMessage(t('auth.claim_already_bound_to_you', '這個帳號已經綁定在你名下了。'));
        } else if (msg.includes('already_bound')) {
          setErrorMessage(t('auth.claim_already_bound', '這位成員已經被綁定了，請聯絡管理員。'));
        } else if (msg.includes('already_requested_by_another')) {
          setErrorMessage(t('auth.claim_taken', '已有其他人申請這位成員，請聯絡管理員。'));
        } else if (msg.includes('too_many_pending_claims')) {
          setErrorMessage(t('auth.claim_too_many', '待審核的申請過多，請先等管理員處理。'));
        } else if (msg.includes('member_not_found')) {
          setErrorMessage(t('auth.claim_member_not_found', '找不到這位成員，請確認遊戲內名稱。'));
        } else {
          setErrorMessage(msg || t('auth.claim_failed', '申請失敗，請稍後再試。'));
        }
        return;
      }
      await reload();
      onChanged?.();
    } finally {
      setSubmittingId(null);
    }
  };

  const roleLabel = (role: string | null) => {
    switch (role) {
      case 'leader': return t('auth.role_leader', '會長');
      case 'coleader': return t('auth.role_coleader', '副會長');
      case 'member': return t('auth.role_member', '成員');
      default: return role || '—';
    }
  };

  return (
    <div className="space-y-4 text-left">
      {/* 已綁定 */}
      <div>
        <h4 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">
          {t('auth.claim_bound_title', '已綁定的成員')}
        </h4>
        {isLoading && bound.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-stone-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('common.loading', '載入中...')}
          </p>
        ) : bound.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('auth.claim_none_bound', '尚未綁定任何成員')}
          </p>
        ) : (
          <ul className="space-y-1">
            {bound.map(b => (
              <li key={b.member_id} className="flex items-center gap-2 text-sm min-w-0">
                <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-bold text-stone-800 dark:text-stone-100 truncate">{b.member_name}</span>
                <span className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  {b.guild_name || '—'} · {roleLabel(b.role)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 申請中 / 已駁回 */}
      {claims.filter(c => c.status !== 'approved').length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">
            {t('auth.claim_pending_list_title', '申請紀錄')}
          </h4>
          <ul className="space-y-1">
            {claims.filter(c => c.status !== 'approved').map(c => (
              <li key={c.member_id} className="flex items-center gap-2 text-sm min-w-0">
                {c.status === 'pending'
                  ? <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  : <XCircle className="w-4 h-4 text-stone-400 shrink-0" />}
                <span className="font-medium text-stone-700 dark:text-stone-200 truncate">{c.member_name}</span>
                <span className="text-xs text-stone-500 dark:text-stone-400 truncate">{c.guild_name || '—'}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 shrink-0">
                  {c.status === 'pending'
                    ? t('auth.claim_status_pending', '審核中')
                    : t('auth.claim_status_rejected', '已駁回')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 新增遊戲帳號 */}
      <div>
        <h4 className="text-[11px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">
          {t('auth.claim_add_title', '新增遊戲帳號')}
        </h4>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('auth.claim_search_placeholder', '輸入遊戲內名稱（至少 2 個字）')}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm text-stone-800 dark:text-stone-100 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {errorMessage && (
          <p className="mb-2 text-sm font-medium text-red-600 dark:text-red-400">{errorMessage}</p>
        )}

        <div className="max-h-56 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-700 divide-y divide-stone-200 dark:divide-stone-700">
          {isSearching && (
            <p className="p-3 text-sm text-stone-500 dark:text-stone-400">{t('common.loading', '載入中...')}</p>
          )}
          {!isSearching && query.trim().length < 2 && (
            <p className="p-3 text-sm text-stone-500 dark:text-stone-400">
              {t('auth.claim_search_hint', '請先輸入至少 2 個字。')}
            </p>
          )}
          {!isSearching && query.trim().length >= 2 && results.length === 0 && (
            <p className="p-3 text-sm text-stone-500 dark:text-stone-400">
              {t('auth.claim_no_result', '找不到符合的未綁定成員，請確認名稱或聯絡管理員。')}
            </p>
          )}
          {results.map(m => {
            const isBound = boundIds.has(m.id);
            const isPending = pendingIds.has(m.id);
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 p-2.5">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-stone-800 dark:text-stone-100 truncate">{m.name}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                    {m.guild_name || '—'} · {roleLabel(m.role)}
                  </p>
                </div>
                {isBound || isPending ? (
                  <span className="shrink-0 text-[10px] px-2 py-1 rounded bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 font-bold">
                    {isBound
                      ? t('auth.claim_status_bound', '已綁定')
                      : t('auth.claim_status_pending', '審核中')}
                  </span>
                ) : (
                  <button
                    onClick={() => handleClaim(m.id)}
                    disabled={submittingId !== null}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-400 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submittingId === m.id ? t('common.processing', '處理中...') : t('auth.claim_submit', '認領')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
