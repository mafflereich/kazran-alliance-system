# GuildRaidManager — Architecture & Logic

## Overview

`src/features/raid/pages/GuildRaidManager.tsx`

公會戰記分數管理頁面。僅限 manager / admin / creator 角色存取。負責協調賽季選擇、成員分數輸入、公會中位數計算、即時同步，以及賽季生命週期操作（新增、歸檔、刪除資料）。

**主要依賴**
- `supabase` — 資料庫讀寫與 Realtime 訂閱
- `AppContext (useAppContext)` — 全域 db、userRole、userGuildRoles、updateMember、fetchAllMembers
- `useGhostRecords` — 幽靈成員紀錄管理
- `react-router-dom` — 導航至 /raid、/team

---

## 架構概覽

`GuildRaidManager` 是純容器元件，所有業務邏輯由 6 個 custom hooks 封裝。

```
GuildRaidManager (208 行)
├── useRaidData          ─ 資料獲取 + Realtime 訂閱
├── useRaidRecordEditor  ─ 草稿管理 + 自動儲存
├── useSeasonManager     ─ 賽季生命週期
├── useGuildStats        ─ 公會衍生資料（useMemo）
├── useTableLayout       ─ 比較模式表格行高同步
└── useGhostRecords      ─ 幽靈成員紀錄（已有）
```

---

## Shared Types

`src/features/raid/types.ts`

```ts
interface RaidSeason {
  id: string;
  season_number: number;
  period_text: string;
  description: string;
  even_rounds: boolean;
  is_archived?: boolean;
}

interface MemberRaidRecord {
  id?: string;
  season_id: string;
  member_id: string;
  score: number;
  note: string;         // 儲存於 member_notes 表的 note 欄位，非 member_raid_records
  season_note?: string;
  season_guild?: string;  // 歸檔時快照的公會 ID
}

interface GuildRaidRecord {
  season_id: string;
  guild_id: string;
  member_score_median: number;
  note?: string;
}
```

---

## Hooks

### `useRaidData(fetchAllMembers)`
`src/features/raid/hooks/useRaidData.ts`

管理所有遠端資料狀態與 Realtime 訂閱。

**管理的 state**
| 狀態 | 說明 |
|------|------|
| `seasons` | 所有賽季清單 |
| `selectedSeasonId` / `setSelectedSeasonId` | 目前選取的賽季 |
| `selectedSeason` | 衍生：找到的賽季物件 |
| `isSelectedSeasonArchived` | 衍生：是否已歸檔 |
| `records` / `setRecords` / `recordsRef` | 成員戰記紀錄（ref 供 async handler 避免 stale state） |
| `guildRaidRecords` / `setGuildRaidRecords` | 公會戰記紀錄 |
| `loading` | 初次載入中 |
| `highlightedMemberIds` | Realtime 更新閃爍效果的成員 ID 集合 |
| `error` | 錯誤訊息 |

**函式**
- `fetchSeasons()` — 拉取全部賽季，設 selectedSeasonId 為最新
- `fetchRecords(isBackground?)` — 並行查詢 member_raid_records + guild_raid_records
- `flashMember(memberId)` — 觸發 2 秒高亮閃爍

**Realtime 訂閱（3 個 channel，依 selectedSeasonId 重建）**
| Channel | 資料表 | 事件 | 副作用 |
|---------|--------|------|--------|
| `member_raid_records_{seasonId}` | member_raid_records | INSERT/UPDATE | 更新 records + 閃爍 |
| | | DELETE | 移除 records 對應項目 |
| `guild_raid_records_{seasonId}` | guild_raid_records | INSERT/UPDATE | 更新 guildRaidRecords |
| `member_notes_all` | member_notes | 任何 | fetchAllMembers + 閃爍 |

---

### `useRaidRecordEditor(options)`
`src/features/raid/hooks/useRaidRecordEditor.ts`

管理草稿編輯與自動儲存。直接呼叫 `useAppContext()` 取得 `db`、`updateMember`。

**接收參數**
```ts
{
  selectedSeasonId, isSelectedSeasonArchived, isComparisonMode,
  records, setRecords, recordsRef,
  guildRaidRecords, setGuildRaidRecords
}
```

**管理的 state**
- `draftRecords` — 尚未儲存的草稿（key: member_id）
- `saving` — 儲存中
- `error`

**函式**
- `handleRecordChange(memberId, field, value)` — 寫入 draftRecords，score 限制 0–10000
- `handleAutoSave(memberId, guildId)` — diff draft vs committed；有變更才 upsert；note 有變更另存 updateMember；score 有變更重算 guild median
- `updateGuildMedian(guildId, customRecords?)` — 計算非零分數中位數，upsert guild_raid_records
- `handleGuildNoteChange(guildId, note)` — upsert guild note

**自動清除草稿**：`selectedSeasonId` 或 `isComparisonMode` 變更時清空 draftRecords

---

### `useSeasonManager(options)`
`src/features/raid/hooks/useSeasonManager.ts`

賽季生命週期管理。直接呼叫 `useAppContext()` 取得 `db`。

**接收參數**
```ts
{
  selectedSeasonId, seasons, setSeasons, setSelectedSeasonId,
  records, setRecords,
  updateGuildMedian,  // 來自 useRaidRecordEditor
  fetchRecords        // 來自 useRaidData
}
```

**管理的 state**
- `saving`, `archiving`, `isDeleting` — 操作狀態
- `isSeasonPanelOpen`, `setIsSeasonPanelOpen` — 面板開關
- `activeSeasonTab`, `setActiveSeasonTab` — 面板分頁（add/archive/delete）
- `newSeason`, `setNewSeason` — 新賽季表單
- `keepScores`, `keepSeasonNotes` — 複製前季選項
- `error`

**函式**
- `handleSaveSeason(e)` — 新增賽季 → 複製前季公會備註 → 選擇性複製成員分數/備註
- `handleArchiveSeason()` — 快照 season_guild → 更新所有公會 median → 標記 is_archived=true
- `handleDeleteRecords(type)` — 批次清空當季所有 score 或 season_note

**自動同步**：seasons 改變時更新 `newSeason.season_number` = maxSeason + 1

---

### `useGuildStats(canManage, targetTier)`
`src/features/raid/hooks/useGuildStats.ts`

純衍生資料，無 side effect。直接呼叫 `useAppContext()` 取得 `db`。

| 返回值 | 說明 |
|--------|------|
| `availableGuilds` | 過濾後排序的公會列表（canManage 看全部，否則只看同 tier） |
| `guildsByTier` | 依 tier 分組的公會 |
| `guildMemberCounts` | 各公會非 archived 成員數 |

---

### `useTableLayout(selectedSeasonId, isComparisonMode, sortConfig)`
`src/features/raid/hooks/useTableLayout.ts`

比較模式多表格對齊用的 UI 狀態。

| 返回值 | 說明 |
|--------|------|
| `rowHeights` | 各資料列最大高度（index → px，只增不減） |
| `headerHeight` | 公會標頭區塊最大高度 |
| `theadHeight` | 欄位標頭列最大高度 |
| `handleRowHeightChange` / `handleHeaderHeightChange` / `handleTheadHeightChange` | 由子表格回呼，取最大值 |

`selectedSeasonId`、`isComparisonMode`、`sortConfig` 任一改變時全部重置。

---

## Component Composition

```
GuildRaidManager
├── TopControlBar
│     賽季下拉選單、比較模式切換、賽季管理按鈕、導航連結
├── SeasonActionsPanel
│     新增 / 歸檔 / 刪除資料三個分頁的操作表單
├── [error banner]
├── GuildSelection
│     依 tier 分組的公會切換按鈕，顯示成員數
└── [grid: grid-cols-1 或 grid-cols-N（比較模式，最多 4）]
    └── GuildRaidTable × selectedGuildIds.length
          成員列表、分數輸入、排序、公會備註、幽靈成員
└── MemberStatsModal（conditional）
      點擊成員後顯示歷史統計
```

**Props 傳遞重點**
- `GuildRaidTable.onBlur` → `editor.handleAutoSave(memberId, guildId)`
- `GuildRaidTable` 接收 `rowHeights / headerHeight / theadHeight` 及 onChange callback，實現跨表格行高同步

---

## 組件內保留的邏輯

| 項目 | 原因 |
|------|------|
| `canManage`、`targetTier` | 簡單衍生，直接讀 userRole/userGuildRoles |
| `selectedGuildIds` + `handleGuildToggle` | 純 UI 模式選擇，與多個 hook 無直接關聯 |
| `sortConfig` + `handleSort` | 渲染排序，與 `useTableLayout` 共用參數 |
| `selectedMemberStats` | Modal 控制，單純 UI state |
| `getSortedMembers(guildId)` | 依賴多個 hook 的資料，保留在組件較清晰 |
| `getTierColorActive(tier)` | 純 UI 工具函式 |
| `handleAddGhostRecord` | 薄包裝，傳入 selectedSeason.season_number |
