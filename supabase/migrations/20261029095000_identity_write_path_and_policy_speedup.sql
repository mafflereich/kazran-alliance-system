-- ============================================================
-- 身分綁定（第二階段）
--   1) 新增 my_member_ids()：把 policy 內「逐列呼叫 owns_member(id)」
--      改成「一次性 hashed SubPlan」
--   2) 寫入路徑：profiles.id 被別的 profile 搶走成員時，
--      自動清理舊 profile 的 id 快取（保持 profile_members 與 id 一致）
--   3) 移除 profiles_id_key UNIQUE(id)：這個約束是
--      「登入時 23505 → 顯示 not_in_guild」的元凶，
--      成員唯一性改由 profile_members.member_id (PK) 保證
--
-- 實測（manager 列出 1,259 位成員）：
--   改前：Filter 內 SubPlan 1 (owns_member) loops=1259 → Execution 55.1 ms
--   改後：預期 ~2 ms
--
-- 可重複執行。回滾方式見檔尾。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：本人綁定的成員清單（SETOF，供 policy 用 IN (SELECT ...)）
--   不相關子查詢 → planner 做成 hashed SubPlan，整個 statement 只算一次
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_member_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.member_id
  FROM public.current_profile() cp
  JOIN public.profile_members pm ON pm.profile_id = cp.discord_id;
$$;

GRANT EXECUTE ON FUNCTION public.my_member_ids() TO authenticated;

-- ------------------------------------------------------------
-- STEP 2：members 的 policy 改用 my_member_ids()
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "members_select_owner" ON public.members;
CREATE POLICY "members_select_owner"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.my_member_ids()));

DROP POLICY IF EXISTS "members_insert" ON public.members;
CREATE POLICY "members_insert"
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_manager())
    OR id IN (SELECT public.my_member_ids())
  );

DROP POLICY IF EXISTS "members_update" ON public.members;
CREATE POLICY "members_update"
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_manager())
    OR id IN (SELECT public.my_member_ids())
    OR (
      guild_id IN (SELECT public.my_guild_ids())
      AND (SELECT public.can_edit_raid_record())
    )
  )
  WITH CHECK (
    (SELECT public.is_manager())
    OR id IN (SELECT public.my_member_ids())
    OR (SELECT public.can_edit_raid_record())
  );

-- ------------------------------------------------------------
-- STEP 3：member_notes 的 policy 同樣改用 my_member_ids()
--   （原本每列都要呼叫 owns_member，備註一多就變慢）
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "member_notes_select" ON public.member_notes;
CREATE POLICY "member_notes_select"
  ON public.member_notes
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_manager())
    OR member_id IN (SELECT public.my_member_ids())
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_notes.member_id
        AND m.guild_id IN (SELECT public.my_guild_ids())
    )
  );

DROP POLICY IF EXISTS "member_notes_insert" ON public.member_notes;
CREATE POLICY "member_notes_insert"
  ON public.member_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_manager())
    OR member_id IN (SELECT public.my_member_ids())
    OR (
      (SELECT public.can_edit_raid_record())
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = member_notes.member_id
          AND m.guild_id IN (SELECT public.my_guild_ids())
      )
    )
  );

DROP POLICY IF EXISTS "member_notes_update" ON public.member_notes;
CREATE POLICY "member_notes_update"
  ON public.member_notes
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_manager())
    OR member_id IN (SELECT public.my_member_ids())
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = member_notes.member_id
        AND m.guild_id IN (SELECT public.my_guild_ids())
    )
  )
  WITH CHECK (
    (SELECT public.is_manager())
    OR member_id IN (SELECT public.my_member_ids())
    OR (
      (SELECT public.can_edit_raid_record())
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = member_notes.member_id
          AND m.guild_id IN (SELECT public.my_guild_ids())
      )
    )
  );

DROP POLICY IF EXISTS "member_notes_delete" ON public.member_notes;
CREATE POLICY "member_notes_delete"
  ON public.member_notes
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.is_manager())
    OR member_id IN (SELECT public.my_member_ids())
  );

-- ------------------------------------------------------------
-- STEP 4：寫入路徑一致化
--
-- 現況：Edge Function（sync-discord-roles，不在本 repo）與後台綁定頁
--       都是「把成員 id 寫進 profiles.id 逗號字串」。
--       這個字串有 UNIQUE(id) 約束，一旦某成員已被別的 profile 佔用，
--       整筆 upsert 會 23505 失敗 → 使用者登入被判定 not_in_guild。
--
-- 改法（Edge Function 不需要改）：
--   a) profile_members 為真正的綁定來源（member_id 為 PK，天然唯一）
--   b) profiles.id 降級為「快取」：被別人搶走成員時，自動把舊 profile 的
--      id 字串清理成它實際還擁有的成員
--   c) 移除 profiles_id_key → 不再有 23505 擋住登入；
--      真正的唯一性由 profile_members.member_id 保證
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_members_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members text[];
  v_losers  text[];
BEGIN
  -- 本函式會主動更新 profiles.id 快取；避免遞迴
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.profile_members pm WHERE pm.profile_id = OLD.discord_id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.discord_id IS NOT DISTINCT FROM OLD.discord_id THEN
    RETURN NEW;
  END IF;

  v_members := ARRAY(
    SELECT DISTINCT btrim(x)
    FROM unnest(string_to_array(COALESCE(NEW.id, ''), ',')) AS x
    WHERE btrim(x) <> ''
      AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = btrim(x))
  );

  -- 這些成員原本被哪些 profile 佔用（需要清理它們的 id 快取）
  SELECT COALESCE(array_agg(DISTINCT pm.profile_id), ARRAY[]::text[])
  INTO v_losers
  FROM public.profile_members pm
  WHERE pm.member_id = ANY(v_members)
    AND pm.profile_id <> NEW.discord_id;

  DELETE FROM public.profile_members pm WHERE pm.profile_id = NEW.discord_id;

  IF array_length(v_members, 1) > 0 THEN
    INSERT INTO public.profile_members (member_id, profile_id)
    SELECT unnest(v_members), NEW.discord_id
    ON CONFLICT (member_id) DO UPDATE
      SET profile_id = EXCLUDED.profile_id;
  END IF;

  -- 被搶走成員的 profile：把它的 id 快取重建成實際還擁有的成員
  IF array_length(v_losers, 1) > 0 THEN
    UPDATE public.profiles p
    SET id = NULLIF((
      SELECT string_agg(pm.member_id, ',' ORDER BY pm.member_id)
      FROM public.profile_members pm
      WHERE pm.profile_id = p.discord_id
    ), '')
    WHERE p.discord_id = ANY(v_losers);
  END IF;

  -- 自己 + 被影響的 profile 一起重算 user_guilds
  UPDATE public.profiles p
  SET user_guilds = (
    SELECT string_agg(DISTINCT g.name, ',' ORDER BY g.name)
    FROM public.profile_members pm
    JOIN public.members m ON m.id = pm.member_id
    JOIN public.guilds g ON g.id = m.guild_id
    WHERE pm.profile_id = p.discord_id
      AND m.status = 'active'
      AND m.guild_id IS NOT NULL
  )
  WHERE p.discord_id = NEW.discord_id
     OR p.discord_id = ANY(v_losers);

  RETURN NEW;
END;
$$;

-- 移除造成 23505 的舊約束（唯一性改由 profile_members.member_id PK 保證）
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_key;

-- ------------------------------------------------------------
-- 驗證
-- 1) members 查詢計劃：SubPlan 1 應消失，改成 hashed SubPlan（只算一次）
--   BEGIN; SET LOCAL ROLE authenticated;
--     SET LOCAL request.jwt.claims = '{"sub":"<auth uid>","role":"authenticated"}';
--     EXPLAIN (ANALYZE) SELECT count(*) FROM public.members;
--   ROLLBACK;
--
-- 2) 搶奪測試（用一位尚未被任何 profile 綁定的成員）
--   INSERT INTO profiles (discord_id, id) VALUES ('test-takeover', '<unbound member id>');
--   SELECT * FROM profile_members WHERE member_id = '<unbound member id>';  -- 應為 test-takeover
--   DELETE FROM profiles WHERE discord_id = 'test-takeover';
--   SELECT * FROM profile_members WHERE member_id = '<unbound member id>';  -- 應為 0 筆
--
-- 3) 約束已移除
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.profiles'::regclass AND contype = 'u';
-- ------------------------------------------------------------
-- 回滾：
--   ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_key UNIQUE (id);
--   （4 支 members policy 可還原成 91000 的版本）
-- ------------------------------------------------------------


