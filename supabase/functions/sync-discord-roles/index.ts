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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const { user_id, discord_id, username } = await req.json();

  if (!user_id || !discord_id || !username) {
    return new Response(JSON.stringify({ error: "缺少參數" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!DISCORD_BOT_TOKEN) {
    console.error("Missing DISCORD_BOT_TOKEN environment variable");
    return new Response(JSON.stringify({ error: "伺服器設定錯誤：缺少 Discord Bot Token" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Discord API Error (${response.status}):`, errorText);
      if (response.status === 401) {
        throw new Error("Discord Bot Token 無效或已過期 (401)");
      } else if (response.status === 403) {
        throw new Error("Discord Bot 沒有權限讀取該伺服器的成員資訊 (403)");
      } else if (response.status === 404) {
        throw new Error("找不到該 Discord 成員或伺服器 (404)");
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
    }

    // 判斷角色等級
    let role = '';
    if (memberRoleIds.includes("1251021144144740372")) {
      role = 'admin'; // 管理員
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

    // 更新 JWT custom claims
    await supabase.auth.admin.updateUserById(user_id, {
      user_metadata: { role, guild_roles: guildRoles.join(',') }
    });

    return new Response(
      JSON.stringify({ success: true, role, guild_roles: guildRoles.join(',') }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
