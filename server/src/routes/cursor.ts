import path from 'path';
import { Router } from 'express';
import { getCursorOutputRootResolved } from '~/services/cursorPaths.ts';
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
    const dirAbs = path.join(root, sid);
    return res.json({
      rootAbs: root,
      dirAbs,
      infoTxtAbs: path.join(dirAbs, 'info.txt'),
      errorTxtAbs: path.join(dirAbs, 'error.txt'),
    });
  });

  return r;
}
