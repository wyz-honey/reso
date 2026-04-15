import { Router } from 'express';
import type { AppDb } from '~/database/db.ts';
import { buildStatelessPayload } from '~/agents/reso/index.ts';
import {
  finalizeChatTurnStream,
  prepareChatTurnStreamPayload,
  runChatTurn,
} from '~/services/chatThreadService.ts';
import { invokeQwenChat, invokeQwenChatStream } from '~/services/dashscopeChat.ts';
import { getErrorStatus } from '~/utils/appError.ts';
import { serviceError } from '~/utils/logger.ts';

export function createAgentRouter(db: AppDb | null): Router {
  const r = Router();

  r.post('/api/agent/chat', async (req, res) => {
    const { messages, system, model: modelOverride, dashscopeApiKey } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const cleaned = messages.filter(
      (m: { role?: string; content?: string }) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 0
    );
    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'no valid user/assistant messages' });
    }
    const payloadMessages = buildStatelessPayload(cleaned, system);

    try {
      const content = await invokeQwenChat(payloadMessages, modelOverride, dashscopeApiKey);
      return res.json({ message: { role: 'assistant', content } });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('agent', 'POST /api/agent/chat failed', e);
      return res.status(502).json({ error: 'Chat request failed' });
    }
  });

  r.post('/api/agent/chat-turn', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const {
      modeId,
      threadId: incomingThreadId,
      userText,
      system,
      model: modelOverride,
      dashscopeApiKey,
      sessionId: sessionIdBody,
    } = req.body || {};
    const sessionId =
      typeof sessionIdBody === 'string' && sessionIdBody.trim() ? sessionIdBody.trim() : undefined;
    if (!modeId || typeof modeId !== 'string') {
      return res.status(400).json({ error: 'modeId required' });
    }
    const text = typeof userText === 'string' ? userText.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'userText required' });
    }

    try {
      const out = await runChatTurn(db, {
        modeId,
        threadId: incomingThreadId,
        userText: text,
        system,
        modelOverride,
        dashscopeApiKey,
        sessionId,
      });
      return res.json(out);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('agent', 'POST /api/agent/chat-turn failed', e);
      return res.status(500).json({ error: 'Chat turn failed' });
    }
  });

  r.post('/api/agent/chat-turn-stream', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    const {
      modeId,
      threadId: incomingThreadId,
      userText,
      system,
      model: modelOverride,
      dashscopeApiKey,
      sessionId: sessionIdBody,
    } = req.body || {};
    const sessionId =
      typeof sessionIdBody === 'string' && sessionIdBody.trim() ? sessionIdBody.trim() : undefined;
    if (!modeId || typeof modeId !== 'string') {
      return res.status(400).json({ error: 'modeId required' });
    }
    const text = typeof userText === 'string' ? userText.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'userText required' });
    }

    const writeSse = (obj: unknown) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      const { threadId, payloadMessages } = await prepareChatTurnStreamPayload(db, {
        modeId,
        threadId: incomingThreadId,
        userText: text,
        system,
        sessionId,
      });

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      (res as { flushHeaders?: () => void }).flushHeaders?.();

      writeSse({ type: 'meta', threadId });

      let assistantContent = '';
      await invokeQwenChatStream(
        payloadMessages,
        modelOverride,
        dashscopeApiKey,
        (d) => {
          assistantContent += d;
          writeSse({ type: 'delta', text: d });
        }
      );

      const messages = await finalizeChatTurnStream(db, threadId, assistantContent);
      writeSse({ type: 'done', messages });
      res.end();
    } catch (e) {
      if (!res.headersSent) {
        const sc = getErrorStatus(e);
        if (sc) {
          return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
        }
        serviceError('agent', 'POST /api/agent/chat-turn-stream failed (before headers)', e);
        const detail = e instanceof Error ? e.message : String(e);
        return res.status(500).json({
          error: detail && detail !== '[object Object]' ? detail : 'Chat stream failed',
        });
      }
      serviceError('agent', 'POST /api/agent/chat-turn-stream failed (after headers)', e);
      try {
        writeSse({ type: 'error', error: e instanceof Error ? e.message : 'stream failed' });
      } catch {
        /* ignore */
      }
      res.end();
    }
  });

  return r;
}
