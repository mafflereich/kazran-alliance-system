-- ============================================================
-- get_member_equipment / ..._showcase：補上「公會範圍」
--
-- 背景：
--   這兩支 RPC 是 SECURITY DEFINER，會繞過 members 的 RLS。
--   原本只做「裝備可見度」遮蔽，沒有檢查呼叫者與目標成員是否同公會，
--   因此只要知道 member id（例如從 member_raid_records 取得），
--   一般成員就能撈到別的公會成員的裝備。
--
-- 修正：
--   在 rows CTE 加上
--     管理者 OR 本人 OR 同公會（my_guild_ids()）
--   既有的 mask_category / mask_equipment 遮蔽邏輯完全不變，
--   只是把「能看到誰」收斂到自己公會。
--
-- 本檔由工具從線上定義產生（pg_get_functiondef），內容與線上一致，
-- 只多了上面那段 AND 條件。可重複執行。
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_equipment(p_member_ids text[] DEFAULT NULL::text[], p_guild_id text DEFAULT NULL::text)
 RETURNS TABLE(id text, equipment jsonb, records jsonb, exclusive_weapons jsonb, refining_traces integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cur AS (
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
      m.category_visibility,
      m.equipment_visibility,
      m.records,
      m.exclusive_weapons,
      m.refining_traces,
      EXISTS (SELECT 1 FROM bound b WHERE b.member_id = m.id) AS owns_member,
      (SELECT v FROM is_admin) AS ok_admin,
      (SELECT v FROM is_manager) AS ok_manager,
      (
        (SELECT v FROM is_admin)
        OR (
          (SELECT v FROM is_manager)
          AND EXISTS (
            SELECT 1
            FROM bound b2
            JOIN members mb2 ON mb2.id = b2.member_id
            WHERE mb2.guild_id = m.guild_id
          )
        )
      ) AS ok_guild_manager
    FROM members m
    WHERE (p_member_ids IS NULL OR m.id = ANY(p_member_ids))
      AND (p_guild_id IS NULL OR m.guild_id = p_guild_id)
      AND (
        (SELECT v FROM is_manager)
        OR EXISTS (SELECT 1 FROM bound b0 WHERE b0.member_id = m.id)
        OR m.guild_id IN (SELECT public.my_guild_ids())
      )
  )
  SELECT
    r.id,
    CASE
      WHEN public.mask_category_can(
        r.equipment_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      THEN public.mask_equipment(
        r.equipment, r.category_visibility, r.equipment_visibility,
        r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      ELSE NULL
    END AS equipment,
    CASE
      WHEN public.mask_category_can(
        r.equipment_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      THEN r.records ELSE NULL
    END AS records,
    CASE
      WHEN public.mask_category_can(
        r.equipment_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      THEN r.exclusive_weapons ELSE NULL
    END AS exclusive_weapons,
    CASE
      WHEN public.mask_category_can(
        r.equipment_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      THEN r.refining_traces ELSE NULL
    END AS refining_traces
  FROM rows r
  ORDER BY r.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_member_equipment_showcase(p_member_ids text[] DEFAULT NULL::text[], p_guild_id text DEFAULT NULL::text)
 RETURNS TABLE(id text, venom_serpent_c24 integer, chief_majesty_c24 integer, guardian_scale_c24 integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH cur AS (
    -- 目前登入使用者對應的 profile（與 get_member_equipment 完全同義）
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
      m.category_visibility,
      m.equipment_visibility,
      EXISTS (SELECT 1 FROM bound b WHERE b.member_id = m.id) AS owns_member,
      (SELECT v FROM is_admin) AS ok_admin,
      (SELECT v FROM is_manager) AS ok_manager,
      (
        (SELECT v FROM is_admin)
        OR (
          (SELECT v FROM is_manager)
          AND EXISTS (
            SELECT 1
            FROM bound b2
            JOIN members mb2 ON mb2.id = b2.member_id
            WHERE mb2.guild_id = m.guild_id
          )
        )
      ) AS ok_guild_manager
    FROM members m
    WHERE (p_member_ids IS NULL OR m.id = ANY(p_member_ids))
      AND (p_guild_id IS NULL OR m.guild_id = p_guild_id)
      AND (
        (SELECT v FROM is_manager)
        OR EXISTS (SELECT 1 FROM bound b0 WHERE b0.member_id = m.id)
        OR m.guild_id IN (SELECT public.my_guild_ids())
      )
  ),
  resolved AS (
    SELECT
      r.*,
      -- 整張裝備表是否可見
      public.mask_category_can(
        r.equipment_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      ) AS can_view_equipment,
      -- 三個部位的 c24 最終隱私級別（c24 覆蓋 > 部位 > 全域）
      COALESCE(
        NULLIF(r.category_visibility->'venom_serpent'->>'c24', ''),
        NULLIF(r.category_visibility->'venom_serpent'->>'visibility', ''),
        r.equipment_visibility
      ) AS venom_visibility,
      COALESCE(
        NULLIF(r.category_visibility->'phys_glove_chief_majesty'->>'c24', ''),
        NULLIF(r.category_visibility->'phys_glove_chief_majesty'->>'visibility', ''),
        r.equipment_visibility
      ) AS chief_visibility,
      COALESCE(
        NULLIF(r.category_visibility->'magic_glove_guardian_scale'->>'c24', ''),
        NULLIF(r.category_visibility->'magic_glove_guardian_scale'->>'visibility', ''),
        r.equipment_visibility
      ) AS scale_visibility
    FROM rows r
  )
  SELECT
    r.id,
    CASE
      WHEN r.can_view_equipment AND public.mask_category_can(
        r.venom_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      THEN COALESCE((r.equipment->'venom_serpent'->>'c24')::int, 0)
    END AS venom_serpent_c24,
    CASE
      WHEN r.can_view_equipment AND public.mask_category_can(
        r.chief_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      THEN COALESCE((r.equipment->'phys_glove_chief_majesty'->>'c24')::int, 0)
    END AS chief_majesty_c24,
    CASE
      WHEN r.can_view_equipment AND public.mask_category_can(
        r.scale_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      THEN COALESCE((r.equipment->'magic_glove_guardian_scale'->>'c24')::int, 0)
    END AS guardian_scale_c24
  FROM resolved r
  ORDER BY r.id;
END;
$function$;