import { createClient } from '@supabase/supabase-js';
import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';
import type { Database } from '@entities/database.types';
import { readQuery, writeQuery } from './http';

/** public schema 的資料表名稱，由 `npm run db:types` 產生的型別推導而來 */
export type TableName = keyof Database['public']['Tables'];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing Supabase URL or Anon Key in environment variables. Supabase features will be disabled.');
}

// 原始 client（不建議直接在業務程式碼中使用）
const rawSupabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
            storageKey: 'kazran-auth-token',
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    })
    : null as any; // Cast to any to avoid type errors if null

// 轉換工具
export const toCamel = <T>(data: any): T => {
    if (Array.isArray(data)) {
        return data.map(item => camelcaseKeys(item, { deep: false })) as unknown as T;
    }
    return camelcaseKeys(data, { deep: false }) as T;
};

export const toSnake = (data: any): any => {
    if (Array.isArray(data)) {
        return data.map(item => snakecaseKeys(item, { deep: false, exclude: ['_'] }));
    }
    return snakecaseKeys(data, { deep: false, exclude: ['_'] });
};

export async function supabaseInsert<T>(
    table: TableName,
    values: T | T[],
    returning: 'minimal' | 'representation' = 'representation'
) {
    const snakeValues = toSnake(values) as any;

    const result = returning === 'minimal'
        ? await writeQuery<any[]>(() => rawSupabase.from(table).insert(snakeValues))
        : await writeQuery<any[]>(() => rawSupabase.from(table).insert(snakeValues).select());

    return {
        data: result.data ? toCamel<T extends any[] ? T : T[]>(result.data) : null,
        error: result.error,
    };
}

export async function supabaseUpdate<T>(
    table: TableName,
    values: Partial<T>,
    filters: Record<string, any>,  // e.g. { id: 'uuid', email: 'test@example.com' }
    returning: 'minimal' | 'representation' = 'representation'
) {
    const snakeValues = toSnake(values) as any;
    const snakeFilters = toSnake(filters) as Record<string, any>;

    // builder 是一次性的，重試時必須整條重建
    const build = () => {
        let query: any = rawSupabase.from(table).update(snakeValues);
        for (const [col, val] of Object.entries(snakeFilters)) {
            query = query.eq(col, val);
        }
        return returning === 'minimal'
            ? query
            : query.select().maybeSingle();
    };

    const result = await writeQuery<any>(build);

    return {
        data: result.data ? toCamel<T>(result.data) : null,
        error: result.error,
    };
}

export async function supabaseUpsert<T>(
    table: TableName,
    values: T | T[],
    options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
    returning: 'minimal' | 'representation' = 'representation'
) {
    const snakeValues = toSnake(values) as any;

    const result = returning === 'minimal'
        ? await writeQuery<any[]>(() => rawSupabase.from(table).upsert(snakeValues, options))
        : await writeQuery<any[]>(() => rawSupabase.from(table).upsert(snakeValues, options).select());

    return {
        data: result.data ? toCamel<T extends any[] ? T : T[]>(result.data) : null,
        error: result.error,
    };
}

export interface FetchAllOptions {
    /**
     * 分頁排序鍵，必須是「唯一且非遞減」的欄位（通常是 primary key）。
     * 沒有 ORDER BY 的 range 分頁在並行寫入時會跳列 / 重複列。
     */
    orderBy?: string;
    pageSize?: number;
}

/**
 * 取得整張表（可帶篩選）的所有資料。
 *
 * 使用 keyset 分頁（WHERE key > cursor ORDER BY key LIMIT n）而非 offset：
 *   - 有序 → 不會跳列 / 重複列
 *   - 深分頁不會越翻越慢（offset 在百萬列時會線性劣化）
 *
 * 錯誤一律 throw，避免「靜默少資料」。
 */
export async function fetchAllPaginated<T = any>(
    table: TableName,
    selectQuery: string,
    applyFilters?: (query: any) => any,
    options: FetchAllOptions = {},
): Promise<T[]> {
    const pageSize = options.pageSize ?? 500;
    const orderBy = options.orderBy ?? 'id';
    const all: T[] = [];
    let cursor: any = null;

    for (;;) {
        const result = await readQuery<any[]>(() => {
            let query: any = rawSupabase
                .from(table)
                .select(selectQuery)
                .order(orderBy, { ascending: true })
                .limit(pageSize);
            if (applyFilters) query = applyFilters(query);
            if (cursor !== null) query = query.gt(orderBy, cursor);
            return query;
        });

        if (result.error) throw result.error;

        const page = result.data ?? [];
        if (page.length === 0) break;

        all.push(...page);
        if (page.length < pageSize) break;

        cursor = (page[page.length - 1] as any)?.[orderBy];
        // 排序鍵為 null 時 keyset 無法繼續（例如未設 primary key 的舊資料），避免無窮迴圈
        if (cursor === undefined || cursor === null) break;
    }

    return all;
}

// 包裝後的 client（推薦在專案中都使用這個）
export const supabase = rawSupabase;

