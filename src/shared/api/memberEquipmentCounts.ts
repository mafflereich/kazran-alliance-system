import { supabase } from './supabase';
import {
  createEmptyMemberEquipmentCounts,
  extractMemberEquipmentCounts,
  type MemberEquipmentCounts,
} from '@/shared/lib/equipmentShowcase';

/**
 * MemberBoard 成員卡的 24C 裝備數量讀取。
 *
 * 效能設計：
 *   1. 優先呼叫輕量 RPC `get_member_equipment_showcase`（只回傳 3 個整數，
 *      不傳整包 equipment / records），大幅降低 payload 與 DB 負擔。
 *   2. 依成員 id 分塊（500 / 次）+ 限制同時請求數，避免單一請求過重。
 *   3. 同一成員的請求會去重（in-flight dedupe），component 重新 render
 *      或同時多處呼叫都不會重複打 API。
 *   4. 成功結果快取 5 分鐘，頁面切換回來不必重抓。
 *   5. 若資料庫尚未建立新 RPC，自動退回既有 `get_member_equipment`
 *      （仍會正確遮蔽隱私，只是 payload 較大）。
 */

const SHOWCASE_RPC = 'get_member_equipment_showcase';
const FALLBACK_RPC = 'get_member_equipment';
const CHUNK_SIZE = 500;
const MAX_CONCURRENT_CHUNKS = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  counts: MemberEquipmentCounts;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<MemberEquipmentCounts | null>>();
let showcaseRpcUnsupported = false;

const isMissingRpcError = (error: unknown): boolean => {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function|function .* does not exist|schema cache/i.test(message)
  );
};

const toCountOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
};

const mapShowcaseRows = (ids: string[], rows: any[] | null): Record<string, MemberEquipmentCounts> => {
  const rowsById = new Map<string, any>((rows ?? []).map(row => [String(row?.id), row]));
  const result: Record<string, MemberEquipmentCounts> = {};

  ids.forEach(id => {
    const row = rowsById.get(id);
    // RPC 對每個存在的成員都會回傳一列；沒有列代表成員不存在（例如尚未儲存的新成員）
    result[id] = row
      ? {
        venom_serpent: toCountOrNull(row.venom_serpent_c24),
        phys_glove_chief_majesty: toCountOrNull(row.chief_majesty_c24),
        magic_glove_guardian_scale: toCountOrNull(row.guardian_scale_c24),
      }
      : createEmptyMemberEquipmentCounts();
  });

  return result;
};

const mapFallbackRows = (ids: string[], rows: any[] | null): Record<string, MemberEquipmentCounts> => {
  const rowsById = new Map<string, any>((rows ?? []).map(row => [String(row?.id), row]));
  const result: Record<string, MemberEquipmentCounts> = {};

  ids.forEach(id => {
    const row = rowsById.get(id);
    // 舊 RPC：equipment 為 null 代表整張表不可見；有值則交給 extractor 判斷部位/C 值遮蔽
    result[id] = row
      ? extractMemberEquipmentCounts(row.equipment)
      : createEmptyMemberEquipmentCounts();
  });

  return result;
};

type ChunkResult = {
  ok: boolean;
  counts: Record<string, MemberEquipmentCounts>;
};

async function fetchChunk(ids: string[]): Promise<ChunkResult> {
  if (!showcaseRpcUnsupported) {
    const { data, error } = await supabase.rpc(SHOWCASE_RPC, { p_member_ids: ids });

    if (!error) {
      return { ok: true, counts: mapShowcaseRows(ids, data) };
    }

    if (!isMissingRpcError(error)) {
      console.error('Error fetching member equipment counts:', error);
      return { ok: false, counts: {} };
    }

    showcaseRpcUnsupported = true;
    console.warn(
      `[memberEquipmentCounts] ${SHOWCASE_RPC} 尚未建立，改用 ${FALLBACK_RPC}。` +
      '請執行 docs/sql/member_equipment_showcase_counts.sql 以獲得最佳效能。',
    );
  }

  const { data, error } = await supabase.rpc(FALLBACK_RPC, { p_member_ids: ids });
  if (error) {
    console.error('Error fetching member equipment (fallback):', error);
    return { ok: false, counts: {} };
  }

  return { ok: true, counts: mapFallbackRows(ids, data) };
}

/**
 * 取得成員的 24C 毒蛇 / 主神 / 龍鱗數量。
 * 回傳的 map 只包含「本次成功取得」的成員；失敗的成員不會有 key。
 */
export async function fetchMemberEquipmentCounts(
  memberIds: string[],
  options: { force?: boolean } = {},
): Promise<Record<string, MemberEquipmentCounts>> {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  const result: Record<string, MemberEquipmentCounts> = {};
  if (ids.length === 0) return result;

  const force = options.force === true;
  const now = Date.now();
  const waits: Promise<void>[] = [];
  const missing: string[] = [];

  ids.forEach(id => {
    if (!force) {
      const cached = cache.get(id);
      if (cached && cached.expiresAt > now) {
        result[id] = cached.counts;
        return;
      }
    }

    const inFlight = pending.get(id);
    if (inFlight) {
      waits.push(inFlight.then(counts => {
        if (counts) result[id] = counts;
      }));
      return;
    }

    missing.push(id);
  });

  if (waits.length > 0) {
    await Promise.all(waits);
  }
  if (missing.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    chunks.push(missing.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS);

    await Promise.all(batch.map(async chunk => {
      const chunkPromise = fetchChunk(chunk);

      chunk.forEach(id => {
        pending.set(id, chunkPromise.then(chunkResult => (
          chunkResult.ok ? (chunkResult.counts[id] ?? null) : null
        )));
      });

      try {
        const { ok, counts } = await chunkPromise;
        if (!ok) return;

        const expiresAt = Date.now() + CACHE_TTL_MS;
        chunk.forEach(id => {
          const value = counts[id] ?? createEmptyMemberEquipmentCounts();
          result[id] = value;
          cache.set(id, { counts: value, expiresAt });
        });
      } finally {
        chunk.forEach(id => pending.delete(id));
      }
    }));
  }

  return result;
}

/** 清除快取（不帶 id 時全部清除）；裝備資料更新後可呼叫。 */
export function invalidateMemberEquipmentCounts(memberIds?: string[]): void {
  if (!memberIds || memberIds.length === 0) {
    cache.clear();
    return;
  }
  memberIds.forEach(id => cache.delete(id));
}
