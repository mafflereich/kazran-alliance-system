-- ============================================================
-- 多重綁定：一個 Discord 帳號可以認領多個遊戲帳號
--
-- 背景：
--   有些人一個 Discord 對應多個遊戲帳號（分身 / 轉服），
--   這也是後台「多重匹配」存在的原因。資料層本來就支援
--   （profile_members：一個 profile_id 對多個 member_id），
--   但認領流程把它卡住了：
--     1. member_claim_requests 有「每個 discord_id 只能一筆 pending」的唯一索引
--     2. request_member_claim 會刪掉同一個人的其他待審申請
--     3. 前端只顯示單一申請，且核准後 Modal 就消失，無法再加第二個
--
-- 本檔：
--   * 移除「每人一筆 pending」限制（改為上限 5 筆，避免亂槍打鳥）
--   * 新增 my_claims()（自己的所有申請）與 my_bound_members()（目前已綁定）
--   * approve_member_claim：若該成員「已經綁在自己名下」→ 直接視為核准（可重複送審）
--
-- 可重複執行。
-- ============================================================

DROP INDEX IF EXISTS public.member_claim_requests_one_pending_per_user;

-- ------------------------------------------------------------
-- STEP 1：request_member_claim（允許多筆）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_member_claim(p_member_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth    uuid := auth.uid();
  v_discord text;
  v_pending integer;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT cp.discord_id INTO v_discord
  FROM public.current_profile() cp
  LIMIT 1;

  IF v_discord IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = p_member_id AND COALESCE(m.status, '') <> 'archived'
  ) THEN
    RAISE EXCEPTION 'member_not_found';
  END IF;

  -- 已經綁在「自己」名下 → 不用再申請
  IF EXISTS (
    SELECT 1 FROM public.profile_members pm
    WHERE pm.member_id = p_member_id AND pm.profile_id = v_discord
  ) THEN
    RAISE EXCEPTION 'already_bound_to_you';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profile_members pm WHERE pm.member_id = p_member_id
  ) THEN
    RAISE EXCEPTION 'already_bound';
  END IF;

  -- 同一位成員已有人申請中：不要覆蓋別人的申請
  IF EXISTS (
    SELECT 1 FROM public.member_claim_requests r
    WHERE r.member_id = p_member_id
      AND r.status = 'pending'
      AND r.discord_id <> v_discord
  ) THEN
    RAISE EXCEPTION 'already_requested_by_another';
  END IF;

  -- 一個人同時最多 5 筆待審（多帳號需求，但仍要防止亂槍打鳥）
  SELECT count(*) INTO v_pending
  FROM public.member_claim_requests r
  WHERE r.discord_id = v_discord AND r.status = 'pending';

  IF v_pending >= 5 AND NOT EXISTS (
    SELECT 1 FROM public.member_claim_requests r
    WHERE r.member_id = p_member_id AND r.discord_id = v_discord AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'too_many_pending_claims';
  END IF;

  INSERT INTO public.member_claim_requests (member_id, discord_id, auth_id, status)
  VALUES (p_member_id, v_discord, v_auth, 'pending')
  ON CONFLICT (member_id) DO UPDATE
    SET discord_id   = EXCLUDED.discord_id,
        auth_id      = EXCLUDED.auth_id,
        status       = 'pending',
        note         = NULL,
        requested_at = now(),
        reviewed_by  = NULL,
        reviewed_at  = NULL
    WHERE public.member_claim_requests.status <> 'approved';

  RETURN 'pending';
END;
$$;

-- ------------------------------------------------------------
-- STEP 2：自己的申請清單（含已駁回）與目前已綁定的成員
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_claims()
RETURNS TABLE (
  member_id    text,
  member_name  text,
  guild_name   text,
  status       text,
  requested_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.member_id, m.name, g.name, r.status, r.requested_at
  FROM public.member_claim_requests r
  JOIN public.members m      ON m.id = r.member_id
  LEFT JOIN public.guilds g  ON g.id = m.guild_id
  WHERE r.discord_id = (
          SELECT cp.discord_id FROM public.current_profile() cp LIMIT 1
        )
  ORDER BY r.requested_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.my_bound_members()
RETURNS TABLE (
  member_id   text,
  member_name text,
  guild_name  text,
  role        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.name, g.name, m.role
  FROM public.current_profile() cp
  JOIN public.profile_members pm ON pm.profile_id = cp.discord_id
  JOIN public.members m         ON m.id = pm.member_id
  LEFT JOIN public.guilds g     ON g.id = m.guild_id
  ORDER BY m.name;
$$;

-- ------------------------------------------------------------
-- STEP 3：approve_member_claim
--   * 已被「別人」綁走 → 結案不覆蓋
--   * 已綁在「申請者本人」名下（重複送審）→ 只更新狀態，不重複寫入
--   其餘：把 member 併入申請者的 profiles.id（UNION，天然支援多綁定），
--   再由 trigger 同步 profile_members / user_guilds
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_member_claim(p_member_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req      public.member_claim_requests%ROWTYPE;
  v_reviewer text;
BEGIN
  SELECT * INTO v_req
  FROM public.member_claim_requests
  WHERE member_id = p_member_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_pending_request';
  END IF;

  IF NOT (
    public.is_manager()
    OR (
      public.can_edit_raid_record()
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = p_member_id
          AND m.guild_id IN (SELECT public.my_guild_ids())
      )
    )
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- 已被別人綁走
  IF EXISTS (
    SELECT 1 FROM public.profile_members pm
    WHERE pm.member_id = p_member_id
      AND pm.profile_id <> v_req.discord_id
  ) THEN
    UPDATE public.member_claim_requests
    SET status = 'rejected', note = 'already_bound', reviewed_at = now()
    WHERE member_id = p_member_id;
    RAISE EXCEPTION 'already_bound';
  END IF;

  SELECT cp.discord_id INTO v_reviewer FROM public.current_profile() cp LIMIT 1;

  -- 尚未綁在申請者名下才需要寫入（重複送審時直接跳到狀態更新）
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_members pm
    WHERE pm.member_id = p_member_id
      AND pm.profile_id = v_req.discord_id
  ) THEN
    UPDATE public.profiles p
    SET id = NULLIF((
      SELECT string_agg(DISTINCT x, ',' ORDER BY x)
      FROM (
        SELECT btrim(t) AS x
        FROM unnest(string_to_array(COALESCE(p.id, ''), ',')) AS t
        WHERE btrim(t) <> ''
        UNION
        SELECT p_member_id
      ) s
    ), '')
    WHERE p.auth_id = v_req.auth_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'applicant_profile_not_found';
    END IF;
  END IF;

  UPDATE public.member_claim_requests
  SET status = 'approved', reviewed_by = v_reviewer, reviewed_at = now()
  WHERE member_id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_member_claim(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_claims() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_bound_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_member_claim(text) TO authenticated;

-- 驗證：
--   select * from public.my_bound_members();   -- 目前已綁定的成員（可多筆）
--   select * from public.my_claims();          -- 自己的申請（含 pending / rejected）
-- ------------------------------------------------------------
-- 回滾：把 request_member_claim / approve_member_claim 還原成 96000 的版本，
--       並重建 member_claim_requests_one_pending_per_user 索引。
-- ------------------------------------------------------------

