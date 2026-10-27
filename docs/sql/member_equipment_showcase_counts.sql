-- ============================================================
-- MemberBoard 成員卡：24C 毒蛇 / 主神 / 龍鱗 數量快照
--
-- 背景：
--   MemberBoard 原本不載入裝備資料（避免把上千位成員丟進
--   get_member_equipment 造成 timeout）。但卡片需要顯示三件
--   特定裝備的 24C 數量，因此新增這支「只回傳 3 個整數」的
--   輕量 RPC，payload 遠小於整包 equipment / records。
--
-- 隱私：
--   完全沿用 mask_category_can 的層級判定：
--     C 值覆蓋 > 部位 visibility > 全域 equipment_visibility
--   不可見的欄位回傳 NULL；可見但沒有資料回傳 0。
--
-- 前提：
--   docs/sql/mask_equipment_category_privacy.sql 已套用
--   （提供 public.mask_category_can）。
--   若尚未套用，前端會自動退回 get_member_equipment（仍能運作，
--   但 payload 較大）。
--
-- 效能：
--   身份 CTE 只解析一次，mask_category_can 為 IMMUTABLE 純函式，
--   沒有 per-row 查表。前端每次最多帶 500 個 id，並限制併發數。
--
-- 執行方式：Supabase 後台 → SQL Editor 直接執行（可重複執行）。
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_equipment_showcase(
  p_member_ids text[] DEFAULT NULL,
  p_guild_id text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  venom_serpent_c24 integer,
  chief_majesty_c24 integer,
  guardian_scale_c24 integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_member_equipment_showcase(text[], text) TO authenticated;

-- ------------------------------------------------------------
-- 驗證：
--   SELECT * FROM public.get_member_equipment_showcase(
--     p_member_ids := (SELECT array_agg(id) FROM members LIMIT 10)
--   );
--   -- 不可見的欄位會是 NULL；可見但沒有裝備會是 0。
-- ------------------------------------------------------------
