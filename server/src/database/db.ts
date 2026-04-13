import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from '~/database/schema.ts';

export function createDb(pool: Pool) {
  const db = drizzle(pool, { schema });
  /** 与 `quickInputService` 等 raw SQL 共用同一 Pool */
  return Object.assign(db, { $client: pool });
}

export type AppDb = ReturnType<typeof createDb>;
