import React, { useState, useEffect } from 'react';
import { supabase } from '@/shared/api/supabase';
import { RefreshCw, AlertTriangle, Info, XCircle, AlertOctagon, Search, X, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  
  // Filters
  const [levelFilter, setLevelFilter] = useState<string[]>(['error', 'fatal']);
  const [searchQuery, setSearchQuery] = useState('');
  
  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (levelFilter.length > 0) {
        query = query.in('level', levelFilter);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Failed to fetch system logs:', error);
        return;
      }
      
      setLogs(data as SystemLog[]);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [levelFilter]);

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.message.toLowerCase().includes(q) ||
      (log.discord_id && log.discord_id.toLowerCase().includes(q)) ||
      (log.user_id && log.user_id.toLowerCase().includes(q)) ||
      log.action.toLowerCase().includes(q) ||
      log.source.toLowerCase().includes(q)
    );
  });

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
          onClick={fetchLogs}
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
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                    {t('system_logs.no_results', '找不到符合的日誌')}
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
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
                        onClick={() => setSelectedLog(log)}
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
