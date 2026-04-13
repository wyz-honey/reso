const KEY = 'reso_agent_thread_by_mode_v1';

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    const m = raw ? JSON.parse(raw) : {};
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

function writeMap(m: Record<string, string>) {
  localStorage.setItem(KEY, JSON.stringify(m));
}

export function getThreadId(modeId: string | null | undefined): string | null {
  if (!modeId) return null;
  const v = readMap()[modeId];
  return typeof v === 'string' ? v : null;
}

export function setThreadId(modeId: string, threadId: string) {
  if (!modeId || !threadId) return;
  const m = readMap();
  m[modeId] = threadId;
  writeMap(m);
}

export function removeThreadId(modeId: string | null | undefined) {
  if (!modeId) return;
  const m = readMap();
  delete m[modeId];
  writeMap(m);
}
