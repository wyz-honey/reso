import pg from 'pg';

const { Pool } = pg;

function databaseName(): string {
  return process.env.OPC_PG_DATABASE || process.env.OPC_PM_DATABASE || 'reso';
}

export function createPool(): pg.Pool | null {
  const host = process.env.OPC_PG_HOST;
  if (!host) return null;
  const useSsl = process.env.OPC_PG_SSL === '1' || process.env.OPC_PG_SSL === 'true';
  return new Pool({
    host,
    port: Number(process.env.OPC_PG_PORT) || 5432,
    user: process.env.OPC_PG_USER,
    password: process.env.OPC_PG_PASSWORD,
    database: databaseName(),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}
