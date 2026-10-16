-- ============================================================
-- 裝備表：UR 通用裝備「分拆成單件」— 清空被分拆分組的舊資料
--
-- ⚠️⚠️ 這個檔案「不是必要的」，而且原版本會做全表 UPDATE ⚠️⚠️
--
--   前端其實已經自動處理好了，不清資料也不會壞：
--     * src/shared/lib/equipment.ts → normalizeEquipment() 只讀新的 18 個
--       單件 key，舊的分組 key 讀進來會被忽略（不會顯示）。
--     * 成員在編輯視窗按一次儲存後，整包 equipment 會被新物件覆蓋，
--       舊 key 就自然消失。
--
--   → 建議：**先不要跑這個檔案**。等離峰時段再分批處理，或完全跳過。
--   → 若真的要清，請用下面的「分批版本」，不要用整段全表 UPDATE：
--     一次改寫 members 每一列會產生大量 dead tuple / WAL / autovacuum IO，
--     在免費方案上可能讓整個資料庫卡住（PostgREST 連線被佔滿 → 全部 API 無回應）。
--
-- 背景：
--   舊版裝備表以「部位分組」為單位（例如 phys_weapon 一個欄位同時代表
--   惡龍的魔劍 / 雷霆槌子 / 必中之矛 三件裝備），單一分組的 23C/24C
--   數量無法對應回個別裝備，因此新版改為「每件裝備各自一欄」。
--
--   對應前端清單：src/entities/member/types.ts → SPLIT_LEGACY_GROUP_KEYS
--   被分拆的舊分組 key：
--     phys_weapon / magic_weapon / life_crit_dmg /
--     life_crit_rate / phys_glove / magic_glove
--   不變動（單件分組，既有資料保留）：
--     ur_exclusive / venom_serpent / phys_crit_glove / magic_crit_glove
--
-- 執行方式：Supabase 後台 → SQL Editor。可重複執行。
-- ============================================================

-- 避免長時間等鎖（等不到就快速失敗，而不是把整張表的鎖佇列卡住）
SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- ------------------------------------------------------------
-- 【第一步】先看有多少列需要處理（純查詢，很安全）
-- ------------------------------------------------------------
SELECT count(*) AS members_needing_cleanup
FROM public.members
WHERE equipment ?| ARRAY['phys_weapon','magic_weapon','life_crit_dmg',
                         'life_crit_rate','phys_glove','magic_glove']
   OR category_visibility ?| ARRAY['phys_weapon','magic_weapon','life_crit_dmg',
                                   'life_crit_rate','phys_glove','magic_glove'];

-- ------------------------------------------------------------
-- 【第二步】分批清空（建議版本）— 一次只處理 200 列
--   重複執行這一段，直到 UPDATE 0 為止。
--   每批都是獨立交易，不會長時間鎖住 members。
-- ------------------------------------------------------------
WITH batch AS (
  SELECT id
  FROM public.members
  WHERE equipment ?| ARRAY['phys_weapon','magic_weapon','life_crit_dmg',
                           'life_crit_rate','phys_glove','magic_glove']
     OR category_visibility ?| ARRAY['phys_weapon','magic_weapon','life_crit_dmg',
                                     'life_crit_rate','phys_glove','magic_glove']
  LIMIT 200
)
UPDATE public.members m
SET equipment = m.equipment
      - 'phys_weapon' - 'magic_weapon' - 'life_crit_dmg'
      - 'life_crit_rate' - 'phys_glove' - 'magic_glove',
    category_visibility = m.category_visibility
      - 'phys_weapon' - 'magic_weapon' - 'life_crit_dmg'
      - 'life_crit_rate' - 'phys_glove' - 'magic_glove'
WHERE m.id IN (SELECT id FROM batch);

-- ------------------------------------------------------------
-- 【第三步】確認清乾淨了（應回傳 0）
-- ------------------------------------------------------------
SELECT count(*) AS remaining
FROM public.members
WHERE equipment ?| ARRAY['phys_weapon','magic_weapon','life_crit_dmg',
                         'life_crit_rate','phys_glove','magic_glove'];

-- ------------------------------------------------------------
-- 【選用】若之後覺得 dead tuple 太多，可在離峰時段執行：
--   VACUUM (ANALYZE) public.members;
-- ------------------------------------------------------------
