-- ============================================================
-- 身分綁定正規化：profiles.id（逗號字串）→ profile_members（關聯表）
--
-- 問題（線上實測）：
--   profiles.id 存的是「逗號分隔的 member UUID 字串」，導致：
--     1. 任何身分判斷都要 string_to_array，無法走索引
--     2. sync_profile_guild_for_member trigger 每次成員寫入都要
--        全表掃 682 列 profiles 做字串切割
--        → 批量存 1,259 位成員 = 約 86 萬次字串運算
--     3. profiles_id_key UNIQUE(id) 讓「兩位 profile 綁到重疊成員」直接 23505
--
-- 本檔做的事：
--   1. 建 profile_members（member_id 為 PK → 一個成員只能綁一個 profile）
--   2. 由現有 profiles.id 回填（線上 685 筆、0 重複）
--   3. 加 trigger：profiles.id 變更時自動同步 profile_members
--      （Edge Function sync-discord-roles 與前端都不必改）
--   4. 改寫 owns_member / my_guild_ids / can_edit_raid_record /
--      sync_profile_guild_for_member / save_raid_records_bulk 的權限判斷
--      → 全部變成索引查詢
--
-- 可重複執行。回滾方式見檔尾。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：關聯表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_members (
  member_id  text PRIMARY KEY
             REFERENCES public.members(id) ON DELETE CASCADE,
  profile_id text NOT NULL
             REFERENCES public.profiles(discord_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_members_profile_idx
  ON public.profile_members (profile_id);

COMMENT ON TABLE public.profile_members IS
  'Discord profile ↔ 遊戲成員 的綁定關係（由 profiles.id 字串同步而來；供 RLS / 身分判斷使用索引查詢）';

-- 只有 SECURITY DEFINER 函式會讀這張表；直接從 PostgREST 讀取一律拒絕
ALTER TABLE public.profile_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_members FROM anon, authenticated;

-- ------------------------------------------------------------
-- STEP 2：由現有 profiles.id 回填（可重複執行）
--   只收「確實存在的 member id」；重複時保留第一筆，不覆蓋既有綁定
-- ------------------------------------------------------------
INSERT INTO public.profile_members (member_id, profile_id)
SELECT DISTINCT ON (btrim(x))
       btrim(x) AS member_id,
       p.discord_id
FROM public.profiles p
CROSS JOIN LATERAL unnest(string_to_array(COALESCE(p.id, ''), ',')) AS x
WHERE btrim(x) <> ''
  AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = btrim(x))
ORDER BY btrim(x), p.discord_id
ON CONFLICT (member_id) DO NOTHING;

-- ------------------------------------------------------------
-- STEP 3：profiles.id 變更時同步 profile_members
--
-- 為什麼需要：Edge Function（sync-discord-roles）與後台綁定頁
-- 都仍然是寫 profiles.id 這個逗號字串。有了這個 trigger，
-- 兩邊都不用改就能讓 profile_members 保持同步，
-- 而所有「讀取」都改走索引化的 profile_members。
--
-- 同時重算 user_guilds：綁定完成後立刻生效，不必等成員轉會。
-- （UPDATE 只動 user_guilds，不符合 trigger 的 UPDATE OF id, discord_id，
--   所以不會遞迴。）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_members_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.profile_members pm WHERE pm.profile_id = OLD.discord_id;
    RETURN OLD;
  END IF;

  -- 重建這個 profile 的綁定（同一 transaction，失敗會整筆回滾，不會留下半套）
  DELETE FROM public.profile_members pm WHERE pm.profile_id = NEW.discord_id;

  INSERT INTO public.profile_members (member_id, profile_id)
  SELECT DISTINCT ON (btrim(x))
         btrim(x),
         NEW.discord_id
  FROM unnest(string_to_array(COALESCE(NEW.id, ''), ',')) AS x
  WHERE btrim(x) <> ''
    AND EXISTS (SELECT 1 FROM public.members m WHERE m.id = btrim(x))
  ORDER BY btrim(x)
  ON CONFLICT (member_id) DO NOTHING;

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
  WHERE p.discord_id = NEW.discord_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_members ON public.profiles;
CREATE TRIGGER trg_profiles_sync_members
  AFTER INSERT OR UPDATE OF id, discord_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_members_from_profile();

DROP TRIGGER IF EXISTS trg_profiles_sync_members_delete ON public.profiles;
CREATE TRIGGER trg_profiles_sync_members_delete
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_members_from_profile();

-- ------------------------------------------------------------
-- STEP 4：改寫身分判斷函式（簽名不變，前端與 RLS 都不用改）
-- ------------------------------------------------------------

-- 本人：直接命中 profile_members 的 PK
CREATE OR REPLACE FUNCTION public.owns_member(p_member_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.current_profile() cp
    JOIN public.profile_members pm ON pm.profile_id = cp.discord_id
    WHERE pm.member_id = p_member_id
  );
$$;

-- 所屬公會：一次 join，取代 unnest(string_to_array(cur.id, ','))
CREATE OR REPLACE FUNCTION public.my_guild_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.guild_id
  FROM public.current_profile() cp
  JOIN public.profile_members pm ON pm.profile_id = cp.discord_id
  JOIN public.members m ON m.id = pm.member_id
  WHERE m.guild_id IS NOT NULL;
$$;

-- 戰記寫入權限：管理者 或 綁定的成員為正/副會長
CREATE OR REPLACE FUNCTION public.can_edit_raid_record()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_manager() OR EXISTS (
    SELECT 1
    FROM public.current_profile() cp
    JOIN public.profile_members pm ON pm.profile_id = cp.discord_id
    JOIN public.members m ON m.id = pm.member_id
    WHERE m.role IN ('leader', 'coleader')
  );
$$;

-- 成員轉會時同步 user_guilds：
-- 從「全表掃 682 列 + 每列字串切割」變成「1 次索引查詢 + 更新 1 列」
CREATE OR REPLACE FUNCTION public.sync_profile_guild_for_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 值沒變就跳過：MemberBoard 一次 upsert 上千位成員時，
  -- 絕大多數只是「寫回原值」，不需要重算 profile.user_guilds。
  IF TG_OP = 'UPDATE'
     AND NEW.guild_id IS NOT DISTINCT FROM OLD.guild_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

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
  WHERE p.discord_id IN (
    SELECT pm.profile_id
    FROM public.profile_members pm
    WHERE pm.member_id = NEW.id
  );

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owns_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_guild_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_raid_record() TO authenticated;

-- ------------------------------------------------------------
-- 驗證
--
-- 1) 回填筆數（預期 685）
--   SELECT count(*) FROM public.profile_members;
--
-- 2) 與 profiles.id 字串是否一致（預期 0 筆差異）
--   SELECT count(*) FROM public.profile_members pm
--    WHERE NOT EXISTS (
--      SELECT 1 FROM profiles p
--       WHERE p.discord_id = pm.profile_id
--         AND pm.member_id = ANY(string_to_array(COALESCE(p.id, ''), ','))
--    );
--
-- 3) 模擬一般成員，owns_member / my_guild_ids 結果必須與改動前相同
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SET LOCAL request.jwt.claims = '{"sub":"<auth uid>","role":"authenticated"}';
--     SELECT public.owns_member('<member id>'), array(SELECT public.my_guild_ids());
--   ROLLBACK;
-- ------------------------------------------------------------
-- 回滾：把 4 支函式改回字串版（見 90100 / 91000 的定義），
--       然後 DROP TABLE public.profile_members CASCADE;
-- ------------------------------------------------------------


