import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type CliWorkbenchKind = 'cursor' | 'qoder';

/** `server/src/services` → `server/outputs/cursor`（其下按会话 ID 分子目录） */
export function getCursorOutputRootResolved(): string {
  return path.resolve(
    process.env.RESO_CURSOR_OUTPUT_DIR || path.join(__dirname, '..', '..', 'outputs', 'cursor')
  );
}

function getQoderOutputRootResolved(): string {
  return path.resolve(
    process.env.RESO_QODER_OUTPUT_DIR || path.join(__dirname, '..', '..', 'outputs', 'qoder')
  );
}

export function getCliWorkbenchOutputRoot(kind: CliWorkbenchKind): string {
  return kind === 'qoder' ? getQoderOutputRootResolved() : getCursorOutputRootResolved();
}

/** 会话输出目录绝对路径（不创建目录） */
export function resolveCliWorkbenchSessionDirAbs(sessionId: string, kind: CliWorkbenchKind): string {
  const sid = String(sessionId || '').trim();
  return path.join(getCliWorkbenchOutputRoot(kind), sid);
}

function formatTurnTimestamp(d = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}

function uniqueAssistantTurnDirName(): string {
  return `assistant-${formatTurnTimestamp()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function resolveCursorSessionDirAbs(sessionId: string): string {
  return resolveCliWorkbenchSessionDirAbs(sessionId, 'cursor');
}

/** 确保 `outputs/<cursor|qoder>/<sessionId>/` 存在；供 REST 与 WS 共用 */
export function ensureCliWorkbenchSessionOutputDir(
  sessionId: string,
  kind: CliWorkbenchKind = 'cursor'
): string {
  const dirAbs = resolveCliWorkbenchSessionDirAbs(sessionId, kind);
  fs.mkdirSync(dirAbs, { recursive: true });
  return dirAbs;
}

/** 每次发送前分配一个独立轮次目录：outputs/<kind>/<sessionId>/assistant-<ts>-<rand>/ */
export function ensureCliWorkbenchAssistantTurnOutputDir(
  sessionId: string,
  kind: CliWorkbenchKind = 'cursor'
): string {
  const sessionDir = ensureCliWorkbenchSessionOutputDir(sessionId, kind);
  const turnDir = path.join(sessionDir, uniqueAssistantTurnDirName());
  fs.mkdirSync(turnDir, { recursive: true });
  return turnDir;
}

/** 会话下最新 assistant 轮次目录（按目录名倒序）；不存在返回 null */
export function resolveLatestCliWorkbenchAssistantTurnDir(
  sessionId: string,
  kind: CliWorkbenchKind = 'cursor'
): string | null {
  const sessionDir = ensureCliWorkbenchSessionOutputDir(sessionId, kind);
  let names: string[] = [];
  try {
    names = fs.readdirSync(sessionDir);
  } catch {
    return null;
  }
  const latest = names
    .filter((n) => /^assistant-\d{8}-\d{6}-\d{3}-[a-z0-9]{4}$/i.test(n))
    .sort()
    .at(-1);
  return latest ? path.join(sessionDir, latest) : null;
}

/** @deprecated 使用 ensureCliWorkbenchSessionOutputDir(sessionId, 'cursor') */
export function ensureCursorSessionOutputDir(sessionId: string): string {
  return ensureCliWorkbenchSessionOutputDir(sessionId, 'cursor');
}

export function readCursorSessionFilesSync(dirAbs: string): { info: string; error: string } {
  const infoPath = path.join(dirAbs, 'info.txt');
  const errPath = path.join(dirAbs, 'error.txt');
  let info = '';
  let error = '';
  try {
    if (fs.existsSync(infoPath)) info = fs.readFileSync(infoPath, 'utf8');
  } catch {
    info = '';
  }
  try {
    if (fs.existsSync(errPath)) error = fs.readFileSync(errPath, 'utf8');
  } catch {
    error = '';
  }
  return { info, error };
}
