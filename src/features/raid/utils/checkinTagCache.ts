/**
 * 簽到催辦名單的 Discord 標記解析快取。
 *
 * 貝拉的 `/api/checkinTags` 有 rate limit，因此：
 *   1. 只有在使用者「手動點擊」解析按鈕時才發出 request（見 CheckInAnnounceModal）
 *   2. 解析結果依（公會、名單回合、成員集合）寫入 localStorage，
 *      TTL 內重開視窗或切回同一個回合都不會再打 API
 */

export interface CheckinTagResolution {
  /** 貝拉組好的完整公告內容（含真正的 Discord `<@id>` 標記） */
  message: string;
  /** Discord 端找不到對應帳號的成員名稱 */
  notFound: string[];
  /** 解析時間（epoch ms） */
  resolvedAt: number;
}

const STORAGE_KEY = 'kazran.checkinTags.cache.v1';

/** 快取有效期（12 小時）：名單內容一變 cache key 就會改變，不需要更短的 TTL */
export const CHECKIN_TAG_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** 保留上限，避免 localStorage 無限制成長 */
const MAX_CACHE_ENTRIES = 30;

type CacheStore = Record<string, CheckinTagResolution>;

function readStore(): CacheStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as CacheStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 無痕模式或額度已滿：當作沒有快取，不影響主要功能
  }
}

/** FNV-1a：把成員清單壓成短簽章，避免 localStorage key 過長 */
function hashSignature(signature: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < signature.length; i += 1) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * 建立快取 key：公會 + 名單回合 + 成員集合 + 公會名稱（公告標題會用到）。
 * 名單內容改變（例如有人補簽、換回合）就會得到新的 key，不會誤用舊名單。
 */
export function buildCheckinTagCacheKey(params: {
  guildId: string;
  guildName: string;
  target: string;
  memberIds: readonly string[];
}): string {
  const { guildId, guildName, target, memberIds } = params;
  const signature = [guildName, ...memberIds].sort().join('\u0001');
  return `${guildId}|${target}|${memberIds.length}|${hashSignature(signature)}`;
}

function isFresh(entry: CheckinTagResolution | undefined, now: number): entry is CheckinTagResolution {
  if (!entry || typeof entry.resolvedAt !== 'number') return false;
  const age = now - entry.resolvedAt;
  return age >= 0 && age < CHECKIN_TAG_CACHE_TTL_MS;
}

export function readCheckinTagCache(key: string, now: number = Date.now()): CheckinTagResolution | null {
  const entry = readStore()[key];
  return isFresh(entry, now) ? entry : null;
}

export function writeCheckinTagCache(
  key: string,
  entry: Pick<CheckinTagResolution, 'message' | 'notFound'>,
): CheckinTagResolution {
  const now = Date.now();
  const store = readStore();

  // 順手清掉過期資料
  for (const [storeKey, value] of Object.entries(store)) {
    if (!isFresh(value, now)) delete store[storeKey];
  }

  const record: CheckinTagResolution = {
    message: typeof entry.message === 'string' ? entry.message : '',
    notFound: Array.isArray(entry.notFound) ? entry.notFound : [],
    resolvedAt: now,
  };
  store[key] = record;

  // 超過上限時丟掉最舊的
  const entries = Object.entries(store);
  if (entries.length > MAX_CACHE_ENTRIES) {
    entries
      .sort((a, b) => a[1].resolvedAt - b[1].resolvedAt)
      .slice(0, entries.length - MAX_CACHE_ENTRIES)
      .forEach(([storeKey]) => delete store[storeKey]);
  }

  writeStore(store);
  return record;
}

/** 清除所有簽到標記快取（測試或需要強制重抓時使用） */
export function clearCheckinTagCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
