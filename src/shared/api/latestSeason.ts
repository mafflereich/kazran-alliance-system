import { supabase } from './supabase';
import { readQuery } from './http';

/**
 * 目前最新賽季 id（`raid_seasons.id` 是 integer，取最大值＝最新賽季）。
 *
 * 為什麼要快取：
 *   `fetchMembers` / `fetchAllMembers` / `searchMembers` 每次都需要它，
 *   原本各自打一次 `raid_seasons` 查詢；同一頁面切換時會重複打好幾次。
 *   快取 30 秒可省下這些重複請求；建立/封存賽季時呼叫
 *   `invalidateLatestSeasonId()` 立即失效。
 */

const TTL_MS = 30_000;

let cached: { id: number | null; expiresAt: number } | null = null;
let inFlight: Promise<number | null> | null = null;

export async function getLatestSeasonId(): Promise<number | null> {
    if (cached && cached.expiresAt > Date.now()) return cached.id;
    if (inFlight) return inFlight;

    inFlight = (async () => {
        const { data, error } = await readQuery<{ id: number }>(() =>
            supabase
                .from('raid_seasons')
                .select('id')
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle()
        );

        if (error) {
            console.error('Error fetching latest raid season:', error);
            return null;
        }

        const id = data?.id ?? null;
        cached = { id, expiresAt: Date.now() + TTL_MS };
        return id;
    })();

    try {
        return await inFlight;
    } finally {
        inFlight = null;
    }
}

/** 建立 / 封存賽季後呼叫，讓下一次讀取重新查詢。 */
export function invalidateLatestSeasonId(): void {
    cached = null;
}
