-- ============================================================
-- 批次寫入 RPC：把「一次編輯」造成的 4~5 個 request 併成 1 個
--
-- 背景（為什麼需要）：
--   舊版每次自動存檔要循序打：
--     1. member_raid_records upsert
--     2. members update            （備註有變時）
--     3. member_notes upsert       （備註有變時）
--     4. guild_raid_records upsert （重算中位數）
--     5. system_logs insert        （Logger）
--   連續打十幾位成員就會 timeout，而且第 2~4 步失敗時資料會半套。
--
--   現在：前端把 600ms 內的編輯合併，呼叫一次 save_raid_records_bulk，
--   分數 / 賽季備註 / overkill / 成員備註 / 中位數 在同一個 transaction 完成。
--
-- 另附 update_order：角色與服裝排序原本是 N 個單列 update 並行，
--   瀏覽器同網域只有 ~6 條連線，拖曳一次會排隊好幾秒。
--
-- 可重複執行。
-- ============================================================

-- ------------------------------------------------------------
-- 1) 重算單一公會的中位數（集合式，取代前端把上千筆 records 丟上來算）
--
--    分數 > 0 才列入；成員若已轉公會，優先用該筆紀錄的 season_guild
--    （封存賽季的語意），沒有才用成員目前的 guild_id。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_guild_median(
  p_season_id integer,
  p_guild_id  text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_median integer;
  v_archived boolean;
BEGIN
  v_archived := COALESCE(
    (SELECT rs.is_archived FROM public.raid_seasons rs WHERE rs.id = p_season_id),
    false
  );

  SELECT COALESCE(FLOOR(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r.score))::int, 0)
  INTO v_median
  FROM public.member_raid_records r
  JOIN public.members m ON m.id = r.member_id
  WHERE r.season_id = p_season_id
    AND r.score > 0
    -- 封存賽季：用「當時的公會」(season_guild)；進行中的賽季：用成員現在的公會。
    -- 這個規則與原本前端 updateGuildMedian 完全一致。
    -- （注意：進行中的賽季也可能有 season_guild，那是 CSV 匯入留下的，不可拿來分組）
    AND (
      CASE WHEN v_archived
           THEN COALESCE(r.season_guild, m.guild_id)
           ELSE m.guild_id
      END
    ) = p_guild_id;

  INSERT INTO public.guild_raid_records (season_id, guild_id, member_score_median)
  VALUES (p_season_id, p_guild_id, v_median)
  ON CONFLICT (season_id, guild_id) DO UPDATE
    SET member_score_median = EXCLUDED.member_score_median;

  RETURN v_median;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_guild_median(integer, text) TO authenticated;

-- ------------------------------------------------------------
-- 2) 批次儲存戰記
--
--    p_rows 範例：
--    [
--      { "member_id": "uuid", "score": 1200, "season_note": "",
--        "overkill": 3, "season_guild": null, "note": "備註" },
--      ...
--    ]
--    `note` 可省略（沒帶就不動 member_notes）。
--
--    回傳受影響公會的新中位數，讓前端不必再補一次 upsert。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_raid_records_bulk(
  p_season_id integer,
  p_rows      jsonb
)
RETURNS TABLE (guild_id text, member_score_median integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guild_ids text[];
  v_archived boolean;
BEGIN
  -- 權限：管理者 / 幹部，或任一公會的正副會長
  -- （與前端 canManageGuild / can_edit_raid_record 的規則一致）
  IF NOT (
    public.is_manager()
    OR EXISTS (
      SELECT 1
      FROM public.current_profile() cp
      CROSS JOIN LATERAL unnest(string_to_array(COALESCE(cp.id, ''), ',')) AS b(mid)
      JOIN public.members m ON m.id = btrim(b.mid)
      WHERE m.role IN ('leader', 'coleader')
    )
  ) THEN
    RAISE EXCEPTION 'permission denied for save_raid_records_bulk'
      USING ERRCODE = '42501';
  END IF;

  -- 1) 分數 / 賽季備註 / overkill
  INSERT INTO public.member_raid_records AS t
    (season_id, member_id, score, season_note, overkill, season_guild)
  SELECT
    p_season_id,
    r->>'member_id',
    COALESCE((r->>'score')::int, 0),
    COALESCE(r->>'season_note', ''),
    NULLIF(r->>'overkill', '')::int,
    NULLIF(r->>'season_guild', '')
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
  ON CONFLICT (season_id, member_id) DO UPDATE
    SET score        = EXCLUDED.score,
        season_note  = EXCLUDED.season_note,
        overkill     = EXCLUDED.overkill,
        season_guild = COALESCE(EXCLUDED.season_guild, t.season_guild);

  -- 2) 成員備註（只有明確帶 note 的列才處理）
  INSERT INTO public.member_notes AS n (member_id, note)
  SELECT r->>'member_id', r->>'note'
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
  WHERE r ? 'note' AND r->>'note' IS NOT NULL
  ON CONFLICT (member_id) DO UPDATE
    SET note = EXCLUDED.note;

  -- 2-1) 備註有變更時同步 members.updated_at
  --      （首頁「最後更新時間」＝ updated_at / costumes_updated_at /
  --        equipment_updated_at 的最大值，舊版是靠 updateMember 順便更新的）
  UPDATE public.members m
  SET updated_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint
  WHERE m.id IN (
    SELECT r->>'member_id'
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
    WHERE r ? 'note'
  );

  -- 3) 重算受影響公會的中位數（同一交易內完成）
  v_archived := COALESCE(
    (SELECT rs.is_archived FROM public.raid_seasons rs WHERE rs.id = p_season_id),
    false
  );

  SELECT array_agg(DISTINCT s.g)
  INTO v_guild_ids
  FROM (
    SELECT CASE WHEN v_archived
                THEN COALESCE(NULLIF(r->>'season_guild', ''), m.guild_id)
                ELSE m.guild_id
           END AS g
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
    LEFT JOIN public.members m ON m.id = r->>'member_id'
  ) s
  WHERE s.g IS NOT NULL;

  IF v_guild_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT g.gid, public.refresh_guild_median(p_season_id, g.gid)
    FROM unnest(v_guild_ids) AS g(gid)
    ORDER BY g.gid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_raid_records_bulk(integer, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 3) 批次更新排序（characters / costumes）
--
--    白名單表名，避免動態 SQL 被注入。
--    p_rows 範例：[ { "id": "uuid", "order_num": 1 }, ... ]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_order(
  p_table text,
  p_rows  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'permission denied for update_order'
      USING ERRCODE = '42501';
  END IF;

  IF p_table NOT IN ('characters', 'costumes') THEN
    RAISE EXCEPTION 'update_order: unsupported table %', p_table
      USING ERRCODE = '22023';
  END IF;

  IF p_table = 'characters' THEN
    UPDATE public.characters AS c
    SET order_num = v.order_num
    FROM (
      SELECT (r->>'id') AS id, (r->>'order_num')::int AS order_num
      FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
    ) v
    WHERE c.id = v.id;
  ELSE
    UPDATE public.costumes AS c
    SET order_num = v.order_num
    FROM (
      SELECT (r->>'id') AS id, (r->>'order_num')::int AS order_num
      FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
    ) v
    WHERE c.id = v.id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order(text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 驗證：
--
--   -- a) 中位數
--   SELECT public.refresh_guild_median(1, '<guild id>');
--   SELECT member_score_median FROM public.guild_raid_records
--    WHERE season_id = 1 AND guild_id = '<guild id>';
--
--   -- b) 批次存檔（請用「有權限的帳號」登入前台後在 Console 執行）
--   await supabase.rpc('save_raid_records_bulk', {
--     p_season_id: 1,
--     p_rows: [{ member_id: '<member id>', score: 1234, season_note: 'test' }]
--   });
--   -- 預期回傳該成員所屬公會的新中位數
--
--   -- c) 排序
--   SELECT public.update_order('characters',
--     '[{"id":"<char id>","order_num":1}]'::jsonb);
-- ------------------------------------------------------------

