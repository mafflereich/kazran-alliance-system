import { supabase } from './supabase';

/**
 * 敏感欄位（equipment / records / exclusive_weapons / refining_traces）
 * 只能透過 `get_member_equipment` RPC 讀取（一般成員的 base SELECT
 * 已 REVOKE，且依隱私級別遮蔽）。此 helper 統一負責撈取並合併。
 */

export interface MemberSecretRow {
  equipment: any;
  records: any;
  exclusiveWeapons: any;
  refiningTraces?: number | null;
}

export async function fetchMemberSecrets(memberIds: string[]): Promise<Record<string, MemberSecretRow>> {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  // 分塊呼叫，避免單一 request 攜帶過大 p_member_ids 陣列，
  // 也避免 DB 端單一語句一次處理太多成員（配合 DB 端集合式 RPC）。
  const CHUNK_SIZE = 500;
  const map: Record<string, MemberSecretRow> = {};

  try {
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase.rpc('get_member_equipment', {
        p_member_ids: chunk,
      });
      if (error) {
        console.error(`Error fetching member sensitive data (chunk ${i / CHUNK_SIZE}):`, error);
        continue;
      }

      (data || []).forEach((row: any) => {
        if (!row || !row.id) return;
        map[String(row.id)] = {
          equipment: row.equipment ?? undefined,
          records: row.records ?? undefined,
          exclusiveWeapons: row.exclusive_weapons ?? undefined,
          refiningTraces: row.refining_traces ?? undefined,
        };
      });
    }
    return map;
  } catch (err) {
    console.error('Error calling get_member_equipment:', err);
    return {};
  }
}

/** 將 RPC 回傳的敏感資料合併進 member 物件（只覆寫有回傳列的成員）。 */
export function applySecretsToMembers<T extends { id?: string | null }>(
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
