import type { Request, Response } from 'express';

function readBearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return undefined;
  return h.slice('Bearer '.length).trim() || undefined;
}

export function createUiControlPushHandler(opts: {
  getSecret: () => string;
  broadcast: (commands: unknown[]) => number;
}): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    const secret = opts.getSecret();
    if (secret) {
      const token = readBearer(req) ?? (typeof req.headers['x-reso-ui-control-token'] === 'string'
        ? String(req.headers['x-reso-ui-control-token']).trim()
        : undefined);
      if (!token || token !== secret) {
        res.status(401).json({ ok: false, error: 'unauthorized' });
        return;
      }
    }

    const body = req.body as { commands?: unknown };
    if (!body || !Array.isArray(body.commands)) {
      res.status(400).json({ ok: false, error: 'body.commands must be an array' });
      return;
    }

    const n = opts.broadcast(body.commands);
    res.json({ ok: true, subscribers: n });
  };
}
