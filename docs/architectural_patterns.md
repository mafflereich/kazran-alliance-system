# 架構模式與設計慣例

## 1. 狀態管理：雙層策略

### 全域狀態：React Context (AppContext)
- **位置**：`src/store/index.tsx`
- **用途**：管理使用者驗證、公會資料、成員資料、Toast 通知等全域狀態
- **存取方式**：透過 `useAppContext()` hook
- **範例**：`src/features/guild/pages/GuildDashboard.tsx:20`、`src/features/auth/pages/Login.tsx:15`

### 功能層狀態：Zustand
- **位置**：`src/features/member/components/MemberBoard/store/useMemberBoardStore.ts`
- **用途**：元件層級的複雜狀態（如 undo/redo、多選、草稿）
- **持久化**：使用 localStorage 儲存草稿，鍵名 `'memberBoardDraft'`

**原則**：全域共用資料放 AppContext，功能模組內部複雜狀態用 Zustand。

---

## 2. 資料存取：Supabase 輔助函式 + camelCase 轉換

- **位置**：`src/shared/api/supabase.ts`
- **核心函式**：`supabaseInsert<T>()`（行 39）、`supabaseUpdate<T>()`（行 59）、`supabaseUpsert<T>()`（行 85）
- **轉換**：`toCamel()`（行 25）將 DB 回應轉為 camelCase；`toSnake()`（行 32）將本地物件轉為 snake_case
- **錯誤處理**：所有資料操作使用 try-catch + Toast 通知

**使用範例**：
- `src/store/index.tsx` — AppContext 的 CRUD 方法
- `src/features/raid/pages/GuildRaidManager.tsx` — 戰記管理
- `src/features/toolbox/components/FiendHunterBoard.tsx:72` — 工具箱資料

---

## 3. 功能切片架構（Feature-Sliced Design）

每個功能模組遵循統一目錄結構：

```
src/features/{feature}/
├── pages/          # 頁面元件（處理狀態與權限）
├── components/     # 展示元件（接收 props 渲染）
├── utils/          # 功能專屬工具函式
├── hooks/          # 功能專屬 hooks
└── store/          # 功能專屬 Zustand store（如需要）
```

**現有功能模組**：`admin`、`arcade`、`auth`、`guild`、`mailbox`、`member`、`raid`、`toolbox`

---

## 4. 權限控制：角色基礎存取控制（RBAC）

- **角色定義**：`src/shared/lib/access.ts`
  - `getDefaultRoles(pageId)`（行 11）— 各頁面預設可存取角色
  - `canUserAccessPage()`（行 32）— 檢查使用者權限（後台 `access_control` 為唯一依據，未設定才用預設值）
  - `canUserAccessGuildPage()`（行 57）— 公會級頁面（`guild_raid_manager` / `member_board`）權限：
    creator / admin 一律放行；其餘使用者依後台勾選的角色，公會正/副會長等同 MANAGER（需勾選 MANAGER 才放行）
- **角色層級**：`creator` > `admin` > `manager` > `member`
- **路由保護**：`src/shared/ui/ProtectedRoute.tsx` 包裝受保護路由
- **路由設定**：`src/app/routes.tsx:32-47` — 各路由指定 `pageId`

---

## 5. 路由：Lazy Loading + Suspense

- **設定**：`src/app/routes.tsx`
- **模式**：所有頁面元件使用 `lazy()` 動態載入（行 6-14）
- **Fallback**：Suspense 包裝，顯示載入文字（行 28）

---

## 6. 表單處理模式

### Modal 表單
- **共用元件**：`src/shared/ui/ConfirmModal.tsx`、`src/shared/ui/InputModal.tsx`
- **功能 Modal**：`src/features/guild/components/MemberEditModal.tsx`、`src/features/raid/components/MemberStatsModal.tsx`
- **流程**：開啟 Modal → 本地 state 管理表單值 → 呼叫 Context 方法儲存 → Toast 回饋

### 表格內行內編輯
- **範例**：`src/features/raid/components/GuildRaidTable.tsx`
- **模式**：使用 `draftRecords` vs `records` 區分編輯態與儲存態

---

## 7. 國際化（i18n）

- **設定**：`src/shared/i18n/index.ts`
- **翻譯檔**：`public/locales/{lang}/{namespace}.json`
- **命名空間**：`translation`、`admin`、`arcade`、`mailbox`、`common`、`toolbox`、`raid`
- **語言**：zh-TW（預設）、en
- **強制導向**：所有 `zh-*` 變體導向 `zh-TW`（行 43-47）
- **使用**：`const { t } = useTranslation()` → `t('key')`

---

## 8. 主題系統

- **位置**：`src/app/providers/ThemeContext.tsx`
- **模式**：三態循環（light → dark → system）
- **偵測**：`window.matchMedia('(prefers-color-scheme: dark)')` 偵測系統偏好
- **持久化**：localStorage 鍵 `'themePreference'`
- **應用**：`document.documentElement.classList.toggle('dark')`

---

## 9. 系統紀錄

- **位置**：`src/shared/utils/logger.ts`
- **方法**：`Logger.info()`、`Logger.warn()`、`Logger.error()`、`Logger.fatal()`
- **儲存**：寫入 Supabase `system_logs` 資料表
- **安全性**：紀錄失敗不影響應用程式運作

---

## 10. 版本檢查與更新

- **位置**：`src/hooks/useVersionCheck.ts`
- **機制**：定期輪詢 `meta.json`，比對版本號，透過 `VersionUpdateToast` 提示使用者重新整理
- **頻率**：每 5 分鐘檢查一次（`src/app/App.tsx:30`）

---

## 11. 分析追蹤（Google Analytics 4）

- **位置**：`src/analytics.ts`
- **方法**：`initGA()`、`logPageView()`、`logEvent()`、`setUserId()`
- **追蹤點**：路由變更（`src/app/App.tsx:34`）、使用者操作（各功能頁面）
