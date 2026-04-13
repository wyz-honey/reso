import express from 'express';
import cors from 'cors';
import type { AppDb } from '~/database/db.ts';
import { httpAccessLogger } from '~/middleware/httpAccessLogger.ts';
import { createHealthRouter } from '~/routes/health.ts';
import { createAgentRouter } from '~/routes/agent.ts';
import { createChatRouter } from '~/routes/chat.ts';
import { createSessionsRouter } from '~/routes/sessions.ts';
import { createQuickInputsRouter } from '~/routes/quickInputs.ts';
import { createCursorRouter } from '~/routes/cursor.ts';

export function createApp(db: AppDb | null): express.Application {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(httpAccessLogger());

  app.use(createHealthRouter(db));
  app.use(createAgentRouter(db));
  app.use(createChatRouter(db));
  app.use(createSessionsRouter(db));
  app.use(createQuickInputsRouter(db));
  app.use(createCursorRouter());

  return app;
}
