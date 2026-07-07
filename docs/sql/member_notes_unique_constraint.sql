-- ============================================================
-- member_notes：去除重複列 + 對 member_id 加上 UNIQUE 約束
--
-- 目的：讓前端的 upsert({ onConflict: 'member_id' }) 有依據，
--       從根本杜絕「同一 member_id 產生多列」的問題。
--
-- 執行方式：在 Supabase 後台 → SQL Editor 依序執行。
--          建議先跑 STEP 0，若沒有重複可直接跳到 STEP 3。
-- 備註：member_notes 主鍵為 uid，member_id 為指向 members 的外鍵。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 0：檢查目前是否已存在重複列（回傳空 = 無重複）
-- ------------------------------------------------------------
SELECT member_id, count(*) AS dup_count
FROM member_notes
GROUP BY member_id
HAVING count(*) > 1
ORDER BY dup_count DESC;

-- ------------------------------------------------------------
-- STEP 1：合併每個 member_id 的多列到「保留列」（uid 最小者）
--         note / archive_remark 取任一非空值，is_reserved 取 OR
--         若 STEP 0 無結果，可略過 STEP 1、STEP 2。
-- ------------------------------------------------------------
WITH merged AS (
  SELECT
    member_id,
    (array_remove(
       array_agg(note ORDER BY uid) FILTER (WHERE note IS NOT NULL AND note <> ''),
       NULL))[1] AS note,
    bool_or(coalesce(is_reserved, false)) AS is_reserved,
    (array_remove(
       array_agg(archive_remark ORDER BY uid) FILTER (WHERE archive_remark IS NOT NULL AND archive_remark <> ''),
       NULL))[1] AS archive_remark
  FROM member_notes
  GROUP BY member_id
  HAVING count(*) > 1
),
-- 挑每個 member_id 中 uid 最小的那列為「保留列」
-- （uid 為 UUID，沒有 min() 聚合，改用 DISTINCT ON + ORDER BY）
keep AS (
  SELECT DISTINCT ON (member_id) member_id, uid AS keep_uid
  FROM member_notes
  ORDER BY member_id, uid
)
UPDATE member_notes mn
SET note           = m.note,
    is_reserved    = m.is_reserved,
    archive_remark = m.archive_remark
FROM merged m
JOIN keep k ON k.member_id = m.member_id
WHERE mn.uid = k.keep_uid;

-- ------------------------------------------------------------
-- STEP 2：刪除每個 member_id 除保留列以外的重複列
-- ------------------------------------------------------------
DELETE FROM member_notes mn
USING (
  SELECT uid,
         row_number() OVER (PARTITION BY member_id ORDER BY uid) AS rn
  FROM member_notes
) d
WHERE mn.uid = d.uid
  AND d.rn > 1;

-- ------------------------------------------------------------
-- STEP 3：加上 UNIQUE 約束
--         之後任何重複的 insert 都會在 DB 端被擋下，
--         而 upsert 會走 ON CONFLICT DO UPDATE。
-- ------------------------------------------------------------
-- 先移除同名約束（若已存在）再建立，讓本步驟可重複執行
ALTER TABLE member_notes
  DROP CONSTRAINT IF EXISTS member_notes_member_id_key;
ALTER TABLE member_notes
  ADD CONSTRAINT member_notes_member_id_key UNIQUE (member_id);

-- ------------------------------------------------------------
-- 驗證：以下應回傳空結果
-- ------------------------------------------------------------
SELECT member_id, count(*)
FROM member_notes
GROUP BY member_id
HAVING count(*) > 1;
