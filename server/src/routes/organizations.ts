import { Router } from 'express';
import type { AppDb } from '~/database/db.ts';
import { createOrganization, getOrganizationDetail, listOrganizations, patchOrganization } from '~/services/orgTeamService.ts';
import { getErrorStatus } from '~/utils/appError.ts';
import { serviceError, serviceWarn } from '~/utils/logger.ts';

export function createOrganizationsRouter(db: AppDb | null): Router {
  const r = Router();

  r.get('/api/organizations', async (_req, res) => {
    if (!db) {
      serviceWarn('organizations', 'GET /api/organizations rejected: no database');
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const items = await listOrganizations(db);
      return res.json({ items });
    } catch (e) {
      serviceError('organizations', 'GET /api/organizations failed', e);
      return res.status(500).json({ error: 'Failed to list organizations' });
    }
  });

  r.post('/api/organizations', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name : '';
      const row = await createOrganization(db, {
        name,
        description: typeof body.description === 'string' ? body.description : undefined,
      });
      return res.status(201).json(row);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      serviceError('organizations', 'POST /api/organizations failed', e);
      return res.status(500).json({ error: 'Failed to create organization' });
    }
  });

  r.get('/api/organizations/:orgId', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    try {
      const out = await getOrganizationDetail(db, req.params.orgId);
      return res.json(out);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      serviceError('organizations', 'GET /api/organizations/:orgId failed', e);
      return res.status(500).json({ error: 'Failed to load organization' });
    }
  });

  r.patch('/api/organizations/:orgId', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    try {
      const row = await patchOrganization(db, req.params.orgId, (req.body || {}) as Record<string, unknown>);
      return res.json(row);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      serviceError('organizations', 'PATCH organization failed', e);
      return res.status(500).json({ error: 'Failed to update organization' });
    }
  });

  return r;
}
