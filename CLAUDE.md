# Kazran Alliance System

## 專案概述

公會管理與戰記追蹤系統（棕色塵埃2相關），功能涵蓋成員管理、隊伍編成、戰記紀錄、服裝/武器追蹤及各類工具。
部署於 GitHub Pages：`https://mafflereich.github.io/kazran-alliance-system/`

## 技術棧

| 類別 | 技術 |
|------|------|
| 框架 | React 19 + TypeScript 5.8 |
| 建置 | Vite 6.2 |
| 樣式 | TailwindCSS 4.1 |
| 狀態管理 | React Context（全域）+ Zustand（功能層） |
| 路由 | React Router DOM 7 |
| 後端/資料庫 | Supabase（PostgreSQL） |
| 驗證 | Supabase Auth（Discord OAuth + Email/Password） |
| UI 元件 | Radix UI |
| 國際化 | i18next（zh-TW、en） |
| 動畫 | Motion |
| 拖放 | @dnd-kit |
| 分析 | Google Analytics 4 |
| E2E 測試 | Playwright |

## 常用指令

```bash
npm run dev          # 開發伺服器（port 3000）
npm run build        # 建置（先執行 generate-meta.js 產生版本資訊）
npm run lint         # TypeScript 型別檢查（tsc --noEmit）
npm run test:e2e     # Playwright E2E 測試
npm run deploy       # 部署至 GitHub Pages
```

## 目錄結構

```
src/
├── app/              # 應用程式初始化、路由、Provider
├── features/         # 功能模組（Feature-Sliced Design）
│   ├── admin/        #   管理後台
│   ├── arcade/       #   遊戲工具（精煉模擬器等）
│   ├── auth/         #   登入驗證
│   ├── guild/        #   公會儀表板、服裝管理
│   ├── mailbox/      #   申請信箱
│   ├── member/       #   成員/隊伍管理看板
│   ├── raid/         #   戰記管理與紀錄
│   └── toolbox/      #   實用工具
├── shared/           # 共用 UI、API 輔助、工具函式、i18n
│   ├── ui/           #   共用元件（Modal、Toast、Header 等）
│   ├── api/          #   Supabase client 與輔助函式
│   ├── lib/          #   工具函式（RBAC、Tier 樣式等）
│   └── i18n/         #   國際化設定
├── entities/         # 資料型別定義
├── store/            # 全域 AppContext
└── hooks/            # 全域 hooks
```

## 關鍵檔案

- `src/store/index.tsx` — 全域狀態（AppContext），包含所有 CRUD 操作
- `src/shared/api/supabase.ts` — Supabase client、camelCase ↔ snake_case 轉換輔助
- `src/shared/lib/access.ts` — RBAC 權限定義
- `src/app/routes.tsx` — 路由設定（lazy loading + ProtectedRoute）
- `src/shared/i18n/index.ts` — i18next 設定
- `public/locales/` — 翻譯檔（zh-TW、en）

## 環境變數

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GA_MEASUREMENT_ID
```

## 重要慣例

- **資料庫欄位**使用 snake_case，**前端物件**使用 camelCase，透過 `toCamel()`/`toSnake()` 轉換
- **功能模組**遵循 `pages/ → components/ → utils/ → hooks/` 結構
- **權限控制**透過 `ProtectedRoute` + `canUserAccessPage()` 實施
- **錯誤處理**統一使用 try-catch + Toast 通知
- **翻譯**所有使用者可見文字使用 `t()` 函式

## 延伸文件

當處理相關主題時，請參閱以下文件：

| 文件 | 說明 |
|------|------|
| [.claude/docs/architectural_patterns.md](.claude/docs/architectural_patterns.md) | 架構模式、設計決策與慣例（狀態管理、API 設計、RBAC、i18n 等） |
