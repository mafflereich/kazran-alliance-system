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

## 4. 下一步：實作計畫
- **Step 2: 前端 Logger 模組**
  建立共用的 `Logger` 工具函式 (例如 `src/shared/utils/logger.ts`)，封裝 Supabase 的 `insert` 操作，讓各個 React 元件可以輕鬆呼叫 `Logger.info()` 或 `Logger.error()`。
- **Step 3: Edge Function 整合**
  修改 `sync-discord-roles` 等 Edge Functions，在 `catch` 區塊中捕捉錯誤，並將詳細的錯誤訊息與變數狀態寫入 `system_logs`。
- **Step 4: 後台監控介面 (已實作)**
  已在 Admin Panel 中新增「系統日誌」頁面，讓管理員直接在網頁上查看與篩選系統日誌。
