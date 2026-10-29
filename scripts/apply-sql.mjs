#!/usr/bin/env node
/**
 * 套用 supabase/migrations/*.sql 到遠端 Supabase 資料庫。
 *
 * 為什麼需要這支：
 *   這些 SQL 內含 `CREATE INDEX` / `CREATE POLICY` / `CREATE FUNCTION`，
 *   只能用「Postgres 連線」或「Supabase Management API」執行，
 *   前端用的 anon key（PostgREST）無法執行 DDL。
 *
 * 憑證來源（依序嘗試，全部從 .env 或環境變數讀取，不會被印出來）：
 *   1. SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF
 *      → 走 Management API（不需要額外套件，推薦）
 *   2. SUPABASE_DB_URL
 *      → 完整連線字串（需 `npm i --no-save pg`）
 *   3. SUPABASE_DB_PASSWORD（project ref 會自動由 VITE_SUPABASE_URL 推導）
 *      → 連 db.<ref>.supabase.co:5432（需 `npm i --no-save pg`）
 *
 * 用法：
 *   node scripts/apply-sql.mjs --dry-run      只列出要套用的檔案
 *   node scripts/apply-sql.mjs                套用全部（每個檔一個 transaction）
 *   node scripts/apply-sql.mjs --verify-only  只跑驗證查詢
 *   node scripts/apply-sql.mjs --file 20261029090200_save_raid_records_bulk.sql
 *
 * 每個檔案都包在 transaction 裡：任何一句失敗就整檔回滾，不會留半套。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getArg = (name, fallback = null) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const VERIFY_ONLY = hasFlag('--verify-only');
const ONLY_FILE = getArg('--file');
/** 直接執行一段唯讀 SQL 並印出結果（診斷用） */
const AD_HOC_SQL = getArg('--sql');
/** 從檔案讀取 SQL（避免 shell 引號轉義問題） */
const AD_HOC_SQL_FILE = getArg('--sql-file');

/** 讀 .env（不引入 dotenv，保持零依賴）；已存在的環境變數優先 */
const loadEnv = () => {
    const envPath = resolve(ROOT, '.env');
    if (!existsSync(envPath)) return;
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
    }
};

loadEnv();

const PROJECT_REF = (() => {
    if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF.trim();
    const url = process.env.VITE_SUPABASE_URL || '';
    const m = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\./i);
    return m ? m[1] : null;
})();

const migrationFiles = (() => {
    if (!existsSync(MIGRATIONS_DIR)) {
        console.log('找不到 supabase/migrations 目錄。');
        process.exit(1);
    }
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    return ONLY_FILE ? files.filter(f => f === ONLY_FILE) : files;
})();

if (migrationFiles.length === 0) {
    console.log(ONLY_FILE ? `找不到指定的 migration：${ONLY_FILE}` : 'supabase/migrations 內沒有 .sql 檔。');
    process.exit(1);
}

const VERIFY_QUERIES = [
    {
        title: 'members 相關索引',
        sql: `select indexname from pg_indexes
              where schemaname = 'public' and tablename = 'members' order by indexname;`,
    },
    {
        title: '戰記表唯一索引',
        sql: `select tablename, indexname from pg_indexes
              where schemaname = 'public'
                and tablename in ('member_raid_records', 'guild_raid_records')
                and indexdef ilike 'CREATE UNIQUE INDEX%'
              order by tablename, indexname;`,
    },
    {
        title: '新增的函式',
        sql: `select p.proname
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('save_raid_records_bulk', 'refresh_guild_median', 'update_order')
              order by p.proname;`,
    },
    {
        title: 'members / 戰記表 RLS policies',
        sql: `select tablename, policyname
              from pg_policies
              where schemaname = 'public'
                and tablename in ('members', 'member_raid_records', 'guild_raid_records')
              order by tablename, policyname;`,
    },
];

// ------------------------------------------------------------
// 執行器：Supabase Management API（不需額外套件）
// ------------------------------------------------------------
const runViaManagementApi = async (sql) => {
    if (!PROJECT_REF) throw new Error('缺少 SUPABASE_PROJECT_REF（或 VITE_SUPABASE_URL 無法推導）');

    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 800)}`);

    try {
        return JSON.parse(text);
    } catch {
        return [];
    }
};

// ------------------------------------------------------------
// 執行器：pg（動態載入；未安裝時給出安裝指令）
// ------------------------------------------------------------
const buildConnectionString = () => {
    if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!password || !PROJECT_REF) return null;
    const host = process.env.SUPABASE_DB_HOST || `db.${PROJECT_REF}.supabase.co`;
    const port = process.env.SUPABASE_DB_PORT || '5432';
    const user = process.env.SUPABASE_DB_USER || 'postgres';
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
};

const createPgRunner = async () => {
    const connectionString = buildConnectionString();
    if (!connectionString) return null;

    let pg;
    try {
        pg = await import('pg');
    } catch {
        console.log('\n偵測到資料庫密碼 / 連線字串，但尚未安裝 pg。請先執行：');
        console.log('  npm install --no-save pg\n');
        process.exit(1);
    }

    const { Client } = pg.default || pg;
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();

    return {
        run: async (sql) => (await client.query(sql)).rows ?? [],
        close: () => client.end(),
    };
};

// ------------------------------------------------------------
// 主流程
// ------------------------------------------------------------
const main = async () => {
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    const hasDbCreds = Boolean(process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_PASSWORD);

    console.log(`專案：${PROJECT_REF ?? '(未設定)'}`);
    console.log(`模式：${DRY_RUN ? 'dry-run' : VERIFY_ONLY ? 'verify-only' : 'apply'}`);
    console.log(`遷移檔（${migrationFiles.length}）：`);
    migrationFiles.forEach(f => console.log(`  - ${f}`));
    console.log('');

    if (DRY_RUN) {
        console.log('dry-run：不會連線、也不會修改任何東西。');
        return;
    }

    if (!token && !hasDbCreds) {
        console.log('沒有可用的憑證。請三選一：');
        console.log('  A) .env 加上 SUPABASE_DB_PASSWORD=<資料庫密碼>（Dashboard → Settings → Database）');
        console.log('     → npm install --no-save pg && npm run db:apply');
        console.log('  B) .env 加上 SUPABASE_ACCESS_TOKEN=<sbp_...>（Dashboard → Account → Access Tokens）');
        console.log('     → npm run db:apply');
        console.log('  C) 直接在 Dashboard → SQL Editor 貼上三個檔案（最單純）');
        process.exit(1);
    }

    let runner;
    let mode;
    if (hasDbCreds) {
        runner = await createPgRunner();
        mode = 'pg（Postgres 直連）';
    } else {
        runner = { run: runViaManagementApi, close: async () => { } };
        mode = 'Supabase Management API';
    }

    console.log(`連線方式：${mode}\n`);

    if (AD_HOC_SQL || AD_HOC_SQL_FILE) {
        try {
            const sql = AD_HOC_SQL_FILE
                ? readFileSync(resolve(ROOT, AD_HOC_SQL_FILE), 'utf8')
                : AD_HOC_SQL;
            const rows = await runner.run(sql);
            console.log(JSON.stringify(rows, null, 2));
        } finally {
            await runner.close();
        }
        return;
    }

    try {
        if (!VERIFY_ONLY) {
            for (const file of migrationFiles) {
                const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
                process.stdout.write(`→ 套用 ${file} ... `);
                try {
                    // 每個檔案一個 transaction：任何一句失敗就整檔回滾
                    await runner.run(`begin;\n${sql}\ncommit;`);
                    console.log('OK');
                } catch (err) {
                    console.log('失敗');
                    console.log(`\n${file} 執行失敗，已回滾：\n${err.message}\n`);
                    process.exitCode = 1;
                    return;
                }
            }
            console.log('');
        }

        console.log('=== 驗證 ===');
        for (const { title, sql } of VERIFY_QUERIES) {
            try {
                const rows = await runner.run(sql);
                console.log(`\n[${title}] ${Array.isArray(rows) ? rows.length : 0} 筆`);
                if (Array.isArray(rows)) {
                    for (const row of rows) console.log('  ', JSON.stringify(row));
                }
            } catch (err) {
                console.log(`\n[${title}] 查詢失敗：${err.message}`);
            }
        }
        console.log('\n完成。若是第一次套用，請重新整理前端，並用「一般成員 / 公會會長」各測一次權限。');
    } finally {
        await runner.close();
    }
};

main().catch((err) => {
    console.log('未預期錯誤：', err.message);
    process.exit(1);
});

