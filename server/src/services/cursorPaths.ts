import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `server/src/services` → `server/outputs/cursor`（其下按会话 ID 分子目录） */
export function getCursorOutputRootResolved(): string {
  return path.resolve(
    process.env.RESO_CURSOR_OUTPUT_DIR || path.join(__dirname, '..', '..', 'outputs', 'cursor')
  );
}

/** 会话输出目录绝对路径（不创建目录） */
export function resolveCursorSessionDirAbs(sessionId: string): string {
  const sid = String(sessionId || '').trim();
  return path.join(getCursorOutputRootResolved(), sid);
}

/** 确保 `outputs/cursor/<sessionId>/` 存在；供 REST 与 WS 共用，避免终端重定向时父目录不存在 */
export function ensureCursorSessionOutputDir(sessionId: string): string {
  const dirAbs = resolveCursorSessionDirAbs(sessionId);
  fs.mkdirSync(dirAbs, { recursive: true });
  return dirAbs;
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
