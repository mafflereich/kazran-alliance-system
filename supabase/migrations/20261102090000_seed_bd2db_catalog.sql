-- ============================================================
-- 以 BD2DB（https://browndust2-db.souseha.com）補齊角色 / 服裝資料
--
-- 來源：BD2DB 角色資料（db-characters chunk）
--   - 只補「5 星」角色與其所屬服裝
--   - 缺少的 5 星角色：3 位
--   - 缺少的服裝：5 件（含既有 5 星角色缺少的 2 件）
--
-- 特性：
--   - 全部使用 ON CONFLICT (id) DO NOTHING，可重複執行
--   - 只新增缺少的資料，不覆蓋既有名稱 / 排序 / 圖片
--   - 角色 order_num 依 BD2DB 角色列表順序（與現有 DB 的 1..61 完全一致）
--   - 服裝 order_num 取 costumeId 結尾數字（例如 Aquila_2 -> 2）
--   - image_name 使用 costumeId，前端會組 https://image-bd2db.souseha.com/characters/<id>.webp
-- ============================================================

INSERT INTO public.characters (id, name, name_e, order_num, gender, atk_type, star, attribute, default_stats)
VALUES
  ('KyoukaUzen', '羽前京香', 'Kyouka Uzen', 62, '女', '物', '5', '光', '{}'::jsonb),
  ('TenkaIzumo', '出雲天花', 'Tenka Izumo', 63, '女', '魔', '5', '暗', '{}'::jsonb),
  ('RenYamashiro', '山城戀', 'Ren Yamashiro', 64, '女', '魔', '5', '光', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.costumes (id, character_id, name, name_e, image_name, order_num, is_new, dashboard_shown)
VALUES
  ('KyoukaUzen_1', 'KyoukaUzen', '無窮之鎖', 'Eternal Chains', 'KyoukaUzen_1', 1, false, false),
  ('TenkaIzumo_1', 'TenkaIzumo', '天御鳥命', 'Ame-no-Mitori', 'TenkaIzumo_1', 1, false, false),
  ('RenYamashiro_1', 'RenYamashiro', '無限宇宙之全一', 'Lord of the Cosmos', 'RenYamashiro_1', 1, false, false),
  ('Nekyndalia_2', 'Nekyndalia', '殘破木乃伊', 'Unraveling Mummy', 'Nekyndalia_2', 2, false, false),
  ('Aquila_2', 'Aquila', '封印的欲望', 'Sealed Desires', 'Aquila_2', 2, false, false)
ON CONFLICT (id) DO NOTHING;
