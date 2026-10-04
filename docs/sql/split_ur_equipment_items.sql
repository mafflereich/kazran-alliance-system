-- ============================================================
-- 裝備表：UR 通用裝備「分拆成單件」— 清空被分拆分組的舊資料
--
-- 背景：
--   舊版裝備表以「部位分組」為單位（例如 phys_weapon 一個欄位同時代表
--   惡龍的魔劍 / 雷霆槌子 / 必中之矛 三件裝備），單一分組的 23C/24C
--   數量無法對應回個別裝備。
--
--   新版改為「每件裝備各自一欄」，因此被分拆的分組舊資料一律清空，
--   由成員重新填寫。對應前端清單：
--     src/entities/member/types.ts → SPLIT_LEGACY_GROUP_KEYS
--
--   被分拆的舊分組 key：
--     phys_weapon / magic_weapon / life_crit_dmg /
--     life_crit_rate / phys_glove / magic_glove
--
--   不變動（單件分組，既有資料保留）：
--     ur_exclusive / venom_serpent / phys_crit_glove / magic_crit_glove
--
-- 執行方式：Supabase 後台 → SQL Editor 整段執行（可重複執行）。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：清空被分拆分組的裝備數量
-- ------------------------------------------------------------
UPDATE public.members
SET equipment = equipment
      - 'phys_weapon'
      - 'magic_weapon'
      - 'life_crit_dmg'
      - 'life_crit_rate'
      - 'phys_glove'
      - 'magic_glove'
WHERE equipment IS NOT NULL;

-- ------------------------------------------------------------
-- STEP 2：同步清空這些分組的「部位個別隱私」覆蓋設定
--   （分組已不存在，殘留的 category_visibility 只會造成混淆）
-- ------------------------------------------------------------
UPDATE public.members
SET category_visibility = category_visibility
      - 'phys_weapon'
      - 'magic_weapon'
      - 'life_crit_dmg'
      - 'life_crit_rate'
      - 'phys_glove'
      - 'magic_glove'
WHERE category_visibility IS NOT NULL;

-- ------------------------------------------------------------
-- 驗證（應回傳 0 列）：
--   SELECT id, name, equipment, category_visibility
--   FROM public.members
--   WHERE equipment ?| ARRAY['phys_weapon','magic_weapon','life_crit_dmg',
--                            'life_crit_rate','phys_glove','magic_glove'];
-- ------------------------------------------------------------
