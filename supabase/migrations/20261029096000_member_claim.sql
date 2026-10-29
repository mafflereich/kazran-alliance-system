-- ============================================================
-- 身分認領（自助綁定 + 會長/管理員審核）
--
-- 背景：
--   目前綁定完全依賴「Discord 暱稱 == members.name」。
--   為了讓比對穩定，還得限制成員不能改暱稱；一旦撞名或改名，
--   輕則綁錯人，重則 23505 導致登入直接被登出（not_in_guild）。
--   線上目前有 224 位 active 成員尚未綁定 → 他們根本登不進來。
--
-- 本檔提供：
--   1. profiles：允許本人建立自己的 profile（id 必須為 NULL，不可自行指定成員）
--   2. member_claim_requests：認領申請（一成員一筆，可由本人重送）
--   3. RPC：
--      search_claimable_members()  以「遊戲名稱」搜尋可認領的成員（最少 2 字，最多 20 筆）
--      request_member_claim()      送出認領申請（本人）
--      my_pending_claim()          查詢自己的申請狀態
--      approve_member_claim()      核准（管理者 / 該公會幹部）
--      reject_member_claim()       駁回
--
-- 核准後只寫 profiles.id（申請者）→ 既有 trigger 會同步 profile_members、
-- 處理「搶奪」與 user_guilds，不需要在 RPC 內重複實作。
--
-- 可重複執行。回滾見檔尾。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：本人可建立自己的 profile
--
-- 這是「登入不再依賴暱稱比對」的關鍵：
--   找不到 profile 時，前端可自行建立一筆「尚未綁定任何成員」的 profile，
--   使用者就能登入並看到認領頁，而不是被強制登出。
--
-- 安全限制（很重要）：
--   * auth_id 必須是自己
--   * id 必須是 NULL —— 否則任何人都能把 id 設成別人的 member id，
--     透過同步 trigger 直接搶走別人的身分
--   * user_role 只能是 'member'，避免自行提權
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth_id = auth.uid()
    AND COALESCE(user_role, 'member') = 'member'
    AND id IS NULL
  );

-- ------------------------------------------------------------
-- STEP 2：認領申請
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_claim_requests (
  member_id    text PRIMARY KEY
               REFERENCES public.members(id) ON DELETE CASCADE,
  discord_id   text NOT NULL,
  auth_id      uuid NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected')),
  note         text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by  text,
  reviewed_at  timestamptz
);

COMMENT ON TABLE public.member_claim_requests IS
  '成員認領申請：玩家自助認領某位成員，由管理者或該公會幹部核准後寫入 profile_members';

CREATE INDEX IF NOT EXISTS member_claim_requests_status_idx
  ON public.member_claim_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS member_claim_requests_discord_idx
  ON public.member_claim_requests (discord_id);

-- 同一個人同時只能有一筆待審申請（避免亂槍打鳥）
CREATE UNIQUE INDEX IF NOT EXISTS member_claim_requests_one_pending_per_user
  ON public.member_claim_requests (discord_id)
  WHERE status = 'pending';

ALTER TABLE public.member_claim_requests ENABLE ROW LEVEL SECURITY;

-- 讀取：自己的申請、管理者、或該成員所屬公會的幹部
DROP POLICY IF EXISTS "member_claim_requests_select" ON public.member_claim_requests;
CREATE POLICY "member_claim_requests_select"
  ON public.member_claim_requests
  FOR SELECT
  TO authenticated
  USING (
    discord_id = (SELECT cp.discord_id FROM public.current_profile() cp LIMIT 1)
    OR (SELECT public.is_manager())
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_claim_requests.member_id
        AND m.guild_id IN (SELECT public.my_guild_ids())
    )
  );

-- 寫入一律走下面的 RPC（SECURITY DEFINER），不開放 direct insert/update
REVOKE INSERT, UPDATE, DELETE ON public.member_claim_requests FROM anon, authenticated;
GRANT SELECT ON public.member_claim_requests TO authenticated;

-- ------------------------------------------------------------
-- STEP 3：RPC
-- ------------------------------------------------------------

-- 以「遊戲名稱」搜尋可認領的成員
--   * 至少 2 個字（避免整份名單被列舉）
--   * 只回傳「未封存且尚未綁定」的成員，最多 20 筆
--   * 完全同名者優先
CREATE OR REPLACE FUNCTION public.search_claimable_members(p_query text)
RETURNS TABLE (id text, name text, guild_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.name, g.name AS guild_name, m.role
  FROM public.members m
  LEFT JOIN public.guilds g ON g.id = m.guild_id
  WHERE length(btrim(COALESCE(p_query, ''))) >= 2
    AND COALESCE(m.status, '') <> 'archived'
    AND m.name ILIKE '%' || btrim(p_query) || '%'
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_members pm WHERE pm.member_id = m.id
    )
  ORDER BY (lower(m.name) = lower(btrim(p_query))) DESC, m.name
  LIMIT 20;
$$;

-- 送出認領申請（本人）
CREATE OR REPLACE FUNCTION public.request_member_claim(p_member_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth    uuid := auth.uid();
  v_discord text;
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

  -- 同一個人同時只保留一筆待審申請
  DELETE FROM public.member_claim_requests r
  WHERE r.discord_id = v_discord
    AND r.member_id <> p_member_id
    AND r.status = 'pending';

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

-- 核准（管理者 / 該成員所屬公會的幹部）
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

  -- 期間已被別人綁走：直接結案，不覆蓋
  IF EXISTS (
    SELECT 1 FROM public.profile_members pm WHERE pm.member_id = p_member_id
  ) THEN
    UPDATE public.member_claim_requests
    SET status = 'rejected', note = 'already_bound', reviewed_at = now()
    WHERE member_id = p_member_id;
    RAISE EXCEPTION 'already_bound';
  END IF;

  SELECT cp.discord_id INTO v_reviewer FROM public.current_profile() cp LIMIT 1;

  -- 只更新申請者的 profiles.id → 既有 trigger 會同步 profile_members、
  -- 處理搶奪與 user_guilds
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

  UPDATE public.member_claim_requests
  SET status = 'approved', reviewed_by = v_reviewer, reviewed_at = now()
  WHERE member_id = p_member_id;
END;
$$;

-- 駁回
CREATE OR REPLACE FUNCTION public.reject_member_claim(p_member_id text, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reviewer text;
BEGIN
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

  SELECT cp.discord_id INTO v_reviewer FROM public.current_profile() cp LIMIT 1;

  UPDATE public.member_claim_requests
  SET status = 'rejected',
      note = p_reason,
      reviewed_by = v_reviewer,
      reviewed_at = now()
  WHERE member_id = p_member_id
    AND status = 'pending';
END;
$$;

-- 查詢自己的待審申請（前端用來顯示「審核中」）
CREATE OR REPLACE FUNCTION public.my_pending_claim()
RETURNS TABLE (member_id text, member_name text, status text, requested_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.member_id, m.name, r.status, r.requested_at
  FROM public.member_claim_requests r
  JOIN public.members m ON m.id = r.member_id
  WHERE r.discord_id = (
          SELECT cp.discord_id FROM public.current_profile() cp LIMIT 1
        )
    AND r.status = 'pending'
  ORDER BY r.requested_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.search_claimable_members(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_member_claim(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_pending_claim() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_member_claim(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_member_claim(text, text) TO authenticated;

-- ------------------------------------------------------------
-- 回滾：
--   DROP FUNCTION IF EXISTS public.approve_member_claim(text);
--   DROP FUNCTION IF EXISTS public.reject_member_claim(text, text);
--   DROP FUNCTION IF EXISTS public.request_member_claim(text);
--   DROP FUNCTION IF EXISTS public.my_pending_claim();
--   DROP FUNCTION IF EXISTS public.search_claimable_members(text);
--   DROP TABLE IF EXISTS public.member_claim_requests;
--   DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
-- ------------------------------------------------------------


