# Discord 名單快照：體量與快取設計

> 2026-11-03｜對應 `GSD_Bella/routes/discordMembers.ts`、`AccountHealthTab.tsx`、`discord_member_snapshot` migration

## 1. 背景

「帳號健檢」需要知道每位登入帳號在 Discord 的角色與公會身分組，才能比對 `profiles` 與成員現況。
第一版是**每個帳號呼叫一次 `sync-discord-roles`**（300 帳號 = 600 次 Discord API），又慢又容易撞 rate limit；
第二版改成「抓一次名單、本機比對」，但如果直接回傳**整個伺服器**的成員，量體會爆掉。

這份文件把「量體」先算清楚，再決定 API 契約、快取層級與 UI 形式。

## 2. 體量假設（實際值請以線上為準）

| 項目 | 假設 | 備註 |
|---|---|---|
| Discord 伺服器成員 | **9,000+**（含大量非聯盟成員） | 這是全量，不是我們要的資料 |
| 系統 profiles（有 `discord_id`） | 300–800 | 真正會被授權／健檢的對象 |
| 公會數 | 20–80 | 決定 UI 能不能用「列表 / chips」而非搜尋 |
| 每個成員的 payload | 約 250–350 bytes | `id`(19) + `username` + `displayName` + `roleIds`(5–15×19) + `roleNames`(5–15×~15) |

### 大小估算

- 全量：9,000 × ~300 B ≈ **2.7 MB**（gzip 後仍有 300–500 KB），每次請求都傳一次，塞進 `jsonb` 也同樣大。
- 只帶有 profile 的人：500 × ~300 B ≈ **150 KB**（gzip 25–40 KB），是前者的 1/18。

**結論：API 一定要在 bot 端就過濾掉「沒有 profile 的人」，不能靠前端篩。**
過濾方式是先抓 `profiles.discord_id`（單欄、分頁 1000 筆）成一個 Set，再從 Discord 成員清單挑出來。

## 3. 決策

| 決策 | 選擇 | 理由 |
|---|---|---|
| 回傳範圍 | 只含有 `profiles.discord_id` 的成員 | 量體 1/18，且其他成員本來就無法被授權 |
| 快取層級 | **DB（單列 jsonb）＋ 記憶體** | 記憶體重啟就沒了；DB 讓多實例 / 重啟都能沿用 |
| TTL | 10 分鐘（`DISCORD_MEMBERS_CACHE_TTL_MS`） | 角色變動不是即時需求；一天最多 144 次 Discord 呼叫 |
| 強制刷新 | `?refresh=1`，**最短間隔 2 分鐘** | 防連點；超限回傳快取並標 `throttled` |
| Discord 失敗 | 有舊快照就回舊的並標 `stale: true` | 健檢不該因為 Discord 暫時掛掉而完全不能用 |
| 授權 | Bearer Supabase token → `profiles.user_role ∈ {creator, admin}` | 名單含全體帳號與角色，屬敏感資料 |
| 寫入權限 | 只有 `service_role`（RLS + revoke anon/authenticated） | 前端不需要、也不該直接讀這張表 |

## 4. API 契約

`GET /api/discordMembers[?refresh=1]`

```jsonc
{
  "guildId": "874685031912710164",
  "fetchedAt": "2026-11-03T09:40:00.000Z",
  "cached": true,              // 這份是快取（沒有打 Discord）
  "stale": false,              // Discord 更新失敗，回的是舊資料
  "throttled": false,          // 要求強制刷新但被節流
  "cacheTtlSeconds": 600,
  "cacheAgeSeconds": 42,
  "memberCount": 512,          // 過濾後（有 profile）
  "serverMemberCount": 9123,   // 伺服器人類成員總數，用來檢查過濾比例
  "members": [{ "id": "...", "username": "...", "displayName": "...",
                "roleIds": ["..."], "roleNames": ["青龍-公會成員 (棕色2)"] }]
}
```

## 5. 已知限制（刻意接受）

1. **新登入的帳號最慢 TTL（10 分鐘）後才會出現在名單**：快照是「產生當下的 profiles」。
   在那之前該帳號的 Discord 差異欄會顯示「尚未抓取名單」；可按「重新抓取名單」（force）立即更新。
2. 快照可能包含「已被刪除的 profile」的成員（快照較舊），前端只會拿它跟現有 profiles 比對，不影響正確性。
3. `guildNamesOf()` 用身分組名稱解析公會（`公會名稱-公會成員 (棕色2)`）；公會改名後舊名稱會殘留到下次刷新。

## 6. 前端 UI 決策（同樣是量體問題）

- **公會篩選不用下拉**：公會幾十個、而且需要「一眼看到每個公會幾筆」。
  改成**可橫向捲動的 chip 列（帶數量）**，並讓**表格內的公會名稱可直接點擊篩選**，
  下拉只有在「選項少且不需要計數」時才合理（角色、Discord 狀態）。
- 帳號清單用「關鍵字搜尋 + 欄位篩選 + 狀態 chips」三層交集；關鍵字同時比對帳號、Discord、
  成員名稱、公會與 UUID，避免為了找人而先選一堆篩選。

## 7. 以後做同類功能前的檢查清單

1. 這個資料集的**上限**是多少？（9,000 還是 500？）
2. 需要全量嗎？能不能在**伺服器端就過濾**（例如只回有 profile 的人）？
3. 有沒有 **N+1**（每人一次外部 API）？能不能改成「一次抓全部 + 本機比對」？
4. 單筆 payload 多大？總量多大？gzip 後多大？塞進 DB 可以嗎？
5. 快取放哪一層？**重啟後還在嗎**？多實例共用嗎？TTL 多久？
6. 使用者連點 / 多分頁同時打，會不會繞過快取？要不要**最小間隔**？
7. 外部服務掛掉時的行為？（回舊資料 stale／500／前端提示）
8. UI 在「最大資料量」下還好用嗎？（80 個公會用下拉？9,000 筆列表？）
9. 有沒有 destructive 操作（刪 profile）需要**列出影響範圍 + 二次確認**？
