-- ============================================================
-- current_profile()：改為「auth_id 快路徑 + 老資料才走慢路徑」
--
-- 實測（改動前）：
--   EXPLAIN ANALYZE SELECT * FROM public.current_profile();  → 3.9 ms
--   原因：CTE 的 legacy 分支是
--     p.id::text = auth.uid()::text OR p.discord_id::text = current_discord_id()
--   兩個 ::text cast + 一次 auth.identities 查詢，完全無法走索引，
--   而且每次呼叫都會被求值一次。
--
-- 現況：682 筆 profile 中有 681 筆已有 auth_id（走 idx_profiles_auth_id）。
--   → 正常使用者只需要 1 次索引查詢。
--   → legacy 分支只在「auth_id 還沒回填」的 1 筆老資料才會執行。
--
-- 為什麼不用 JWT claim 取代？
--   JWT 只會在 token refresh（預設 1 小時）時更新，而 user_role / user_guilds
--   會因為升職、成員轉會而改變。把這些放進 claim 會讓「UI 已更新、DB 權限還是舊的」
--   持續最多 1 小時（成員轉會後看到空名單）。改用索引查詢可拿到同樣速度且零延遲。
--
-- 可重複執行。
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS TABLE (id text, user_role text, discord_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_id       text;
  v_role     text;
  v_discord  text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;                       -- 未登入：0 列（與原本語意相同）
  END IF;

  -- 快路徑：auth_id 唯一索引
  SELECT p.id, p.user_role, p.discord_id::text
  INTO v_id, v_role, v_discord
  FROM public.profiles p
  WHERE p.auth_id = v_uid
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_id, v_role, v_discord;
    RETURN;
  END IF;

  -- 慢路徑（僅老資料）：保留原本的三段 OR 語意
  SELECT p.id, p.user_role, p.discord_id::text
  INTO v_id, v_role, v_discord
  FROM public.profiles p
  WHERE p.id::text = v_uid::text
     OR p.discord_id::text = public.current_discord_id()
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_id, v_role, v_discord;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;

-- 驗證：
--   EXPLAIN ANALYZE SELECT * FROM public.current_profile();   -- 未登入仍走慢路徑（預期 0 列）
--   以真實使用者登入後，應為 1 次 Index Scan on idx_profiles_auth_id
