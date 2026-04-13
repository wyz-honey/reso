import pg from 'pg';

const { Pool } = pg;

function databaseName(): string {
  return process.env.PG_DATABASE || process.env.PM_DATABASE || 'reso';
}

export function createPool(): pg.Pool | null {
  const host = process.env.PG_HOST;
  if (!host) return null;
  const useSsl = process.env.PG_SSL === '1' || process.env.PG_SSL === 'true';
  return new Pool({
    host,
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: databaseName(),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}
