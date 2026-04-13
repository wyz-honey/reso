export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function getErrorStatus(e: unknown): number | undefined {
  if (isAppError(e)) return e.statusCode;
  if (e && typeof e === 'object' && 'statusCode' in e) {
    const sc = (e as { statusCode?: number }).statusCode;
    return typeof sc === 'number' ? sc : undefined;
  }
  return undefined;
}
