import { supabase } from './supabase';
import { readQuery } from './http';

/**
 * 敏感欄位（equipment / records / exclusive_weapons / refining_traces）
 * 只能透過 `get_member_equipment` RPC 讀取（一般成員的 base SELECT
 * 已 REVOKE，且依隱私級別遮蔽）。此 helper 統一負責撈取並合併。
 *
 * 重要：失敗時 **不可以** 靜默跳過。
 *   舊版在 chunk 失敗時 `continue`，結果是「裝備畫面空白、但沒有任何錯誤」，
 *   使用者會以為資料不見了。現在改成回報失敗的成員，由呼叫端提示/重試。
 */

const CHUNK_SIZE = 500;

export interface MemberSecretRow {
  equipment: any;
  records: any;
  exclusiveWeapons: any;
  refiningTraces?: number | null;
}

export interface MemberSecretsLoad {
  /** 成功取得的成員資料 */
  secrets: Record<string, MemberSecretRow>;
  /** 失敗（整個 chunk 打不回來）的成員 id */
  failedMemberIds: string[];
  /** 失敗的 chunk 數 */
  failedChunks: number;
}

/** 讀取成員敏感資料，並回報哪些成員失敗（不 throw，讓呼叫端決定如何提示）。 */
export async function loadMemberSecrets(memberIds: string[]): Promise<MemberSecretsLoad> {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  const secrets: Record<string, MemberSecretRow> = {};
  const failedMemberIds: string[] = [];
  let failedChunks = 0;

  if (ids.length === 0) return { secrets, failedMemberIds, failedChunks };

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);

    // 分塊呼叫：避免單一 request 攜帶過大 p_member_ids 陣列，
    // 也避免 DB 端單一語句一次處理太多成員（配合 DB 端集合式 RPC）。
    const { data, error } = await readQuery<any[]>(() =>
      supabase.rpc('get_member_equipment', { p_member_ids: chunk })
    );

    if (error || !data) {
      failedChunks += 1;
      failedMemberIds.push(...chunk);
      console.error(
        `[memberSecrets] get_member_equipment 失敗（chunk ${i / CHUNK_SIZE}，${chunk.length} 位成員）:`,
        error,
      );
      continue;
    }

    data.forEach((row: any) => {
      if (!row || !row.id) return;
      secrets[String(row.id)] = {
        equipment: row.equipment ?? undefined,
        records: row.records ?? undefined,
        exclusiveWeapons: row.exclusive_weapons ?? undefined,
        refiningTraces: row.refining_traces ?? undefined,
      };
    });
  }

  return { secrets, failedMemberIds, failedChunks };
}

/**
 * 相容舊介面：只回傳成功取得的資料。
 * 新程式碼請改用 `loadMemberSecrets`，才能知道有沒有漏資料。
 */
export async function fetchMemberSecrets(memberIds: string[]): Promise<Record<string, MemberSecretRow>> {
  const { secrets } = await loadMemberSecrets(memberIds);
  return secrets;
}

/** 可被敏感資料覆寫的成員物件（前端 Member 一定符合） */
interface SecretableMember {
  id?: string | null;
  equipment?: any;
  records?: any;
  exclusiveWeapons?: any;
  refiningTraces?: number | null;
}

/** 將 RPC 回傳的敏感資料合併進 member 物件（只覆寫有回傳列的成員）。 */
export function applySecretsToMembers<T extends SecretableMember>(
  members: T[],
  secrets: Record<string, MemberSecretRow>,
): T[] {
  return members.map((m) => {
    if (!m?.id) return m;
    const secret = secrets[String(m.id)];
    if (!secret) return m;
    return {
      ...m,
      equipment: secret.equipment ?? m.equipment,
      records: secret.records ?? m.records,
      exclusiveWeapons: secret.exclusiveWeapons ?? m.exclusiveWeapons,
      refiningTraces: secret.refiningTraces ?? m.refiningTraces,
    };
  });
}

