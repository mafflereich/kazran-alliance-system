-- ============================================================
-- 待審認領申請：一次回傳審核需要的所有資訊
--
-- 為什麼需要這支：
--   原本前端直接查 member_claim_requests 再 embed members(name)，
--   但審核的人最需要的是「這是哪個公會的人、他 Discord 叫什麼、什麼時候申請的」，
--   這些分散在 members / guilds / profiles 三張表，用 PostgREST 連續 embed
--   會受限於 FK 是否存在（member_claim_requests.discord_id 沒有 FK 到 profiles）。
--
--   改成一支 SECURITY DEFINER 的 RPC：
--     * 一次 join 完，單一往返
--     * 權限也在此收斂：管理者看全部；公會幹部只看自己公會的成員
--
-- 可重複執行。
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_pending_claims()
RETURNS TABLE (
  member_id        text,
  member_name      text,
  member_role      text,
  guild_id         text,
  guild_name       text,
  discord_id       text,
  discord_username text,
  display_name     text,
  requested_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.member_id,
    m.name,
    m.role,
    m.guild_id,
    g.name,
    r.discord_id,
    p.discord_username,
    p.display_name,
    r.requested_at
  FROM public.member_claim_requests r
  JOIN public.members m   ON m.id = r.member_id
  LEFT JOIN public.guilds g   ON g.id = m.guild_id
  LEFT JOIN public.profiles p ON p.discord_id = r.discord_id
  WHERE r.status = 'pending'
    AND (
      public.is_manager()
      OR m.guild_id IN (SELECT public.my_guild_ids())
    )
  ORDER BY r.requested_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_claims() TO authenticated;

-- 驗證（以 manager 身分應該看得到全部待審；一般成員應為 0 筆）：
--   select * from public.list_pending_claims();
