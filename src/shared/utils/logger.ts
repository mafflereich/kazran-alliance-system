import { supabase } from '@/shared/api/supabase';

type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

interface LogPayload {
  source: string;
  action: string;
  message: string;
  user_id?: string | null;
  discord_id?: string | null;
  details?: Record<string, any>;
}

/**
 * 內部共用寫入 Log 的函式
 */
const insertLog = async (level: LogLevel, payload: LogPayload) => {
  try {
    // 如果沒有特別指定 user_id，嘗試自動抓取當前登入者的 ID
    let userId = payload.user_id;
    if (userId === undefined) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id || null;
    }

    const { error } = await supabase.from('system_logs').insert({
      level,
      source: payload.source,
      action: payload.action,
      message: payload.message,
      user_id: userId,
      discord_id: payload.discord_id || null,
      details: payload.details || {},
    });

    if (error) {
      // 寫入 Log 失敗時，只在 Console 印出，不影響主程式運行
      console.error('[Logger] 寫入 system_logs 失敗:', error);
    }
  } catch (err) {
    console.error('[Logger] 寫入 system_logs 發生未預期錯誤:', err);
  }
};

/**
 * 系統日誌工具 (System Logger)
 * 用於將前端的重要操作或錯誤寫入 Supabase 的 system_logs 資料表
 */
export const Logger = {
  info: (payload: LogPayload) => insertLog('info', payload),
  warn: (payload: LogPayload) => insertLog('warn', payload),
  error: (payload: LogPayload) => insertLog('error', payload),
  fatal: (payload: LogPayload) => insertLog('fatal', payload),
};
