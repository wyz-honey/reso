import path from 'path';
import { Router } from 'express';
import {
  ensureCursorSessionOutputDir,
  getCursorOutputRootResolved,
} from '~/services/cursorPaths.ts';
import {
  getCursorRunStatus,
  startCursorRun,
  stopCursorRun,
} from '~/services/cursorRunManager.ts';
import { parseCliEnvPayload } from '~/utils/cliEnvMerge.ts';
import { isValidUuid } from '~/utils/validation.ts';

export function createCursorRouter(): Router {
  const r = Router();

  /** 在服务端执行 Cursor 剪贴板同款 shell 命令（子进程）；需能访问本机 agent 与输出路径 */
  r.post('/api/cursor/run', (req, res) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const command = typeof req.body?.command === 'string' ? req.body.command : '';
    if (!isValidUuid(sessionId)) {
      return res.status(400).json({ error: 'Invalid or missing sessionId' });
    }
    const cliEnv = parseCliEnvPayload(req.body?.cliEnv);
    const out = startCursorRun(sessionId, command, cliEnv);
    if (!out.ok) {
      return res.status(400).json({ error: out.error });
    }
    return res.json({ ok: true, pid: out.pid });
  });

  r.post('/api/cursor/stop', (req, res) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (!isValidUuid(sessionId)) {
      return res.status(400).json({ error: 'Invalid or missing sessionId' });
    }
    const out = stopCursorRun(sessionId);
    return res.json({ ok: true, stopped: out.ok });
  });

  r.get('/api/cursor/run-status', (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
    if (!isValidUuid(sessionId)) {
      return res.status(400).json({ error: 'Invalid or missing sessionId' });
    }
    const st = getCursorRunStatus(sessionId);
    return res.json(st);
  });

  r.get('/api/cursor/session-paths', (req, res) => {
    const sessionId = req.query.sessionId;
    if (typeof sessionId !== 'string' || !isValidUuid(sessionId.trim())) {
      return res.status(400).json({ error: 'Invalid or missing sessionId' });
    }
    const sid = sessionId.trim();
    const root = getCursorOutputRootResolved();
    let dirAbs: string;
    try {
      dirAbs = ensureCursorSessionOutputDir(sid);
    } catch (e) {
      return res.status(500).json({
        error: e instanceof Error ? e.message : 'Failed to create cursor output directory',
      });
    }
    return res.json({
      rootAbs: root,
      dirAbs,
      infoTxtAbs: path.join(dirAbs, 'info.txt'),
      errorTxtAbs: path.join(dirAbs, 'error.txt'),
    });
  });

  return r;
}
