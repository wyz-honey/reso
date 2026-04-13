import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from '~/database/schema.ts';

export function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export type AppDb = ReturnType<typeof createDb>;
