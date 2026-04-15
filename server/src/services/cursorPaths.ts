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
