-- ============================================================
-- 裝備表隱私 v4：
--   1) 最低可見度改為「本公會正副會長」(guild_manager)，停用 'public'
--   2) 新增「重要資源個別隱私」members.resource_visibility
--
-- 語意：
--   equipment_visibility：
--     guild_manager（預設）→ 該成員所屬公會的正/副會長（admin/creator 亦可）
--     all_manager          → creator / admin / manager
--     admin                → 僅 creator / admin
--     'public' / NULL / 未知值 → 一律視為 guild_manager（舊資料升級）
--
--   重要資源層級：resource_visibility[<resource_key>] 覆蓋 equipment_visibility
--     僅在「整張裝備表可見」的前提下生效（只會再限縮，不會放寬）。
--
-- 本檔可重複執行，不會刪除任何裝備 / 資源資料。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：重要資源個別隱私欄位 + 舊資料升級
-- ------------------------------------------------------------
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS resource_visibility jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.members.resource_visibility IS
  '重要資源個別隱私覆蓋（key = ancientCrystal / refiningCrystal / goddessTears / refiningTrace / burstFlame）。未設定者沿用 equipment_visibility。';

-- equipment_visibility：補上欄位（保險）並把 default 改為最低可見度
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS equipment_visibility text NOT NULL DEFAULT 'guild_manager';

UPDATE public.members
SET equipment_visibility = 'guild_manager'
WHERE equipment_visibility IS NULL OR equipment_visibility = 'public';

ALTER TABLE public.members
  ALTER COLUMN equipment_visibility SET DEFAULT 'guild_manager';

-- category_visibility 內殘留的 'public' 覆蓋 → guild_manager
UPDATE public.members
SET category_visibility = REPLACE(category_visibility::text, '"public"', '"guild_manager"')::jsonb
WHERE category_visibility IS NOT NULL
  AND category_visibility::text LIKE '%"public"%';

-- resource_visibility 只需前端讀寫（非敏感欄位；實際遮蔽由 RPC 負責）
GRANT SELECT (resource_visibility) ON public.members TO anon, authenticated;
GRANT UPDATE (resource_visibility) ON public.members TO anon, authenticated;

-- ------------------------------------------------------------
-- STEP 2：隱私值正規化（'public'/NULL/未知 → guild_manager）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_equipment_visibility(p_visibility text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_visibility IN ('guild_manager', 'all_manager', 'admin') THEN p_visibility
    ELSE 'guild_manager'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_equipment_visibility(text) TO authenticated;

-- ------------------------------------------------------------
-- STEP 3：單一 visibility → 是否可看（純判定，不查表）
--   與前端 canViewWithVisibility 完全一致。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mask_category_can(
  p_visibility text,
  p_owns_member boolean,
  p_ok_admin boolean,
  p_ok_manager boolean,
  p_ok_guild_manager boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_owns_member THEN TRUE
    WHEN public.normalize_equipment_visibility(p_visibility) = 'guild_manager' THEN p_ok_guild_manager
    WHEN p_visibility = 'all_manager' THEN p_ok_manager
    WHEN p_visibility = 'admin' THEN p_ok_admin
    ELSE FALSE
  END;
$$;

GRANT EXECUTE ON FUNCTION public.mask_category_can(text, boolean, boolean, boolean, boolean)
  TO authenticated;

-- ------------------------------------------------------------
-- STEP 4：部位遮蔽（純函式；語意與前端 resolveCategoryVisibility 一致）
--   同時補齊「分拆後」的單件 key —— 舊版清單只有分組 key，
--   分拆後的部位（例：phys_weapon_dragon_sword）會被當成未知 key
--   原封不動回傳，等於部位隱私在後端沒生效。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mask_equipment(
  p_equipment jsonb,
  p_category_visibility jsonb,
  p_equipment_visibility text,
  p_owns_member boolean,
  p_ok_admin boolean,
  p_ok_manager boolean,
  p_ok_guild_manager boolean
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_categories text[] := ARRAY[
    -- 現行單件 key（EQUIPMENT_CATEGORIES）
    'phys_weapon_dragon_sword', 'phys_weapon_thunder_hammer', 'phys_weapon_piercing_spear',
    'magic_weapon_traveler_friend', 'magic_weapon_destroyer_eye', 'magic_weapon_demon_grimoire',
    'ur_exclusive', 'venom_serpent',
    'life_crit_dmg_lake_ring', 'life_crit_dmg_charm_eye',
    'life_crit_rate_aesthetic_peak', 'life_crit_rate_harmony_pact',
    'phys_glove_god_arm', 'phys_glove_chief_majesty',
    'magic_glove_betrayal_bond', 'magic_glove_guardian_scale',
    'phys_crit_glove', 'magic_crit_glove',
    -- 舊分組 key（尚未清理的舊資料仍會遮蔽）
    'phys_weapon', 'magic_weapon', 'life_crit_dmg',
    'life_crit_rate', 'phys_glove', 'magic_glove'
  ];
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_in jsonb;
  v_cat jsonb;
  v_item jsonb;
  v_global_vis text;
  v_c23_vis text;
  v_c24_vis text;
  v_can_c23 boolean;
  v_can_c24 boolean;
BEGIN
  IF p_equipment IS NULL THEN
    RETURN NULL;
  END IF;

  v_global_vis := p_equipment_visibility;

  FOR v_key IN SELECT jsonb_object_keys(p_equipment) LOOP
    v_in := p_equipment->v_key;

    -- 非已知類別 key：原封不動（__resources 由 mask_equipment_resources 處理）
    IF NOT (v_key = ANY(v_categories)) THEN
      v_out := jsonb_set(v_out, ARRAY[v_key], v_in, true);
      CONTINUE;
    END IF;

    v_cat := NULLIF(p_category_visibility->v_key, 'null'::jsonb);

    -- 層級解析：c 值專屬 > 部位 > 全域
    v_c23_vis := COALESCE(NULLIF(v_cat->>'c23', ''), NULLIF(v_cat->>'visibility', ''), v_global_vis);
    v_c24_vis := COALESCE(NULLIF(v_cat->>'c24', ''), NULLIF(v_cat->>'visibility', ''), v_global_vis);

    v_can_c23 := public.mask_category_can(v_c23_vis, p_owns_member, p_ok_admin, p_ok_manager, p_ok_guild_manager);
    v_can_c24 := public.mask_category_can(v_c24_vis, p_owns_member, p_ok_admin, p_ok_manager, p_ok_guild_manager);

    v_item := jsonb_build_object(
      'c23', CASE WHEN v_can_c23 THEN (v_in->>'c23')::jsonb ELSE NULL END,
      'c24', CASE WHEN v_can_c24 THEN (v_in->>'c24')::jsonb ELSE NULL END
    );

    -- 任一部份可看時才保留 updatedAt；否則整部位只剩 null 佔位
    IF (v_can_c23 OR v_can_c24) AND v_in ? 'updatedAt' THEN
      v_item := v_item || jsonb_build_object('updatedAt', v_in->'updatedAt');
    END IF;

    v_out := jsonb_set(v_out, ARRAY[v_key], v_item, true);
  END LOOP;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mask_equipment(jsonb, jsonb, text, boolean, boolean, boolean, boolean)
  TO authenticated;

-- ------------------------------------------------------------
-- STEP 5：重要資源遮蔽（純函式；只保留可見的資源 key）
--   在 mask_equipment 之後呼叫（mask_equipment 會原封不動保留
--   __resources，這裡再依 resource_visibility 逐項遮蔽）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mask_equipment_resources(
  p_equipment jsonb,
  p_resource_visibility jsonb,
  p_equipment_visibility text,
  p_owns_member boolean,
  p_ok_admin boolean,
  p_ok_manager boolean,
  p_ok_guild_manager boolean
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_resource_keys text[] := ARRAY[
    'ancientCrystal', 'refiningCrystal', 'goddessTears',
    'refiningTrace', 'burstFlame'
  ];
  v_in jsonb;
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_vis text;
BEGIN
  IF p_equipment IS NULL THEN
    RETURN NULL;
  END IF;

  v_in := p_equipment->'__resources';
  IF v_in IS NULL OR jsonb_typeof(v_in) <> 'object' THEN
    RETURN p_equipment;
  END IF;

  FOREACH v_key IN ARRAY v_resource_keys LOOP
    IF NOT (v_in ? v_key) THEN
      CONTINUE;
    END IF;

    -- 層級解析：資源覆蓋 > 全域
    v_vis := COALESCE(NULLIF(p_resource_visibility->>v_key, ''), p_equipment_visibility);

    IF public.mask_category_can(
      v_vis, p_owns_member, p_ok_admin, p_ok_manager, p_ok_guild_manager
    ) THEN
      v_out := jsonb_set(v_out, ARRAY[v_key], v_in->v_key, true);
    END IF;
  END LOOP;

  RETURN jsonb_set(p_equipment, ARRAY['__resources'], v_out, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mask_equipment_resources(jsonb, jsonb, text, boolean, boolean, boolean, boolean)
  TO authenticated;

-- ------------------------------------------------------------
-- STEP 6：身份 helper —— 公會正/副會長一律視為該公會管理者
--   （不再要求 profiles.user_role 必須是 manager，與前端
--     managedGuildIds 的判定一致）
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
    WHERE cp.user_role IN ('creator', 'admin', 'manager')
      AND (p_guild_id IS NULL OR m.guild_id = p_guild_id)
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
    WHEN 'guild_manager' THEN public.is_guild_manager_of(v_guild)
    WHEN 'all_manager' THEN public.is_manager()
    WHEN 'admin' THEN public.is_admin()
    ELSE FALSE
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_equipment(text) TO authenticated;


-- ------------------------------------------------------------
-- STEP 7：get_member_equipment
--   * 回傳 resource_visibility 供遮蔽使用
--   * ok_guild_manager 納入「綁定成員是該公會正/副會長」
--   * 重要資源逐項遮蔽；refining_traces 同步受 refiningTrace 隱私控制
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
        OR EXISTS (
          SELECT 1
          FROM bound b3
          JOIN members mb3 ON mb3.id = b3.member_id
          WHERE mb3.guild_id = m.guild_id
            AND mb3.role IN ('leader', 'coleader')
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
      THEN public.mask_equipment_resources(
        public.mask_equipment(
          r.equipment, r.category_visibility, r.equipment_visibility,
          r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
        ),
        r.resource_visibility, r.equipment_visibility,
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
      AND public.mask_category_can(
        COALESCE(NULLIF(r.resource_visibility->>'refiningTrace', ''), r.equipment_visibility),
        r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
      )
      THEN r.refining_traces ELSE NULL
    END AS refining_traces
  FROM rows r
  ORDER BY r.id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_member_equipment(text[], text) TO authenticated;


-- ------------------------------------------------------------
-- STEP 8：get_member_equipment_showcase
--   ok_guild_manager 同步納入「綁定成員是該公會正/副會長」
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
        OR EXISTS (
          SELECT 1
          FROM bound b3
          JOIN members mb3 ON mb3.id = b3.member_id
          WHERE mb3.guild_id = m.guild_id
            AND mb3.role IN ('leader', 'coleader')
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
      public.mask_category_can(
        r.equipment_visibility, r.owns_member, r.ok_admin, r.ok_manager, r.ok_guild_manager
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

GRANT EXECUTE ON FUNCTION public.get_member_equipment_showcase(text[], text) TO authenticated;

-- ------------------------------------------------------------
-- 驗證：
--   SELECT id, name, equipment_visibility, category_visibility, resource_visibility
--   FROM public.members LIMIT 5;
--   -- 舊 'public' 應已全部轉為 guild_manager：
--   SELECT count(*) FROM public.members WHERE equipment_visibility = 'public';
--   -- 資源隱私（以本人身份執行時應完整回傳；以他人身份執行時隱藏項不應出現）
--   SELECT id, equipment->'__resources' FROM public.get_member_equipment() LIMIT 3;
-- ------------------------------------------------------------

