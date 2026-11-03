import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ClipboardCheck, Copy, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCheckInMarks, type CheckInMark } from '@/shared/lib/noteUtils';
import { supabase } from '@/shared/api/supabase';

/** 貝拉（Discord bot）API 伺服器 */
const BELLA_API_BASE = 'https://chaosop.duckdns.org';

export interface CheckInAnnounceMember {
  id: string;
  name: string;
  note?: string;
}

interface CheckInAnnounceModalProps {
  guildId: string;
  guildName: string;
  members: CheckInAnnounceMember[];
  onClose: () => void;
}

interface BellaCheckinTagsResponse {
  ok?: boolean;
  message?: string;
  mentions?: string[];
  notFound?: string[];
  error?: string;
}

type AnnounceTarget = 'round2' | 'round3' | 'dead';

/** 各名單要求的簽到回合：只要缺少其中任一回合，就會出現在催辦名單中。 */
const TARGET_REQUIRED_ROUNDS: Record<AnnounceTarget, CheckInMark[]> = {
  round2: [1, 2],
  round3: [1, 2, 3],
  dead: [1, 2, 3],
};

export default function CheckInAnnounceModal({ guildId, guildName, members, onClose }: CheckInAnnounceModalProps) {
  const { t } = useTranslation(['raid', 'translation']);
  const [target, setTarget] = useState<AnnounceTarget>('round2');
  const [copied, setCopied] = useState(false);
  const [bellaMessage, setBellaMessage] = useState('');
  const [bellaNotFound, setBellaNotFound] = useState<string[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const requestSeqRef = useRef(0);

  const targets = useMemo(() => {
    const required = TARGET_REQUIRED_ROUNDS[target];
    return members
      .map(member => ({ ...member, marks: getCheckInMarks(member.note) }))
      .filter(member =>
        !member.marks.includes(4) &&
        required.every(round => !member.marks.includes(round))
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  }, [members, target]);

  const targetLabel = target === 'round2'
    ? t('raid.checkin_round_2', '第二次簽到（未完成第 1 次）')
    : target === 'round3'
      ? t('raid.checkin_round_3', '第三次簽到（未完成第 1、2 次）')
      : t('raid.checkin_dead_candidates', '失聯確認（三次皆未完成）');

  const localMessage = useMemo(() => {
    const header = t('raid.checkin_announce_header', {
      guild: guildName,
      round: targetLabel,
      defaultValue: '【{{guild}}】{{round}}',
    });
    if (targets.length === 0) {
      return `${header}\n${t('raid.checkin_empty', '目前沒有需要催辦的成員。')}`;
    }
    return `${header}\n${targets.map(member => `@${member.name}`).join('\n')}`;
  }, [guildName, targetLabel, targets, t]);

  // 向貝拉解析真正的 Discord <@id> 標記；失敗時退回 @名稱。
  useEffect(() => {
    if (targets.length === 0) {
      requestSeqRef.current += 1;
      setBellaMessage('');
      setBellaNotFound([]);
      setResolveError('');
      setIsResolving(false);
      return;
    }

    const seq = ++requestSeqRef.current;

    const resolveTags = async () => {
      setIsResolving(true);
      setResolveError('');
      setBellaMessage('');
      setBellaNotFound([]);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

        const response = await fetch(`${BELLA_API_BASE}/api/checkinTags`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            guildId,
            guildName,
            title: targetLabel,
            target,
            members: targets.map(member => ({ id: member.id, name: member.name })),
          }),
        });
        const data: BellaCheckinTagsResponse = await response.json().catch(() => ({}));
        if (seq !== requestSeqRef.current) return;

        if (!response.ok) {
          throw new Error(data?.error || `HTTP ${response.status}`);
        }

        setBellaMessage(typeof data.message === 'string' ? data.message : '');
        setBellaNotFound(Array.isArray(data.notFound) ? data.notFound : []);
      } catch (error: any) {
        if (seq !== requestSeqRef.current) return;
        console.error('Failed to resolve check-in Discord tags:', error);
        setBellaMessage('');
        setBellaNotFound([]);
        setResolveError(error?.message || String(error));
      } finally {
        if (seq === requestSeqRef.current) setIsResolving(false);
      }
    };

    void resolveTags();

    return () => {
      requestSeqRef.current += 1;
    };
  }, [guildId, guildName, target, targetLabel, targets]);

  const message = bellaMessage || localMessage;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy check-in list:', error);
    }
  };

  const tabs: { key: AnnounceTarget; label: string }[] = [
    { key: 'round2', label: t('raid.checkin_round_2', '第二次簽到（未完成第 1 次）') },
    { key: 'round3', label: t('raid.checkin_round_3', '第三次簽到（未完成第 1、2 次）') },
    { key: 'dead', label: t('raid.checkin_dead_candidates', '失聯確認（三次皆未完成）') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-800">
        <div className="flex items-center justify-between border-b border-stone-200 p-4 dark:border-stone-700">
          <h3 className="flex items-center gap-2 text-lg font-bold text-stone-800 dark:text-stone-100">
            <ClipboardCheck className="h-5 w-5 text-indigo-500" />
            {t('raid.checkin_announce_title', '簽到催辦名單')}
            <span className="text-sm font-normal text-stone-500 dark:text-stone-400">{guildName}</span>
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-700 dark:hover:text-stone-200"
            title={t('common.close', '關閉')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-stone-200 p-4 dark:border-stone-700">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setTarget(tab.key);
                setCopied(false);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                target === tab.key
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {t('raid.checkin_count', { count: targets.length, defaultValue: '{{count}} 位成員' })}
            </p>
            <p className="text-xs text-stone-400 dark:text-stone-500">
              {t('raid.checkin_announce_hint', '已標記為「死」的成員不會列入名單')}
            </p>
          </div>

          <div className="mb-3 min-h-[18px] text-xs">
            {isResolving ? (
              <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('raid.checkin_bella_loading', '正在向貝拉解析 Discord 標記…')}
              </span>
            ) : resolveError ? (
              <span
                className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400"
                title={resolveError}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {t('raid.checkin_bella_failed', '無法向貝拉解析標記，已改用 @名稱')}
              </span>
            ) : targets.length > 0 && bellaNotFound.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                {t('raid.checkin_bella_not_found', {
                  count: bellaNotFound.length,
                  defaultValue: '{{count}} 位成員尚未綁定 Discord，將以名稱代替',
                })}
              </span>
            ) : targets.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                {t('raid.checkin_bella_resolved', '已由貝拉解析為真正的 Discord 標記')}
              </span>
            ) : null}
          </div>

          {targets.length > 0 && (
            <div className="mb-3 max-h-40 overflow-auto rounded-lg border border-stone-200 dark:border-stone-700">
              {targets.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between border-b border-stone-100 px-3 py-1.5 text-xs text-stone-700 last:border-b-0 dark:border-stone-700/60 dark:text-stone-300"
                >
                  <span className="truncate">{member.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-stone-400 dark:text-stone-500">
                    {member.marks.length > 0 ? member.marks.join(' / ') : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
            {t('raid.checkin_copy_preview', '可複製的公告內容')}
          </label>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-700 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-300">
            {message}
          </pre>
        </div>

        <div className="flex justify-end gap-2 border-t border-stone-200 p-4 dark:border-stone-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            {t('common.close', '關閉')}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={targets.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t('raid.checkin_copied', '已複製') : t('raid.checkin_copy', '複製名單')}
          </button>
        </div>
      </div>
    </div>
  );
}

