const KEY = 'reso_agent_thread_by_mode_v1';
const KEY_BY_SESSION = 'reso_agent_thread_by_mode_session_v1';

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

function readSessionMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY_BY_SESSION);
    const m = raw ? JSON.parse(raw) : {};
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

function writeSessionMap(m: Record<string, string>) {
  localStorage.setItem(KEY_BY_SESSION, JSON.stringify(m));
}

export function agentSessionThreadCompositeKey(
  modeId: string | null | undefined,
  sessionId: string | null | undefined
): string | null {
  if (!modeId) return null;
  const sid = String(sessionId ?? '').trim();
  if (!sid) return null;
  return `${modeId}::${sid}`;
}

export function getAgentThreadIdForSession(
  modeId: string | null | undefined,
  sessionId: string | null | undefined
): string | null {
  const ck = agentSessionThreadCompositeKey(modeId, sessionId);
  if (!ck) return null;
  const v = readSessionMap()[ck];
  return typeof v === 'string' ? v : null;
}

export function setAgentThreadIdForSession(
  modeId: string | null | undefined,
  sessionId: string | null | undefined,
  threadId: string
) {
  const ck = agentSessionThreadCompositeKey(modeId, sessionId);
  if (!ck || !threadId) return;
  const m = readSessionMap();
  m[ck] = threadId;
  writeSessionMap(m);
}

export function removeAgentThreadIdForSession(
  modeId: string | null | undefined,
  sessionId: string | null | undefined
) {
  const ck = agentSessionThreadCompositeKey(modeId, sessionId);
  if (!ck) return;
  const m = readSessionMap();
  delete m[ck];
  writeSessionMap(m);
}

export function removeAllAgentThreadIdsForMode(modeId: string | null | undefined) {
  if (!modeId) return;
  const prefix = `${modeId}::`;
  const m = readSessionMap();
  const next = { ...m };
  for (const k of Object.keys(next)) {
    if (k.startsWith(prefix)) delete next[k];
  }
  writeSessionMap(next);
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
