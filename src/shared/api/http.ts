/**
 * Supabase / PostgREST 的統一存取包裝（timeout + 重試）。
 *
 * 為什麼需要：
 *   1. 原本所有查詢都是 `await supabase.from(...)`，沒有任何 timeout。
 *      請求卡住時只能等瀏覽器自己放棄 → 使用者看到的就是「一直轉圈圈」。
 *   2. PostgREST 的 builder 是「一次性」的，重試時必須重新 build。
 *   3. 只有真正可重試的錯誤才重試（statement timeout 57014、網路錯誤、Abort），
 *      並用指數退避，避免失敗瞬間又打一次把 DB 壓垮。
 *
 * 注意：
 *   - `writeQuery` 預設「不重試」，避免非 idempotent 的 INSERT 重複寫入。
 *     upsert / 以 primary key 為條件的 RPC 屬於 idempotent，可自行傳 `{ retries: 1 }`。
 *   - `build` 每次嘗試都會被呼叫一次，所以務必把整條 query 建構鏈放在裡面。
 */

export interface DbResult<T> {
    data: T | null;
    error: any;
    count?: number | null;
}

export interface RunQueryOptions {
    /** 單次請求的 timeout（毫秒） */
    timeoutMs?: number;
    /** 失敗後額外重試次數（不含第一次） */
    retries?: number;
}

/** PostgREST builder 的最小結構：thenable + 可選的 abortSignal */
type AbortableBuilder = PromiseLike<any> & {
    abortSignal?: (signal: AbortSignal) => any;
};

export const READ_TIMEOUT_MS = 15_000;
export const WRITE_TIMEOUT_MS = 30_000;

/** 超過 timeout 被主動中止時丟出的錯誤（方便上層辨識） */
export class DbTimeoutError extends Error {
    constructor(public readonly ms: number) {
        super(`DB request timed out after ${ms}ms`);
        this.name = 'DbTimeoutError';
    }
}

/** PostgREST / Postgres 中「重試可能成功」的錯誤碼 */
const RETRYABLE_CODES = new Set([
    '57014',   // statement_timeout / query_canceled
    '08000',   // connection_exception
    '08001',   // sqlclient_unable_to_establish_sqlconnection
    '08003',   // connection_does_not_exist
    '08004',   // sqlserver_rejected_establishment_of_sqlconnection
    '08006',   // connection_failure
    'PGRST000', // PostgREST: 無法連線
    'PGRST301', // PostgREST: JWT / 連線層問題
]);

const isRetryable = (error: any): boolean => {
    if (!error) return false;
    if (error instanceof DbTimeoutError) return true;
    if (error.name === 'AbortError') return true;

    const code = String(error.code ?? '');
    if (RETRYABLE_CODES.has(code)) return true;

    return /timeout|timed out|fetch failed|network|ECONNRESET|ETIMEDOUT|Failed to fetch|Load failed/i
        .test(String(error.message ?? error));
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 執行單一 PostgREST 查詢，附帶 timeout 與（可選）重試。
 * 永遠不回傳「throw」，而是回傳 `{ data, error }`，與 supabase-js 的慣例一致。
 */
export async function runQuery<T = any>(
    build: () => AbortableBuilder,
    options: RunQueryOptions = {},
): Promise<DbResult<T>> {
    const timeoutMs = options.timeoutMs ?? READ_TIMEOUT_MS;
    const maxAttempts = Math.max(1, (options.retries ?? 0) + 1);

    let lastError: any = new DbTimeoutError(timeoutMs);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const builder = build();
            const query = typeof builder.abortSignal === 'function'
                ? builder.abortSignal(controller.signal)
                : builder;

            const result: any = await query;

            if (!result?.error) {
                return {
                    data: (result?.data ?? null) as T | null,
                    error: null,
                    count: result?.count ?? null,
                };
            }

            lastError = result.error;
            if (attempt < maxAttempts - 1 && isRetryable(result.error)) {
                await sleep(250 * 2 ** attempt);
                continue;
            }

            return {
                data: (result?.data ?? null) as T | null,
                error: result.error,
                count: result?.count ?? null,
            };
        } catch (err: any) {
            const aborted = err?.name === 'AbortError' || controller.signal.aborted;
            lastError = aborted ? new DbTimeoutError(timeoutMs) : err;

            if (attempt >= maxAttempts - 1 || !isRetryable(lastError)) break;
            await sleep(250 * 2 ** attempt);
        } finally {
            clearTimeout(timer);
        }
    }

    return { data: null, error: lastError, count: null };
}

/** 讀取：15 秒 timeout、預設最多重試 2 次（讀取是安全的 idempotent 操作） */
export function readQuery<T = any>(build: () => AbortableBuilder, options: RunQueryOptions = {}) {
    return runQuery<T>(build, { timeoutMs: READ_TIMEOUT_MS, retries: 2, ...options });
}

/** 寫入：30 秒 timeout、預設不重試（避免 INSERT 重複寫入） */
export function writeQuery<T = any>(build: () => AbortableBuilder, options: RunQueryOptions = {}) {
    return runQuery<T>(build, { timeoutMs: WRITE_TIMEOUT_MS, retries: 0, ...options });
}
