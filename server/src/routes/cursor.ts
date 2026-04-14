import path from 'path';
import { Router } from 'express';
import {
  ensureCursorSessionOutputDir,
  getCursorOutputRootResolved,
} from '~/services/cursorPaths.ts';
import { isValidUuid } from '~/utils/validation.ts';

export function createCursorRouter(): Router {
  const r = Router();

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
