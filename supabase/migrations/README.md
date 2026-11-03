# Supabase Migrations

這個資料夾是**這次效能修正開始**才建立的。先前所有 schema 變更都是手動貼在
Supabase Dashboard → SQL Editor（散落在 `docs/sql/*.sql`），因此無法從版控確認
線上到底是哪一版 —— 這也是「明明修過、過一陣子又壞」的主因之一。

## 內容

| 檔案 | 內容 |
|------|------|
| `20261029090000_perf_indexes.sql` | 熱門表索引（members / 戰記 / profiles / system_logs…），並補 `pg_trgm` |
| `20261029090100_rls_single_eval.sql` | `current_profile()` 走索引 + RLS policy 改成 `(SELECT fn())` 每個 statement 只求值一次；補回 `can_edit_raid_record()`；重建戰記表 policy（正副會長可寫） |
| `20261029090200_save_raid_records_bulk.sql` | `refresh_guild_median()`、`save_raid_records_bulk()`、`update_order()` |
| `20261029091000_members_guild_scoped_rls.sql` | 成員資料可見範圍改為「自己公會 + 本人 + 管理階層」；`my_guild_ids()`；重建 `member_notes` / `ghost_records` policy |
| `20261029092000_get_member_equipment_guild_scope.sql` | `get_member_equipment` / `..._showcase` 補上公會範圍（避免用 member id 撈別公會裝備） |
| `20261029093000_profile_members.sql` | **身分綁定正規化**：`profile_members` 關聯表 + 回填 + `profiles.id` 同步 trigger；改寫 `owns_member` / `my_guild_ids` / `can_edit_raid_record` / `sync_profile_guild_for_member` 為索引查詢 |
| `20261029094000_current_profile_fast_path.sql` | `current_profile()` 改為「auth_id 快路徑 + 老資料才走慢路徑」 |
| `20261029095000_identity_write_path_and_policy_speedup.sql` | `my_member_ids()`；members / member_notes policy 由「逐列 `owns_member()`」改為一次性 hashed SubPlan；`profiles.id` 快取清理（搶奪）；移除 `profiles_id_key UNIQUE(id)`（23505 登入問題） |
| `20261029096000_member_claim.sql` | **身分認領**：`profiles` 本人可新增（`id` 必須 NULL、`user_role` 只能 member）；`member_claim_requests`；`search_claimable_members` / `request_member_claim` / `my_pending_claim` / `approve_member_claim` / `reject_member_claim` |
| `20261029097000_pending_claims_rpc.sql` | `list_pending_claims()`：待審清單一次回傳成員 / 公會 / 角色 / 申請者 Discord 資料 / 申請時間（管理者看全部、幹部只看自己公會） |
| `20261029098000_multi_account_claim.sql` | **多重綁定**：移除「每人只能一筆待審」限制（上限 5 筆）；`my_claims()` / `my_bound_members()`；核准時支援「已綁在自己名下」不重複寫入 |
| `20261102090000_seed_bd2db_catalog.sql` | **BD2DB 圖鑑補齊（僅 5 星）**：新增缺少的 3 位 5 星角色與 5 件服裝（可重複執行，不覆蓋既有資料） |
| `20261102100000_equipment_guild_min_privacy_and_resource_privacy.sql` | **裝備表隱私 v4**：最低可見度改為「本公會正副會長」（舊 `public` 全部升級為 `guild_manager`）；新增 `members.resource_visibility` 與 `mask_equipment_resources()`，重要資源可逐項設定隱私；`mask_equipment` 補齊分拆後的單件 key |
| `20261102110000_equipment_guild_leader_always_visible.sql` | **裝備表隱私 v5（設計初衷）**：本公會正／副會長與 creator/admin 一律可看到完整裝備與全部重要資源；部位／資源覆蓋不能排除他們；`admin` 級別併入 `guild_manager`，可選級別只剩 `guild_manager` / `all_manager` |
| `20261102130000_permission_catalog_v2_foundation.sql` | **權限 v2 Phase 1（零行為變更）**：新增 `permissions` / `role_grants` / `user_grants` / `permission_meta`；`my_roles()` / `has_permission()` / `my_permissions()` / `get_my_access()`；把 `access_control` 等價搬成 `role_grants`（parity 驗證 0 差異）；`set_page_roles()` 供舊「存取控制」UI 雙寫 |
| `20261102120000_member_board_admin_only_and_rls_alignment.sql` | **Team Assign Board 僅 admin/creator + 前後端對齊**：`members` 寫入限制為 admin/creator 或本人；`archive_members_bulk()` 加 admin 檢查；`save_raid_records_bulk()` / `can_edit_raid_record()` 移除 manager；trigger 禁止非 admin 修改成員身分欄位；賽季／封存歷史／申請信箱 policy 對齊 |

十五支都可**重複執行**，且不刪改任何資料。

## 套用方式（擇一）

### A. SQL Editor（最單純，與以往做法相同）

依檔名順序把三個檔案的內容貼到 SQL Editor 執行即可。

### B. Supabase CLI（推薦，之後就能用 `db push` 管理）

因為線上 DB 已經有這些物件、但 migration 歷史是空的，第一次要先讓 CLI 知道
「這些版本已經套用過了」：

```bash
npm run db:link                     # 已連結過可跳過
supabase migration list             # 看 local / remote 差異

# 若只想把 SQL 套到線上
supabase db push

# 若 CLI 回報 migration history 不一致，先把三個版本標記為已套用：
supabase migration repair --status applied 20261029090000
supabase migration repair --status applied 20261029090100
supabase migration repair --status applied 20261029090200
```

> ⚠️ 千萬不要在**尚未** `migration repair` 的情況下對空歷史的線上資料庫執行
> `supabase db reset` —— 那會清空資料庫。

## 之後的規則

1. Schema 變更一律新增 `supabase/migrations/<timestamp>_<name>.sql`，不再手貼。
2. 開 PR 時 SQL 也會進 diff，review 就看得到。
3. `docs/sql/*.sql` 保留作為歷史紀錄與說明文件，但**不再作為套用來源**。
