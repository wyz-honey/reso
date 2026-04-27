import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import type { AppDb } from '~/database/db.ts';
import { httpAccessLogger } from '~/middleware/httpAccessLogger.ts';
import { createHealthRouter } from '~/routes/health.ts';
import { createAgentRouter } from '~/routes/agent.ts';
import { createChatRouter } from '~/routes/chat.ts';
import { createSessionsRouter, handleSessionsBatchDelete } from '~/routes/sessions.ts';
import { createQuickInputsRouter } from '~/routes/quickInputs.ts';
import { createTasksRouter } from '~/routes/tasks.ts';
import { createOrganizationsRouter } from '~/routes/organizations.ts';
import { createCursorRouter } from '~/routes/cursor.ts';
import { createMetaRouter } from '~/routes/meta.ts';
import { createClientSettingsRouter } from '~/routes/clientSettings.ts';

function resolveClientDist(): string | null {
  const env = process.env.RESO_CLIENT_DIST;
  if (env) {
    const p = path.resolve(env);
    return fs.existsSync(path.join(p, 'index.html')) ? p : null;
  }
  const fromSrc = path.join(import.meta.dir, '../../client/dist');
  return fs.existsSync(path.join(fromSrc, 'index.html'))
    ? path.resolve(fromSrc)
    : null;
}

export function createApp(db: AppDb | null): express.Application {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(httpAccessLogger());

  app.use(createHealthRouter(db));
  app.use(createClientSettingsRouter(db));
  app.use(createMetaRouter());
  app.use(createAgentRouter(db));
  app.use(createChatRouter(db));
  app.post('/api/sessions/batch-delete', (req, res) => {
    void handleSessionsBatchDelete(db, req, res);
  });
  app.use('/api/sessions', createSessionsRouter(db));
  app.use(createQuickInputsRouter(db));
  app.use(createTasksRouter(db));
  app.use(createOrganizationsRouter(db));
  app.use(createCursorRouter());

  const clientDist = resolveClientDist();
  if (clientDist) {
    app.use(express.static(clientDist, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'), (err) => next(err));
    });
  }

  return app;
}
