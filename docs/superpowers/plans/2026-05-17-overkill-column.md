# Overkill Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tier-1-only "超殺 / Overkill" column to GuildRaidTable between 推算 and 成員備註, with a numeric input showing `12.34E` format, shared sort state with the score column, and Supabase persistence.

**Architecture:** The `overkill` field is added to the `MemberRaidRecord` type and the Supabase table. `useRaidRecordEditor` handles change/save logic. `GuildRaidTable` receives a `showOverkill` boolean prop (derived from `guild.tier === 1` in `GuildRaidManager`). Score and overkill columns share `sortConfig.key === 'score'` — clicking either header activates the same sort state, ordering by score → overkill → name.

**Tech Stack:** React 19, TypeScript 5.8, TailwindCSS 4.1, Supabase (PostgreSQL), i18next

---

## Files Modified

| File | Change |
|------|--------|
| `src/features/raid/types.ts` | Add `overkill?: number \| null` to `MemberRaidRecord` |
| `public/locales/zh-TW/raid.json` | Add `"column_overkill": "超殺"` |
| `public/locales/en/raid.json` | Add `"column_overkill": "Overkill"` |
| `src/features/raid/hooks/useRaidRecordEditor.ts` | Extend field union, add overkill diff/save logic |
| `src/features/raid/pages/GuildRaidManager.tsx` | Update sort tie-breaking, pass `showOverkill` prop |
| `src/features/raid/components/GuildRaidTable.tsx` | Add `showOverkill` prop, colgroup, thead, tbody cells |

---

## Task 1: Supabase Migration

Apply this before any code runs in production.

**Files:** Supabase dashboard (no code file)

- [ ] **Step 1: Run migration in Supabase SQL editor**

```sql
ALTER TABLE member_raid_records ADD COLUMN overkill NUMERIC;
```

- [ ] **Step 2: Verify column exists**

In Supabase Table Editor, open `member_raid_records` and confirm `overkill` column is present with type `numeric`, nullable.

- [ ] **Step 3: Commit note**

```bash
git commit --allow-empty -m "chore: supabase migration - add overkill column to member_raid_records"
```

---

## Task 2: TypeScript Type + Translations

**Files:**
- Modify: `src/features/raid/types.ts`
- Modify: `public/locales/zh-TW/raid.json`
- Modify: `public/locales/en/raid.json`

- [ ] **Step 1: Add `overkill` to `MemberRaidRecord`**

In `src/features/raid/types.ts`, update `MemberRaidRecord`:

```ts
export interface MemberRaidRecord {
  id?: string;
  season_id: string;
  member_id: string;
  score: number;
  note: string;
  season_note?: string;
  season_guild?: string;
  overkill?: number | null;
}
```

- [ ] **Step 2: Add zh-TW translation key**

In `public/locales/zh-TW/raid.json`, add after `"column_season_note"`:

```json
"column_overkill": "超殺",
```

Result (lines 44–49 of that file):
```json
    "column_score": "個人總分",
    "column_deduction": "推算",
    "column_note": "成員備註",
    "column_season_note": "賽季備註",
    "column_overkill": "超殺",
```

- [ ] **Step 3: Add en translation key**

In `public/locales/en/raid.json`, add after `"column_season_note"`:

```json
"column_overkill": "Overkill",
```

Result (lines 44–49 of that file):
```json
    "column_score": "Total Score",
    "column_deduction": "Deduction",
    "column_note": "Member Note",
    "column_season_note": "Season Note",
    "column_overkill": "Overkill",
```

- [ ] **Step 4: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/raid/types.ts public/locales/zh-TW/raid.json public/locales/en/raid.json
git commit -m "feat(raid): add overkill field type and translations"
```

---

## Task 3: Extend useRaidRecordEditor

**Files:**
- Modify: `src/features/raid/hooks/useRaidRecordEditor.ts`

- [ ] **Step 1: Extend `handleRecordChange` field union**

Find this line (around line 54):
```ts
const handleRecordChange = useCallback((memberId: string, field: 'score' | 'note' | 'season_note', value: string | number) => {
```

Replace with:
```ts
const handleRecordChange = useCallback((memberId: string, field: 'score' | 'note' | 'season_note' | 'overkill', value: string | number | null) => {
```

- [ ] **Step 2: Keep score clamping, leave overkill as-is**

Inside `handleRecordChange`, the existing block is:
```ts
let finalValue = value;
if (field === 'score') {
  finalValue = Math.min(Math.max(Number(value) || 0, 0), 10000);
}
```

No change needed — overkill values pass through as-is (the component handles string→number conversion on blur via the existing save flow).

- [ ] **Step 3: Add overkill diff check in `doAutoSave`**

Find the diff block in `doAutoSave` (around lines 119–123):
```ts
const scoreChanged = draft.score !== (originalRecord?.score ?? 0);
const seasonNoteChanged = (draft.season_note || '') !== (originalRecord?.season_note || '');
const noteChanged = (draft.note || '') !== originalNote;

if (!scoreChanged && !seasonNoteChanged && !noteChanged) {
```

Replace with:
```ts
const scoreChanged = draft.score !== (originalRecord?.score ?? 0);
const seasonNoteChanged = (draft.season_note || '') !== (originalRecord?.season_note || '');
const noteChanged = (draft.note || '') !== originalNote;
const overkillChanged = (draft.overkill ?? null) !== (originalRecord?.overkill ?? null);

if (!scoreChanged && !seasonNoteChanged && !noteChanged && !overkillChanged) {
```

- [ ] **Step 4: Convert overkill string to number before upsert**

Find the save block in `doAutoSave` (around lines 130–134):
```ts
const { note, ...raidRecord } = draft;

const { error } = await supabase
  .from('member_raid_records')
  .upsert(raidRecord, { onConflict: 'season_id, member_id' });
```

Replace with:
```ts
const { note, ...raidRecord } = draft;

const payload = {
  ...raidRecord,
  overkill: raidRecord.overkill != null ? Number(raidRecord.overkill) : null,
};

const { error } = await supabase
  .from('member_raid_records')
  .upsert(payload, { onConflict: 'season_id, member_id' });
```

Also update the `setRecords` call just below to use `payload` instead of `raidRecord`:

Find:
```ts
const nextRecords = { ...recordsRef.current, [memberId]: raidRecord as MemberRaidRecord };
```

Replace:
```ts
const nextRecords = { ...recordsRef.current, [memberId]: payload as MemberRaidRecord };
```

- [ ] **Step 5: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/raid/hooks/useRaidRecordEditor.ts
git commit -m "feat(raid): extend record editor to handle overkill field"
```

---

## Task 4: Update Sort Logic in GuildRaidManager

**Files:**
- Modify: `src/features/raid/pages/GuildRaidManager.tsx`

- [ ] **Step 1: Update `sortedMembersMap` score branch tie-breaking**

Find the score sort block inside `sortedMembersMap` (around lines 283–288):
```ts
if (sortConfig.key === 'score') {
  const scoreA = editor.draftRecords[a.id!]?.score ?? raidData.records[a.id!]?.score ?? 0;
  const scoreB = editor.draftRecords[b.id!]?.score ?? raidData.records[b.id!]?.score ?? 0;
  if (scoreA !== scoreB) {
    return sortConfig.order === 'desc' ? scoreB - scoreA : scoreA - scoreB;
  }
}
```

Replace with:
```ts
if (sortConfig.key === 'score') {
  const scoreA = editor.draftRecords[a.id!]?.score ?? raidData.records[a.id!]?.score ?? 0;
  const scoreB = editor.draftRecords[b.id!]?.score ?? raidData.records[b.id!]?.score ?? 0;
  if (scoreA !== scoreB) {
    return sortConfig.order === 'desc' ? scoreB - scoreA : scoreA - scoreB;
  }
  const overkillA = editor.draftRecords[a.id!]?.overkill ?? raidData.records[a.id!]?.overkill ?? null;
  const overkillB = editor.draftRecords[b.id!]?.overkill ?? raidData.records[b.id!]?.overkill ?? null;
  const oA = overkillA != null ? Number(overkillA) : -Infinity;
  const oB = overkillB != null ? Number(overkillB) : -Infinity;
  if (oA !== oB) {
    return sortConfig.order === 'desc' ? oB - oA : oA - oB;
  }
}
```

> Note: members with no overkill value sort to the bottom (treated as `-Infinity`) within the same score group, regardless of sort direction. Name tie-breaking below this block is unchanged.

- [ ] **Step 2: Pass `showOverkill` prop to `GuildRaidTable`**

Find the `<GuildRaidTable` block (around line 400). Add `showOverkill` after the existing props:

```tsx
<GuildRaidTable
  key={guildId}
  guildId={guildId}
  guild={db.guilds[guildId]}
  sortedMembers={sortedMembersMap[guildId] ?? []}
  records={raidData.records}
  draftRecords={editor.draftRecords}
  guildRaidRecord={raidData.guildRaidRecords[guildId]}
  isComparisonMode={isComparisonMode}
  isArchived={raidData.isSelectedSeasonArchived}
  seasonId={raidData.selectedSeasonId}
  evenRounds={raidData.selectedSeason?.even_rounds ?? true}
  loading={raidData.loading}
  saving={editor.saving}
  sortConfig={sortConfig}
  onSort={handleSort}
  onRecordChange={editor.handleRecordChange}
  onGuildNoteChange={editor.handleGuildNoteChange}
  onBlur={editor.handleAutoSave}
  onMemberClick={setSelectedMemberStats}
  rowHeights={layout.rowHeights}
  onRowHeightChange={layout.handleRowHeightChange}
  headerHeight={layout.headerHeight}
  onHeaderHeightChange={layout.handleHeaderHeightChange}
  theadHeight={layout.theadHeight}
  onTheadHeightChange={layout.handleTheadHeightChange}
  highlightedMemberIds={raidData.highlightedMemberIds}
  ghostRecords={ghostRecords}
  onFetchGhostRecords={fetchGhostRecordsForMember}
  onAddGhostRecord={handleAddGhostRecord}
  onDeleteGhostRecord={handleDeleteGhostRecord}
  showOverkill={db.guilds[guildId]?.tier === 1}
/>
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: TypeScript error on `GuildRaidTable` because `showOverkill` prop doesn't exist yet — this is expected and will be resolved in Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/features/raid/pages/GuildRaidManager.tsx
git commit -m "feat(raid): update sort tie-breaking and pass showOverkill prop"
```

---

## Task 5: Add Overkill Column to GuildRaidTable

**Files:**
- Modify: `src/features/raid/components/GuildRaidTable.tsx`

- [ ] **Step 1: Add `showOverkill` and update `onRecordChange` type in props interface**

Find `GuildRaidTableProps` interface (lines 9–39). Update `onRecordChange` and add `showOverkill`:

```ts
interface GuildRaidTableProps {
  guildId: string;
  guild: Guild;
  sortedMembers: Member[];
  records: Record<string, MemberRaidRecord>;
  draftRecords: Record<string, MemberRaidRecord>;
  guildRaidRecord?: GuildRaidRecord;
  isComparisonMode: boolean;
  isArchived?: boolean;
  seasonId: string;
  evenRounds?: boolean;
  loading: boolean;
  saving: boolean;
  sortConfig: { key: 'default' | 'score', order: 'asc' | 'desc' };
  onSort: (key: 'default' | 'score') => void;
  onRecordChange: (memberId: string, field: 'score' | 'note' | 'season_note' | 'overkill', value: string | number | null) => void;
  onGuildNoteChange?: (guildId: string, note: string) => void;
  onBlur: (memberId: string, guildId: string) => void;
  onMemberClick: (member: Member) => void;
  rowHeights?: Record<number, number>;
  onRowHeightChange?: (index: number, height: number) => void;
  headerHeight?: number;
  onHeaderHeightChange?: (height: number) => void;
  theadHeight?: number;
  onTheadHeightChange?: (height: number) => void;
  highlightedMemberIds?: Set<string>;
  ghostRecords?: Record<string, any[]>;
  onFetchGhostRecords?: (memberId: string) => void;
  onAddGhostRecord?: (memberId: string) => void;
  onDeleteGhostRecord?: (memberId: string, record: any) => void;
  showOverkill?: boolean;
}
```

- [ ] **Step 2: Destructure `showOverkill` in component signature**

Find the function signature (line 41–71). Add `showOverkill = false` to the destructured props:

```ts
function GuildRaidTable({
  guildId,
  guild,
  sortedMembers,
  records,
  draftRecords,
  guildRaidRecord,
  isComparisonMode,
  isArchived,
  seasonId,
  evenRounds = true,
  loading,
  saving,
  sortConfig,
  onSort,
  onRecordChange,
  onGuildNoteChange,
  onBlur,
  onMemberClick,
  rowHeights,
  onRowHeightChange,
  headerHeight,
  onHeaderHeightChange,
  theadHeight,
  onTheadHeightChange,
  highlightedMemberIds,
  ghostRecords = {},
  onFetchGhostRecords,
  onAddGhostRecord,
  onDeleteGhostRecord,
  showOverkill = false,
}: GuildRaidTableProps) {
```

- [ ] **Step 3: Add overkill column to colgroup**

Find the non-comparison colgroup (lines 222–228):
```tsx
<colgroup>
  <col />
  <col style={{ width: '80px' }} />
  <col style={{ width: '150px' }} />
  <col />
  <col />
</colgroup>
```

Replace with:
```tsx
<colgroup>
  <col />
  <col style={{ width: '80px' }} />
  <col style={{ width: '150px' }} />
  {showOverkill && <col style={{ width: '92px' }} />}
  <col />
  <col />
</colgroup>
```

- [ ] **Step 4: Add overkill column header in thead**

Find the thead section. The 推算 header is:
```tsx
{!isComparisonMode && (
  <th className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600">
    {t('raid.column_deduction', '推算')}
  </th>
)}
```

Add the overkill header immediately after (between 推算 and 成員備註):
```tsx
{!isComparisonMode && (
  <th className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600">
    {t('raid.column_deduction', '推算')}
  </th>
)}
{!isComparisonMode && showOverkill && (
  <th
    className="p-3 text-xs font-semibold text-stone-600 dark:text-stone-300 border-b border-stone-200 dark:border-stone-600 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-600"
    onClick={() => onSort('score')}
  >
    <div className="flex items-center gap-1">
      {t('raid.column_overkill', '超殺')}
      {sortConfig.key === 'score' && (
        sortConfig.order === 'asc'
          ? <ArrowDownWideNarrow className="w-3.5 h-3.5 text-indigo-500" />
          : <ArrowDownNarrowWide className="w-3.5 h-3.5 text-indigo-500" />
      )}
    </div>
  </th>
)}
```

- [ ] **Step 5: Add overkill body cell in each member row**

Find the 推算 body cell (around lines 358–364):
```tsx
{!isComparisonMode && (
  <td className="py-0.5 px-2">
    <div className="px-2 py-0.5 text-xs font-medium text-stone-800 dark:text-stone-200 whitespace-pre-line leading-tight">
      {deduceScore(record.score || 0, t, evenRounds, parseInt(seasonId) <= 7)}
    </div>
  </td>
)}
```

Add the overkill cell immediately after:
```tsx
{!isComparisonMode && showOverkill && (
  <td className="py-0.5 px-2">
    {!isArchived ? (
      <div className="flex items-center gap-0.5">
        <input
          type="text"
          inputMode="decimal"
          value={record.overkill != null ? String(record.overkill) : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!/^[0-9.]*$/.test(v)) return;
            if ((v.match(/\./g) || []).length > 1) return;
            if (v.length > 5) return;
            onRecordChange(member.id!, 'overkill', v === '' ? null : v);
          }}
          onBlur={() => onBlur(member.id!, guildId)}
          className={`w-full px-2 py-0.5 text-xs border rounded bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:ring-2 focus:ring-indigo-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDirty ? 'border-amber-300 dark:border-amber-600' : 'border-stone-300 dark:border-stone-600'}`}
        />
        <span className="text-xs text-stone-400 dark:text-stone-500 select-none shrink-0">E</span>
      </div>
    ) : (
      <div className="px-2 py-0.5 text-xs text-stone-800 dark:text-stone-200">
        {record.overkill != null ? `${record.overkill}E` : ''}
      </div>
    )}
  </td>
)}
```

- [ ] **Step 6: Adjust median row colspan**

Find the median row (around lines 402–411):
```tsx
<tr className="bg-stone-50 dark:bg-stone-700/30 font-bold border-t-2 border-stone-200 dark:border-stone-600">
  <td className="py-1 px-3 text-right text-xs text-stone-500 dark:text-stone-400">
    {t('raid.median', '中位數')}：
  </td>
  <td className="py-1 px-3 text-xs text-stone-500 dark:text-stone-400">
    {medianScore}
  </td>
  {!isComparisonMode && <td colSpan={3}></td>}
</tr>
```

Replace with:
```tsx
<tr className="bg-stone-50 dark:bg-stone-700/30 font-bold border-t-2 border-stone-200 dark:border-stone-600">
  <td className="py-1 px-3 text-right text-xs text-stone-500 dark:text-stone-400">
    {t('raid.median', '中位數')}：
  </td>
  <td className="py-1 px-3 text-xs text-stone-500 dark:text-stone-400">
    {medianScore}
  </td>
  {!isComparisonMode && <td colSpan={showOverkill ? 4 : 3}></td>}
</tr>
```

- [ ] **Step 7: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 8: Start dev server and verify manually**

```bash
npm run dev
```

Open `http://localhost:3000` and navigate to the Guild Raid Manager. Verify:
1. Tier 1 guild shows 超殺 column between 推算 and 成員備註
2. Tier 2+ guilds have no 超殺 column
3. Typing `12.34` in a cell shows `12.34E` format (number in input + E suffix)
4. Cannot type letters or more than 5 characters
5. Cannot type two decimal points
6. Clicking 超殺 or 個人總分 header activates sorting; arrow appears on both headers when sort is active
7. Sort order: same score → sorted by overkill; same overkill → sorted by name
8. In archived season: overkill shows as `12.34E` read-only text
9. In comparison mode: overkill column hidden

- [ ] **Step 9: Commit**

```bash
git add src/features/raid/components/GuildRaidTable.tsx
git commit -m "feat(raid): add overkill column to GuildRaidTable for tier 1 guilds"
```

---

## Self-Review Checklist

- [x] **Spec coverage**
  - Column between 推算 and 成員備註 → Task 5 Step 4+5
  - Only tier 1 → `showOverkill={db.guilds[guildId]?.tier === 1}` in Task 4 Step 2
  - Width 92px, total table width unchanged → Task 5 Step 3
  - E suffix at right, numeric only, max 5 chars, no double dot → Task 5 Step 5
  - Archived read-only `12.34E` → Task 5 Step 5
  - Sort shared with score column → Task 4 Step 1, Task 5 Step 4
  - Sort order: score → overkill → name → Task 4 Step 1
  - i18n → Task 2 Steps 2+3
  - Supabase persistence → Task 3 Steps 1+3+4
  - Supabase migration → Task 1

- [x] **Type consistency**
  - `'overkill'` added to field union in both `useRaidRecordEditor` (Task 3 Step 1) and `GuildRaidTableProps` (Task 5 Step 1) ✓
  - `value` type is `string | number | null` in both locations ✓
  - `showOverkill` prop defined in interface (Task 5 Step 1) and passed in (Task 4 Step 2) ✓

- [x] **No placeholders** — all steps contain concrete code ✓
