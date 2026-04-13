import { Router } from 'express';
import type { AppDb } from '~/database/db.ts';
import {
  deleteChatThread,
  deleteChatThreadMessages,
  getChatThreadBundle,
} from '~/services/chatThreadService.ts';
import { getErrorStatus } from '~/utils/appError.ts';
import { serviceError } from '~/utils/logger.ts';
import { isValidUuid } from '~/utils/validation.ts';

export function createChatRouter(db: AppDb | null): Router {
  const r = Router();

  r.get('/api/chat/threads/:threadId', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { threadId } = req.params;
    if (!isValidUuid(threadId)) {
      return res.status(400).json({ error: 'Invalid thread id' });
    }
    try {
      const bundle = await getChatThreadBundle(db, threadId);
      if (!bundle) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      return res.json({
        thread: bundle.thread,
        messages: bundle.messages,
      });
    } catch (e) {
      serviceError('chat', 'GET /api/chat/threads/:threadId failed', e);
      return res.status(500).json({ error: 'Failed to load thread' });
    }
  });

  r.delete('/api/chat/threads/:threadId/messages', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { threadId } = req.params;
    if (!isValidUuid(threadId)) {
      return res.status(400).json({ error: 'Invalid thread id' });
    }
    try {
      const deleted = await deleteChatThreadMessages(db, threadId);
      return res.json({ deleted });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('chat', 'DELETE /api/chat/threads/:threadId/messages failed', e);
      return res.status(500).json({ error: 'Failed to clear messages' });
    }
  });

  r.delete('/api/chat/threads/:threadId', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { threadId } = req.params;
    if (!isValidUuid(threadId)) {
      return res.status(400).json({ error: 'Invalid thread id' });
    }
    try {
      const ok = await deleteChatThread(db, threadId);
      if (!ok) {
        return res.status(404).json({ error: 'Thread not found' });
      }
      return res.json({ ok: true });
    } catch (e) {
      serviceError('chat', 'DELETE /api/chat/threads/:threadId failed', e);
      return res.status(500).json({ error: 'Failed to delete thread' });
    }
  });

  return r;
}
