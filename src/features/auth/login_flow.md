# 登入流程完整說明

本文件涵蓋 Kazran Alliance System 的兩種登入方式、完整的 Discord 驗證流程、所有邊界情境（含資料庫變動），以及管理員後台的手動身份綁定機制。

---

## 一、登入入口

使用者點選任何需要權限的操作（例如：選擇公會）時，系統會開啟 **LoginModal**，提供兩種登入方式：

| 方式 | 對象 |
|---|---|
| Discord OAuth | 一般成員 |
| Email / Password | 管理員（Supabase Auth 帳號） |

---

## 二、Discord 登入流程

### 2-1. 前端觸發（LoginModal）

```
使用者點擊「使用 Discord 登入」
  → supabase.auth.signInWithOAuth({ provider: 'discord', scopes: 'guilds.members.read' })
  → 導向 Discord 官方授權頁面
  → 授權完成後 redirect 回應用程式原頁面
```

**資料庫變動：** 無（此步驟由 Supabase Auth 內部建立 session，不直接寫入業務資料表）

---

### 2-2. 前端載入角色（AppContext.loadDiscordRoles）

Supabase session 建立後，`loadDiscordRoles()` 自動執行：

```
取得 Supabase session
  ↓
判斷登入 provider
  ├─ email/password → 走「管理員登入」分支（見第四節）
  └─ discord → 繼續下方流程

取得 discord_id（from user.identities 或 user_metadata.sub）
  ↓
SELECT profiles WHERE discord_id = ?（含 auth_id 欄位）
  ├─ 有 profile 且 auth_id 不為 null → 跳過 Edge Function，直接讀取角色
  ├─ 有 profile 但 auth_id 為 null（管理員手動建立、從未登入同步）→ 觸發 Edge Function
  └─ 無 profile（首次登入 / 資料遺失）→ 觸發 Edge Function
       ↓（觸發後）
       同步完成後重新 SELECT profiles WHERE discord_id = ?
         ├─ 仍無 profile → 強制登出（見情境 B）
         └─ 有 profile → 繼續

設定前端狀態：
  setCurrentUser / setCurrentAvatar / setUserRole / setuserGuildRoles / setUserProfileId
```

**資料庫變動（失敗情境）：**
```sql
-- 不在伺服器、同步後仍無 profile 時
INSERT INTO system_logs (level, source, action, message, user_id, discord_id, details)
VALUES ('warn', 'frontend_auth', 'unauthorized_login', '未授權的登入嘗試', ?, ?, ?);
```

---

### 2-3. Edge Function：sync-discord-roles

觸發時機：首次登入，或前端明確要求強制同步（`forceSync = true`）

**完整流程：**

```
接收：{ user_id, discord_id, username }
  ↓
驗證 JWT（Bearer token from Supabase session）
  ↓
GET /guilds/{GUILD_ID}/members/{discord_id}  →  Discord API
  ├─ 404 → 成員不在伺服器（情境 B）
  ├─ 401 → Bot Token 無效
  ├─ 403 → Bot 沒有權限
  └─ 200 → 取得 member（含 roles[], nick）

GET /guilds/{GUILD_ID}/roles  →  Discord API
  → 篩出名稱符合 /公會成員.+棕色2/ 且使用者擁有的角色
  → 取名稱中 '-' 前半段作為 guildRoles[]

判斷 user_role：
  ├─ 擁有 role ID 1251021144144740372 → 'manager'
  ├─ 擁有 role ID 1404976598507323393 → 'member'
  └─ 其他 → ''（空）

SELECT admin_users WHERE username = ? （檢查是否為 creator / admin）
  ├─ role === 'creator' → 覆蓋為 'creator'
  └─ role === 'admin'   → 覆蓋為 'admin'

嘗試比對遊戲成員：
  SELECT members WHERE status = 'active'
  取 Discord nickname，移除 [...]、(...) 括號後與 members.name 完全比對
  ├─ 有符合 → matchedId = member.id
  └─ 無符合 → matchedId = null

SELECT profiles WHERE discord_id = ?（檢查是否已有 id，避免覆蓋既有綁定）
  shouldUpdateId = matchedId !== null && !existingProfile?.id?.includes(matchedId)
```

**資料庫變動：**
```sql
-- 核心寫入（每次登入同步均執行）
UPSERT INTO profiles (discord_id, discord_username, id, auth_id, user_role,
                      user_guilds, display_name, avatar_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (discord_id) DO UPDATE SET ...;

-- 同步結果寫入日誌
INSERT INTO system_logs (level, source, action, message, user_id, discord_id, details)
VALUES ('info'/'error', 'edge_sync_discord', 'sync_success'/'upsert_profile_failed', ?, ?, ?, ?);
```

> **id 覆蓋保護：** `shouldUpdateId` 須同時滿足兩個條件才為 `true`：(1) `matchedId !== null`（比對有結果）；(2) 現有 `profiles.id` 尚未包含 `matchedId`。兩者任一不符則保留現有 `id`，避免清除管理員手動設定的成員綁定，或在暱稱比對失敗時以 `null` 覆蓋既有 `id`。

---

## 三、Discord 登入情境一覽

### 情境 A：正常登入（既有 profile，auth_id 不為 null）

**條件：**
- Discord 帳號已認證
- 已加入聯盟 Discord 伺服器
- 擁有「公會成員-棕色2」相關身份組
- `profiles` 表中已有紀錄且 `auth_id` 不為 null（曾成功同步過）

**資料庫變動：**
```sql
-- 只有 SELECT，不觸發 Edge Function
SELECT id, user_role, user_guilds, display_name, avatar_url
  FROM profiles WHERE discord_id = ?;
-- 無任何 INSERT / UPDATE
```

**前端結果：** 登入完成，`userRole`、`userGuildRoles`、`userProfileId` 正常填入

---

### 情境 B：不在聯盟 Discord 伺服器

**條件：** 已授權但帳號不在伺服器內

**資料庫變動：**
```sql
-- Edge Function 無法取得成員資訊，不執行 UPSERT
-- 前端登出後寫入：
INSERT INTO system_logs (level, source, action, message, user_id, discord_id, details)
VALUES ('warn', 'frontend_auth', 'unauthorized_login', '未授權的登入嘗試', ?, ?, ?);
```

**前端結果：** 強制登出，顯示 Toast 錯誤「登入失敗：您不在指定的公會聯盟中」

---

### 情境 C：在伺服器但無「棕二」身份組

**條件：** Discord API 成功，但無符合 `/公會成員.+棕色2/` 的身份組

**資料庫變動：**
```sql
UPSERT INTO profiles SET
  discord_id = ?,
  discord_username = ?,
  auth_id = ?,
  user_role = '',        -- 無對應的管理/成員身份組
  user_guilds = NULL,    -- 無棕二身份組，此欄位為空
  display_name = ?,
  avatar_url = ?
  -- id 欄位：依 matchedId 決定是否更新
ON CONFLICT (discord_id) DO UPDATE SET ...;
```

**前端結果：** 可登入，但 `userGuildRoles` 為空陣列，無法查看任何公會資料；UI 應提示身份組問題

---

### 情境 D：首次登入，暱稱自動比對成功

**條件：** `member.nick`（去除括號後）完全符合 `members.name`

**資料庫變動：**
```sql
UPSERT INTO profiles SET
  id = '<matched_member_uuid>',  -- 自動比對成功，寫入遊戲成員 ID
  user_role = 'member'/'manager',
  user_guilds = '公會名稱A,公會名稱B',
  discord_username = ?,
  display_name = ?,
  avatar_url = ?
ON CONFLICT (discord_id) DO UPDATE SET ...;
```

**前端結果：** 完整登入，`userProfileId` 正確指向遊戲成員

---

### 情境 E：首次登入，暱稱比對失敗

**條件：** 暱稱無法對應任何 `members.name`，或使用者無 Discord 暱稱

**資料庫變動：**
```sql
UPSERT INTO profiles SET
  id = NULL,             -- 比對失敗，id 保持空值
  user_role = 'member'/'manager',
  user_guilds = '...',
  discord_username = ?,
  display_name = ?,
  avatar_url = ?
ON CONFLICT (discord_id) DO UPDATE SET ...;
```

**前端結果：** 可登入，但 `userProfileId = null`；需管理員手動綁定（見第五節）

---

### 情境 F：管理員預先建立 profile（auth_id 為 null）

**條件：**
- 管理員透過身份綁定後台以 Discord ID 建立 profile（5-3 找不到情境）
- 當事人尚未以 Discord 登入過系統（`auth_id` 為 null）

**登入時行為：**
```
SELECT profiles WHERE discord_id = ? → 找到 profile，但 auth_id 為 null
  → shouldSync = true → 觸發 Edge Function 同步
  → Edge Function 寫入 auth_id、display_name、avatar_url、discord_username、user_role、user_guilds
  → shouldUpdateId = false（matchedId 通常為 null，比對失敗不覆蓋已綁定的 id）
```

**資料庫變動：**
```sql
UPSERT INTO profiles SET
  auth_id = ?,           -- 補齊（原為 null）
  discord_username = ?,
  display_name = ?,
  avatar_url = ?,
  user_role = 'member'/'manager'/'admin'/'creator',
  user_guilds = '...'
  -- id 欄位保留管理員預設的值，不覆蓋
ON CONFLICT (discord_id) DO UPDATE SET ...;
```

**前端結果：** 完整登入，`userProfileId` 正確指向管理員預先綁定的遊戲成員

---

### 情境 G：Discord 帳號未認證

**條件：** Discord 帳號未完成 email / 手機認證

**資料庫變動：** 無（授權在 Discord 官方頁面中止）

**前端結果：** Discord 顯示英文錯誤，不會導回應用程式

---

## 四、管理員 Email/Password 登入

```
LoginModal → handleAdminLogin
  → supabase.auth.signInWithPassword({ email, password })
  → 成功後 onClose()

loadDiscordRoles 檢測 provider !== 'discord'
  → 查詢 profiles 表：SELECT WHERE id = user.id（Supabase auth UUID）
    ├─ 有 profile → 讀取 display_name、user_role、user_guilds
    └─ 無 profile → fallback：user.email 作為顯示名稱，角色預設 'member'
```

**資料庫變動：**
```sql
-- 僅 SELECT，無 INSERT / UPDATE
SELECT id, user_role, user_guilds, display_name, avatar_url
  FROM profiles WHERE id = '<supabase_auth_user_uuid>';
```

> **注意：** 管理員 profile 以 Supabase auth UUID 作為 `id` 查詢（非 `discord_id`）。

---

## 五、身份綁定（IdentityBinding 後台）

當情境 E 發生時（profile 存在但 `id` 為空），管理員可透過後台手動建立綁定關係。

### 5-1. 單一匹配模式（Single Match）

左側顯示所有 `profiles.id` 為空的 Discord 帳號。

**資料庫變動：**
```sql
UPDATE profiles
  SET id = '<member_uuid>'
  WHERE discord_id = '<selected_profile_discord_id>';
```

---

### 5-2. 多重匹配模式（Multi Match）- 編輯現有綁定

左側搜尋已綁定成員後，可修改其所有綁定成員與 Discord 用戶名。

**資料庫變動：**
```sql
UPDATE profiles
  SET id = 'uuid1,uuid2,uuid3',         -- stagedIds 合併
      discord_username = '新用戶名'      -- 僅在有變更時才加入此欄位
  WHERE discord_id = '<profile_discord_id>';
```

---

### 5-3. 多重匹配模式（Multi Match）- 新建綁定（未綁定成員）

點選左側「未綁定」成員，進入新建綁定流程。需輸入 **Discord ID**（必填）與 Discord 用戶名（選填），並暫存至少一名遊戲成員。

**儲存時流程：**
```
找尋 profiles WHERE discord_id = ? (完全比對)
  ├─ 找到現有 profile（該帳號曾以 Discord 登入過系統）
  │    → UPDATE profiles SET id = 'uuid1,uuid2,...'
  │                        [, discord_username = ?]（僅在有輸入時）
  │      WHERE discord_id = '<discord_id>'
  │
  └─ 找不到 profile → INSERT INTO profiles (discord_id, id [, discord_username])
                       建立一筆管理員手動建立的 profile
                       當事人以 Discord 登入時，系統偵測 auth_id 為 null，
                       自動觸發 Edge Function 補齊其餘欄位
```

**資料庫變動（找到）：**
```sql
UPDATE profiles
  SET id = 'uuid1,uuid2,...'
      [, discord_username = '?']
  WHERE discord_id = '<discord_id>';
```

**資料庫變動（找不到）：**
```sql
INSERT INTO profiles (discord_id, id [, discord_username])
  VALUES ('<discord_id>', 'uuid1,uuid2,...' [, '?']);
-- auth_id、user_role、user_guilds、display_name、avatar_url 均為 null
-- 當事人首次登入時，auth_id 為 null → 觸發 Edge Function 自動補齊
```

---

## 六、profiles 表關鍵欄位

| 欄位 | 類型 | 說明 |
|---|---|---|
| `discord_id` | text（PK / ON CONFLICT） | Discord 雪花 ID，系統的穩定主鍵 |
| `discord_username` | text | Discord 用戶名（人類可讀），新建綁定以此欄位匹配 |
| `display_name` | text | Discord 伺服器暱稱 |
| `avatar_url` | text | Discord 頭像 URL |
| `auth_id` | uuid | Supabase Auth `user.id` |
| `id` | text | 綁定的遊戲成員 UUID，多筆以逗號分隔；空值代表尚未綁定 |
| `user_role` | text | `creator` / `admin` / `manager` / `member` / `''` |
| `user_guilds` | text | 所屬公會名稱，多筆以逗號分隔（來自 Discord 身份組） |

---

## 七、角色權限層級

| 角色 | 來源 | 說明 |
|---|---|---|
| `creator` | `admin_users` 表（role = 'creator'） | 最高權限，系統創建者 |
| `admin` | `admin_users` 表（role = 'admin'） | 管理員 |
| `manager` | Discord role ID `1251021144144740372` | 幹部 |
| `member` | Discord role ID `1404976598507323393` | 一般成員 |
| `''`（空） | 預設 | 已登入但尚未分配角色 |

> `creator` / `admin` 優先級高於 Discord 身份組，Edge Function 最後檢查 `admin_users` 表並覆蓋角色。

---

## 八、系統日誌（system_logs）

關鍵事件均寫入 `system_logs`，可由 Admin Panel > 系統日誌查閱：

| action | level | source | 說明 |
|---|---|---|---|
| `sync_success` | info | edge_sync_discord | Discord 角色同步成功 |
| `upsert_profile_failed` | error | edge_sync_discord | UPSERT profiles 失敗 |
| `unauthorized_login` | warn | frontend_auth | 不在伺服器的登入嘗試 |
| `discord_api_error` | error | edge_sync_discord | Discord API 呼叫失敗 |
| `jwt_verification_failed` | error | edge_sync_discord | Edge Function JWT 驗證失敗 |
| `missing_bot_token` | fatal | edge_sync_discord | 缺少 DISCORD_BOT_TOKEN 環境變數 |
| `discord_roles_api_error` | warn | edge_sync_discord | 無法取得伺服器角色列表 |
| `unhandled_exception` | fatal | edge_sync_discord | 未預期的例外（如頭像 BigInt 轉換錯誤） |
