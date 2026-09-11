-- ============================================================
-- 修正 get_member_equipment「statement timeout」（57014 / query_canceled）
--
-- 真正根因：
--   原 get_member_equipment 在 SELECT 中對「每一列」呼叫
--   can_view_equipment(m.id)（PL/pgSQL SECURITY DEFINER），而
--   can_view_equipment 內部又逐列呼叫 owns_member / is_manager /
--   is_guild_manager_of / is_admin —— 每個 helper 又各自查詢
--   auth.identities + profiles。成員破千後，單一 RPC 變成數千次
--   資料庫子查詢，必然超過 statement_timeout。
--
--   （先前把它誤判成「inlinable + db-max-rows 1000」而改用
--     RETURN QUERY 包裝，不會變快，因為 N+1 問題仍在。）
--
-- 修正做法（語意與視覺完全相同，只改實作）：
--   1) 目前使用者身份（current_profile 等價）只在 WITH CTE 解析一次；
--   2) 可見性判斷改成集合式 EXISTS / 純 SQL 表達式，不再呼叫
--      任何 per-row PL/pgSQL 函式；
--   3) 維持 LANGUAGE sql + STABLE + SECURITY DEFINER，
--      但結構複雜不會被 PostgREST 內聯，因此不回受 1000 列上限影響。
--
-- 前端配套：fetchMemberSecrets 已改為每 500 個 id 分塊呼叫，
-- 避免單一請求攜帶過大 payload / 單一語句過重。
--
-- 執行方式：Supabase 後台 → SQL Editor 直接執行（可重複執行）。
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_equipment(
  p_member_ids text[] DEFAULT NULL,
  p_guild_id text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  equipment jsonb,
  records jsonb,
  exclusive_weapons jsonb,
  refining_traces integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cur AS (
    -- 目前登入使用者對應的 profile（與 public.current_profile() 完全同義）
    SELECT p.id,
           p.user_role
    FROM profiles p
    WHERE p.auth_id::text = auth.uid()::text
       OR p.id::text = auth.uid()::text
       OR p.discord_id::text = (
             SELECT i.provider_id::text
             FROM auth.identities i
             WHERE i.user_id = auth.uid() AND i.provider = 'discord'
             LIMIT 1
           )
    LIMIT 1
  ),
  -- 目前使用者綁定的 member id 清單（解析一次）
  bound AS (
    SELECT x AS member_id
    FROM cur, LATERAL unnest(string_to_array(cur.id, ',')) AS t(x)
  ),
  is_manager AS (
    SELECT EXISTS (SELECT 1 FROM cur WHERE cur.user_role IN ('creator', 'admin', 'manager')) AS v
  ),
  is_admin AS (
    SELECT EXISTS (SELECT 1 FROM cur WHERE cur.user_role IN ('creator', 'admin')) AS v
  ),
  rows AS (
    SELECT
      m.id,
      m.equipment,
      m.records,
      m.exclusive_weapons,
      m.refining_traces,
      (
        -- can_view_equipment(id) 展開：
        EXISTS (SELECT 1 FROM bound b WHERE b.member_id = m.id)                 -- 本人
        OR COALESCE(m.equipment_visibility, '') NOT IN
             ('public', 'all_manager', 'guild_manager', 'admin')                -- 其他/NULL → TRUE
        OR m.equipment_visibility = 'public'                                     -- public
        OR (m.equipment_visibility = 'all_manager' AND (SELECT v FROM is_manager))
        OR (m.equipment_visibility = 'admin' AND (SELECT v FROM is_admin))
        OR (m.equipment_visibility = 'guild_manager' AND (
              (SELECT v FROM is_admin)                                            -- admin/creator 可管所有公會
              OR ((SELECT v FROM is_manager)                                      -- manager 需綁定同公會成員
                  AND EXISTS (
                    SELECT 1
                    FROM bound b2
                    JOIN members mb2 ON mb2.id = b2.member_id
                    WHERE mb2.guild_id = m.guild_id
                  ))
            ))
      ) AS can_view
    FROM members m
    WHERE (p_member_ids IS NULL OR m.id = ANY(p_member_ids))
      AND (p_guild_id IS NULL OR m.guild_id = p_guild_id)
  )
  SELECT
    r.id,
    CASE WHEN r.can_view THEN r.equipment ELSE NULL END AS equipment,
    CASE WHEN r.can_view THEN r.records ELSE NULL END AS records,
    CASE WHEN r.can_view THEN r.exclusive_weapons ELSE NULL END AS exclusive_weapons,
    CASE WHEN r.can_view THEN r.refining_traces ELSE NULL END AS refining_traces
  FROM rows r
  ORDER BY r.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_equipment(text[], text) TO authenticated;

-- ------------------------------------------------------------
-- 驗證（SQL Editor 直接跑，替換成真實 guild id 或直接全表）：
--   SELECT count(*) FROM public.get_member_equipment();
--   SELECT * FROM public.get_member_equipment()
--   WHERE id = '<某個成員 id>';
-- ------------------------------------------------------------