-- ============================================================
-- Team Assign Board 僅限 creator / admin + 前後端權限對齊
-- 2026-11-02
--
-- 前端規則：
--   * member_board：adminOnly（忽略 access_control 與公會幹部規則）
--   * /raid：manager 唯讀；公會幹部只顯示自己管理的公會
--   * 申請信箱：公會幹部可處理（前端 isPrivileged）
--
-- 本 migration 讓 DB 與上述一致：
--   1) 建立 is_global_admin() / is_guild_officer() / my_managed_guild_ids()
--   2) members：寫入只允許 admin/creator 或本人（移除 manager/幹部）
--   3) member_notes：寫入只允許 admin/creator、本人、或自己公會的幹部（移除 manager）
--   4) archive_members_bulk：加上 admin/creator 檢查
--   5) 封存歷史：manager 可讀、只有 admin/creator 可寫
--   6) 賽季：只有 admin/creator 或公會幹部可異動
--   7) can_edit_raid_record()：移除 manager（manager 在 /raid 為唯讀）
--   8) apply_mail：補上公會幹部 UPDATE / DELETE（前端本來就允許）
--
-- 可重複執行。建議在交易中執行。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1：身分 helper
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.current_profile() cp
    WHERE cp.user_role IN ('creator', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_global_admin() TO authenticated;

-- 目前登入者是否為任一公會的正/副會長（支援 profile_members 與舊版逗號清單）
CREATE OR REPLACE FUNCTION public.is_guild_officer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.current_profile() cp
    JOIN public.profile_members pm ON pm.profile_id = cp.discord_id
    JOIN public.members m ON m.id = pm.member_id
    WHERE m.role IN ('leader', 'coleader')
      AND m.guild_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.current_profile() cp
    CROSS JOIN LATERAL unnest(string_to_array(COALESCE(cp.id, ''), ',')) AS b(mid)
    JOIN public.members m ON m.id = btrim(b.mid)
    WHERE m.role IN ('leader', 'coleader')
      AND m.guild_id IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_guild_officer() TO authenticated;

-- 目前登入者可管理的公會（只認 leader / coleader）
CREATE OR REPLACE FUNCTION public.my_managed_guild_ids()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m.guild_id
  FROM public.current_profile() cp
  JOIN public.profile_members pm ON pm.profile_id = cp.discord_id
  JOIN public.members m ON m.id = pm.member_id
  WHERE m.role IN ('leader', 'coleader')
    AND m.guild_id IS NOT NULL
  UNION
  SELECT DISTINCT m.guild_id
  FROM public.current_profile() cp
  CROSS JOIN LATERAL unnest(string_to_array(COALESCE(cp.id, ''), ',')) AS b(mid)
  JOIN public.members m ON m.id = btrim(b.mid)
  WHERE m.role IN ('leader', 'coleader')
    AND m.guild_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.my_managed_guild_ids() TO authenticated;

-- ------------------------------------------------------------
-- STEP 2：members 寫入（Team Assign Board 的底層）
--   INSERT / DELETE：只有 creator / admin
--   UPDATE：creator / admin 或本人（一般成員只能改自己那一列）
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "members_insert" ON public.members;
CREATE POLICY "members_insert"
  ON public.members
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_global_admin()));

DROP POLICY IF EXISTS "members_update" ON public.members;
CREATE POLICY "members_update"
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_global_admin())
    OR id IN (SELECT public.my_member_ids())
  )
  WITH CHECK (
    (SELECT public.is_global_admin())
    OR id IN (SELECT public.my_member_ids())
  );

DROP POLICY IF EXISTS "members_delete" ON public.members;
CREATE POLICY "members_delete"
  ON public.members
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_global_admin()));

-- ------------------------------------------------------------
-- STEP 3：member_notes
--   寫入：admin/creator、本人、自己公會的正副會長
--   讀取：維持原狀（manager 仍可讀）
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "member_notes_insert" ON public.member_notes;
CREATE POLICY "member_notes_insert"
  ON public.member_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.is_global_admin())
    OR member_id IN (SELECT public.my_member_ids())
    OR (
      (SELECT public.is_guild_officer())
      AND EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.id = member_notes.member_id
          AND m.guild_id IN (SELECT public.my_managed_guild_ids())
      )
    )
  );

DROP POLICY IF EXISTS "member_notes_update" ON public.member_notes;
CREATE POLICY "member_notes_update"
  ON public.member_notes
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.is_global_admin())
    OR member_id IN (SELECT public.my_member_ids())
    OR (
      (SELECT public.is_guild_officer())
      AND EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.id = member_notes.member_id
          AND m.guild_id IN (SELECT public.my_managed_guild_ids())
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_global_admin())
    OR member_id IN (SELECT public.my_member_ids())
    OR (
      (SELECT public.is_guild_officer())
      AND EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.id = member_notes.member_id
          AND m.guild_id IN (SELECT public.my_managed_guild_ids())
      )
    )
  );

DROP POLICY IF EXISTS "member_notes_delete" ON public.member_notes;
CREATE POLICY "member_notes_delete"
  ON public.member_notes
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.is_global_admin())
    OR member_id IN (SELECT public.my_member_ids())
  );

-- ------------------------------------------------------------
-- STEP 4：封存 RPC（Team Assign Board 使用）
--   函式本體是 SECURITY INVOKER；在這裡先擋掉非 admin/creator，
--   再讓原本的 members / member_notes / archive_history 寫入照常執行。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_members_bulk(payload json)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
declare
    item record;
begin
    IF NOT public.is_global_admin() THEN
        RAISE EXCEPTION 'permission denied: member board is admin-only';
    END IF;

    for item in
        select *
        from json_populate_recordset(null::record, payload)
            as (member_id text, from_guild_id text, reason text)
    loop
        -- 1. 新增歷史紀錄
        insert into public.members_archive_history (member_id, from_guild_id, archive_reason)
        values (item.member_id, item.from_guild_id, item.reason);

        -- 2. 更新成員狀態
        update public.members
        set status = 'archived', guild_id = null
        where id = item.member_id;

        -- 3. 更新備註
        update public.member_notes
        set archive_remark = item.reason
        where member_id = item.member_id;
    end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.archive_members_bulk(json) TO authenticated;


-- ------------------------------------------------------------
-- STEP 5：封存歷史
--   manager 仍可讀（後台「封存成員」分頁），但只有 admin/creator 可寫
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "管理員可完整操作封存歷史" ON public.members_archive_history;
DROP POLICY IF EXISTS "封存歷史可讀取" ON public.members_archive_history;
DROP POLICY IF EXISTS "封存歷史僅管理員可寫" ON public.members_archive_history;
CREATE POLICY "封存歷史可讀取"
  ON public.members_archive_history
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.get_admin_role()) IN ('creator', 'admin', 'manager')
  );

CREATE POLICY "封存歷史僅管理員可寫"
  ON public.members_archive_history
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_global_admin()))
  WITH CHECK ((SELECT public.is_global_admin()));

-- ------------------------------------------------------------
-- STEP 6：賽季
--   原本 manager 可異動；改為 admin/creator 或公會幹部
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "管理員可異動賽季" ON public.raid_seasons;
DROP POLICY IF EXISTS "賽季僅管理員或幹部可異動" ON public.raid_seasons;
CREATE POLICY "賽季僅管理員或幹部可異動"
  ON public.raid_seasons
  FOR ALL
  TO authenticated
  USING (
    (SELECT public.is_global_admin())
    OR (SELECT public.is_guild_officer())
  )
  WITH CHECK (
    (SELECT public.is_global_admin())
    OR (SELECT public.is_guild_officer())
  );

-- ------------------------------------------------------------
-- STEP 7：戰記寫入
--   manager 在 /raid 是唯讀；只有 admin/creator 或公會幹部可寫。
--   （幹部的逐公會限制仍由前端過濾；DB 目前允許任一幹部寫整季，
--     這是為了讓「封存賽季」一次更新所有公會時不會被 RLS 中斷。）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_raid_record()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_global_admin() OR public.is_guild_officer();
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_raid_record() TO authenticated;

-- ------------------------------------------------------------
-- STEP 8：申請信箱
--   前端讓公會幹部更新狀態 / 刪除；DB 原本只有 manager 以上，
--   這裡補上幹部的 UPDATE / DELETE policy。
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "公會幹部可更新申請" ON public.apply_mail;
CREATE POLICY "公會幹部可更新申請"
  ON public.apply_mail
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_guild_officer()))
  WITH CHECK ((SELECT public.is_guild_officer()));

DROP POLICY IF EXISTS "公會幹部可刪除申請" ON public.apply_mail;
CREATE POLICY "公會幹部可刪除申請"
  ON public.apply_mail
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_guild_officer()));

-- ------------------------------------------------------------
-- 完成
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- STEP 9：保護 members 的身分欄位
--   本人可以更新自己的裝備 / 服裝 / 備註，但不能改 name / guild_id /
--   role / status / color（避免把自己改成 leader 取得幹部權限）。
--   service role / SQL editor（沒有 JWT）不受限。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_member_identity_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_global_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.guild_id IS DISTINCT FROM OLD.guild_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.color IS DISTINCT FROM OLD.color
  THEN
    RAISE EXCEPTION 'permission denied: only creator/admin can change member identity fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_member_identity_columns ON public.members;
CREATE TRIGGER protect_member_identity_columns
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_member_identity_columns();


-- ------------------------------------------------------------
-- STEP 10：戰記批次儲存
--   原本用 is_manager()（含 manager）；改為與 can_edit_raid_record 一致。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_raid_records_bulk(p_season_id integer, p_rows jsonb)
RETURNS TABLE(guild_id text, member_score_median integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_guild_ids text[];
  v_archived boolean;
BEGIN
  IF NOT (public.is_global_admin() OR public.is_guild_officer()) THEN
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
$function$;

GRANT EXECUTE ON FUNCTION public.save_raid_records_bulk(integer, jsonb) TO authenticated;

