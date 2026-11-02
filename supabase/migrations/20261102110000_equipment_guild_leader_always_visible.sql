-- ============================================================
-- 裝備表隱私 v5：本公會正副會長「一律可見」
--
-- 設計原則（本次釐清）：
--   * 該成員所屬公會的會長 / 副會長，以及 creator / admin，
--     永遠可以看到「完整」裝備表與「全部」重要資源。
--   * equipment_visibility / category_visibility / resource_visibility
--     只能在「上述人員一定可見」的前提下，決定是否再開放給其他管理者。
--     任何部位 / 資源的覆蓋設定都不能把正副會長排除。
--
-- 因此：
--   * 'admin'（僅總長）已無意義 → 併入 'guild_manager'
--   * 可選級別只剩：guild_manager（預設）、all_manager
--   * 'public' 仍比照 guild_manager（停用）
--
-- 做法：
--   * mask_category_can / mask_equipment / mask_equipment_resources 的
--     第一個人員旗標（p_owns_member）改視為「無條件可見」，
--     RPC 傳入 (本人 OR 總長 OR 該公會正副會長)。
--   * guild_manager 級別的人員旗標只傳入「該公會正副會長」。
--
-- 可重複執行，不會刪除任何裝備 / 資源資料。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：舊資料升級（public / admin → guild_manager）
-- ------------------------------------------------------------
UPDATE public.members
SET equipment_visibility = 'guild_manager'
WHERE equipment_visibility IN ('public', 'admin');

ALTER TABLE public.members
  ALTER COLUMN equipment_visibility SET DEFAULT 'guild_manager';

UPDATE public.members
SET category_visibility = REPLACE(REPLACE(category_visibility::text, '"public"', '"guild_manager"'), '"admin"', '"guild_manager"')::jsonb
WHERE category_visibility IS NOT NULL
  AND (category_visibility::text LIKE '%"public"%' OR category_visibility::text LIKE '%"admin"%');

UPDATE public.members
SET resource_visibility = REPLACE(REPLACE(resource_visibility::text, '"public"', '"guild_manager"'), '"admin"', '"guild_manager"')::jsonb
WHERE resource_visibility IS NOT NULL
  AND (resource_visibility::text LIKE '%"public"%' OR resource_visibility::text LIKE '%"admin"%');

-- ------------------------------------------------------------
-- STEP 2：隱私值正規化（只有 all_manager 保留，其餘 → guild_manager）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_equipment_visibility(p_visibility text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_visibility = 'all_manager' THEN 'all_manager'
    ELSE 'guild_manager'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_equipment_visibility(text) TO authenticated;

-- ------------------------------------------------------------
-- STEP 3：身份 helper —— 「該公會正副會長」或 creator / admin
--   （profiles.user_role = manager 但綁定的不是正副會長 → 不算，
--     這種人要看得到資料必須由成員把級別設為 all_manager）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_guild_manager_of(p_guild_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.current_profile() cp
    WHERE cp.user_role IN ('creator', 'admin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.current_profile() cp
    CROSS JOIN LATERAL unnest(string_to_array(cp.id, ',')) AS mb(owner_member_id)
    JOIN members m ON m.id = mb.owner_member_id
    WHERE m.role IN ('leader', 'coleader')
      AND (p_guild_id IS NULL OR m.guild_id = p_guild_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_guild_manager_of(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_equipment(p_member_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vis text;
  v_guild text;
BEGIN
  IF public.owns_member(p_member_id) THEN
    RETURN TRUE;
  END IF;

  SELECT equipment_visibility, guild_id INTO v_vis, v_guild
  FROM members WHERE id = p_member_id;

  RETURN CASE public.normalize_equipment_visibility(v_vis)
    WHEN 'all_manager' THEN public.is_manager()
    ELSE public.is_guild_manager_of(v_guild)
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_equipment(text) TO authenticated;

-- ------------------------------------------------------------
-- STEP 4：get_member_equipment
--   * 新增 ok_guild_leader（綁定成員＝該公會正/副會長）
--   * 傳給 mask_* 的第一個人員旗標 = 本人 OR 總長 OR 該公會正副會長
--     → 這三種人一律看到完整裝備與全部資源
--   * guild_manager 級別只認「該公會正副會長」（其他管理者要 all_manager）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_member_equipment(
  p_member_ids text[] DEFAULT NULL::text[],
  p_guild_id text DEFAULT NULL::text
)
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
      m.resource_visibility,
      m.equipment_visibility,
      m.records,
      m.exclusive_weapons,
      m.refining_traces,
      EXISTS (SELECT 1 FROM bound b WHERE b.member_id = m.id) AS owns_member,
      (SELECT v FROM is_admin) AS ok_admin,
      (SELECT v FROM is_manager) AS ok_manager,
      EXISTS (
        SELECT 1
        FROM bound b3
        JOIN members mb3 ON mb3.id = b3.member_id
        WHERE mb3.guild_id = m.guild_id
          AND mb3.role IN ('leader', 'coleader')
      ) AS ok_guild_leader
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
        r.equipment_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      THEN public.mask_equipment_resources(
        public.mask_equipment(
          r.equipment, r.category_visibility, r.equipment_visibility,
          (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
          r.ok_admin, r.ok_manager,
          (r.ok_guild_leader OR r.ok_admin)
        ),
        r.resource_visibility, r.equipment_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      ELSE NULL
    END AS equipment,
    CASE
      WHEN public.mask_category_can(
        r.equipment_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      THEN r.records ELSE NULL
    END AS records,
    CASE
      WHEN public.mask_category_can(
        r.equipment_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      THEN r.exclusive_weapons ELSE NULL
    END AS exclusive_weapons,
    CASE
      WHEN public.mask_category_can(
        r.equipment_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      AND public.mask_category_can(
        COALESCE(NULLIF(r.resource_visibility->>'refiningTrace', ''), r.equipment_visibility),
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      THEN r.refining_traces ELSE NULL
    END AS refining_traces
  FROM rows r
  ORDER BY r.id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_member_equipment(text[], text) TO authenticated;


-- ------------------------------------------------------------
-- STEP 5：get_member_equipment_showcase（成員卡 24C 數量）
--   與 STEP 4 相同：正副會長 / 總長一律可見，部位覆蓋不能排除他們
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_member_equipment_showcase(p_member_ids text[] DEFAULT NULL::text[], p_guild_id text DEFAULT NULL::text)
 RETURNS TABLE(id text, venom_serpent_c24 integer, chief_majesty_c24 integer, guardian_scale_c24 integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
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
      EXISTS (SELECT 1 FROM bound b WHERE b.member_id = m.id) AS owns_member,
      (SELECT v FROM is_admin) AS ok_admin,
      (SELECT v FROM is_manager) AS ok_manager,
      EXISTS (
        SELECT 1
        FROM bound b3
        JOIN members mb3 ON mb3.id = b3.member_id
        WHERE mb3.guild_id = m.guild_id
          AND mb3.role IN ('leader', 'coleader')
      ) AS ok_guild_leader
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
      public.mask_category_can(
        r.equipment_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      ) AS can_view_equipment,
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
        r.venom_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      THEN COALESCE((r.equipment->'venom_serpent'->>'c24')::int, 0)
    END AS venom_serpent_c24,
    CASE
      WHEN r.can_view_equipment AND public.mask_category_can(
        r.chief_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      THEN COALESCE((r.equipment->'phys_glove_chief_majesty'->>'c24')::int, 0)
    END AS chief_majesty_c24,
    CASE
      WHEN r.can_view_equipment AND public.mask_category_can(
        r.scale_visibility,
        (r.owns_member OR r.ok_admin OR r.ok_guild_leader),
        r.ok_admin, r.ok_manager,
        (r.ok_guild_leader OR r.ok_admin)
      )
      THEN COALESCE((r.equipment->'magic_glove_guardian_scale'->>'c24')::int, 0)
    END AS guardian_scale_c24
  FROM resolved r
  ORDER BY r.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_member_equipment_showcase(text[], text) TO authenticated;

-- ------------------------------------------------------------
-- 驗證：
--   -- 不應再有 public / admin：
--   SELECT equipment_visibility, count(*) FROM public.members GROUP BY 1;
--   -- 正規化：
--   SELECT public.normalize_equipment_visibility('admin'),
--          public.normalize_equipment_visibility('public'),
--          public.normalize_equipment_visibility('all_manager');
--   -- 正副會長（uncond=true）即使資源設為 guild_manager 也看得到：
--   SELECT public.mask_equipment_resources(
--     '{"__resources":{"ancientCrystal":10}}'::jsonb,
--     '{"ancientCrystal":"guild_manager"}'::jsonb,
--     'guild_manager', true, false, false, true
--   );
-- ------------------------------------------------------------

