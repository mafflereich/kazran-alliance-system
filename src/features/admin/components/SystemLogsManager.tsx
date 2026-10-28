import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/shared/api/supabase';
import { RefreshCw, AlertTriangle, Info, XCircle, AlertOctagon, Search, X, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PostgREST 的 or() 語法以逗號分隔條件，且支援 * 作為 ilike 的萬用字元，
 * 因此搜尋字串中的逗號、括號、引號與反斜線必須先移除，避免查詢語法被破壞。
 */
const sanitizeSearchTerm = (term: string) =>
  term.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 組成伺服器端搜尋條件。
 * 注意：user_id 是 UUID 欄位，直接 ilike 會造成 PostgreSQL 型別錯誤，
 * 因此僅在輸入完整 UUID 時以 eq 比對。
 */
const buildSearchFilter = (term: string): string | null => {
  const cleaned = sanitizeSearchTerm(term);
  if (!cleaned) return null;

  const conditions = [
    `message.ilike.*${cleaned}*`,
    `action.ilike.*${cleaned}*`,
    `source.ilike.*${cleaned}*`,
    `discord_id.ilike.*${cleaned}*`,
  ];

  if (UUID_PATTERN.test(cleaned)) {
    conditions.push(`user_id.eq.${cleaned}`);
  }

  return conditions.join(',');
};

interface SystemLog {
  id: string;
  created_at: string;
  level: 'info' | 'warn' | 'error' | 'fatal';
  source: string;
  action: string;
  user_id: string | null;
  discord_id: string | null;
  message: string;
  details: any;
}

export default function SystemLogsManager() {
  const { t } = useTranslation('admin');
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  // 只採納最後一次請求的結果，避免快速換頁 / 搜尋時的競態覆蓋
  const requestIdRef = useRef(0);

  // Filters
  const [levelFilter, setLevelFilter] = useState<string[]>(['error', 'fatal']);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const fetchLogs: (targetPage?: number, queryText?: string) => Promise<void> = useCallback(async (targetPage: number = 1, queryText: string = '') => {
    const requestId = ++requestIdRef.current;
    const safePage = Math.max(1, targetPage);
    const from = (safePage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    setLoading(true);
    try {
      let query = supabase
        .from('system_logs')
        .select('id, created_at, level, source, action, user_id, discord_id, message', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (levelFilter.length > 0) {
        query = query.in('level', levelFilter);
      }

      const searchFilter = buildSearchFilter(queryText);
      if (searchFilter) {
        query = query.or(searchFilter);
      }

      const { data, error, count } = await query;

      // 已有較新的請求在跑，捨棄這次結果
      if (requestId !== requestIdRef.current) return;

      if (error) {
        console.error('Failed to fetch system logs:', error);
        return;
      }

      setLogs((data ?? []) as SystemLog[]);
      setTotalCount(count ?? 0);

      // 資料筆數變動（例如舊日誌被清理）導致目前頁碼超出範圍時，退回最後一頁
      const lastPage = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
      if (safePage > lastPage) {
        await fetchLogs(lastPage, queryText);
        return;
      }

      setPage(safePage);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching logs:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [levelFilter]);

  const openLogDetails = async (log: SystemLog) => {
    try {
      const { data, error } = await supabase
        .from('system_logs')
        .select('*')
        .eq('id', log.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch log details:', error);
        return;
      }

      if (data) {
        setSelectedLog(data as SystemLog);
      }
    } catch (err) {
      console.error('Error fetching log details:', err);
    }
  };

  // 搜尋輸入 debounce，避免每次按鍵都打 DB
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 篩選條件或搜尋字串變動時，一律回到第 1 頁重新查詢
  useEffect(() => {
    fetchLogs(1, debouncedQuery);
  }, [fetchLogs, debouncedQuery]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const goToPage = (targetPage: number) => {
    const clamped = Math.min(Math.max(1, targetPage), totalPages);
    if (clamped === page) return;
    fetchLogs(clamped, debouncedQuery);
  };

  const toggleLevel = (level: string) => {
    setLevelFilter(prev => 
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'info': return <Info className="w-4 h-4 text-blue-500" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'fatal': return <AlertOctagon className="w-4 h-4 text-rose-700" />;
      default: return <Info className="w-4 h-4 text-stone-500" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'info': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'warn': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'fatal': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800 font-bold animate-pulse';
      default: return 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100">{t('system_logs.title', '系統日誌')}</h2>
        <button 
          onClick={() => fetchLogs(page, debouncedQuery)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('system_logs.refresh', '重新整理')}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-stone-50 dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input 
            type="text" 
            placeholder={t('system_logs.search_placeholder', '搜尋訊息、Discord ID、動作...')} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 dark:text-stone-200"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {['info', 'warn', 'error', 'fatal'].map(level => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5
                ${levelFilter.includes(level) 
                  ? getLevelBadge(level) 
                  : 'bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                }`}
            >
              {getLevelIcon(level)}
              {level.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 dark:bg-stone-900/50 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
              <tr>
                <th className="px-4 py-3 font-medium">{t('system_logs.time', '時間')}</th>
                <th className="px-4 py-3 font-medium">{t('system_logs.level', '層級')}</th>
                <th className="px-4 py-3 font-medium">{t('system_logs.source_action', '來源 / 動作')}</th>
                <th className="px-4 py-3 font-medium">{t('system_logs.message', '訊息')}</th>
                <th className="px-4 py-3 font-medium">{t('system_logs.related_id', '關聯 ID')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('system_logs.actions', '操作')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700/50">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                    {t('system_logs.loading', '載入中...')}
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                    {t('system_logs.no_results', '找不到符合的日誌')}
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-stone-50 dark:hover:bg-stone-700/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-stone-600 dark:text-stone-300 text-xs">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${getLevelBadge(log.level)}`}>
                        {log.level.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-stone-800 dark:text-stone-200 font-medium">{log.action}</div>
                      <div className="text-stone-400 dark:text-stone-500 text-xs">{log.source}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300 max-w-xs truncate" title={log.message}>
                      {log.message}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-stone-500 dark:text-stone-400">
                      {log.discord_id && <div>Discord: <span className="font-mono text-stone-700 dark:text-stone-300">{log.discord_id}</span></div>}
                      {log.user_id && <div>User: <span className="font-mono text-stone-700 dark:text-stone-300">{log.user_id.substring(0, 8)}...</span></div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button 
                        onClick={() => openLogDetails(log)}
                        className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                        title={t('system_logs.view_details', '查看詳情')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50">
          <div className="text-xs text-stone-500 dark:text-stone-400">
            {t('system_logs.total_count', '共 {{total}} 筆', { total: totalCount })}
            <span className="mx-1.5">·</span>
            {t('system_logs.per_page', '每頁 {{size}} 筆', { size: PAGE_SIZE })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {t('system_logs.prev_page', '上一頁')}
            </button>
            <span className="text-xs font-medium text-stone-600 dark:text-stone-300 whitespace-nowrap">
              {t('system_logs.page_indicator', '第 {{page}} / {{totalPages}} 頁', { page, totalPages })}
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('system_logs.next_page', '下一頁')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-stone-200 dark:border-stone-800">
            <div className="flex justify-between items-center p-4 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border ${getLevelBadge(selectedLog.level)}`}>
                  {getLevelIcon(selectedLog.level)}
                  {selectedLog.level.toUpperCase()}
                </span>
                <h3 className="font-bold text-stone-800 dark:text-stone-100">{t('system_logs.log_details', '日誌詳情')}</h3>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-stone-400 dark:text-stone-500 mb-1">{t('system_logs.time', '時間')}</div>
                  <div className="font-medium text-stone-800 dark:text-stone-200">{new Date(selectedLog.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-stone-400 dark:text-stone-500 mb-1">{t('system_logs.source_module', '來源模組')}</div>
                  <div className="font-medium text-stone-800 dark:text-stone-200 font-mono text-xs bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded inline-block">{selectedLog.source}</div>
                </div>
                <div>
                  <div className="text-stone-400 dark:text-stone-500 mb-1">{t('system_logs.action_category', '動作分類')}</div>
                  <div className="font-medium text-stone-800 dark:text-stone-200 font-mono text-xs bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded inline-block">{selectedLog.action}</div>
                </div>
                <div>
                  <div className="text-stone-400 dark:text-stone-500 mb-1">{t('system_logs.related_id', '關聯 ID')}</div>
                  <div className="space-y-1">
                    {selectedLog.discord_id && <div className="text-stone-700 dark:text-stone-300">Discord: <span className="font-mono text-xs">{selectedLog.discord_id}</span></div>}
                    {selectedLog.user_id && <div className="text-stone-700 dark:text-stone-300">User: <span className="font-mono text-xs">{selectedLog.user_id}</span></div>}
                    {!selectedLog.discord_id && !selectedLog.user_id && <span className="text-stone-400 italic">{t('system_logs.none', '無')}</span>}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-stone-400 dark:text-stone-500 mb-2 text-sm">{t('system_logs.message', '訊息')}</div>
                <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-lg text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700">
                  {selectedLog.message}
                </div>
              </div>

              <div>
                <div className="text-stone-400 dark:text-stone-500 mb-2 text-sm">{t('system_logs.details_json', '詳細資料 (Details JSON)')}</div>
                <div className="relative group">
                  <pre className="p-4 bg-stone-900 text-stone-300 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed border border-stone-800">
                    <code>{JSON.stringify(selectedLog.details, null, 2)}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
