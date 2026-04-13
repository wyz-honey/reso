/**
 * 读仓库根目录 .env，连库并打印 sessions / quick_inputs 统计与样例。
 * 运行：在 server 目录执行 `npm run test-db`
 */
import '~/loadEnv.ts';
import { count } from 'drizzle-orm';
import { createDb } from '~/database/db.ts';
import { createPool } from '~/database/pool.ts';
import { quickInputs, sessions } from '~/database/schema.ts';
import { listQuickInputs } from '~/services/quickInputService.ts';

async function main(): Promise<void> {
  const pool = createPool();
  if (!pool) {
    console.error('FAIL: no pool — set PG_HOST (and user/password) in repo root .env');
    process.exit(1);
  }

  const db = createDb(pool);
  const dbName = process.env.PG_DATABASE || process.env.PM_DATABASE || 'reso';

  console.log('--- reso DB probe ---');
  console.log('host:', process.env.PG_HOST);
  console.log('database:', dbName);
  console.log('user:', process.env.PG_USER);

  try {
    const [sc] = await db.select({ c: count() }).from(sessions);
    console.log('Drizzle sessions count:', Number(sc?.c ?? 0));

    const [qc] = await db.select({ c: count() }).from(quickInputs);
    console.log('Drizzle quick_inputs count:', Number(qc?.c ?? 0));

    const qiRows = await db.select().from(quickInputs).limit(5);
    console.log('Drizzle select().from(quickInputs).limit(5) row count:', qiRows.length);
    if (qiRows.length > 0) {
      console.log('first row keys:', Object.keys(qiRows[0] as object));
      console.log('first row:', JSON.stringify(qiRows[0], (_k, v) => (v instanceof Date ? v.toISOString() : v), 2));
    }

    const listed = await listQuickInputs(db);
    console.log('listQuickInputs() length:', listed.length);
    if (listed[0]) {
      console.log('listQuickInputs[0] keys:', Object.keys(listed[0]));
    }

    const raw = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM quick_inputs');
    console.log('raw SQL COUNT quick_inputs:', raw.rows[0]?.c);

    const rawSess = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM sessions');
    console.log('raw SQL COUNT sessions:', rawSess.rows[0]?.c);

    console.log('--- OK ---');
  } catch (e) {
    console.error('FAIL: query error');
    console.error(e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
