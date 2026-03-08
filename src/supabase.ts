import { createClient } from '@supabase/supabase-js';
import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase URL or Anon Key in environment variables');
}

// 原始 client（不建議直接在業務程式碼中使用）
const rawSupabase = createClient(supabaseUrl, supabaseKey);

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
    table: string,
    values: T | T[],
    returning: 'minimal' | 'representation' = 'representation'
) {
    const snakeValues = toSnake(values);
    const { data, error, count, status, statusText } = await rawSupabase
        .from(table)
        .insert(snakeValues, { count: 'exact' })
        .select();

    return {
        data: data ? toCamel<T extends any[] ? T : T[]>(data) : null,
        error,
        count,
        status,
        statusText,
    };
}

export async function supabaseUpdate<T>(
    table: string,
    values: Partial<T>,
    filters: Record<string, any>,  // e.g. { id: 'uuid', email: 'test@example.com' }
    returning: 'minimal' | 'representation' = 'representation'
) {
    let query = rawSupabase.from(table).update(toSnake(values));

    const snakeFilters = toSnake(filters) as Record<string, any>;
    for (const [col, val] of Object.entries(snakeFilters)) {
        query = query.eq(col, val);
    }

    const { data, error, count, status, statusText } = await query
        .select()
        .maybeSingle();

    return {
        data: data ? toCamel<T>(data) : null,
        error,
        count,
        status,
        statusText,
    };
}

export async function supabaseUpsert<T>(
    table: string,
    values: T | T[],
    options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
    returning: 'minimal' | 'representation' = 'representation'
) {
    const snakeValues = toSnake(values);
    const { data, error, count, status, statusText } = await rawSupabase
        .from(table)
        .upsert(snakeValues, { ...options, count: 'exact' })
        .select();

    return {
        data: data ? toCamel<T extends any[] ? T : T[]>(data) : null,
        error,
        count,
        status,
        statusText,
    };
}

// 包裝後的 client（推薦在專案中都使用這個）
export const supabase = rawSupabase;
