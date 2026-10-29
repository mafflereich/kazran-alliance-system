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

type LogRow = {
  level: LogLevel;
  source: string;
  action: string;
  message: string;
  user_id: string | null;
  discord_id: string | null;
  details: Record<string, any>;
};

/**
 * 系統日誌工具（批次寫入版）。
 *
 * 原本每一筆 log 都是一次 `insert`，而 log 幾乎散落在每個操作裡
 * （戰記自動存檔一次就寫一筆），造成 system_logs 寫入量爆炸、
 * 也讓 system_logs 的列表查詢 timeout。
 *
 * 現在改成：
 *   - 進記憶體佇列，每 5 秒或累積 100 筆才「一次 insert 多列」
 *   - `info` 在 production 直接丟棄（保留 warn/error/fatal）
 *   - 使用者離開頁面（visibilitychange → hidden）時強制 flush
 *   - 寫入失敗不影響主程式（僅 console）
 */

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 100;

const queue: LogRow[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

/** 目前登入者 id：只查一次 session，避免每筆 log 都打一次 auth */
let cachedUserId: string | null | undefined = undefined;

const resolveUserId = async (): Promise<string | null> => {
  if (cachedUserId !== undefined) return cachedUserId;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    cachedUserId = session?.user?.id ?? null;
  } catch {
    cachedUserId = null;
  }
  return cachedUserId;
};

/** 立即把佇列中的 log 寫入 DB（離開頁面、或手動呼叫時使用）。 */
export const flushLogs = async (): Promise<void> => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (isFlushing || queue.length === 0) return;

  isFlushing = true;
  const rows = queue.splice(0, MAX_BATCH_SIZE);

  try {
    if (!supabase) return;
    const { error } = await supabase.from('system_logs').insert(rows);
    if (error) {
      console.error('[Logger] 批次寫入 system_logs 失敗:', error);
    }
  } catch (err) {
    console.error('[Logger] 批次寫入 system_logs 發生未預期錯誤:', err);
  } finally {
    isFlushing = false;
    // 這批之後還有剩餘的，排下一次
    if (queue.length > 0) scheduleFlush();
  }
};

const scheduleFlush = () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushLogs();
  }, FLUSH_INTERVAL_MS);
};

const enqueue = (row: LogRow) => {
  queue.push(row);
  if (queue.length >= MAX_BATCH_SIZE) {
    void flushLogs();
    return;
  }
  scheduleFlush();
};

/**
 * 內部共用寫入 Log 的函式
 */
const insertLog = async (level: LogLevel, payload: LogPayload) => {
  try {
    // info 等級只在開發環境記錄，避免 production 產生大量無用資料
    if (!import.meta.env.DEV && level === 'info') return;

    const userId = payload.user_id !== undefined
      ? payload.user_id
      : await resolveUserId();

    enqueue({
      level,
      source: payload.source,
      action: payload.action,
      message: payload.message,
      user_id: userId ?? null,
      discord_id: payload.discord_id || null,
      details: payload.details || {},
    });
  } catch (err) {
    console.error('[Logger] 建立 log 發生未預期錯誤:', err);
  }
};

if (typeof window !== 'undefined') {
  // 使用者切到背景 / 關閉分頁前，把剩下的 log 送出去
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushLogs();
  });
  window.addEventListener('pagehide', () => { void flushLogs(); });
}

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

