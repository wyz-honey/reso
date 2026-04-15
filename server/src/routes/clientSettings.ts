import { Router } from 'express';
import type { AppDb } from '~/database/db.ts';
import { getResoClientSettingsRow, upsertResoClientSettingsRow } from '~/services/clientSettingsService.ts';
import { getErrorStatus } from '~/utils/appError.ts';
import { serviceError } from '~/utils/logger.ts';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function createClientSettingsRouter(db: AppDb | null): Router {
  const r = Router();

  r.get('/api/client-settings', async (_req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const row = await getResoClientSettingsRow(db);
      if (!row) {
        return res.json({ voice: {}, modelProviders: {} });
      }
      return res.json({
        voice: row.voiceSettings,
        modelProviders: row.modelProviders,
        updatedAt: row.updatedAt.toISOString(),
      });
    } catch (e) {
      serviceError('client-settings', 'GET /api/client-settings failed', e);
      return res.status(500).json({ error: e instanceof Error ? e.message : 'failed' });
    }
  });

  r.put('/api/client-settings', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const body = req.body || {};
    const voice = body.voice;
    const modelProviders = body.modelProviders;
    if (!isPlainObject(voice) || !isPlainObject(modelProviders)) {
      return res.status(400).json({ error: 'body must include voice and modelProviders objects' });
    }
    try {
      await upsertResoClientSettingsRow(db, { voiceSettings: voice, modelProviders: modelProviders });
      return res.json({ ok: true });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('client-settings', 'PUT /api/client-settings failed', e);
      return res.status(500).json({ error: e instanceof Error ? e.message : 'failed' });
    }
  });

  return r;
}
