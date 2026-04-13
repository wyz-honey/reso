import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function ts(): string {
  return new Date().toISOString();
}

const logsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../logs');

/** 常规运行日志（不含异常堆栈） */
const logFilePath = path.join(logsDir, 'reso.log');

/** 仅 `serviceError` 写入：消息 + JSON + 堆栈 */
const errorLogFilePath = path.join(logsDir, 'reso-errors.log');

function logFileDisabled(): boolean {
  const v = process.env.RESO_LOG_FILE?.toLowerCase();
  return v === '0' || v === 'false' || v === 'off';
}

function errorLogFileDisabled(): boolean {
  const v = process.env.RESO_ERROR_LOG_FILE?.toLowerCase();
  return v === '0' || v === 'false' || v === 'off';
}

let logDirEnsured = false;
let logFileWarned = false;

function appendLogFile(chunk: string): void {
  if (logFileDisabled()) return;
  try {
    if (!logDirEnsured) {
      fs.mkdirSync(logsDir, { recursive: true });
      logDirEnsured = true;
    }
    const line = chunk.endsWith('\n') ? chunk : `${chunk}\n`;
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch (err) {
    if (!logFileWarned) {
      logFileWarned = true;
      console.warn('[reso] log file write failed:', logFilePath, err);
    }
  }
}

let errorLogDirEnsured = false;
let errorLogFileWarned = false;

function appendErrorLogFile(chunk: string): void {
  if (errorLogFileDisabled()) return;
  try {
    if (!errorLogDirEnsured) {
      fs.mkdirSync(logsDir, { recursive: true });
      errorLogDirEnsured = true;
    }
    const line = chunk.endsWith('\n') ? chunk : `${chunk}\n`;
    fs.appendFileSync(errorLogFilePath, line, 'utf8');
  } catch (err) {
    if (!errorLogFileWarned) {
      errorLogFileWarned = true;
      console.warn('[reso] error log file write failed:', errorLogFilePath, err);
    }
  }
}

function shouldExposeErrorDetail(): boolean {
  if (process.env.RESO_EXPOSE_ERRORS === '1') return true;
  if (process.env.NODE_ENV === 'production') return false;
  return true;
}

/** 生产仅 `RESO_EXPOSE_ERRORS=1`；本地开发（非 production）默认附带 detail/pgCode 便于排错。 */
export function errorDetailForClient(err: unknown): Record<string, string> {
  if (!shouldExposeErrorDetail()) return {};
  const o: Record<string, string> = {};
  if (err instanceof Error && err.message) o.detail = err.message;
  else if (err != null) o.detail = String(err);
  if (err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string') {
    o.pgCode = (err as { code: string }).code;
  }
  return o;
}

function errorCauses(err: unknown, depth = 0): unknown[] {
  if (depth > 5 || !(err instanceof Error)) return [];
  const c = (err as Error & { cause?: unknown }).cause;
  if (c === undefined || c === null) return [];
  return [c, ...errorCauses(c, depth + 1)];
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as Error & Record<string, unknown>;
    const o: Record<string, unknown> = {
      name: e.name,
      message: e.message,
    };
    if (e.stack) o.stack = e.stack;
    if (typeof e.code === 'string') o.code = e.code;
    if (typeof e.detail === 'string') o.detail = e.detail;
    if (typeof e.hint === 'string') o.hint = e.hint;
    if (typeof e.constraint === 'string') o.constraint = e.constraint;
    if (typeof e.table === 'string') o.table = e.table;
    if (typeof e.column === 'string') o.column = e.column;
    if (typeof e.schema === 'string') o.schema = e.schema;
    if (typeof e.severity === 'string') o.severity = e.severity;
    if (typeof e.position === 'string') o.position = e.position;
    if (typeof e.routine === 'string') o.routine = e.routine;
    const causes = errorCauses(err);
    if (causes.length > 0) {
      o.causes = causes.map((c) => serializeError(c));
    }
    return o;
  }
  if (err instanceof Error) {
    const o: Record<string, unknown> = { name: err.name, message: err.message, stack: err.stack };
    const causes = errorCauses(err);
    if (causes.length > 0) o.causes = causes.map((c) => serializeError(c));
    return o;
  }
  return { value: String(err) };
}

export function serviceLog(scope: string, message: string, meta?: Record<string, unknown>): void {
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const line = `[reso ${ts()}] [${scope}] ${message}${suffix}`;
  appendLogFile(line);
  console.log(line);
}

export function serviceWarn(scope: string, message: string, meta?: Record<string, unknown>): void {
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const line = `[reso ${ts()}] [${scope}] ${message}${suffix}`;
  appendLogFile(line);
  console.warn(line);
}

function safeJsonLines(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return JSON.stringify({ fallback: String(obj) });
  }
}

function appendErrorStacks(err: unknown, depth = 0): void {
  if (depth > 5) return;
  if (!(err instanceof Error)) return;
  if (err.stack) {
    appendErrorLogFile(err.stack);
    console.error(err.stack);
  }
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    appendErrorLogFile(`[cause ${depth + 1}]`);
    console.error(`[cause ${depth + 1}]`, cause);
    appendErrorStacks(cause, depth + 1);
  }
}

export function serviceError(scope: string, message: string, err?: unknown): void {
  const head = `[reso ${ts()}] [${scope}] ${message}`;
  appendErrorLogFile(head);
  console.error(head);
  if (err !== undefined && err !== null) {
    const body = safeJsonLines(serializeError(err));
    appendErrorLogFile(body);
    console.error(body);
    appendErrorLogFile('--- stack trace(s) ---');
    console.error('--- stack trace(s) ---');
    appendErrorStacks(err);
  }
  appendErrorLogFile('');
}

export function isVerboseLog(): boolean {
  const v = process.env.RESO_LOG?.toLowerCase();
  return v === '1' || v === 'true' || v === 'debug' || v === 'verbose';
}

export function isHttpAccessLogEnabled(): boolean {
  const h = process.env.RESO_LOG_HTTP?.toLowerCase();
  if (h === '1' || h === 'true') return true;
  return isVerboseLog();
}

/** 常规日志路径 */
export function getLogFilePath(): string {
  return logFilePath;
}

/** 错误日志路径（仅 serviceError） */
export function getErrorLogFilePath(): string {
  return errorLogFilePath;
}
