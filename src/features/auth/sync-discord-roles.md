// @ts-nocheck
// supabase/functions/sync-discord-roles/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GUILD_ID = "874685031912710164";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 輔助寫入 system_logs 的函式
async function logSystemEvent(
  level: 'info' | 'warn' | 'error' | 'fatal',
  action: string,
  message: string,
  details: any = {},
  userId: string | null = null,
  discordId: string | null = null
) {
  try {
    await supabase.from('system_logs').insert({
      level,
      source: 'edge_sync_discord',
      action,
      message,
      user_id: userId,
      discord_id: discordId,
      details
    });
  } catch (e) {
    console.error("Failed to write to system_logs:", e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let parsedBody: any = {};

  try {
    // 1. 嘗試解析 body 以便在後續錯誤中能記錄 user_id 和 discord_id
    // 注意：req.json() 只能呼叫一次，所以我們先存起來
    parsedBody = await req.json().catch(() => ({}));
    const { user_id, discord_id, username } = parsedBody;

    // 2. 驗證 JWT (這是修復 401 的關鍵)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      await logSystemEvent('error', 'missing_auth_header', 'Missing Authorization header', {}, user_id, discord_id);
      throw new Error("Missing Authorization header");
    }
    
    // 建立一個使用 User Token 的 Client 來驗證身分
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!, // 注意這裡用 Anon Key
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      console.error("JWT 驗證失敗:", authError);
      await logSystemEvent('error', 'jwt_verification_failed', 'JWT 驗證失敗', { error: authError }, user_id, discord_id);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. 驗證通過後，才執行後面的邏輯 (使用 SERVICE_ROLE_KEY 的 supabase 實例)
    if (!user_id || !discord_id || !username) {
      await logSystemEvent('warn', 'missing_parameters', '缺少參數', { parsedBody }, user_id, discord_id);
      return new Response(JSON.stringify({ error: "缺少參數" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!DISCORD_BOT_TOKEN) {
      console.error("Missing DISCORD_BOT_TOKEN environment variable");
      await logSystemEvent('fatal', 'missing_bot_token', '伺服器設定錯誤：缺少 Discord Bot Token', {}, user_id, discord_id);
      return new Response(JSON.stringify({ error: "伺服器設定錯誤：缺少 Discord Bot Token" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // 從 Discord API 取得成員角色
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discord_id}`,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(response);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Discord API Error (${response.status}):`, errorText);

      // 【修正】解析 Discord 的錯誤碼，方便分辨真正的失敗原因：
      //   10007 Unknown Member → 使用者真的不在伺服器（或被踢／退出／封鎖）
      //   10004 Unknown Guild / 50001 Missing Access → Bot 不在伺服器或沒有 GUILD_MEMBERS 權限
      //   （這兩種都會回 404/403，過去只記下 status，無法分辨）
      let discordCode: number | null = null;
      let discordMessage: string | null = null;
      try {
        const parsed = JSON.parse(errorText);
        discordCode = parsed?.code ?? null;
        discordMessage = parsed?.message ?? null;
      } catch (_) {
        // 非 JSON 內容，維持 null
      }

      await logSystemEvent('error', 'discord_api_error', `Discord API 錯誤: ${response.status}`, { errorText, status: response.status, discordCode, discordMessage }, user_id, discord_id);
      
      if (response.status === 401) {
        throw new Error("Discord Bot Token 無效或已過期 (401)");
      } else if (response.status === 403) {
        throw new Error("Discord Bot 沒有權限讀取該伺服器的成員資訊 (403)");
      } else if (response.status === 404) {
        throw new Error(`找不到該 Discord 成員或伺服器 (404)${discordMessage ? ` - ${discordMessage}` : ''}`);
      }
      throw new Error(`Discord API 錯誤: ${response.status} - ${errorText}`);
    }

    const member = await response.json();
    const memberRoleIds = member.roles as string[];

    // 取得伺服器所有角色資訊以獲取名稱
    const rolesResponse = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/roles`,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    let guildRoles: string[] = [];
    if (rolesResponse.ok) {
      const allRoles = await rolesResponse.json();

      guildRoles = allRoles
        .filter((r: any) => r.name.match(/公會成員.+棕色2/) && memberRoleIds.includes(r.id))
        .map((r: any) => r.name.split("-")[0]);
    } else {
      const rolesErrorText = await rolesResponse.text();
      await logSystemEvent('warn', 'discord_roles_api_error', `無法取得伺服器角色列表: ${rolesResponse.status}`, { errorText: rolesErrorText }, user_id, discord_id);
    }

    // 判斷角色等級
    let role = '';
    if (memberRoleIds.includes("1251021144144740372")) {
      role = 'manager'; // 管理員
    } else if (memberRoleIds.includes("1404976598507323393")) {
      role = 'member'; // 一般成員
    }

    // 檢查是否為 creator
    const { data: existingUser } = await supabase
      .from("admin_users")
      .select("role")
      .eq("username", username)
      .single();

    if (existingUser?.role === 'creator') {
      role = 'creator';
    }
    else if (existingUser?.role === 'admin') {
      role = 'admin';
    }


    // 透過 Discord nickname 與 members.name 進行模糊比對 (includes)
    const displayName = member.nick?.toString();
    console.log(member);
    
    // 1. 先預設比對失敗，id 給空值 (null)
    let matchedId = null;

    const { data: memberRows, error: memberRowsErr } = await supabase
      .from('members')
      .select('id, name')
      .eq('status', 'active');

    // 2. 嘗試比對：只有在有抓到資料，且玩家有 displayName 的情況下才比對
    if (!memberRowsErr && Array.isArray(memberRows) && displayName) {
      const matchedMember = memberRows.find((m: any) => {
        if (!m?.name) return false;
        const memberName = m.name.toString();
        return displayName.replace(/(\[[^]*\])|(\([^]*\))/g,"") == memberName;
      });

      // 如果有找到人，就把預設的 null 替換成真實的 id
      if (matchedMember) {
        matchedId = matchedMember.id;
      }
    }

    // 3. 準備資料列 (這段已經移出 if 外面，保證一定會執行)
    const cleanedUsername = username?.endsWith('#0') ? username.slice(0, -2) : username;

    // 查詢現有 profile 的 id，若已與 matchedId 相同則不重複寫入
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('discord_id', discord_id)
      .single();

    let shouldUpdateId = matchedId !== null && !existingProfile?.id?.includes(matchedId);

    // 【修正 23505】profiles.id 上有唯一性約束 (profiles_id_key)。
    // 若 matchedId 已被「其他 Discord 帳號」的 profile 佔用（同暱稱的第二個帳號、
    // 管理員手動綁定、或玩家換帳號後舊 profile 沒解除），直接寫入 id 會觸發
    // 23505 duplicate key → 整筆 upsert 失敗 → profiles 沒有這一列 →
    // 前端查不到 profile，就誤顯示「您不在指定的公會聯盟中」並把使用者登出。
    // 因此這裡先檢查佔用者：被別人綁走時不搶綁定，只同步角色，
    // 綁定衝突交由管理員處理（SQL：docs/sql/fix_profiles_id_conflict.sql）。
    if (shouldUpdateId && matchedId) {
      const { data: owner } = await supabase
        .from('profiles')
        .select('discord_id, discord_username')
        .eq('id', matchedId)
        .maybeSingle();

      if (owner && owner.discord_id !== discord_id) {
        shouldUpdateId = false;
        await logSystemEvent(
          'warn',
          'id_conflict',
          '成員已被其他 Discord 帳號綁定，本次僅同步角色、不覆寫綁定',
          { member_id: matchedId, owner_discord_id: owner.discord_id, owner_username: owner.discord_username },
          user_id,
          discord_id
        );
      }
    }
    
    const dataRow: Record<string, any> = {
      discord_id: discord_id,
      discord_username: cleanedUsername, // 新增：儲存 Discord 的 username (已移除 #0)
      ...(shouldUpdateId ? { id: matchedId } : {}),
      auth_id: user_id || null,
      user_role: role || null,
      user_guilds: guildRoles.join(',') || null,
      display_name: displayName || null,
      avatar_url: getMemberAvatarUrl(member) || null
    };

    // 4. 無條件執行 upsert 寫入 profiles
    let { error: upsertError } = await supabase
      .from('profiles')
      .upsert(dataRow, { onConflict: 'discord_id' });

    // 【修正 23505】保險機制：若仍因 profiles_id_key 衝突而失敗
    // （例如兩個同暱稱帳號同時登入，上面的佔用檢查被 race condition 繞過），
    // 拿掉 id 再寫一次，確保 profile 一定能建立，使用者不會被鎖在門外。
    if (upsertError && upsertError.code === '23505' && (upsertError.message || '').includes('profiles_id_key')) {
      await logSystemEvent(
        'warn',
        'id_conflict_fallback',
        'upsert 因 profiles_id_key 衝突失敗，改為不寫入 id 重試',
        { member_id: matchedId, error: upsertError.message },
        user_id,
        discord_id
      );

      const rowWithoutId: Record<string, any> = { ...dataRow };
      delete rowWithoutId.id;

      const retry = await supabase
        .from('profiles')
        .upsert(rowWithoutId, { onConflict: 'discord_id' });

      upsertError = retry.error;
    }
      
    if (upsertError) {
       console.error("寫入 profiles 發生錯誤:", upsertError);
       // 這是最關鍵的 Log：紀錄 Upsert 失敗的詳細原因與當下的 dataRow
       await logSystemEvent('error', 'upsert_profile_failed', '寫入 profiles 發生錯誤', { error: upsertError, dataRow }, user_id, discord_id);

       // 【修正】明確回傳失敗狀態，讓前端能區分「同步失敗」與「真的不在伺服器」，
       // 不再一律顯示 not_in_guild（前端會改顯示 login.sync_failed）。
       return new Response(
         JSON.stringify({ error: "寫入 profiles 失敗", code: "upsert_failed", detail: upsertError.message }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
    }

    // 成功時記錄一筆 Info（boundId 為 null 代表本次沒有寫入成員綁定）
    await logSystemEvent('info', 'sync_success', '成功同步 Discord 角色與 Profile', { role, guildRoles, matchedId, boundId: dataRow.id ?? null }, user_id, discord_id);

    return new Response(
      JSON.stringify({ success: true, role, guildRoles: guildRoles.join(',') }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    // 捕捉所有未預期的例外錯誤 (例如 getMemberAvatarUrl 裡的 BigInt 轉換錯誤)
    await logSystemEvent('fatal', 'unhandled_exception', err.message || '未知的例外錯誤', { stack: err.stack, parsedBody }, parsedBody?.user_id, parsedBody?.discord_id);
    
    return new Response(
      JSON.stringify({ error: err.message, code: 'sync_failed' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getMemberAvatarUrl(
  member: { user: { id: any; avatar: any; }; avatar: any; },
  size: number = 512
): string {
  const userId = member.user?.id;
  const guildAvatarHash = member.avatar;
  const globalAvatarHash = member.user?.avatar;

  let baseUrl: string;
  let hash: string;

  if (guildAvatarHash) {
    // 優先伺服器專屬
    baseUrl = `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${userId}/avatars/${guildAvatarHash}`;
    hash = guildAvatarHash;
  } else if (globalAvatarHash) {
    // fallback 全域
    baseUrl = `https://cdn.discordapp.com/avatars/${userId}/${globalAvatarHash}`;
    hash = globalAvatarHash;
  } else {
    // 完全沒頭像 → 預設
    // 【修正】userId 為 undefined 時 BigInt 會拋錯 → 被外層 catch 變成
    // unhandled_exception (500) → 整個同步失敗、使用者被誤判不在伺服器。
    // 因此先退回 index 0，不讓頭像問題擋掉登入。
    if (!userId) {
      return `https://cdn.discordapp.com/embed/avatars/0.png?size=${size}`;
    }
    const defaultIndex = Number(BigInt(userId) >> 22n) % 6; // 新系統推薦
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png?size=${size}`;
  }

  // 判斷是否 animated
  const isAnimated = hash.startsWith('a_');
  const extension = isAnimated ? '.gif' : '.png';

  return `${baseUrl}${extension}?size=${size}`;
}


