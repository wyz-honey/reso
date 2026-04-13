import { Router } from 'express';
import type { AppDb } from '~/database/db.ts';
import { quickInputs } from '~/database/schema.ts';

export function createHealthRouter(db: AppDb | null): Router {
  const r = Router();
  r.get('/health', (_req, res) => {
    res.json({ ok: true, db: Boolean(db) });
  });
  r.get('/api/health', (_req, res) => {
    res.json({ ok: true, db: Boolean(db) });
  });
  r.get('/api/health/db', async (_req, res) => {
    if (!db) {
      return res.json({ ok: false, db: false, quick_inputs: false, error: 'no db' });
    }
    try {
      await db.select().from(quickInputs).limit(1);
      return res.json({ ok: true, db: true, quick_inputs: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        e && typeof e === 'object' && typeof (e as { code?: string }).code === 'string'
          ? (e as { code: string }).code
          : undefined;
      return res.json({ ok: false, db: true, quick_inputs: false, error: msg, pgCode: code });
    }
  });
  return r;
}
