# GuildRaidManager — Architecture & Logic

## Overview

`src/features/raid/pages/GuildRaidManager.tsx`

公會戰記分數管理頁面。僅限 manager / admin / creator 角色存取。負責協調賽季選擇、成員分數輸入、公會中位數計算、即時同步，以及賽季生命週期操作（新增、歸檔、刪除資料）。

**主要依賴**
- `supabase` — 資料庫讀寫、Realtime 訂閱，以及歸檔後直接查詢下一賽季資料
- `AppContext (useAppContext)` — 全域 db、userRole、userGuildRoles、updateMember、fetchAllMembers
- `useGhostRecords` — 幽靈成員紀錄管理（`ghostRecords`, `fetchGhostRecordsForMember`, `handleAddGhostRecord`, `handleDeleteGhostRecord`）
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

### `useRaidData(fetchAllMembers, updateMemberNote)`
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
| `member_notes_all` | member_notes | INSERT/UPDATE | updateMemberNote（增量更新單一成員）+ 閃爍 |
| | | DELETE | updateMemberNote（清除 note/isReserved/archiveRemark）+ 閃爍 |

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
- `handleBulkScoreFill(guildId, score, memberIds)` — 一鍵批次填分：合併既有紀錄與未儲存草稿（剔除 note），單次 upsert `member_raid_records`，清除該批草稿，重算一次公會中位數。回傳 `boolean` 表示成功與否
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

### `useMemberMoveAnnounce(selectedSeasonId, archivedSeasonRecords, nextSeasonRecords, members, guilds, isSelectedSeasonArchived)`
`src/features/raid/hooks/useMemberMoveAnnounce.ts`

比對兩個賽季的 `season_guild` 欄位，生成各公會的成員移動摘要（招收 / 送出）。由 `SeasonActionsPanel` 透過 `MemberMoveAnnounceTab` 呈現並複製公告文字。**Discord 公告生成邏輯集中於 GuildRaidManager，不在 MemberBoard。**

**兩種比對模式**（由 `isNextSeasonEmpty` 決定）

| 模式 | 條件 | 比對依據 |
|------|------|---------|
| `useCurrentGuildAsNext = true` | `nextSeasonRecords` 為空 | 歸檔賽季 `season_guild` vs 成員當前 `member.guildId` |
| `useCurrentGuildAsNext = false` | `nextSeasonRecords` 有資料 | 歸檔賽季 `season_guild` vs 下一賽季 `season_guild` |

**成員移動類型**
- 僅出現在下一賽季（或當前）→ **recruit**（`fromGuild: ''`）
- 僅出現在歸檔賽季 → **kick**（`toGuild: ''`）
- 兩季皆有且公會不同 → **move**

**注意**：成員名稱優先從 `members` 陣列取，若不存在（尚未同步至 `db.members`）則 fallback 至 raid record 的 `member_id`。

**返回值**
| 欄位 | 說明 |
|------|------|
| `moveSummaries` | `GuildMoveSummary[]`，各公會的送出/招收清單 |
| `loading` | 是否計算中 |

---

### `nextSeasonRecords` fetch（GuildRaidManager 內部 useEffect）

當 `isSelectedSeasonArchived = true` 時，於 `GuildRaidManager` 直接查詢下一賽季的 `member_raid_records`。

**查找順序**
1. 從 `raidData.seasons` 找 `season_number === currentSeasonNum + 1`
2. 若未找到（新賽季尚未載入），直接查 `raid_seasons` 表，以 `season_number` 為鍵

**deps**：`[raidData.isSelectedSeasonArchived, raidData.selectedSeason?.season_number, raidData.selectedSeason?.id]`（使用純量值避免 object reference 造成 stale closure）

---

### `useGuildStats(canManage, targetTier, allowedGuildIds?)`
`src/features/raid/hooks/useGuildStats.ts`

掛載時查詢一次 `members`（`status = 'active'`）計算各公會成員數，其餘為 `useMemo` 衍生資料。直接呼叫 `useAppContext()` 取得 `db`。

| 返回值 | 說明 |
|--------|------|
| `availableGuilds` | 過濾後排序的公會列表（canManage 看全部，否則只看同 tier） |
| `guildsByTier` | 依 tier 分組的公會 |
| `guildMemberCounts` | 各公會 active 成員數（`fetchAllPaginated` 的 select 必須包含 `id`，否則 keyset 分頁拿不到游標、只會回傳第一頁 → 缺少人數算錯） |

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
          └── BulkScoreFillModal（conditional）
                一鍵輸入分數：兩步 Modal（輸入分數 + 勾選成員 → 確認摘要），
                按鈕位於表格底部中位數列下方，僅非歸檔且非比較模式時顯示
└── MemberStatsModal（conditional）
      點擊成員後顯示歷史統計
```

**Props 傳遞重點**
- `GuildRaidTable.onBlur: (memberId, guildId) => void` → 直接傳 `editor.handleAutoSave`（useCallback 穩定引用）
- `GuildRaidTable.onBulkScoreFill` → `editor.handleBulkScoreFill`；未傳時按鈕不渲染
- `GuildRaidTable.onFetchGhostRecords` → `fetchGhostRecordsForMember`（modal 打開時懶載入，已拉過不重複請求）
- `GuildRaidTable` 接收 `rowHeights / headerHeight / theadHeight` 及 onChange callback，實現跨表格行高同步
- `SeasonActionsPanel` 改為接收 `archivedSeasonRecords`（當前已歸檔賽季）和 `nextSeasonRecords`（下一賽季），取代原本的單一 `records` prop

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
| `nextSeasonRecords` + fetch useEffect | 當前賽季已歸檔時，查詢下一賽季紀錄；供 SeasonActionsPanel 做成員移動比對 |
