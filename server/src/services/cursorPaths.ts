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
