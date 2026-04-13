import { Router } from 'express';
import type { AppDb } from '~/database/db.ts';
import {
  addParagraph,
  clearParagraphs,
  createSession,
  deleteSession,
  getSessionWithParagraphs,
  listSessions,
} from '~/services/sessionService.ts';
import { AppError, getErrorStatus } from '~/utils/appError.ts';
import { serviceError } from '~/utils/logger.ts';

export function createSessionsRouter(db: AppDb | null): Router {
  const r = Router();

  r.post('/api/sessions', async (_req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured (set OPC_PG_*)' });
    }
    try {
      const id = await createSession(db);
      return res.json({ id });
    } catch (e) {
      serviceError('sessions', 'POST /api/sessions failed', e);
      return res.status(500).json({ error: 'Failed to create session' });
    }
  });

  r.get('/api/sessions', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const qRaw = req.query.q;
    const q = typeof qRaw === 'string' ? qRaw.trim() : '';
    const filter =
      req.query.filter === 'with' ? 'with' : req.query.filter === 'empty' ? 'empty' : 'all';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize || '10'), 10) || 10));

    try {
      const out = await listSessions(db, { q, filter, page, pageSize });
      return res.json(out);
    } catch (e) {
      serviceError('sessions', 'GET /api/sessions failed', e);
      return res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  r.get('/api/sessions/:sessionId', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const out = await getSessionWithParagraphs(db, req.params.sessionId);
      return res.json(out);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('sessions', 'GET /api/sessions/:sessionId failed', e);
      return res.status(500).json({ error: 'Failed to load session' });
    }
  });

  r.delete('/api/sessions/:sessionId/paragraphs', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const deleted = await clearParagraphs(db, req.params.sessionId);
      return res.json({ deleted });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('sessions', 'DELETE /api/sessions/.../paragraphs failed', e);
      return res.status(500).json({ error: 'Failed to clear paragraphs' });
    }
  });

  r.delete('/api/sessions/:sessionId', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      await deleteSession(db, req.params.sessionId);
      return res.json({ ok: true });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('sessions', 'DELETE /api/sessions/:sessionId failed', e);
      return res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  r.post('/api/sessions/:sessionId/paragraphs', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    try {
      const out = await addParagraph(db, req.params.sessionId, content);
      return res.json(out);
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 400 && e.message === 'content is required') {
        return res.status(400).json({ error: 'content is required' });
      }
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('sessions', 'POST /api/sessions/.../paragraphs failed', e);
      return res.status(500).json({ error: 'Failed to save paragraph' });
    }
  });

  return r;
}
