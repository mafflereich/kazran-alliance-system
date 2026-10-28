# 系統日誌 (System Logs) 架構與實作指南

本文件記錄了 Kazran Alliance System 中用來追蹤錯誤與重要操作的 `system_logs` 機制。

## 1. 架構目的
為了解決前後端分離（特別是 Supabase Auth 與 Edge Function 之間）導致的錯誤難以追蹤問題（例如：Discord 登入後 Auth 有建立，但 Profiles 未建立）。透過建立獨立的 `system_logs` 資料表，讓開發者與管理員能在不依賴使用者瀏覽器 Console 的情況下，主動監控系統狀態與錯誤細節。

## 2. 資料表結構 (`system_logs`)
- `id` (UUID): 日誌唯一識別碼
- `created_at` (TIMESTAMPTZ): 記錄時間
- `level` (TEXT): 嚴重程度 (`info`, `warn`, `error`, `fatal`)
- `source` (TEXT): 來源模組 (例如：`frontend_auth`, `edge_sync_discord`, `admin_panel`)
- `action` (TEXT): 動作分類 (例如：`login_attempt`, `upsert_profile_failed`)
- `user_id` (UUID): 關聯的 Supabase Auth ID (若有)
- `discord_id` (TEXT): 關聯的 Discord ID (特別用於追蹤 Discord 登入問題)
- `message` (TEXT): 簡短的描述訊息
- `details` (JSONB): 彈性的詳細資料，可存放 Error Stack, Request Body, 變更前後的資料對比等。

## 3. 安全性與 RLS (Row Level Security)
- **寫入權限 (INSERT)**：開放給所有人（包含未登入者）。因為在登入失敗的當下，使用者尚未取得 Auth Token，必須允許匿名寫入錯誤日誌。
- **讀取與管理權限 (SELECT, UPDATE, DELETE)**：嚴格限制僅限管理員。透過 `get_admin_role() IN ('creator', 'admin', 'manager')` 確保只有具備管理權限的人員可以查看日誌。

## 4. 前端 Logger 模組（已實作）
共用的 `Logger` 工具位於 `src/shared/utils/logger.ts`，封裝 Supabase 的 `insert` 操作，並自動抓取目前登入者。各 React 元件可透過 `Logger.info()` / `Logger.warn()` / `Logger.error()` / `Logger.fatal()` 寫入日誌，寫入失敗不會影響主程式運行。

## 5. 日誌覆蓋範圍（已實作）
以下重要操作執行時皆會寫入 `system_logs`：

| 模組 | 操作 | 說明 |
|------|------|------|
| 登入/登出 | `frontend_auth` | 未授權登入警告、登出紀錄 |
| 成員管理 | `member_management` | 新增/編輯/刪除/封存/解除封存成員、更新服裝等級、專武、存取控制、成員看板批次儲存與批次歸檔 |
| 公會管理 | `guild_management` | 新增/編輯/刪除公會 |
| 角色/服裝管理 | `character_management` / `costume_management` | 新增/編輯/刪除/排序角色與服裝 |
| 設定/資料管理 | `setting_management` / `data_management` | 更新設定、備份/還原資料 |
| 申請信箱 | `apply_mail` | 新增/更新/刪除申請 |
| 權限控制 | `access_control` | 更新頁面角色權限、更新使用者角色 |
| 管理工具 | `admin_tools` | 身份綁定/解除、CSV 匯入、備份下載 |
| 戰記管理 | `raid_manager` | 同盟戰記儲存、成員戰記自動儲存、賽季建立/封存/編輯/清除、幽靈紀錄新增/刪除、戰記備份 |

## 6. 實作慣例
- **source** 使用固定命名（見上方表格），**action** 為動作分類（如 `add_member`、`save_member_board`、`update_user_role`）。
- **成功操作**用 `Logger.info`，**刪除類操作**用 `Logger.warn`，**失敗**用 `Logger.error`。
- 在 try-catch 的 `catch` 區塊中記錄 `error.message`，並在成功路徑中附上變更內容摘要（如數量、id 清單）。

## 7. 下一步：Edge Function 整合
修改 `sync-discord-roles` 等 Edge Functions，在 `catch` 區塊中捕捉錯誤，並將詳細的錯誤訊息與變數狀態寫入 `system_logs`。

## 8. 後台監控介面 (已實作)
已在 Admin Panel 中新增「系統日誌」頁面，讓管理員直接在網頁上查看與篩選系統日誌。

- **分頁**：每頁 50 筆，使用 Supabase `range(from, to)` + `count: 'exact'` 於伺服器端分頁，畫面下方顯示總筆數與頁碼切換，可瀏覽 100 筆以外的歷史日誌。
- **搜尋**：於伺服器端以 `or(...)` 對 `message`、`action`、`source`、`discord_id` 做 `ilike` 模糊比對（300ms debounce），因此可搜尋全部日誌而非僅目前載入的頁面。`user_id` 為 UUID 欄位，僅在輸入完整 UUID 時以 `eq` 比對（UUID 無法使用 `ilike`）。
- **層級篩選**：以 `level=in.(info,warn,error,fatal)` 於伺服器端過濾，切換篩選或搜尋時自動回到第 1 頁。
