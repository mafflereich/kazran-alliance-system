-- ============================================================
-- 部位級隱私遮蔽：mask_equipment + mask_category_can
--
-- 背景問題：
--   get_member_equipment 只做「粗粒度」(equipment_visibility) 判斷，
--   只要該成員全域可見（例如 public），就會把整包 equipment jsonb
--   （含被 member 的 category_visibility 設為隱藏的部位）回傳給瀏覽端，
--   隱私只靠前端 canViewCategoryForUI 的 JS 判斷 →「後端沒卡」。
--
-- 修正：
--   在 RPC 內對 equipment 做部位/C值級遮蔽，語意與前端完全一致：
--     resolveCategoryVisibility：c23/c24 的專屬覆蓋 > 部位 visibility >
--       > 全域 equipment_visibility > （無值視為 public）
--     權限判定：私人(owns) 永遠看 → public：所有人 →
--       admin：creator/admin → all_manager：creator/admin/manager →
--       guild_manager：admin/creator 或 manager 且綁定同公會成員 →
--       其他值 → TRUE（與 DB can_view_equipment 的 ELSE TRUE 一致）
--
-- 效能：mask_equipment / mask_category_can 是純函式（不查任何表），
--   每列呼叫皆微秒級，不會再造成 N+1 timeout。身份判定仍由
--   get_member_equipment 的 CTE 只解析一次後以布林傳入。
--
-- 執行方式：Supabase 後台 → SQL Editor 直接執行（可重複執行）。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：單一 visibility → 是否可看（純判定，不查表）
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
    WHEN p_visibility = 'public' THEN TRUE
    WHEN p_visibility NOT IN ('public', 'all_manager', 'guild_manager', 'admin') THEN TRUE
    WHEN p_visibility = 'admin' THEN p_ok_admin
    WHEN p_visibility = 'all_manager' THEN p_ok_manager
    WHEN p_visibility = 'guild_manager' THEN p_ok_guild_manager
    ELSE TRUE
  END;
$$;

GRANT EXECUTE ON FUNCTION public.mask_category_can(text, boolean, boolean, boolean, boolean)
  TO authenticated;

-- ------------------------------------------------------------
-- STEP 2：遮蔽 equipment jsonb（純函式；不認識的頂層 key 原封保留）
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
    'phys_weapon', 'magic_weapon', 'ur_exclusive', 'venom_serpent',
    'life_crit_dmg', 'life_crit_rate', 'phys_glove', 'magic_glove',
    'phys_crit_glove', 'magic_crit_glove'
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

    -- 非已知類別 key：原封不動
    IF NOT (v_key = ANY(v_categories)) THEN
      v_out := jsonb_set(v_out, ARRAY[v_key], v_in, true);
      CONTINUE;
    END IF;

    v_cat := NULLIF(p_category_visibility->v_key, 'null'::jsonb);

    -- 層級解析：c 值專屬 > 部位 > 全域 > public
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
-- STEP 3：更新 get_member_equipment（技術性重寫，遮蔽部位詳細資料）
--   仍為集合式：身份 CTE 只解析一次；mask_* 純函式不產生查詢。
-- ------------------------------------------------------------
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
$$;

GRANT EXECUTE ON FUNCTION public.get_member_equipment(text[], text) TO authenticated;

-- ------------------------------------------------------------
-- 驗證：
--   SELECT id, equipment FROM public.get_member_equipment() LIMIT 3;
--   -- 隱藏部位應為 c23/c24:null；非隱藏部位保留數值。
-- ------------------------------------------------------------