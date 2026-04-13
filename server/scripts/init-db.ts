/**
 * 用仓库根目录 .env 中的 PG_* 连接数据库，执行：
 * 1) server/database/bootstrap.sql（全量建表，IF NOT EXISTS，可重复执行）
 * 2) server/database/migrations/*.sql 按文件名排序（追加迁移，可重复执行）
 *
 * 运行：仓库根目录 `npm run init-db` 或 `npm run init-db -w server`
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import '~/loadEnv.ts';
import { createPool } from '~/database/pool.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(scriptDir, '..');

function stripSqlCommentLines(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('--');
    })
    .join('\n');
}

function splitSqlStatements(sql: string): string[] {
  const body = stripSqlCommentLines(sql);
  return body
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runSqlFile(pool: Pool, filePath: string, label: string): Promise<void> {
  const raw = readFileSync(filePath, 'utf8');
  const stmts = splitSqlStatements(raw);
  if (stmts.length === 0) {
    console.warn(`[init-db] skip empty: ${label}`);
    return;
  }
  console.log(`[init-db] ${label} (${stmts.length} statement(s))`);
  for (let i = 0; i < stmts.length; i++) {
    const q = `${stmts[i]};`;
    try {
      await pool.query(q);
    } catch (e) {
      console.error(`[init-db] FAIL ${label} #${i + 1}:`, q.slice(0, 200));
      throw e;
    }
  }
}

async function main(): Promise<void> {
  const pool = createPool();
  if (!pool) {
    console.error('[init-db] 未配置 PG_HOST：请在仓库根目录 .env 填写 PG_HOST、PG_USER、PG_PASSWORD、PG_DATABASE 等');
    process.exit(1);
  }

  const dbName = process.env.PG_DATABASE || process.env.PM_DATABASE || 'reso';
  console.log('[init-db] connecting', {
    host: process.env.PG_HOST,
    database: dbName,
    user: process.env.PG_USER,
  });

  try {
    const bootstrapPath = join(serverRoot, 'database', 'bootstrap.sql');
    await runSqlFile(pool, bootstrapPath, 'bootstrap.sql');

    const migrationsDir = join(serverRoot, 'database', 'migrations');
    let migrationFiles: string[] = [];
    try {
      migrationFiles = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    } catch {
      /* no migrations dir */
    }
    for (const name of migrationFiles) {
      await runSqlFile(pool, join(migrationsDir, name), `migrations/${name}`);
    }

    console.log('[init-db] done');
  } catch (e) {
    console.error('[init-db] aborted');
    console.error(e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
