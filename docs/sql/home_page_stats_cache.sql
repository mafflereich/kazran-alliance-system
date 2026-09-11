-- ============================================================
-- 首頁統計快取（home_page_stats）
--
-- 目的：
--   首頁（Login.tsx）原本要 fetchAllMembers → 呼叫 get_member_equipment RPC
--   讀全部成員敏感資料，再在前端計算每公會的：
--     ＊ 煉製之痕總數（traces）
--     ＊ 填寫人數（filled，refining_traces > 0 的人數）
--     ＊ 最後更新時間（last_update_ms，updated_at / costumes_updated_at /
--        equipment_updated_at 的最大值）
--   成員破千後此路徑必 timeout。
--
--   改為：DB 端以「集合式聚合」預先算好每公會統計，存到本表；
--   首頁只讀一筆快取（最新 < 1h 直接回傳，超過才重算）。
--
-- 決策（依使用者確認）：
--   1) 統計範圍＝全體【非封存】成員，不分瀏覽者權限、不遮蔽
--      （僅存聚合值，不含任何成員個人敏感資料）。
--   2) 更新機制＝讀取時檢查過期（>1h 才重算），不依賴 pg_cron，
--      兼容 Supabase free tier。
--
-- 安全性：
--   本表只透過 SECURITY DEFINER RPC get_home_page_stats() 讀取，
--   故啟用 RLS 且不設 policy（直接 SELECT 會被擋，RPC 不受影響）。
--
-- 執行方式：Supabase 後台 → SQL Editor 直接執行（可重複執行）。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：快取表（idempotent）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.home_page_stats (
  guild_id text PRIMARY KEY,
  refining_traces_total bigint NOT NULL DEFAULT 0,   -- 煉製之痕總和
  people_filled_count bigint NOT NULL DEFAULT 0,     -- refining_traces > 0 的人數
  last_update_ms bigint NOT NULL DEFAULT 0,          -- 最後更新（epoch ms）
  updated_at timestamptz NOT NULL DEFAULT now()      -- 本筆快取產生時間
);

COMMENT ON TABLE public.home_page_stats IS
  '首頁每公會統計快取：煉痕總數 / 填寫人數 / 最後更新。僅存聚合值，由 refresh_home_page_stats() 產生、get_home_page_stats() 讀取（逾 1h 自動重算）。';

ALTER TABLE public.home_page_stats ENABLE ROW LEVEL SECURITY;

-- 只可經由 SECURITY DEFINER RPC 存取；不建立任何 policy。
REVOKE ALL ON public.home_page_stats FROM anon, authenticated;
GRANT SELECT ON public.home_page_stats TO service_role;

-- ------------------------------------------------------------
-- STEP 2：重算（集合式，一次全算；advisory lock 避免並發重複計算）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_home_page_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 串行化重算：同一時間只想讓一個請求在做刪除+重建
  PERFORM pg_advisory_xact_lock(hashtext('home_page_stats_refresh'));

  DELETE FROM public.home_page_stats;

  INSERT INTO public.home_page_stats (
    guild_id,
    refining_traces_total,
    people_filled_count,
    last_update_ms,
    updated_at
  )
  SELECT
    m.guild_id,
    COALESCE(SUM(COALESCE(m.refining_traces, 0)), 0),
    COUNT(*) FILTER (WHERE COALESCE(m.refining_traces, 0) > 0),
    COALESCE(MAX(GREATEST(
      COALESCE(m.updated_at, 0),
      COALESCE(m.costumes_updated_at, 0),
      COALESCE(m.equipment_updated_at, 0)
    )), 0),
    now()
  FROM public.members m
  WHERE m.guild_id IS NOT NULL
    AND COALESCE(m.status, '') <> 'archived'
  GROUP BY m.guild_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_home_page_stats() TO authenticated;

-- ------------------------------------------------------------
-- STEP 3：讀取（逾時檢查 + 回傳快取；超過 1h 才重算）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_home_page_stats()
RETURNS TABLE (
  guild_id text,
  refining_traces_total bigint,
  people_filled_count bigint,
  last_update_ms bigint,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 全表都沒有夠新的快取（或表為空）→ 先重算一次
  IF COALESCE(
    (SELECT MAX(updated_at) FROM public.home_page_stats),
    'epoch'
  ) < now() - interval '1 hour' THEN
    PERFORM public.refresh_home_page_stats();
  END IF;

  RETURN QUERY
  SELECT
    h.guild_id,
    h.refining_traces_total,
    h.people_filled_count,
    h.last_update_ms,
    h.updated_at
  FROM public.home_page_stats h
  ORDER BY h.guild_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_page_stats() TO authenticated;

-- ------------------------------------------------------------
-- 驗證：
--   SELECT * FROM public.get_home_page_stats();
--   SELECT * FROM public.home_page_stats ORDER BY guild_id;
-- ------------------------------------------------------------