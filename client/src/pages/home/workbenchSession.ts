export const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Agent 消息列表在 chatByModeId 中的键（按模式 + 数据库会话） */
export function agentChatStateKey(modeId: unknown, sessionId: unknown) {
  const sid =
    sessionId != null && SESSION_UUID_RE.test(String(sessionId).trim())
      ? String(sessionId).trim()
      : '';
  return `${modeId}::${sid || '_none_'}`;
}

export function formatWorkbenchSessionLabel(s: Record<string, unknown>) {
  const title = String(s.list_title ?? s.preview ?? '').trim();
  const shortId = typeof s.id === 'string' ? s.id.slice(0, 8) : '';
  const nRaw = s.paragraph_count ?? s.paragraphCount;
  const n =
    typeof nRaw === 'number' && !Number.isNaN(nRaw)
      ? nRaw
      : typeof nRaw === 'string' && nRaw.trim()
        ? Number(nRaw.trim())
        : null;
  const seg = typeof n === 'number' && Number.isFinite(n) ? ` · ${Math.max(0, Math.floor(n))} 段` : '';
  if (title) return `${title} · ${shortId}…${seg}`;
  if (typeof n === 'number' && Number.isFinite(n))
    return `会话 ${shortId}… · ${Math.max(0, Math.floor(n))} 段`;
  return `会话 ${shortId}…`;
}
