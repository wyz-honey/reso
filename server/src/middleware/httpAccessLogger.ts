import type { Request, Response, NextFunction } from 'express';
import { isHttpAccessLogEnabled, serviceLog } from '~/utils/logger.ts';

export function httpAccessLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isHttpAccessLogEnabled()) {
      next();
      return;
    }
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      serviceLog('http', `${req.method} ${req.originalUrl}`, {
        status: res.statusCode,
        ms,
        ...(req.ip ? { ip: req.ip } : {}),
      });
    });
    next();
  };
}
