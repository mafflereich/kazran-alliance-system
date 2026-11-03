# 權限系統 v2：單一能力目錄（Single Capability Catalog）

> 狀態：**Phase 0–1 已實作並套用（零行為變更）**　｜　日期：2026-11-02　｜　影響範圍：全站
> Phase 2–4 尚未開始；進度與驗證結果見 §7.1。
> `docs/permissions.md` 描述的是「Phase 2 前的元件判斷」；頁面權限已改由 DB `role_grants` 決定。

---

## 0. TL;DR

把「角色 × 頁面」的勾選表，換成「**角色 × 權限**」的授權表，並且讓 **DB 成為唯一計算權限的地方**：

| 現在 | 新方案 |
|---|---|
| 4 個角色 + 隱含階級 + 3 種特例分支 | 4 個角色標籤 + 一張 `role_grants` |
| 權限單位是「頁面」 | 權限單位是「能力」（頁面也是能力：`page.raid.view`） |
| 前端算一次、SQL 再寫一次 | 只有 `public.has_permission()` 算，前端只讀結果 |
| `canManageGuild()` / `isManager` / `isGlobalAdmin` / `userRole === ...` 散落各頁 | 全部換成 `can('raid.score.write', guildId)` |
| 公會幹部靠「MANAGER 有沒有勾」模擬 | `officer` 的授權天生綁定自己管理的公會（scope = managed） |

五條新規則：

1. **角色是標籤，不是階級**：`member` / `manager` / `officer` / `admin` 可同時擁有多個。
2. **權限是平面字串**：`<domain>.<action>` 或 `<domain>.<resource>.<action>`，例如 `raid.score.write`。
3. **授權只有一張表**：`role_grants(role, permission, scope)`，後台只改這張表。
4. **只有一個判斷函式**：DB 的 `has_permission(permission, guild_id)`；RLS 與前端都用它。
5. **`admin` 是唯一硬規則**：在 resolver 第一行放行，其他一律看 `role_grants`。

### 0.1 更正紀錄（文件 v1.1）

初版 §9 D2 寫「幹部改裝備：UI 可開、DB 會擋」，**這是錯的，方向相反**。實際是：

- UI：`GuildDashboard.tsx:74-77`
  ```ts
  const canEdit = isCurrentUser;
  if (!canEdit) return;
  ```
  → 連 admin 都打不開別人的裝備編輯。
- UI：`MyCostumes.tsx:665-670` 的服裝編輯器只渲染 `myMembers`（自己綁定的成員）；
  矩陣 `CostumeMatrixTable` 是唯讀。
- DB：`members_update` 允許 admin 改任何人（`20261102120000_...sql:108`）。

所以是「**DB 允許 admin、UI 沒有入口**」，不是「UI 假裝可以」。
D2 已改寫成「要不要補入口」，`equipment.write.managed` 的預設值維持 admin-only（與現況 UI 一致）。

同一次重審也改了 §1.4 / §1.6 / §1.7，並新增 §1.9：**沒有檔案:行號依據的推論，一律標
`[待 db pull]`，不再當成事實**。

第二個錯誤（同一次複查抓到）：初版說 `profiles.user_guilds` 用在
「`Login` / `GuildDashboard` / `Header` / `GuildRaidManager` / `sort.ts`」。
實際上 `Header.tsx:25` 只有 destructure `userGuildRoles`，**完全沒有使用**
（`grep 'userGuildRoles\.'` 在 Header 零命中）。已在 §1.1 / §2.7 修正。

為了不再靠「我說我讀過」，已把文件裡 25 條可機械驗證的斷言寫成
`scripts/audit-permission-claims.mjs`：

```bash
npm run audit:permissions     # 25/25 passed；任何一條 FAIL 就是文件寫錯
```

腳本只驗證程式結構（例如「裝備編輯只允許本人」「SQL 沒有任何 policy 引用
access_control」「Logger 在 production 丟棄 info」），**不驗證設計好壞**——
§2–§7 仍是設計主張，可以也應該被反對。

---

## 1. 為什麼現在很亂（診斷）

### 1.1 四套「身分」來源同時存在

| 來源 | 值域 | 實際用途 | 問題 |
|---|---|---|---|
| `profiles.user_role` | creator / admin / manager / member | 前端 `userRole`、DB `current_profile()` | 與 `admin_users` 表無關，但 i18n 文案寫「後台帳號（admin_users）」 |
| `admin_users` 表 | creator / admin | 由 **Edge Function** 讀取（`sync-discord-roles.md:171-182`）；函式原始碼不在 repo，只有文件 | 角色的真正來源不在可執行版控內；`manager` / `member` 是寫死的 Discord role ID（`sync-discord-roles.md:164-168`） |
| Discord 身分組 `profiles.user_guilds` | 公會**名稱**字串（逗號分隔） | `Login.tsx:65` 能否選公會、`GuildDashboard.tsx:155` 能否檢視、`GuildRaidManager.tsx:34` 選公會、`sort.ts:112` 排序（`Header.tsx:25` 只有 destructure，沒用到） | 用「名稱字串」比對決定可見範圍，與 `managedGuildIds`（成員綁定）並存，兩者可能不一致 |
| `members.role` = leader/coleader | 公會內職位 | `managedGuildIds`、`is_guild_officer()` | 前端與 DB 各自 join 一次 |

結果：同一個人可能「是 manager 但不是幹部」「是幹部但沒有 manager 身分組」，
文件（`docs/permissions.md` §1）也明確承認這件事，卻沒有在資料模型上分開。

### 1.2 頁面權限只有「角色陣列」，沒有「動作」

`access_control.roles` 是 `('member'|'manager'|'admin'|'creator')[]`。
一頁只能表達「誰能進來」，不能表達「進來後能做什麼」。於是程式長出這些替代品：

- `usePermissions().canProcessApplications = canManageGuild()`（`src/shared/lib/usePermissions.ts:62`）
- `canManageRaid = canManageGuild()`、`canManageMemberBoard = isGlobalAdmin`
- `AdminDashboard` 直接用 `isGlobalAdmin` 決定顯示哪些分頁（`src/features/admin/pages/AdminDashboard.tsx:43-70`）
- `Arcade.tsx:16` 用 `userRole === 'creator'` 決定要不要顯示極速精煉

這些「能力」都是臨時算出來的，彼此沒有共同的命名或來源。

### 1.3 三個互相重疊的特例分支

`src/shared/lib/access.ts` 的判斷其實是四條規則疊起來：

```ts
if (definition?.adminOnly) return isGlobalAdminRole(userRole);      // 特例 1
if (isGlobalAdminRole(userRole)) return true;                        // 特例 2
if (roles.includes(userRole)) return true;                           // 一般規則
return canManageGuild() && roles.includes('manager');                // 特例 3
```

- 特例 1：`member_board` 的 `adminOnly`
- 特例 2：creator / admin 無條件放行（避免管理員把自己鎖在門外）
- 特例 3：公會幹部「視同 manager，但要看後台有沒有勾 MANAGER」

特例 3 的註解自己說明它是在補破洞（`access.ts:171-176`）：因為 `canManageGuild()`
原本會無條件放行，只好再加一個「MANAGER 有沒有勾」的條件把它擋回來。
這是模型錯了才需要的補丁——新方案用 scope 直接表達，補丁消失。

另外 `canUserAccessPage` 與 `canUserAccessGuildPage` 兩支函式名字看起來是「一般 / 公會」，
但 `usePermissions` 對**所有**頁面都呼叫後者（`usePermissions.ts:42`）；前者只剩下
`canUserAccessGuildPage` 內部的 fallback 呼叫（`access.ts:195`），沒有任何外部使用者。

### 1.4 前後端各寫一次，而且已經開始分歧

每列都標了驗證依據；`[待 db pull]` = repo 內看不到對應 policy，不能斷言。

| 行為 | UI（前端） | DB（RLS / RPC） | 方向 |
|---|---|---|---|
| 編輯成員裝備 | **只有本人**：`GuildDashboard.tsx:74-77`（`canEdit = isCurrentUser`） | `members_update`：admin 或本人（`20261102120000_...sql:108`） | **UI 比 DB 嚴**：admin 沒有入口。決議 D2 = 任何人都不改他人裝備，DB 這條 Phase 3 再收緊 |
| 編輯服裝 | **只有本人**：`MyCostumes.tsx:665-670` 只渲染 `myMembers`；`CostumeMatrixTable` 唯讀 | 同上 | **UI 比 DB 嚴** |
| 寫戰記分數 | 該公會幹部 / admin：`GuildRaidManager.tsx:42`（`allowedGuildIds`）、`:342`（`!canManage` 直接擋頁） | `can_edit_raid_record()` = admin 或**任一**幹部（`:280`）；`save_raid_records_bulk` 也只檢查「有任一公會幹部身分」，**沒有比對 guild_id**（`20261029090200_...sql:101-113`） | **DB 比 UI 寬**：A 公會幹部可寫 B 公會 |
| 賽季管理 | 只有 `canManage` 才看得到面板（`GuildRaidManager.tsx:342, 372`） | `raid_seasons`：admin 或任一幹部（`:261`） | **DB 比 UI 寬** |
| 處理申請信箱 | `isPrivileged = canManageGuild()`（`ApplicationMailbox.tsx:57`） | 幹部可 UPDATE/DELETE（`:301`、`:309`）；SELECT = `USING (true)`（Phase 0 查證） | **DB 比 UI 寬**：任何登入者可讀全部申請（`fetchApplyMails` 無過濾，`store/index.tsx:1761`） |
| 讀裝備資料 | `equipment.ts:113-128` 的 TS 鏡像 | `mask_category_can()` + `get_member_equipment` | 同一條規則寫兩次（兩邊目前都是 2 級） |
| 後台分頁 | `isGlobalAdmin`（`AdminDashboard.tsx:43-70`） | `guilds` / `costumes`：讀取 public、寫入 `get_admin_role() in (creator,admin,manager)`（Phase 0 查證） | manager 在 DB 可寫，但 UI 要先進得了 `/admin`；分頁可見性 ≠ 資料權限 |
| `/raid-manager` 頁面本身 | 路由允許 manager（`access.ts:79`），頁面卻在 `!canManage` 時直接回「無權限」（`GuildRaidManager.tsx:342`） | — | **頁面權限與頁面能力不一致**（manager 進得去但看到死頁） |

最後一列很關鍵：它證明「能不能進頁面」和「能不能做事」是兩件事，
把兩者塞進同一張 `access_control` 表就是模型的錯。

`docs/permissions.md` §7「已知設計取捨」等於一張技術債清單。

### 1.5 `access_control` 只在瀏覽器生效，卻被當成安全邊界

`access_control` 由前端載入、前端判斷；DB 沒有任何 RLS policy 參考它
（已驗證：`grep access_control supabase/migrations/*.sql docs/sql/*.sql` 在 Phase 1 migration
之前只命中一處**註解**；Phase 1 的 migration 會讀它一次做等價搬遷，但沒有 policy 依賴它）。
也就是說「這個頁面只開放給 admin」只是**選單禮貌**：任何人改 JS 或直接打 PostgREST
仍然拿得到 RLS 允許的資料。這不是錯，但 UI 的說法（「勾選後才能進入該頁面」）
會讓人誤以為它是安全機制。

### 1.6 文件、翻譯、程式三方不一致（實例）

- `public/locales/zh-TW/admin.json:218` 寫「creator / admin：後台帳號（admin_users）」——
  這句話**是真的**，但驗證它的代價很高：讀 `admin_users` 的邏輯在 Edge Function 裡，
  repo 只有一份文件快照（`sync-discord-roles.md:171-182`），沒有 `supabase/functions/` 原始碼。
  同一份文件也顯示 `manager` / `member` 是**寫死的 Discord role ID**（`:164-168`），
  公會清單是從角色名稱 regex `/公會成員.+棕色2/` 取（`:154-156`）。
  → 身分規則有一部分只存在於文件與部署環境，這是最難 audit 的部分。
- `docs/permissions.md` §2「預設值」把 `member_board` 寫成預設「manager / admin / creator」、
  且是 **公會級**；程式是 `defaultRoles: ['admin','creator']` + `adminOnly`（`access.ts:84-91`）。
- `docs/permissions.md` §3 寫「manager 需 `admin_settings` 勾選，且只看部分分頁」，
  但 `AdminDashboard` 對 manager 只顯示 guilds / costumes / archived，其餘分頁整塊不渲染。
- `20261102120000_...sql:246` 呼叫 `public.get_admin_role()`，這支函式**不在 repo 的任何
  migration 裡**（只存在於遠端 DB），是典型的 schema drift。
- `Login.tsx:57-59` 的註解說「來源是 `profiles.user_guilds`……與 DB 端 RLS
  （`my_guild_ids`）使用同一套歸屬關係」，但 `my_guild_ids()` 讀的是
  `members.guild_id`（`20261029091000_...sql:41-45`），不是 Discord 身分組名稱。
  公會改名或身分組同步失敗時，兩邊就會不一致。

### 1.7 稽核與快取

- 權限變更用的是 `Logger.info(...)`（`store/index.tsx:1025`；`RoleSetting.tsx` 的 `handleSaveRole` 也一樣），
  而 `Logger` 在 production 會**直接丟棄 info**（`logger.ts:108`：
  `if (!import.meta.env.DEV && level === 'info') return;`）
  → 正式環境的權限變更**完全沒有紀錄**。
- 即使寫進去了，也只有「page + roles」，沒有 before/after，也沒有「這個人為什麼有這個權限」。
- 管理員無法「用某個人的視角看一次」再存檔。
- `accessControl` 只在 `fetchInitialData` 載入一次，別人改完要重新整理才生效。

### 1.8 元件各自重寫判斷

```
EquipmentTable.tsx:88   isManagerRole(userRole) || viewerManagedGuildIds.size > 0
MyCostumes.tsx:33-34    isGlobalManager / canUseMatrix
MyCostumes.tsx:186      isAdminRole(userRole)
GuildDashboard.tsx:155  canSeeAllGuilds || userGuildRoles.some(名稱比對)
sort.ts:112             用 profiles.user_guilds 的名稱清單過濾公會
GuildRaidManager.tsx:31 isGlobalAdminRole(userRole) + canManageGuild() + userGuildRoles
AllianceRaidRecord.tsx:43-46  canManageGuild() + isManagerOrAboveRole()
ApplicationMailbox.tsx:57     canManageGuild()
```

每一個都是「角色 → 能力」的手寫推導，只要規則改一次就要改六個地方。

### 1.9 Phase 0 查證結果（原本的 `[待 db pull]` 已關閉）

用專案既有的 Management API 通道（`node scripts/apply-sql.mjs --sql ...`）做唯讀查詢：

| 項目 | 實際值 | 影響 |
|---|---|---|
| `access_control` 欄位 | `page`, `roles text[]`, `created_at`, `updated_at` | 確認只能表達「頁面 → 角色」（支持 P1） |
| `apply_mail` SELECT | `USING (true)`（policy 名「登入者可讀取」） | **任何登入者可讀全部申請**：DB 比 UI 寬 |
| `apply_mail` 寫入 | 幹部 UPDATE / DELETE，加上 `get_admin_role() in (creator,admin,manager)` | 與 UI 一致 |
| `guilds` / `costumes` | 讀取 `public`；寫入 `get_admin_role() in (creator,admin,manager)` | manager 在 DB 可寫 |
| `get_admin_role()` | `select user_role from profiles where auth_id = auth.uid()` | 直接用 `auth_id` 查，與 `current_profile()`（含 legacy 路徑）不同 → 同一人可能「這裡是 admin、那裡不是」 |
| `is_manager()` / `is_global_admin()` / `is_guild_officer()` | 都是 `current_profile()` 的包裝 | 可被 `has_permission()` 取代 |

仍無法從 repo 驗證：`sync-discord-roles` 的**部署版本**是否與 `sync-discord-roles.md` 一致。

---
## 2. 新模型

### 2.1 三個名詞就夠了

| 名詞 | 回答的問題 | 存在哪裡 |
|---|---|---|
| **Principal**（你是誰） | 我身上有哪些角色標籤？ | `my_roles()` → `text[]` |
| **Permission**（能做什麼） | 這個動作需要什麼能力？ | `src/shared/lib/permissions.ts` + DB `permissions` 表 |
| **Scope**（在哪裡） | 只在自己管理的公會，還是全站？ | `role_grants.scope` = `global` \| `managed` |

一次檢查 = `has_permission('raid.score.write', 'guild-123')`。

### 2.2 角色是標籤，不是階級

| 角色 | 來源 | 語意 |
|---|---|---|
| `member` | 任何有 profile 的登入者（自動） | 一般成員 |
| `manager` | `profiles.user_role = 'manager'`（Discord 身分組同步） | 全域工作人員，**不是**公會幹部 |
| `officer` | 綁定的成員 `members.role ∈ (leader, coleader)`，可多個公會 | 公會幹部，**只有自己管理的公會** |
| `admin` | `profiles.user_role ∈ (creator, admin)` | 全域管理員，唯一不受授權表限制的角色 |

`creator` 保留在 DB 值域裡（向後相容），但 resolver 一律視為 `admin`；
後台權限表只顯示一個 ADMIN 欄。只有 `creator` 能新增/移除 admin（決策 D4）。

**關鍵差異**：舊模型 `manager` 是「比 member 高一階」，所以每個地方都要問
「manager 以上嗎？」。新模型 `manager` 只是一個標籤，他能做什麼完全由授權表決定，
`officer` 也一樣（只是他的授權天生帶公會範圍）。

### 2.3 權限命名規則

```
<domain>.<action>            member.archive / mailbox.process
<domain>.<resource>.<action> raid.score.write
<domain>.<resource>.<scope>.<action>   member.note.write.managed
```

- 全小寫、底線分隔，2–4 段；`.self` / `.managed` 是**範圍後綴**，不是物件。
- `page.*` — 只影響導覽 / 路由，**不是**資料安全邊界。
- 其他 domain 一律代表「動作」，必須在 RLS 或 RPC 裡真的被檢查。
- `needsGuild: true` 的權限，資料層檢查**必須**帶 `guild_id`（見 §2.4 規則 4）。

好處：可以 grep。`grep "raid.score.write"` 就能找到所有相關的路由、按鈕、RLS，
不用再猜 `canManageRaid` 到底等於什麼。

### 2.4 解析規則（只有五條，寫在 DB 一處）

```sql
has_permission(p_permission, p_guild_id := NULL)
```

1. 有 `admin` 角色 → `true`（唯一硬規則）。
2. 找出 `role_grants` 中 `permission = p_permission` 且 role 在自己身上的列。
3. 逐列判斷 scope：
   - `scope = 'global'` → 成立。
   - `scope = 'managed'` → 需要 `p_guild_id ∈ my_managed_guild_ids()`。
   - 目錄裡 officer 的公會級權限一律標成 `managed`；只有「所有成員本來就看得到」
     的頁面（例如 `page.equipment.view`）才給 officer `global`，這樣即使把 member
     從該頁移除，幹部仍能進入。
4. `p_guild_id IS NULL` 代表「**在任何地方**都行嗎？」——只給選單 / 路由用。
   資料層（RLS、RPC）**必須**傳實際的 `guild_id`，否則擋不住跨公會操作。
5. `user_grants`（Phase 4）：`deny` 優先於 `allow`，且支援 `expires_at`。

這個「無 guildId = 任何地方」的語意是刻意的：
Header 只需要知道「這個連結要不要顯示」，不需要知道是哪個公會。

### 2.5 裝備 / 服裝可見性怎麼掛進來

目前 `members.equipment_visibility` 有兩個有效級別（`'guild_manager'` / `'all_manager'`），
DB 用 `mask_category_can(visibility, owns_member, ok_admin, ok_manager, ok_guild_manager)`
一行行遮罩。新方案把它變成「可見性級別 → 需要哪個權限」的對照：

| `equipment_visibility` | 需要的權限（帶成員的 `guild_id`） |
|---|---|
| `guild_manager`（預設） | `equipment.read.managed`（officer 只在自己公會）或 admin |
| `all_manager` | `equipment.read.staff`（manager / admin） |
| 本人 | 不需要權限（`my_member_ids()`） |

於是 `mask_category_can` 的五個 boolean 參數縮成一個 `text[]`（viewer 的權限清單），
前端 `equipment.ts` 的鏡像也從「重算角色」變成「查目錄」：

```ts
const canSee = isOwner
  || can(visibility === 'all_manager' ? 'equipment.read.staff' : 'equipment.read.managed', member.guildId);
```

**重要**：可見性仍然由「被觀看者」決定（那是他的隱私設定），權限只決定
「你有沒有資格拿到他開放的那一級」。兩件事不要混在同一張表。

### 2.6 三層防線與不變式

| 層 | 位置 | 作用 | 能不能當安全邊界 |
|---|---|---|---|
| A 資料層 | RLS / RPC / `has_permission()` | 真正的邊界 | ✅ 唯一 |
| B 路由層 | `<RouteGate perm="...">` | 不要讓使用者看到 403 空白頁 | ❌ |
| C 介面層 | `<Can perm="...">` / `can()` | 隱藏 / 停用按鈕 | ❌ |

不變式（CI / review 檢查）：

1. 任何「會寫資料」的 UI 入口，背後一定要有一個 `needsGuild` 權限被 RLS 檢查。
2. 前端不得出現 `userRole ===`、`isManager`、`canManageGuild` 這類推導（Phase 3 後）。
3. `page.*` 權限不得被 RLS 當成資料保護使用。

### 2.7 公會可見範圍也只能有一個來源

目前「我看得到哪些公會」有兩套算法：

- `managedGuildIds`：綁定成員的 `members.role ∈ (leader, coleader)`（前端用 `db.members` 算）。
- `profiles.user_guilds`：Discord 身分組的公會**名稱**，用字串比對（`Login.tsx:65`、
  `GuildDashboard.tsx:155`、`sort.ts:112`、`GuildRaidManager.tsx:34`）。

新方案：

| 問題 | 唯一來源 |
|---|---|
| 我能管理哪些公會 | `my_managed_guild_ids()`（leader/coleader） |
| 我屬於哪些公會 | `my_guild_ids()`（`members.guild_id`）——RLS 已在使用 |
| `profiles.user_guilds` | **只做顯示**（Header 的預設公會、除錯），不參與任何 `can()` |

好處：公會改名不會導致權限消失；Discord 身分組同步失敗也不會讓幹部看不到自己公會。
`Login` 的公會選擇器改成「從 `my_guild_ids()` 來」，不再比對名稱。

---

## 3. 權限目錄

30 個權限，`G` = 全站授權、`M` = 只在自己管理的公會、`—` = 沒有。
這張表就是 `role_grants` 的初始種子（現行行為的等價翻譯）。

| 權限 | member | manager | officer | admin | 說明 |
|---|:--:|:--:|:--:|:--:|---|
| `page.equipment.view` | G | G | G | G | 裝備表 `/guild/:id` |
| `page.my_costumes.view` | G | G | G | G | 服裝表 `/costumes` |
| `page.mailbox.view` | G | G | G | G | 申請信箱 |
| `page.arcade.view` | — | G | — | G | 小遊戲 |
| `page.toolbox.view` | — | G | — | G | 小工具 |
| `page.raid.view` | — | G | M | G | 聯盟戰記（唯讀） |
| `page.raid_manage.view` | — | G | M | G | 公會聯合戰管理（決策 D1） |
| `page.member_board.view` | — | — | — | G | Team Assign Board |
| `page.admin.view` | — | — | — | G | 後台 |
| `equipment.read.managed` | — | — | M | G | 讀 `guild_manager` 級裝備 |
| `equipment.read.staff` | — | G | — | G | 讀 `all_manager` 級裝備 |
| `equipment.write.self` | G | G | G | G | 改自己的裝備 / 服裝 |
| `equipment.visibility.configure` | G | G | G | G | 設定自己的可見度 |
| `member.edit.managed` | — | — | — | G | 改本公會成員資料 |
| `member.archive` | — | — | — | G | 封存 / 還原成員 |
| `member.note.write.managed` | — | — | M | G | 改本公會成員備註 |
| `raid.score.write` | — | — | M | G | 編輯分數 |
| `raid.season.manage` | — | — | M | G | 開季 / 封存賽季 |
| `raid.ghost.manage` | — | — | M | G | 幽靈紀錄 |
| `raid.roster.move` | — | — | M | G | 成員移轉 / 公告 |
| `mailbox.process` | — | — | M | G | 處理申請（改狀態 / 刪除） |
| `admin.guild.manage` | — | — | — | G | 公會管理分頁 |
| `admin.costume.manage` | — | — | — | G | 服裝資料庫分頁 |
| `admin.identity.manage` | — | — | — | G | 身分綁定分頁 |
| `admin.logs.read` | — | — | — | G | 系統日誌 |
| `admin.tools.run` | — | — | — | G | 工具（匯入 / 備份 / 同步） |
| `admin.settings.manage` | — | — | — | G | 系統設定 |
| `admin.permission.manage` | — | — | — | G | 改這張授權表 |
| `admin.role.assign` | — | — | — | G | 指派 manager / admin |
| `arcade.speed_refining.use` | — | — | — | G | 極速精煉（原本寫死 creator） |

對照舊世界：`access_control` 的 9 個 pageId → 9 個 `page.*.view`；
其餘能力原本藏在 `canManageGuild()` / 各頁 if 裡，現在全部具名。

---
## 4. 資料庫設計（Phase 1 遷移草稿）

> 以下 SQL 是**提案**，請 review 後再放進 `supabase/migrations/`。
> 全部語句可重複執行；Phase 1 完成前不影響任何現有行為（沒有任何 RLS 改用它）。

### 4.1 資料表

```sql
-- 1) 權限目錄：key 由 src/shared/lib/permissions.ts 產生（scripts/gen-permission-catalog.mjs）
create table if not exists public.permissions (
  key          text primary key,
  domain       text not null,
  needs_guild  boolean not null default false,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- 2) 角色授權：後台「權限」分頁唯一會寫的表
create table if not exists public.role_grants (
  role        text not null check (role in ('member','manager','officer','admin')),
  permission  text not null references public.permissions(key) on delete cascade,
  scope       text not null default 'global' check (scope in ('global','managed')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (role, permission)
);

-- officer 的公會級授權一律用 scope = 'managed'（由 catalog 的預設值保證，
-- 不另外加 CHECK，因為「全站開放」的頁面允許 officer 拿 global）

-- 3) 例外授權（Phase 4）：deny 優先，支援到期時間
create table if not exists public.user_grants (
  id            uuid primary key default gen_random_uuid(),
  user_auth_id  uuid not null,
  permission    text not null references public.permissions(key) on delete cascade,
  effect        text not null check (effect in ('allow','deny')),
  guild_id      text references public.guilds(id) on delete cascade,
  expires_at    timestamptz,
  reason        text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  -- 同一權限的全域例外只保留一筆；guild_id 為 NULL 的列由 UI 以 upsert 維護
  unique (user_auth_id, permission, guild_id, effect)
);

-- 4) 版本號：前端快取與 Realtime 都靠它
create table if not exists public.permission_meta (
  id          integer primary key default 1 check (id = 1),
  version     bigint not null default 1,
  updated_at  timestamptz not null default now()
);
insert into public.permission_meta (id) values (1) on conflict do nothing;

create or replace function public.bump_permission_version()
returns trigger
language plpgsql
security definer          -- 寫 permission_meta，呼叫者（admin）沒有直接寫入權限
set search_path = public, pg_temp
as $$
begin
  update public.permission_meta set version = version + 1, updated_at = now() where id = 1;
  return null;
end;
$$;

revoke all on function public.bump_permission_version() from public;

drop trigger if exists role_grants_bump on public.role_grants;
create trigger role_grants_bump
  after insert or update or delete on public.role_grants
  for each statement execute function public.bump_permission_version();

drop trigger if exists user_grants_bump on public.user_grants;
create trigger user_grants_bump
  after insert or update or delete on public.user_grants
  for each statement execute function public.bump_permission_version();

-- 5) RLS：所有人可讀目錄與授權（resolver 是 SECURITY DEFINER，但後台 UI 要讀），
--    只有 admin/creator 能寫。
alter table public.permissions      enable row level security;
alter table public.role_grants      enable row level security;
alter table public.user_grants      enable row level security;
alter table public.permission_meta  enable row level security;

drop policy if exists "permissions_read" on public.permissions;
create policy "permissions_read" on public.permissions
  for select to authenticated using (true);

drop policy if exists "role_grants_read" on public.role_grants;
create policy "role_grants_read" on public.role_grants
  for select to authenticated using (true);

drop policy if exists "permission_meta_read" on public.permission_meta;
create policy "permission_meta_read" on public.permission_meta
  for select to authenticated using (true);

drop policy if exists "role_grants_admin_write" on public.role_grants;
create policy "role_grants_admin_write" on public.role_grants
  for all to authenticated
  using (
    exists (select 1 from public.current_profile() cp where cp.user_role in ('creator','admin'))
  )
  with check (
    exists (select 1 from public.current_profile() cp where cp.user_role in ('creator','admin'))
  );

drop policy if exists "user_grants_admin_all" on public.user_grants;
create policy "user_grants_admin_all" on public.user_grants
  for all to authenticated
  using (
    exists (select 1 from public.current_profile() cp where cp.user_role in ('creator','admin'))
  )
  with check (
    exists (select 1 from public.current_profile() cp where cp.user_role in ('creator','admin'))
  );
```

---
### 4.2 解析函式（唯一真相）

```sql
-- 我是誰：member 人人有；manager / admin 來自 profiles；officer 來自綁定成員的職位
create or replace function public.my_roles()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(r), '{}')
  from (
    select 'member'::text as r where exists (select 1 from public.current_profile())
    union
    select 'manager' where exists (
      select 1 from public.current_profile() cp where cp.user_role = 'manager'
    )
    union
    select 'officer' where exists (select 1 from public.my_managed_guild_ids())
    union
    select 'admin' where exists (
      select 1 from public.current_profile() cp where cp.user_role in ('creator','admin')
    )
  ) t;
$$;

-- 核心：唯一允許判斷「能不能做」的函式
create or replace function public.has_permission(
  p_permission text,
  p_guild_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select public.my_roles() as roles,
           array(select public.my_managed_guild_ids()) as guild_ids
  ),
  granted as (
    select 1
    from public.role_grants rg, me
    where rg.permission = p_permission
      and rg.role = any(me.roles)
      and (
        rg.scope = 'global'
        -- managed：帶公會就比對；沒帶公會 = 「任何一個我管理的公會都可以嗎？」
        or (rg.scope = 'managed' and (
              (p_guild_id is null and cardinality(me.guild_ids) > 0)
              or (p_guild_id is not null and p_guild_id = any(me.guild_ids))
        ))
      )
  ),
  denied as (
    select 1 from public.user_grants ug
    where ug.user_auth_id = auth.uid()
      and ug.permission = p_permission
      and ug.effect = 'deny'
      and (ug.guild_id is null or ug.guild_id = p_guild_id)
      and (ug.expires_at is null or ug.expires_at > now())
  ),
  allowed as (
    select 1 from public.user_grants ug
    where ug.user_auth_id = auth.uid()
      and ug.permission = p_permission
      and ug.effect = 'allow'
      and (ug.guild_id is null or ug.guild_id = p_guild_id)
      and (ug.expires_at is null or ug.expires_at > now())
  )
  select
    -- 規則 1：admin 是唯一硬規則
    ('admin' = any((select roles from me)))
    -- 規則 5：個人 allow 覆寫
    or exists (select 1 from allowed)
    -- 規則 2/3：角色授權，且沒有被個人 deny 蓋掉
    or (exists (select 1 from granted) and not exists (select 1 from denied));
$$;

-- 給 RLS / RPC 用的清單版（一次算好，避免逐列呼叫）
create or replace function public.my_permissions(p_guild_id text default null)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when 'admin' = any(public.my_roles())
      then (select coalesce(array_agg(key order by key), '{}') from public.permissions)
    else (
      select coalesce(array_agg(distinct rg.permission), '{}')
      from public.role_grants rg
      where rg.role = any(public.my_roles())
        and (
          rg.scope = 'global'
          or (p_guild_id is not null and p_guild_id in (select public.my_managed_guild_ids()))
        )
    )
  end;
$$;

-- 給前端用的單次快照（global / managed 兩份清單，前端不需要懂 scope 規則）
create or replace function public.get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select public.my_roles() as roles,
           array(select public.my_managed_guild_ids()) as guild_ids
  )
  select jsonb_build_object(
    'roles', to_jsonb(me.roles),
    'isAdmin', 'admin' = any(me.roles),
    'managedGuildIds', to_jsonb(me.guild_ids),
    'globalPermissions', coalesce((
      select jsonb_agg(distinct rg.permission)
      from public.role_grants rg
      where rg.role = any(me.roles) and rg.scope = 'global'
    ), '[]'::jsonb),
    'managedPermissions', coalesce((
      select jsonb_agg(distinct rg.permission)
      from public.role_grants rg
      where rg.role = any(me.roles) and rg.scope = 'managed'
    ), '[]'::jsonb),
    'version', coalesce((select version from public.permission_meta where id = 1), 1)
  )
  from me;
$$;

grant execute on function public.my_roles() to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;
grant execute on function public.my_permissions(text) to authenticated;
grant execute on function public.get_my_access() to authenticated;
```

**效能**：`has_permission` 內含 3 次索引查詢，RLS 請一律寫成
`(SELECT public.has_permission('raid.score.write', guild_id))`（planner 會當 InitPlan，
每個 statement 只算一次，與現有 `(SELECT public.is_manager())` 同模式）。
RPC 內要逐列判斷時，改成 `viewer AS (SELECT public.my_permissions() AS p)`，
再用 `'raid.score.write' = ANY(viewer.p)`，不要逐列呼叫函式。

---
### 4.3 從 `access_control` 遷移（保留所有既有自訂）

```sql
-- 目錄 + 預設授權由 scripts/gen-permission-catalog.mjs 從 permissions.ts 產生（示意）
insert into public.permissions (key, domain, needs_guild, sort_order) values
  ('page.equipment.view',   'page', false,  10),
  ('page.raid_manage.view', 'page', false,  70),
  ('raid.score.write',      'raid', true,  180)
on conflict (key) do update
  set domain = excluded.domain,
      needs_guild = excluded.needs_guild,
      sort_order = excluded.sort_order;

insert into public.role_grants (role, permission, scope) values
  ('member',  'page.equipment.view', 'global'),
  ('officer', 'page.equipment.view', 'global'),
  ('officer', 'raid.score.write',    'managed')
on conflict (role, permission) do update set scope = excluded.scope;

-- 舊 pageId → 新權限
create temp table legacy_page_map (page_id text primary key, permission text not null);
insert into legacy_page_map values
  ('costume_list',         'page.equipment.view'),
  ('my_costumes',          'page.my_costumes.view'),
  ('application_mailbox',  'page.mailbox.view'),
  ('arcade',               'page.arcade.view'),
  ('toolbox',              'page.toolbox.view'),
  ('guild_raid_manager',   'page.raid_manage.view'),
  ('member_board',         'page.member_board.view'),   -- 舊程式是 adminOnly，忽略設定
  ('admin_settings',       'page.admin.view'),
  ('alliance_raid_record', 'page.raid.view');

-- 1) 有自訂的頁面：先清掉非 admin 的預設授權（admin 永遠放行，不受表影響）
delete from public.role_grants rg
using legacy_page_map m, public.access_control ac
where ac.page = m.page_id
  and ac.page <> 'member_board'
  and rg.permission = m.permission
  and rg.role <> 'admin';

-- 2) 再照 access_control 重建（creator 併入 admin）
insert into public.role_grants (role, permission, scope)
select distinct
  case when r = 'creator' then 'admin' else r end,
  m.permission,
  'global'
from public.access_control ac
cross join lateral unnest(ac.roles) as r
join legacy_page_map m on m.page_id = ac.page
where ac.page <> 'member_board'
on conflict (role, permission) do update set scope = excluded.scope;

-- 3) 特例：舊規則「MANAGER 有勾 → 幹部視同 manager」。
--    access_control 有列且含 manager 時，才補 officer 的公會授權。
insert into public.role_grants (role, permission, scope)
select distinct 'officer', m.permission, 'managed'
from public.access_control ac
cross join lateral unnest(ac.roles) as r
join legacy_page_map m on m.page_id = ac.page
where ac.page = 'guild_raid_manager'
  and r = 'manager'
on conflict (role, permission) do nothing;
```

遷移後的驗收查詢（應回傳 0 列，代表與舊行為逐頁相同）：

```sql
select m.permission, r.role,
       (r.role = any(coalesce(ac.roles, '{}'))) as legacy_allowed,
       exists (select 1 from public.role_grants rg
               where rg.permission = m.permission and rg.role = r.role) as new_allowed
from legacy_page_map m
left join public.access_control ac on ac.page = m.page_id
cross join (values ('member'),('manager'),('admin')) as r(role)
where m.page_id <> 'member_board'
  and (r.role = any(coalesce(ac.roles, '{}'))) is distinct from
      exists (select 1 from public.role_grants rg
              where rg.permission = m.permission and rg.role = r.role);
```

---
## 5. 前端 API

### 5.1 一次性載入，全域共用

```ts
// src/store/index.tsx（Phase 1）
const EMPTY_ACCESS: MyAccess = {
  roles: [], isAdmin: false, managedGuildIds: [],
  globalPermissions: [], managedPermissions: [], version: 0,
};

const [access, setAccess] = useState<MyAccess>(EMPTY_ACCESS);

const refreshAccess = useCallback(async () => {
  const { data, error } = await supabase.rpc('get_my_access');
  if (error) return;                       // 保留舊值，不要把人踢掉
  setAccess(data as MyAccess);
}, []);
```

- 登入後、`profiles` 變更後、Realtime 收到 `role_grants` / `user_grants` 變更時呼叫。
- 任何資料請求回 `42501 / permission denied` 時，強制 `refreshAccess()` 後重試一次
  （處理「管理員剛改完、我的快取還舊」的情況）。
- `version` 只用來判斷「需不需要重抓」，不參與授權判斷。

### 5.2 唯一的判斷入口

```ts
// src/shared/lib/useCan.ts
import { useCallback } from 'react';
import { useAppContext } from '@/store';
import type { PermissionKey } from './permissions';

export function useCan() {
  const { access, isLoaded } = useAppContext();

  const can = useCallback(
    (permission: PermissionKey, guildId?: string | null): boolean => {
      if (access.isAdmin) return true;                       // 與 DB 規則 1 一致
      if (access.globalPermissions.includes(permission)) return true;
      if (!access.managedPermissions.includes(permission)) return false;
      // managed：有帶公會就比對，沒帶＝「任何一個我管理的公會都可以嗎？」
      return guildId
        ? access.managedGuildIds.includes(guildId)
        : access.managedGuildIds.length > 0;
    },
    [access],
  );

  return { can, ready: isLoaded, ...access };
}
```

三行就能完全對應 DB 的五條規則，而且**沒有任何角色名稱**出現在前端。

### 5.3 兩個宣告式元件

```tsx
// src/shared/ui/Can.tsx
export function Can({ perm, guildId, fallback = null, children }: CanProps) {
  const { can } = useCan();
  return <>{can(perm, guildId) ? children : fallback}</>;
}

// 用法：讀寫分離，不用再傳 canManage / isGlobalAdmin 這種 prop
<Can perm="raid.score.write" guildId={guildId} fallback={<ReadOnlyBadge />}>
  <ScoreEditor />
</Can>
```

```tsx
// src/shared/ui/RouteGate.tsx
export function RouteGate({ perm, children }: { perm: PermissionKey; children: ReactNode }) {
  const { can, ready } = useCan();
  const { currentUser, isRoleLoading } = useAppContext();
  if (isRoleLoading || !ready) return <FullPageLoading />;
  if (!currentUser) return <Navigate to="/" replace />;
  return can(perm) ? <>{children}</> : <UnauthorizedView />;
}
```

```tsx
// src/app/routes.tsx（Phase 2）
<Route path="/raid-manager" element={
  <RouteGate perm="page.raid_manage.view"><GuildRaidManager /></RouteGate>
} />
```

`ProtectedRoute` 之後只負責「有沒有登入」，不再接收 `allowedRoles` / `pageId`。

### 5.4 既有程式怎麼無痛接上（Phase 1 的關鍵）

`usePermissions()` 保留原介面，內部改成查目錄：

```ts
const canAccessPage = (pageId: string, options: PageAccessOptions = {}) => {
  if (options.requireRulesLoaded && !rulesLoaded) return false;
  const perm = LEGACY_PAGE_TO_PERMISSION[pageId];
  return perm ? can(perm) : false;
};
```

Header、`ProtectedRoute`、`AccessControlManager` 一行都不用改，行為與 `access_control`
完全相同（因為 `role_grants` 是從它遷移來的），但真相已經搬到 DB。
接著才一個一個把 `canManageGuild()` / `isManager` 換成 `can(perm, guildId)`。

---

## 6. 後台 UI（`/admin` → 權限）

現在「存取控制」只有一張 9 列的角色勾選表；新方案把它換成四個分頁：

### 6.1 角色權限（預設分頁）

- 列 = 權限，依 `domain` 分組（頁面 / 裝備 / 成員 / 聯合戰 / 申請信箱 / 後台）；
  每列顯示 `label` + 一行 `description`。
- 欄 = member / manager / **officer（標「僅自己公會」）** / admin（鎖定全勾）。
- 切換即寫 `role_grants`（單列 upsert），有「重設為預設」與「套用全部預設」。
- 表格上方有「這個權限誰有？」按鈕 → 呼叫 `preview_permission(perm)` 列出符合的人。

### 6.2 使用者

- 搜尋人名 → 顯示：角色標籤與**來源**（Discord 身分組 / 綁定成員 `公會A 會長` / 手動）、
  目前生效的權限清單（`get_my_access` 針對該人）。
- 可改 `profiles.user_role`（member ↔ manager）＝ `admin.role.assign`；
  admin 清單只有 `creator` 能改。
- 「以他的身分預覽」→ 見 6.4。

### 6.3 例外授權（Phase 4）

- 使用者 × 權限 ×（公會 / 到期日）→ `user_grants`，可 `allow`（暫時開權）或 `deny`（停權）。
- 列表要顯示「為什麼他現在有這個權限」：角色授權 / 例外 allow / admin。

### 6.4 預覽與稽核

- **預覽**：`preview_access(p_user_auth_id)` 回傳與 `get_my_access()` 同結構，
  前端用同一套 `can()`  render 一次 Header + 頁面按鈕，管理員不用真的登入另一個帳號。
- **稽核**：`role_grants` / `user_grants` / `profiles.user_role` 的變更寫進
  `system_logs`（source = `permissions`，details 帶 before/after），
  並在 UI 顯示最近 50 筆。

### 6.5 i18n

`public/locales/{zh-TW,en}/admin.json` 新增：

```json
"permissions": {
  "roles": { "member": "MEMBER", "manager": "MANAGER", "officer": "公會幹部", "admin": "ADMIN" },
  "officer_scope": "僅自己管理的公會",
  "page.equipment.view": { "label": "裝備表", "description": "檢視 /guild/:id 的成員裝備" }
}
```

key 由 `permissionLabelKey()` 產生，新增權限時少了翻譯會顯示原始 key（與現有機制一致）。

---
## 7. 遷移計畫（每階段都可獨立上線 / 回滾）

| 階段 | 內容 | 行為變化 | 估時 |
|---|---|---|---|
| **Phase 0** | `supabase db pull` 補齊 repo 外 schema（§1.9）、本文件 + `permissions.ts` 目錄定案（不改程式） | 無 | 0.5 天 |
| **Phase 1** | DB 建表 + 從 `access_control` 遷移 + `get_my_access()`；store 載入；`usePermissions().canAccessPage` 改讀目錄 | **無**（等價遷移） | 2 天 |
| **Phase 2** | 路由改 `RouteGate`、Header 改 `can()`；`/raid` 拆出 `page.raid.view`；刪掉 `adminOnly` / `scope` / officer 特例 | 無（除非 D1 通過） | 2–3 天 |
| **Phase 3** | RLS / RPC 全面改 `has_permission()`；裝備遮罩改權限；刪 `access_control` | 依 D2 / D3 | 3–5 天 |
| **Phase 4** | `user_grants` 例外授權 + 預覽 + 稽核 | 新增功能 | 1.5 天 |

### 7.1 實作進度（2026-11-02）

| 階段 | 狀態 | 產出 |
|---|---|---|
| Phase 0 | ✅ | §1.9 的查證結果（唯讀 Management API 查詢） |
| Phase 1 | ✅ 已套用 | `supabase/migrations/20261102130000_permission_catalog_v2_foundation.sql`、`scripts/gen-permission-catalog.ts`、`src/shared/lib/useCan.ts`、store 的 `access` / `refreshAccess`、`usePermissions` fallback、`set_page_roles` 雙寫 |
| Phase 2 | ✅ | D1/D2 + 路由改 `perm`（`/raid` 拆成 `page.raid.view`，授權已從 `raid_manage` 複製並驗證相等）；`GuildRaidTable` `readOnly` |
| Phase 3 | ✅ | `can_edit_raid_record()` / `raid_seasons` / `apply_mail` 改用 `has_permission()`；`guilds` / `costumes` 收回 admin-only；`members` 新增裝備欄位 guard（非本人 → `42501`），備份還原改走 `restore_members_snapshot()` |
| Phase 4 | ✅ | `/admin → 權限（v2）`：角色權限矩陣、例外授權（`user_grants`）、預覽視角（`preview_access`）、稽核（`system_logs` `source=permissions`） |

Phase 1 驗證：

- `scripts/verify-permission-parity.sql`（member / manager / admin / officer × 8 頁）→ **0 列差異**。
- 真實 persona（`request.jwt.claims` 模擬）：
  - manager：`roles=[manager,member]`、`managedGuildIds=[]`、9 個 global 權限
  - officer（manager + 公會會長）：`managedGuildIds=[...]`、8 個 managed 權限
  - admin：`isAdmin=true`、31 個 global 權限
- `npm run audit:permissions` → 31/31、`npm run db:catalog:check` → 無 drift、`npm run lint` → 通過。
- D1（manager 唯讀看自己公會）以真實 persona 驗證：
  `memberGuildIds=[QR7…]`、`managedGuildIds=[]`、`page.raid_manage.view=true`、
  `raid.score.write=false`（連自己公會也是 false）。
- D2：`permissions` 表已無 `equipment.write.managed`（`perms=30`、`grants=58`）。
- D2 的 DB 層（實測）：
  - admin 改他人裝備備註 → `RESULT: blocked`（`42501`）
  - 本人改自己裝備備註 → `RESULT: allowed-owner`（測完已還原）
  - `restore_members_snapshot([])`：admin → `0`；manager → `42501`
- Phase 4：`preview_access(admin)` 與 `get_my_access()` 的權限集合 **0 差異**；
  manager 預覽結果為 `roles=[member,manager]`、無 `admin.*`。
- 收尾（2026-11-02）：舊「存取控制」分頁與 `AccessControlManager` 已移除；
  權限矩陣改為 **500ms 合併佇列**（連續點擊 → 1 次 bulk upsert + 每角色 1 次 `in()` delete）。

### Phase 1 要動的檔案

```
supabase/migrations/2026xxxx_permission_catalog.sql   # 新增（本文件 §4）
scripts/gen-permission-catalog.mjs                    # 由 permissions.ts 產生 seed SQL
src/shared/lib/permissions.ts                         # 已建立
src/shared/lib/useCan.ts                              # 新增
src/store/index.tsx                                   # 新增 access 狀態 + refreshAccess
src/shared/lib/usePermissions.ts                       # 內部改寫，介面不變
```

完成標準：

1. §4.3 的驗收查詢回傳 0 列。
2. 用四種帳號（member / manager / officer / admin）登入，Header 與頁面可見性和改版前一致。
3. `npm run lint` 通過。

### 為什麼不一次大改

`access_control` 目前是**唯一**的頁面權限來源，直接刪掉會讓 `ProtectedRoute`、Header、
`AccessControlManager` 同時壞掉；而 RLS 散在 4 個 migration、6 支函式裡，一次改完
沒辦法分辨「行為改變」是來自新模型還是寫錯 SQL。分階段讓每一步都有一個
「舊 vs 新必須相同」的驗收條件，出錯時只要回滾單一 migration。

### 回滾方式

- Phase 1：`access_control` 完全沒動，把 `usePermissions` 改回舊版即可。
- Phase 2：`RouteGate` 換回 `ProtectedRoute pageId`。
- Phase 3：每個資料表保留舊 policy 名稱一週（新 policy 命名 `*_v2`），確認後再 drop。

---

## 8. 測試與驗收

### 8.1 自動

- `npm run lint`（`tsc --noEmit`）— 型別層保證 `perm` 只能是目錄裡的 key。
- `npm run audit:permissions` — 把本文件 25 條「可機械驗證」的斷言變成檢查
  （`scripts/audit-permission-claims.mjs`）。任何一條 FAIL 就代表文件寫錯，
  不是「我覺得」。
- `scripts/gen-permission-catalog.mjs --check` — 確認 `permissions.ts` 與 DB 的
  `permissions` 表沒有 drift（CI 可跑）。
- 遷移驗收 SQL（§4.3）必須 0 列。

### 8.2 前後端一致性（最重要的一項）

對每個 persona，用 `supabase-js` + 該使用者 token 直接打 API，驗證
「UI 顯示可以編輯」⇔「API 回 200」：

| Persona | 測項（✅ 應成功 / ❌ 應被拒） | 現況備註 |
|---|---|---|
| A. member（已綁定） | 改自己裝備 ✅ / 改別人裝備 ❌ / 寫戰記 ❌ / 進 `/raid` ❌ | 三邊一致 |
| B. member（未綁定） | 只讀自己可看的頁面；任何寫入 ❌ | — |
| C. manager | 讀 `all_manager` 裝備 ✅ / 寫戰記 ❌ / 進 `/admin` ❌（預設） | `/raid-manager` 進得去但顯示無權限（死頁） |
| D. officer（公會 A） | 寫 A 公會分數 ✅ / 寫 B 公會分數 ❌ / 看 A 公會裝備 ✅ / 看 B ❌ | **現況 API 會放行 B 公會（要修）** |
| E. admin | 全部 ✅（唯一硬規則） | **現況 UI 缺「編輯他人裝備」入口（D2）**，API 可寫 |

這張表同時是 Playwright e2e 的 case 清單（`tests/` 目前被 `.gitignore` 排除，
建議改成 `e2e/` 並納入版控，否則這類測試永遠留不下來）。

### 8.3 效能

- `get_member_equipment` 在 1000 名成員下的耗時，改動前後差異 < 10%。
- 熱路徑（RLS）只能用 `(SELECT has_permission(...))` 形式，禁止在 policy 裡 join。

---

## 9. 決策點（需要你拍板）

| # | 問題 | 建議 | 影響 |
|---|---|---|---|
| **D1** | `manager` 還需要進 `/raid-manager` 嗎？ | **已決議（2026-11-02）**：可以進，但**只看自己公會**（`memberGuildIds`），且完全唯讀（`raid.score.write` = false）。已實作 `readOnly` 表格 + 公會過濾 | `page.raid_manage.view` 仍給 manager；編輯改用 `raid.score.write` |
| **D2** | 成員裝備 / 服裝的編輯入口要給誰？ | **已決議（2026-11-02）**：**任何人都不能編輯他人裝備/服裝**（含 admin）。`equipment.write.managed` 已從目錄移除；DB 由 `members_equipment_guard` 擋下，備份還原走 `restore_members_snapshot()` 的 transaction-local 例外 | UI 只有本人；API 也擋（實測 `blocked` / `allowed-owner`） |
| **D3** | 賽季管理要限縮到 admin 嗎？（現在任一幹部可改整季所有公會） | 保留幹部，但 RLS 改為只能改自己管理的公會；「封存賽季」走 SECURITY DEFINER RPC | 避免 A 公會幹部動到 B 公會 |
| **D4** | `creator` 要不要合併成 admin 的一個旗標？ | DB 值保留，resolver 視為 admin；UI 只顯示 ADMIN；只有 creator 能改 admin 名單 | 不動資料，只改語意 |
| **D5** | 例外授權（`user_grants`）要 Phase 1 就有嗎？ | 不需要，Phase 4 | 提前做會多一層 debug 變數 |

## 10. 風險

| 風險 | 機率 | 對策 |
|---|---|---|
| 遷移腳本漏掉某個 `access_control` 特例 | 中 | §4.3 驗收查詢 + Phase 1 不改行為，可慢慢比對 |
| 把「UI 現況」誤讀成「權限規則」 | **已發生 1 次（D2）** | 每條診斷都附 `檔案:行號`；查不到就標 `[待 db pull]`；再用 §8.2 的 API 測試驗證實際行為 |
| RLS 改寫造成效能下降 | 中 | 只允許 InitPlan 形式；先量測再上 |
| 前端快取導致「管理員改完沒生效」 | 高 | `version` + Realtime + 42501 重抓 |
| 舊文件 / i18n 文案持續誤導 | 高 | Phase 2 一併更新 `docs/permissions.md` 與 `admin.json` 的 legend |
| `get_admin_role()` 這類 repo 外函式 | 已發生 | Phase 3 前先 `supabase db pull` 對一次 schema，補回 migration |

## 11. 驗收定義（Definition of Done）

- [ ] 全站找不到 `userRole ===` / `isManagerRole` / `canManageGuild` / `isGlobalAdminRole`
      的權限判斷（`access.ts` 只剩型別 re-export）。
- [ ] 本文件所有「不一致」都附 `檔案:行號`，或明確標 `[待 db pull]`（沒有無依據的斷言）。
- [ ] 每個 `needsGuild` 權限都至少有一個 RLS policy 或 RPC 在檢查它。
- [ ] `/admin` → 權限 可以完成：改角色授權、看某人為什麼有權限、預覽某人視角。
- [ ] 新增一個權限只需要改 `permissions.ts` 一處（+ 翻譯），UI 與 seed 自動跟上。
- [ ] §8.2 的五個 persona 全部通過。

---

## 12. 這個方案可能錯在哪（可反駁的預測）

信任不該建立在「我看過了」，所以把方案的主張寫成「若 X 成立，方案就錯」：

| # | 主張 | 若下列情況成立，方案就錯 | 怎麼驗 |
|---|---|---|---|
| **P1** | `access_control` 無法表達「能進頁面」≠「能做事」 | DB 的 `access_control` 除了 `page` / `roles` 還有其他欄位，或另有頁面權限表 | `supabase db pull` 看 schema |
| **P2** | 現有 6 支 SQL helper 都能被 `has_permission()` 取代 | 某個 helper 的條件不是「角色 + 公會範圍」（例如依資料列 owner、時間、金額） | **逐一讀 SQL 條件**再對照目錄（不要憑 helper 名稱判斷——我前兩次錯就是這樣來的） |
| **P3** | Phase 1 可以零行為變更 | `access_control` 有「頁面已不存在但仍有資料」的列，或 `member_board` 有自訂列被 `adminOnly` 忽略 | §4.3 驗收 SQL 回傳 0 列；另查孤兒 `page` 列 |
| **P4** | officer 的 `managed` scope 足以取代「MANAGER 勾選」補丁 | 需要「同一個 officer 在 A 權限開放、B 權限不開放」的組合 | 目錄預設值本來就是逐權限，天然支援；若不夠才需要 `user_grants` |
| **P5** | 前端只讀 `get_my_access()` 就夠 | 某些 UI 需要「別人的權限」（例如顯示某成員可否被編輯） | 這種情況由 RLS 回傳欄位或額外 RPC，不在前端推算 |

目前已知的兩個事實錯誤（D2、Header）都是同一種模式：**沒讀實作就從名稱推論**。
所以 P2 的驗法特別寫「逐一讀 SQL」，而不是再相信一張對照表。






