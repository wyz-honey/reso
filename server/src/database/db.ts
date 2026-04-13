import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from '~/database/schema.ts';

function buildDb(pool: Pool) {
  const db = drizzle(pool, { schema });
  return Object.assign(db, { $client: pool });
}

export type AppDb = ReturnType<typeof buildDb>;

export function createDb(pool: Pool): AppDb {
  return buildDb(pool);
}
