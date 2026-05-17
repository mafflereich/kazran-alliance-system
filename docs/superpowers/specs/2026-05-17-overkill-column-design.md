# Overkill Column Design

**Date:** 2026-05-17  
**Feature:** Add Overkill (超殺) column to GuildRaidTable

## Overview

Add an "Overkill" column to the raid member table, visible only for Tier 1 guild pages. Each member row has an input that accepts a numeric value displayed as `12.34E` (number followed by fixed "E" suffix). The column supports sorting.

## Requirements

- Column appears **between** 推算 (deduction) and 成員備註 (note) columns
- Only visible when the guild's tier is 1
- Not shown in comparison mode (follows same pattern as other columns)
- Column width: score column width (80px) + 12px = **92px**
- Total table width must remain unchanged — the 92px is absorbed from the flexible 成員備註 column (no extra width added to the table)
- Input field: number typed by user + fixed non-editable "E" suffix at right
- Input constraints: digits and decimal point only, max **5 characters** (numeric part, excluding E)
- Multiple decimal points are disallowed
- Archived state: read-only display showing `{value}E`, e.g. `12.34E`
- Column supports sorting; data is persisted to Supabase

## Sorting

- 個人總分 and 超殺 columns **share the same sort state** — clicking either calls `onSort('score')`
- `sortConfig.key` union stays `'default' | 'score'` (no new key needed)
- First click on either header → `key: 'score', order: 'desc'`; subsequent clicks toggle asc/desc
- Sort order (direction follows `sortConfig.order`):
  1. score (primary)
  2. overkill (always follows score, same direction)
  3. member name (always ascending alphabetical)
- Both score and overkill headers show sort arrow icon when `sortConfig.key === 'score'`

## Data Layer

### Supabase Migration

```sql
ALTER TABLE member_raid_records ADD COLUMN overkill NUMERIC;
```

Applied manually via Supabase dashboard before deploying.

### TypeScript Type (`src/features/raid/types.ts`)

```ts
export interface MemberRaidRecord {
  // ... existing fields ...
  overkill?: number | null;
}
```

## Logic Layer

### `useRaidRecordEditor` (`src/features/raid/hooks/useRaidRecordEditor.ts`)

- `handleRecordChange` field union extended to include `'overkill'`
- `doAutoSave`: add `overkillChanged` diff check; include overkill in upsert payload

### `GuildRaidManager` (`src/features/raid/pages/GuildRaidManager.tsx`)

- `sortConfig.key` type stays `'default' | 'score'` — no change needed
- `handleSort`: no change needed
- `sortedMembersMap`: update `key === 'score'` branch tie-breaking to: score → overkill (same direction) → name asc
- Pass `showOverkill={db.guilds[guildId]?.tier === 1}` to each `GuildRaidTable`

## Component Layer

### `GuildRaidTable` (`src/features/raid/components/GuildRaidTable.tsx`)

**Props:**
```ts
showOverkill?: boolean;
// onSort type unchanged: (key: 'default' | 'score') => void
```

**colgroup** (non-comparison mode): insert `<col style={{ width: '92px' }} />` after the deduction column. Because 成員備註 and 賽季備註 are flexible (`<col />` with no fixed width), the browser automatically absorbs the 92px into those columns — total table width stays the same with no other colgroup changes needed.

**thead** (non-comparison, `showOverkill`):
```tsx
<th onClick={() => onSort('score')} ...>
  <div className="flex items-center gap-1">
    {t('raid.column_overkill', '超殺')}
    {sortConfig.key === 'score' && <SortIcon />}
  </div>
</th>
```

**tbody** each row (non-comparison, `showOverkill`):
- Not archived:
  ```tsx
  <td>
    <div className="flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={overkillDisplayValue}
        onChange={handleOverkillChange}
        onBlur={() => onBlur(member.id!, guildId)}
        maxLength={5}
        className="..."
      />
      <span className="text-xs text-stone-500 select-none px-1">E</span>
    </div>
  </td>
  ```
- Archived:
  ```tsx
  <td>
    <div className="px-2 py-0.5 text-xs ...">
      {record.overkill != null ? `${record.overkill}E` : ''}
    </div>
  </td>
  ```

**onChange validation:**
```ts
const handleOverkillChange = (v: string) => {
  if (!/^[0-9.]*$/.test(v)) return;
  if ((v.match(/\./g) || []).length > 1) return;
  if (v.length > 5) return;
  onRecordChange(member.id!, 'overkill', v);
};
```

**Median row:** colspan adjusted to account for the extra column when `showOverkill` is true.

## Translations

`public/locales/zh-TW/raid.json`:
```json
"column_overkill": "超殺"
```

`public/locales/en/raid.json`:
```json
"column_overkill": "Overkill"
```

## Out of Scope

- No overkill aggregation in guild median calculation
- No overkill display in AllianceRaidExportView or MemberStatsModal
- No overkill in comparison mode
