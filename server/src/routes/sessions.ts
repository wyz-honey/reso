import { Router, type Request, type Response } from 'express';
import type { AppDb } from '~/database/db.ts';
import {
  addParagraph,
  clearParagraphs,
  createSession,
  deleteSession,
  deleteSessionsByIds,
  getSessionWithParagraphs,
  listSessions,
} from '~/services/sessionService.ts';
import { ensureSessionExternalThreadWithAgentCreateChat } from '~/services/cursorAgentEnsure.ts';
import {
  deleteSessionExternalThread,
  listSessionExternalThreads,
  upsertSessionExternalThread,
} from '~/services/sessionExternalThreadService.ts';
import { AppError, getErrorStatus } from '~/utils/appError.ts';
import { serviceError } from '~/utils/logger.ts';

/** 挂在根 app 上（`POST /api/sessions/batch-delete`），避免子路由挂载后部分环境下 404。 */
export async function handleSessionsBatchDelete(
  db: AppDb | null,
  req: Request,
  res: Response
): Promise<void> {
  if (!db) {
    res.status(503).json({ error: 'Database not configured' });
    return;
  }
  const raw = req.body?.ids;
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: 'Request body must include ids: string[]' });
    return;
  }
  const ids = raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  if (ids.length > 100) {
    res.status(400).json({ error: 'At most 100 sessions per request' });
    return;
  }
  if (ids.length === 0) {
    res.json({ ok: true, deleted: 0 });
    return;
  }
  try {
    const deleted = await deleteSessionsByIds(db, ids);
    res.json({ ok: true, deleted });
  } catch (e) {
    serviceError('sessions', 'POST /api/sessions/batch-delete failed', e);
    res.status(500).json({ error: 'Failed to delete sessions' });
  }
}

/** 挂在 `app.use('/api/sessions', …)` 上。 */
export function createSessionsRouter(db: AppDb | null): Router {
  const r = Router();

  r.post('/', async (_req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured (set PG_*)' });
    }
    try {
      const id = await createSession(db);
      return res.json({ id });
    } catch (e) {
      serviceError('sessions', 'POST /api/sessions failed', e);
      return res.status(500).json({ error: 'Failed to create session' });
    }
  });

  r.get('/', async (req, res) => {
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

  r.get('/:sessionId/external-threads', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const threads = await listSessionExternalThreads(db, req.params.sessionId);
      return res.json({ threads });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('sessions', 'GET /api/sessions/.../external-threads failed', e);
      return res.status(500).json({ error: 'Failed to list external threads' });
    }
  });

  r.put('/:sessionId/external-threads/:provider', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const threadId = typeof req.body?.threadId === 'string' ? req.body.threadId : '';
    try {
      await upsertSessionExternalThread(db, req.params.sessionId, req.params.provider, threadId);
      return res.json({ ok: true });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('sessions', 'PUT /api/sessions/.../external-threads/... failed', e);
      return res.status(500).json({ error: 'Failed to save external thread' });
    }
  });

  r.delete('/:sessionId/external-threads/:provider', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const deleted = await deleteSessionExternalThread(db, req.params.sessionId, req.params.provider);
      return res.json({ ok: true, deleted });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('sessions', 'DELETE /api/sessions/.../external-threads/... failed', e);
      return res.status(500).json({ error: 'Failed to delete external thread' });
    }
  });

  r.post('/:sessionId/external-threads/:provider/ensure', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const out = await ensureSessionExternalThreadWithAgentCreateChat(
        db,
        req.params.sessionId,
        req.params.provider
      );
      return res.json(out);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('sessions', 'POST /api/sessions/.../external-threads/.../ensure failed', e);
      const detail = e instanceof Error ? e.message : String(e);
      return res.status(500).json({
        error: 'Failed to ensure external thread',
        detail,
      });
    }
  });

  r.get('/:sessionId', async (req, res) => {
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

  r.delete('/:sessionId/paragraphs', async (req, res) => {
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

  r.delete('/:sessionId', async (req, res) => {
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

  r.post('/:sessionId/paragraphs', async (req, res) => {
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
