import React, { useMemo, useState } from 'react';
import { X, BellRing, Loader, Check, Copy, AlertCircle, Send, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/store';
import { supabase } from '@/shared/api/supabase';

// 貝拉（Discord bot）API 伺服器
const BELLA_API_BASE = 'https://chaosop.duckdns.org';

interface EquipmentReminderModalProps {
  guildId: string;
  guildName: string;
  members: { id: string; name: string }[];
  onClose: () => void;
}

interface ReminderResult {
  ok?: boolean;
  channelId?: string | null;
  channelName?: string | null;
  message?: string;
  sent?: boolean;
  notFound?: string[];
  candidates?: { id: string; name: string }[];
  error?: string;
}

export default function EquipmentReminderModal({ guildId, guildName, members, onClose }: EquipmentReminderModalProps) {
  const { t } = useTranslation();
  const { showToast } = useAppContext();
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<ReminderResult | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // 系統連結（保留部署路徑，例如 GitHub Pages 的子目錄）
  const systemUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}`;
  }, []);

  const bellaLine = t('equipment.reminder_bella_line', '以上成員請立即到系統更新資訊，不否總長將逐一私訊狙擊你們。');

  const callBella = async (dryRun: boolean) => {
    if (members.length === 0) return;
    setIsSending(true);
    try {
      // 附上 Supabase 登入憑證，讓貝拉端再次驗證呼叫者權限
      // （僅該公會正/副會長或 admin / creator 可發送）
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const response = await fetch(`${BELLA_API_BASE}/api/equipmentReminder`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          guildId,
          guildName,
          members: members.map(m => m.name),
          systemUrl,
          dryRun,
        }),
      });
      const data: ReminderResult = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.error || `HTTP ${response.status}`;
        if (response.status === 401 || response.status === 403) {
          throw new Error(`${t('equipment.reminder_no_permission', '沒有發送權限（僅該公會正/副會長或 admin / creator）')}：${detail}`);
        }
        throw new Error(detail);
      }
      setResult(data);
      if (dryRun) {
        showToast(t('equipment.reminder_preview_ready', '已產生預覽'), 'info');
      } else if (data.sent) {
        showToast(t('equipment.reminder_sent', '貝拉已在公會專區發出通知'), 'success');
      }
    } catch (error: any) {
      console.error('Failed to call Bella:', error);
      setResult({ error: error?.message || String(error) });
      showToast(`${t('equipment.reminder_failed', '呼叫貝拉失敗')}: ${error?.message || error}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = () => {
    if (!result?.message) return;
    navigator.clipboard.writeText(result.message).catch(console.error);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-700 w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/40 rounded-xl">
              <BellRing className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h3 className="font-bold text-stone-800 dark:text-stone-100">{t('equipment.reminder_title', '請貝拉通知更新裝備表')}</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">{guildName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          <section className="bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-700 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="font-bold text-stone-800 dark:text-stone-200">
                {t('equipment.reminder_outdated_count', { count: members.length, defaultValue: '{{count}} 位未更新' })}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {members.map(m => (
                <span key={m.id} className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  {m.name}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-200">
              <Link2 className="w-4 h-4 text-stone-400" />
              {t('equipment.reminder_system_link', '系統連結')}
            </div>
            <div className="text-xs font-mono text-stone-600 dark:text-stone-300 bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 break-all">
              {systemUrl || '-'}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-sm font-medium text-stone-700 dark:text-stone-200">{t('equipment.reminder_bella_line_label', '貝拉對白')}</div>
            <div className="text-sm text-stone-600 dark:text-stone-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2">
              {bellaLine}
            </div>
          </section>

          {result?.error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
              {result.error}
              {result.candidates && result.candidates.length > 0 && (
                <div className="mt-2 text-xs">
                  {t('equipment.reminder_channel_candidates', '可用頻道')}：
                  {result.candidates.map(c => c.name).join('、')}
                </div>
              )}
            </div>
          )}

          {result?.message && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-700 dark:text-stone-200">
                  {t('equipment.reminder_preview', '通知內容')}
                  {result.channelName && <span className="ml-2 text-xs text-stone-500 dark:text-stone-400">#{result.channelName}</span>}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-600 transition-colors"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {isCopied ? t('common.copied', '已複製') : t('common.copy', '複製')}
                </button>
              </div>
              <div className="text-sm font-mono text-stone-700 dark:text-stone-200 bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-700 rounded-lg p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {result.message}
              </div>
              {result.notFound && result.notFound.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t('equipment.reminder_not_found', '以下成員在 Discord 找不到對應帳號，將以純文字顯示')}：{result.notFound.join('、')}
                </p>
              )}
              {result.sent && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {t('equipment.reminder_sent', '貝拉已在公會專區發出通知')}
                </p>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-200 dark:border-stone-700 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
          >
            {t('common.close', '關閉')}
          </button>
          <button
            type="button"
            onClick={() => callBella(true)}
            disabled={isSending}
            className="px-4 py-2 rounded-xl font-bold bg-stone-200 dark:bg-stone-600 text-stone-800 dark:text-stone-100 hover:bg-stone-300 dark:hover:bg-stone-500 transition-all active:scale-95 disabled:opacity-50"
          >
            {t('equipment.reminder_preview_btn', '產生預覽')}
          </button>
          <button
            type="button"
            onClick={() => callBella(false)}
            disabled={isSending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            {isSending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSending ? t('equipment.reminder_sending', '處理中...') : t('equipment.reminder_send_btn', '請貝拉發送')}
          </button>
        </div>
      </div>
    </div>
  );
}
