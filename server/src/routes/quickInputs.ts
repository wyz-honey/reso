import { Router } from 'express';
import type { AppDb } from '~/database/db.ts';
import {
  createQuickInput,
  deleteQuickInput,
  listQuickInputsResilient,
  patchQuickInput,
} from '~/services/quickInputService.ts';
import { getErrorStatus } from '~/utils/appError.ts';
import {
  errorDetailForClient,
  isVerboseLog,
  serviceError,
  serviceLog,
  serviceWarn,
} from '~/utils/logger.ts';

export function createQuickInputsRouter(db: AppDb | null): Router {
  const r = Router();
  r.get('/api/quick-inputs', async (_req, res) => {
    if (!db) {
      serviceWarn('quick-inputs', 'GET /api/quick-inputs rejected: no database', {
        hint: 'set OPC_PG_HOST and credentials in .env',
      });
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const items = await listQuickInputsResilient(db);
      if (isVerboseLog()) {
        serviceLog('quick-inputs', 'GET /api/quick-inputs ok', { count: items.length });
      }
      return res.json({ items });
    } catch (e) {
      serviceError('quick-inputs', 'GET /api/quick-inputs failed (Drizzle + SQL fallback)', e);
      const pgCode =
        e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string'
          ? (e as { code: string }).code
          : undefined;
      return res.status(500).json({
        error: 'Failed to list quick inputs',
        detail: e instanceof Error ? e.message : String(e),
        ...(pgCode ? { pgCode } : {}),
        ...errorDetailForClient(e),
      });
    }
  });

  r.post('/api/quick-inputs', async (req, res) => {
    if (!db) {
      serviceWarn('quick-inputs', 'POST /api/quick-inputs rejected: no database');
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const row = await createQuickInput(db, req.body || {});
      return res.status(201).json(row);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('quick-inputs', 'POST /api/quick-inputs failed', e);
      return res.status(500).json({ error: 'Failed to create quick input' });
    }
  });

  r.patch('/api/quick-inputs/:id', async (req, res) => {
    if (!db) {
      serviceWarn('quick-inputs', 'PATCH /api/quick-inputs/:id rejected: no database');
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const row = await patchQuickInput(db, req.params.id, req.body || {});
      return res.json(row);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('quick-inputs', 'PATCH /api/quick-inputs failed', e);
      return res.status(500).json({ error: 'Failed to update' });
    }
  });

  r.delete('/api/quick-inputs/:id', async (req, res) => {
    if (!db) {
      serviceWarn('quick-inputs', 'DELETE /api/quick-inputs/:id rejected: no database');
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      await deleteQuickInput(db, req.params.id);
      return res.json({ ok: true });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('quick-inputs', 'DELETE /api/quick-inputs failed', e);
      return res.status(500).json({ error: 'Failed to delete' });
    }
  });

  return r;
}
