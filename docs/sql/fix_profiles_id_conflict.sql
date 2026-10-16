-- ============================================================
-- profiles：修正 profiles_id_key 唯一鍵衝突（症狀：使用者登入顯示 not_in_guild）
--
-- 症狀：
--   使用者在正確的 Discord 伺服器、也有棕二身份組，但登入後被強制登出並顯示
--   「not_in_guild」（或字面上的 not_in_guild）。系統日誌會有一筆
--   level=error / source=edge_sync_discord / action=upsert_profile_failed：
--     code      = 23505
--     message   = duplicate key value violates unique constraint "profiles_id_key"
--     details   = Key (id)=(<成員 UUID>) already exists.
--
-- 成因：
--   Edge Function sync-discord-roles 會用 Discord 暱稱比對 members.name，
--   找到成員後把 profiles.id 設為該成員 UUID（onConflict: discord_id）。
--   profiles.id 有唯一性約束 profiles_id_key，因此當「同一個遊戲成員」
--   已經被另一個 Discord 帳號的 profile 佔用時，整筆 upsert 會失敗 →
--   profiles 沒有該 discord_id 這一列 → 前端查不到 profile，
--   就誤顯示「您不在指定的公會聯盟中」並把使用者登出（每次登入都會重複發生）。
--
-- 常見佔用來源：
--   1. 玩家換了 Discord 帳號，舊帳號的 profile 仍留著綁定。
--   2. 管理員在「身份綁定」後台手動綁定時填錯 Discord ID。
--   3. 兩個不同 Discord 帳號使用相同伺服器暱稱，都被比對到同一位成員。
--
-- 執行方式：Supabase 後台 → SQL Editor，依序執行 STEP 0 → STEP 1 → STEP 2。
-- 提醒：解除綁定請一律設 NULL，不要設空字串 ''。
--       profiles_id_key 是 UNIQUE(id)，PostgreSQL 允許「多個 NULL」，
--       但不允許「多個 ''」，設 '' 只會把問題變成下一次的 23505。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 0-1：找出「誰佔用了這個成員 UUID」（= 造成衝突的那一列）
--   把 <MEMBER_ID> 換成 log 裡 details 的 Key (id)=(...) 值
-- ------------------------------------------------------------
SELECT discord_id,
       discord_username,
       display_name,
       id,
       auth_id,
       user_role,
       user_guilds
FROM profiles
WHERE id = '<MEMBER_ID>'                 -- 單筆綁定
   OR id LIKE '%<MEMBER_ID>%'            -- 逗號分隔的多筆綁定
ORDER BY discord_id;

-- ------------------------------------------------------------
-- STEP 0-2：找出「這次登入失敗的帳號」目前有沒有 profile 列
--   把 <NEW_DISCORD_ID> 換成登入者的 Discord 雪花 ID
--   （通常回傳 0 列，代表 upsert 確實整筆失敗、profile 沒被建立）
-- ------------------------------------------------------------
SELECT discord_id, discord_username, display_name, id, auth_id, user_role, user_guilds
FROM profiles
WHERE discord_id = '<NEW_DISCORD_ID>';

-- ------------------------------------------------------------
-- STEP 0-3：確認衝突原因（可選）
--   確認 members 真的有這位成員，以及他的暱稱是否與別人重複
-- ------------------------------------------------------------
SELECT id, name, guild_id, role, status
FROM members
WHERE id = '<MEMBER_ID>';

-- ------------------------------------------------------------
-- STEP 1：解除「錯誤的那一列」對該成員的綁定
--
--   把 <OLD_DISCORD_ID> 換成 STEP 0-1 查到的佔用者 discord_id。
--   以下語法同時支援單筆（'UUID'）與逗號多筆（'UUID1,UUID2'）：
--   只移除該 UUID，其餘保留；若移除後清單為空則設為 NULL。
--   ※ 若該欄位是用「逗號+空白」分隔（例如 'a, b'），此 replace 不會命中，
--     請先 SELECT 確認格式，或改用 Multi Match 後台／手動字串處理。
-- ------------------------------------------------------------
UPDATE profiles
SET id = NULLIF(
           trim(both ',' from replace(',' || id || ',', ',' || '<MEMBER_ID>' || ',', ',')),
           ''
         )
WHERE discord_id = '<OLD_DISCORD_ID>'
  AND id LIKE '%<MEMBER_ID>%';

-- 若 STEP 0-1 的佔用者是「已不再使用」的孤兒 profile（auth_id 為 null、
-- 該帳號也不會再登入），也可以直接整列刪除（二選一，不要同時做）：
-- DELETE FROM profiles
-- WHERE discord_id = '<OLD_DISCORD_ID>'
--   AND id LIKE '%<MEMBER_ID>%';

-- ------------------------------------------------------------
-- STEP 2：驗證
--   1) 該成員 UUID 應該只剩「正確的那一列」（或完全沒有）
--   2) 不應該再有任何 id = '' 的列（空字串會讓下一次解除綁定再撞 23505）
-- ------------------------------------------------------------
SELECT discord_id, discord_username, display_name, id
FROM profiles
WHERE id LIKE '%<MEMBER_ID>%'
ORDER BY discord_id;

SELECT count(*) AS empty_id_rows
FROM profiles
WHERE id = '';

-- ------------------------------------------------------------
-- STEP 3：請該使用者重新登入
--   Edge Function 會重新 upsert，這次 id 不再衝突 → profile 建立成功 →
--   前端即可正常登入（若系統日誌出現 warn / id_conflict，代表仍有其他
--   帳號佔用同一位成員，回到 STEP 0 再查一次）。
-- ============================================================
