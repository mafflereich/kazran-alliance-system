# 權限管理方案（單一來源）

> ✅ **Phase 1 已上線（2026-11-02）**：頁面權限已改由 DB 的 `role_grants` 決定
> （等價遷移，parity 驗證 0 差異）；元件內的其他角色判斷仍是本文件描述的舊規則，Phase 2 才會替換。
> 新方案見 [plans/2026-11-02-permissions-v2.md](plans/2026-11-02-permissions-v2.md)。

本專案的權限分成「**身分**」、「**頁面**」、「**公會級能力**」、「**資料可見性**」四層。
所有頁面層級的規則都集中在 `src/shared/lib/access.ts`，元件請使用 `src/shared/lib/usePermissions.ts`，不要各自重寫角色判斷。

---

## 1. 身分來源（`profiles.user_role`）

| 角色 | 來源 | 說明 |
|---|---|---|
| `creator` | `admin_users`（後台帳號） | 最高權限，一律放行所有頁面 |
| `admin` | `admin_users`（後台帳號） | 管理員，一律放行所有頁面 |
| `manager` | Discord 身分組 `1251021144144740372` | 可進入後台勾選的頁面，但**不是公會幹部** |
| `member` | Discord 身分組 `1404976598507323393` | 一般成員 |
| `''` | 未對到身分組 | 幾乎所有頁面都會被擋下 |

另外有一個**與角色無關**的身分：

- **公會正/副會長（officer）**：`profiles.id` 綁定的成員中，`members.role = 'leader' | 'coleader'`。
- 由 `store/index.tsx` 的 `managedGuildIds` / `canManageGuild()` 計算，**不看 Discord manager 身分組**。
- 只在「公會管理」頁面視同 `manager`；其他頁面與能力仍依 `user_role`。

> 因此：`manager ≠ 公會幹部`、`公會幹部 ≠ 全域 manager`。這兩件事在 UI 與文件上都應分開描述。

---

## 2. 頁面權限（`access_control`）

- 目錄：`src/shared/lib/access.ts` → `PAGE_DEFINITIONS`
- 每筆包含：`id`、`group`、`scope`、`defaultRoles`、i18n 標籤／說明
- 生效值：`getEffectiveRoles(pageId, accessControl)`（後台有設定就用設定，沒有才用預設）
- 判斷：
  - `canUserAccessPage(pageId, role, accessControl)` — 依角色
  - `canUserAccessGuildPage(pageId, role, accessControl, canManageGuild)` — 公會頁規則

### 規則

1. `creator` / `admin` 一律放行（不受 `access_control` 限制）。
2. 其他角色：`access_control[pageId].roles` 是否包含自己的 `user_role`。
3. `scope = 'guild'` 的頁面（`guild_raid_manager`、`member_board`）：
   - 先看自己的角色有沒有被勾選；
   - 沒有的話，**公會正/副會長在 MANAGER 有勾選時視同 manager 放行**。
4. Header 與路由使用同一支函式；Header 額外要求 `access_control` 已載入，避免規則還沒回來就先放行。

### 預設值

| 分組 | 頁面 | pageId | 預設角色 | 範圍 |
|---|---|---|---|---|
| 聯盟功能 | 裝備表 `/guild/:id` | `costume_list` | member / manager / admin / creator | 全站 |
| 聯盟功能 | 服裝表 `/costumes` | `my_costumes` | member / manager / admin / creator | 全站 |
| 聯盟功能 | 申請信箱 `/mailbox` | `application_mailbox` | member / manager / admin / creator | 全站 |
| 聯盟功能 | 小遊戲 `/arcade` | `arcade` | manager / admin / creator | 全站 |
| 聯盟功能 | 小工具 `/toolbox` | `toolbox` | manager / admin / creator | 全站 |
| 公會管理 | 公會聯合戰管理 `/raid-manager`、`/raid` | `guild_raid_manager` | manager / admin / creator | **公會級** |
| 公會管理 | Team Assign Board `/team` | `member_board` | **admin / creator（固定）** | 全站 |
| 系統設定 | 後台 `/admin` | `admin_settings` | admin / creator | 全站 |
| （隱藏） | 聯盟戰記舊頁面 | `alliance_raid_record` | creator | 全站 |

---

## 3. 公會級能力（`canManageGuild`）

| 能力 | 判斷 | 說明 |
|---|---|---|
| 管理某公會 | `canManageGuild(guildId)` | `creator/admin` 全部；其他人需綁定該公會 leader/coleader |
| 檢視所有公會 | `isManager`（manager/admin/creator） | 只影響「看得到哪些公會」 |
| 處理申請信箱 | `canManageGuild()` | 有任一個公會幹部身分即可 |
| 請貝拉提醒 | `canManageGuild(guildId)` | 只限該公會幹部 |
| 聯合戰分數／賽季 | `canManageGuild()` + 頁面權限 | 幹部只會管理 `managedGuildIds` |
| 服裝表矩陣 | `isManager || canManageGuild()` | 幹部只看自己管理的公會 |
| Team Assign Board | `isGlobalAdmin`（admin/creator） | **固定 admin-only，不受 `access_control` 影響** |
| 後台管理 | `isGlobalAdmin`（admin/creator） | manager 需 `admin_settings` 勾選，且只看部分分頁 |

---

## 4. 資料可見性（裝備 / 服裝）

裝備與服裝共用同一組隱私設定（`members.equipment_visibility`）：

| 級別 | 可讀取者 |
|---|---|
| `guild_manager`（預設） | 該成員所屬公會的 leader/coleader、`creator` / `admin`、本人 |
| `all_manager` | `creator` / `admin` / `manager`、本人 |

- 讀取唯一管道：`get_member_equipment` RPC（DB 端遮罩）。
- 前端鏡像：`shared/lib/equipment.ts` 的 `canViewEquipmentForUI()` 等函式。
- `records`（服裝）與 `exclusive_weapons`（UR 專武）是**整包一起遮**，沒有單件服裝的隱私粒度。
- 服裝表儲存（`updateMember`）會同步更新 `costumes_updated_at`，與 `updateMemberCostumeLevel` / `updateMemberExclusiveWeapon` 一致。
- 服裝表矩陣對「被遮蔽」的成員顯示鎖頭，不再顯示成 `-`。

---

## 5. 後台管理介面

`/admin` → 系統設定 → **權限設定**（舊「存取控制」分頁已於 2026-11-02 移除）：

- **角色權限**：30 個權限 × member / manager / officer / admin 的矩陣，點擊即時寫入 `role_grants`；
  連續點擊會合併成一次 bulk upsert / delete（500ms 佇列），admin 欄固定鎖定。
- **例外授權**：使用者 × 權限 × allow/deny × 公會 × 到期時間 × 原因（`user_grants`）。
  使用者、權限、公會都是**可搜尋／可篩選的 modal 選擇器**（上千成員、上百帳號也不會卡），
  權限顯示中文名稱＋白話說明；公會用名稱挑選，不需要貼 guild id。
- **預覽視角**：`preview_access(auth_id)`，顯示該使用者實際的 roles / 公會 / 權限。
- **稽核**：`system_logs`（`source='permissions'`）最近 50 筆，含 before/after JSON。

> 舊的 `access_control` 表仍在資料庫中（回滾用），但已沒有任何 UI 會寫它；
> `role_grants` 是唯一生效來源。

---

## 6. 新增頁面的步驟

1. 在 `PAGE_DEFINITIONS` 新增一筆（`id`、`group`、`scope`、`defaultRoles`、i18n key）。
2. 在 `public/locales/{zh-TW,en}/admin.json` 的 `access.pages.<id>` 補 `label` / `desc`。
3. 在 `src/app/routes.tsx` 用 `<ProtectedRoute pageId="<id>">` 包住路由。
4. 若需要出現在 Header，於 `src/shared/ui/Header.tsx` 的 `navItems` 加一筆（同樣用 `pageId`）。
5. 若為公會級頁面，將 `scope` 設為 `'guild'`，並在頁面內用 `canManageGuild()` 限制可操作的公會。
6. 若頁面固定只有 `creator / admin` 能進（例如 Team Assign Board），加上 `adminOnly: true`；`access_control` 與公會幹部規則都會被忽略。

---

## 7. 前後端一致性（2026-11-02）

| 項目 | 前端 | 資料庫 |
|---|---|---|
| Team Assign Board | `member_board` → `adminOnly`（只有 creator / admin） | `members_insert/update/delete` 只允許 admin/creator（update 另允許本人）；`archive_members_bulk()` 內建 admin 檢查 |
| `/raid` 聯盟戰記 | manager 唯讀；公會幹部只顯示 `managedGuildIds` | `can_edit_raid_record()` 與 `save_raid_records_bulk()` 都只允許 admin/creator 或公會幹部 |
| 成員身分欄位 | UI 只開放裝備／服裝／備註 | trigger 禁止非 admin 修改 `name / guild_id / role / status / color`（本人也不行） |
| 申請信箱 | 公會幹部可改狀態 / 刪除 | 新增 `公會幹部可更新申請` / `公會幹部可刪除申請` policy |
| 賽季異動 | 只有 admin/creator 或幹部能看到操作 | `raid_seasons` 只允許 admin/creator 或幹部 |
| 封存歷史 | 後台「封存成員」分頁（manager 可讀） | manager 可讀、只有 admin/creator 可寫 |
| 裝備／服裝 | `canViewEquipmentForUI()` 鏡像 | `get_member_equipment()` 依 `can_view_equipment()` 遮蔽 |
| `/raid-manager`（2026-11-02 起） | `manager` 可進入，但**只顯示自己公會**（`access.memberGuildIds`）且表格 `readOnly` | 編輯需 `raid.score.write`（officer/admin）；寫入 policy 未變 |
| 成員簽到（2026-11-02 起） | `/raid-manager` 的簽到欄與重置按鈕用 `can('raid.checkin.write')`，與分數編輯分開 | `set_member_checkin_marks()` / `reset_guild_checkin_marks()` 內建 `has_permission('raid.checkin.write', guild_id)`；貝拉 `/api/checkinTags` 也用同一權限 |
| 裝備／服裝編輯（2026-11-02 決議） | 只有本人（`GuildDashboard.handleEditClick` / `MyCostumes`） | `members_equipment_guard`：非本人改裝備/服裝欄位 → `42501`；備份還原走 `restore_members_snapshot()` |

對應 migration：`supabase/migrations/20261102120000_member_board_admin_only_and_rls_alignment.sql`

---

## 8. 已知取捨

- `can_edit_raid_record()` 對「任一公會幹部」放行整季寫入（封存賽季會一次更新所有公會，逐公會限制會讓操作中斷）；前端已把幹部可見公會限制為 `managedGuildIds`。
- 申請信箱的 `SELECT` 仍對所有登入者開放（前端 `fetchApplyMails()` 也抓全表）；若要只讓幹部看，需再改 SELECT policy 與前端查詢。
- `manager` 在 `/raid` 可以看全部公會，但唯讀；這是刻意保留的檢視能力。
- Team Assign Board 的「讀取」在 DB 層無法只限 admin（`members` 的 SELECT 也供裝備表使用）；但頁面、寫入與封存 RPC 都已限制為 admin/creator。

---

## 9. 2026-11-02 決議

| # | 決定 | 實作 |
|---|---|---|
| D1 | `manager` 可以進 `/raid-manager`，但**只看自己公會**（成員綁定的 `my_guild_ids()`）且完全唯讀 | `get_my_access().memberGuildIds`；`GuildRaidManager` 用 `can('page.raid_manage.view')` 進入、`can('raid.score.write')` 編輯、`can('raid.checkin.write')` 簽到；`GuildRaidTable` 新增 `readOnly` |
| D2 | **任何人都不能編輯他人裝備／服裝**（含 admin） | `equipment.write.managed` 已從權限目錄移除；`members_equipment_guard` 擋下非本人寫入；備份還原改走 `restore_members_snapshot()` |
| 額外 | `guilds` / `costumes` 寫入收回 admin-only | policy 改用 `has_permission('admin.guild.manage')` / `admin.costume.manage` |
| 後台 | `/admin → 權限設定`：矩陣、例外授權、預覽、稽核 | `PermissionManager` + `preview_access()` + `role_grants`/`user_grants` 稽核 trigger |
