import '~/loadEnv.ts';
import { createServer } from 'http';
import { count } from 'drizzle-orm';
import { createApp } from '~/app.ts';
import { createDb } from '~/database/db.ts';
import { createPool } from '~/database/pool.ts';
import { sessions } from '~/database/schema.ts';
import { attachWebSockets } from '~/websocket/setup.ts';
import { PORT } from '~/config/constants.ts';
import { getLogFilePath, serviceError, serviceLog, serviceWarn } from '~/utils/logger.ts';

const pool = createPool();
const db = pool ? createDb(pool) : null;
const app = createApp(db);
const httpServer = createServer(app);

attachWebSockets(httpServer);

async function main(): Promise<void> {
  if (db) {
    try {
      const [row] = await db.select({ c: count() }).from(sessions);
      const n = Number(row?.c ?? 0);
      serviceLog('db', `PostgreSQL ready (sessions: ${n} rows)`);
    } catch (e) {
      serviceError('db', 'PostgreSQL connection/query failed', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (/does not support SSL/i.test(msg)) {
        serviceLog('db', 'Hint: unset OPC_PG_SSL or set OPC_PG_SSL=0 (server has no SSL).');
      } else if (/startup packet|invalid.*startup|no pg_hba/i.test(msg)) {
        serviceLog('db', 'Hint: try OPC_PG_SSL=1 and check DB firewall / IP allowlist.');
      }
    }
  } else {
    serviceWarn('db', 'PostgreSQL disabled: set OPC_PG_HOST and credentials for /api/*');
  }

  httpServer.listen(PORT, () => {
    serviceLog(
      'server',
      `listening http://localhost:${PORT} (ws /ws/asr, /ws/cursor-tail, REST /api) log→${getLogFilePath()}`
    );
  });
}

main();
