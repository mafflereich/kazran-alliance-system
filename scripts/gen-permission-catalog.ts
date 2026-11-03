#!/usr/bin/env node
/**
 * 由 src/shared/lib/permissions.ts 產生 migration 裡的 seed SQL。
 *
 * 用法：
 *   npm run db:catalog:write   把 GENERATED 區塊寫回 migration
 *   npm run db:catalog:check   CI 用：確認 migration 與目錄沒有 drift
 *   npm run db:catalog         印出 SQL（不寫檔）
 *
 * 產生規則：
 *   - permissions：key / domain / needs_guild / sort_order（目錄順序 × 10）
 *   - role_grants：每個權限的預設授權（role + scope）
 *   - 刪除 DB 中已不在目錄的權限（cascade 會清掉對應授權）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERMISSIONS } from '../src/shared/lib/permissions';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = 'supabase/migrations/20261102130000_permission_catalog_v2_foundation.sql';
const START = '-- >>> GENERATED:permissions';
const END = '-- <<< GENERATED:permissions';

const esc = (value: string): string => value.replace(/'/g, "''");

export const buildSeedSql = (): string => {
  const lines: string[] = [];

  lines.push('insert into public.permissions (key, domain, needs_guild, sort_order) values');
  lines.push(
    PERMISSIONS.map(
      (permission, index) =>
        `  ('${esc(permission.key)}', '${permission.domain}', ${permission.needsGuild}, ${(index + 1) * 10})`,
    ).join(',\n'),
  );
  lines.push('on conflict (key) do update');
  lines.push('  set domain = excluded.domain,');
  lines.push('      needs_guild = excluded.needs_guild,');
  lines.push('      sort_order = excluded.sort_order;');
  lines.push('');

  const grants = PERMISSIONS.flatMap((permission) =>
    permission.defaults.map((grant) => ({
      role: grant.role,
      permission: permission.key,
      scope: grant.scope,
    })),
  );
  lines.push('insert into public.role_grants (role, permission, scope) values');
  lines.push(
    grants
      .map((grant) => `  ('${grant.role}', '${esc(grant.permission)}', '${grant.scope}')`)
      .join(',\n'),
  );
  lines.push('on conflict (role, permission) do update set scope = excluded.scope;');
  lines.push('');

  // 目錄已移除的權限（含其授權，FK on delete cascade）
  lines.push('-- 清掉目錄已不存在的權限');
  lines.push('delete from public.permissions p');
  lines.push('where p.key not in (');
  lines.push(PERMISSIONS.map((permission) => `  '${esc(permission.key)}'`).join(',\n'));
  lines.push(');');

  return lines.join('\n');
};

const replaceBlock = (source: string, seed: string): string => {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`migration 缺少 GENERATED 標記（${START} / ${END}）`);
  }
  const head = source.slice(0, start + START.length);
  const tail = source.slice(end);
  return `${head}\n${seed}\n\n${tail}`;
};

const main = (): void => {
  const mode = process.argv.includes('--write')
    ? 'write'
    : process.argv.includes('--check')
      ? 'check'
      : 'emit';

  const seed = buildSeedSql();
  if (mode === 'emit') {
    console.log(seed);
    return;
  }

  const path = resolve(ROOT, MIGRATION);
  const current = readFileSync(path, 'utf8');
  const next = replaceBlock(current, seed);

  if (mode === 'check') {
    if (current !== next) {
      console.error(`FAIL  ${MIGRATION} 與 permissions.ts 不一致，請執行：npm run db:catalog -- --write`);
      process.exit(1);
    }
    console.log(`PASS  ${MIGRATION} 與 permissions.ts 一致（${PERMISSIONS.length} 個權限）`);
    return;
  }

  writeFileSync(path, next, 'utf8');
  console.log(`WROTE  ${MIGRATION}（${PERMISSIONS.length} 個權限）`);
};

main();
