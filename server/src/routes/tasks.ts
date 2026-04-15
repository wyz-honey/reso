import { Router } from 'express';
import type { AppDb } from '~/database/db.ts';
import { createTask, deleteTask, getTaskById, listTasks, patchTask, TASK_STATUSES } from '~/services/taskService.ts';
import { getErrorStatus } from '~/utils/appError.ts';
import { serviceError, serviceWarn } from '~/utils/logger.ts';

export function createTasksRouter(db: AppDb | null): Router {
  const r = Router();

  r.get('/api/tasks', async (req, res) => {
    if (!db) {
      serviceWarn('tasks', 'GET /api/tasks rejected: no database');
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
      const items = await listTasks(db, { status, tag });
      return res.json({ items, statuses: [...TASK_STATUSES] });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('tasks', 'GET /api/tasks failed', e);
      return res.status(500).json({ error: 'Failed to list tasks' });
    }
  });

  r.post('/api/tasks', async (req, res) => {
    if (!db) {
      serviceWarn('tasks', 'POST /api/tasks rejected: no database');
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const row = await createTask(db, (req.body || {}) as Record<string, unknown>);
      return res.status(201).json(row);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('tasks', 'POST /api/tasks failed', e);
      return res.status(500).json({ error: 'Failed to create task' });
    }
  });

  r.get('/api/tasks/:id', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const row = await getTaskById(db, req.params.id);
      if (!row) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.json(row);
    } catch (e) {
      serviceError('tasks', 'GET /api/tasks/:id failed', e);
      return res.status(500).json({ error: 'Failed to load task' });
    }
  });

  r.patch('/api/tasks/:id', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      const row = await patchTask(db, req.params.id, (req.body || {}) as Record<string, unknown>);
      return res.json(row);
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('tasks', 'PATCH /api/tasks/:id failed', e);
      return res.status(500).json({ error: 'Failed to update task' });
    }
  });

  r.delete('/api/tasks/:id', async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Database not configured' });
    }
    try {
      await deleteTask(db, req.params.id);
      return res.json({ ok: true });
    } catch (e) {
      const sc = getErrorStatus(e);
      if (sc) {
        return res.status(sc).json({ error: e instanceof Error ? e.message : 'Error' });
      }
      serviceError('tasks', 'DELETE /api/tasks/:id failed', e);
      return res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  return r;
}
