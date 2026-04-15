import { CURSOR_EXTERNAL_THREAD_PROVIDER } from './constants/builtins';

async function parseJson(r: Response): Promise<Record<string, unknown>> {
  return r.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function normalizeParagraphCount(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return Math.max(0, Math.floor(raw));
  if (typeof raw === 'bigint') return Number(raw) || 0;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return 0;
}

function normalizeSessionListItem(row: Record<string, unknown>): Record<string, unknown> {
  const pc = row.paragraph_count ?? row.paragraphCount;
  return {
    ...row,
    paragraph_count: normalizeParagraphCount(pc),
  };
}

/**
 * 服务端 meta：cwd（或 RESO_DEFAULT_WORKSPACE）、externalThreadProvider（或 RESO_EXTERNAL_THREAD_PROVIDER）。
 */
export async function fetchServerMeta(): Promise<{
  cwd: string;
  externalThreadProvider: string;
} | null> {
  try {
    const r = await fetch('/api/meta');
    const data = await parseJson(r);
    if (!r.ok) return null;
    const cwd = typeof data.cwd === 'string' ? data.cwd.trim() : '';
    const externalThreadProvider =
      typeof data.externalThreadProvider === 'string' && data.externalThreadProvider.trim()
        ? String(data.externalThreadProvider).trim()
        : CURSOR_EXTERNAL_THREAD_PROVIDER;
    return { cwd, externalThreadProvider };
  } catch {
    return null;
  }
}

export async function apiCreateSession(): Promise<string> {
  const r = await fetch('/api/sessions', { method: 'POST' });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `创建会话失败 (${r.status})`));
  return data.id as string;
}

export async function fetchCursorSessionPaths(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const r = await fetch(`/api/cursor/session-paths?sessionId=${encodeURIComponent(sid)}`);
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `解析 Cursor 输出路径失败 (${r.status})`));
  return data;
}

/** 在服务端以 shell 子进程执行 Cursor CLI 命令（与剪贴板内容一致） */
export async function apiCursorRun(
  sessionId: string,
  command: string,
  options?: { cliEnv?: Record<string, string> }
): Promise<{ pid: number }> {
  const sid = String(sessionId || '').trim();
  const body: Record<string, unknown> = { sessionId: sid, command: String(command ?? '') };
  if (options?.cliEnv && Object.keys(options.cliEnv).length > 0) {
    body.cliEnv = options.cliEnv;
  }
  const r = await fetch('/api/cursor/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson(r);
  if (!r.ok) {
    throw new Error(String(data.error || `启动 Cursor 子进程失败 (${r.status})`));
  }
  const pid = typeof data.pid === 'number' ? data.pid : 0;
  return { pid };
}

/** 终止该会话在服务端运行的 Cursor CLI 子进程（含进程组，POSIX） */
export async function apiCursorStop(sessionId: string): Promise<void> {
  const sid = String(sessionId || '').trim();
  await fetch('/api/cursor/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sid }),
  });
}

/** Cursor CLI 工作台：数据库中的对话历史（与 outputs/cursor/.../info.txt 并行） */
export type CliWorkbenchChatRow = { id?: string; role: string; content: string };

export async function fetchCliWorkbenchChat(
  sessionId: string,
  modeId: string
): Promise<{ messages: CliWorkbenchChatRow[] }> {
  const sid = String(sessionId || '').trim();
  const mid = String(modeId || '').trim();
  const q = new URLSearchParams({ modeId: mid });
  const r = await fetch(`/api/sessions/${encodeURIComponent(sid)}/cli-workbench-chat?${q}`);
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `加载工作台对话失败 (${r.status})`));
  const messages = data.messages;
  return {
    messages: Array.isArray(messages)
      ? (messages as CliWorkbenchChatRow[]).filter(
          (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        )
      : [],
  };
}

export async function apiAppendCliWorkbenchChatMessage(
  sessionId: string,
  modeId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<{ threadId: string; messageId: string }> {
  const sid = String(sessionId || '').trim();
  const mid = String(modeId || '').trim();
  const r = await fetch(`/api/sessions/${encodeURIComponent(sid)}/cli-workbench-chat/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modeId: mid, role, content: String(content ?? '') }),
  });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `写入工作台对话失败 (${r.status})`));
  return {
    threadId: String(data.threadId || ''),
    messageId: String(data.messageId || ''),
  };
}

export async function fetchCursorRunStatus(
  sessionId: string
): Promise<{ running: boolean; pid: number | null }> {
  const sid = String(sessionId || '').trim();
  const r = await fetch(`/api/cursor/run-status?sessionId=${encodeURIComponent(sid)}`);
  const data = await parseJson(r);
  if (!r.ok) {
    throw new Error(String(data.error || `查询子进程状态失败 (${r.status})`));
  }
  return {
    running: Boolean(data.running),
    pid: typeof data.pid === 'number' ? data.pid : null,
  };
}

export type SessionExternalThreadRow = {
  provider: string;
  threadId: string;
  updatedAt: string;
};

/** GET /api/sessions/:id/external-threads */
export async function fetchSessionExternalThreads(sessionId: string): Promise<SessionExternalThreadRow[]> {
  const sid = String(sessionId || '').trim();
  const r = await fetch(`/api/sessions/${encodeURIComponent(sid)}/external-threads`);
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `加载外部 CLI 映射失败 (${r.status})`));
  const threads = data.threads;
  if (!Array.isArray(threads)) return [];
  return threads.filter(
    (x: unknown): x is SessionExternalThreadRow =>
      x != null &&
      typeof x === 'object' &&
      typeof (x as SessionExternalThreadRow).provider === 'string' &&
      typeof (x as SessionExternalThreadRow).threadId === 'string'
  );
}

/** PUT /api/sessions/:id/external-threads/:provider body { threadId }；空字符串表示删除该映射 */
export async function apiPutSessionExternalThread(
  sessionId: string,
  provider: string,
  threadId: string
): Promise<void> {
  const sid = String(sessionId || '').trim();
  const r = await fetch(
    `/api/sessions/${encodeURIComponent(sid)}/external-threads/${encodeURIComponent(provider)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId }),
    }
  );
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `保存外部 CLI 映射失败 (${r.status})`));
}

export async function apiDeleteSessionExternalThread(sessionId: string, provider: string): Promise<void> {
  const sid = String(sessionId || '').trim();
  const r = await fetch(
    `/api/sessions/${encodeURIComponent(sid)}/external-threads/${encodeURIComponent(provider)}`,
    { method: 'DELETE' }
  );
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `清除外部 CLI 映射失败 (${r.status})`));
}

/** 检测 Reso 服务端是否已为这些变量名设置非空值（不返回具体值） */
export async function apiMetaCliEnvPresence(names: string[]): Promise<Record<string, boolean>> {
  const uniq = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))].slice(0, 64);
  if (uniq.length === 0) return {};
  const r = await fetch('/api/meta/cli-env-presence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names: uniq }),
  });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `检测环境变量失败 (${r.status})`));
  const p = data.presence;
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, boolean>) : {};
}

/** POST …/ensure：有映射则复用，否则本机执行 agent create-chat 并落库；可选 cliEnv 填补服务端未设置的键 */
export async function apiEnsureSessionExternalThread(
  sessionId: string,
  provider: string,
  options?: { cliEnv?: Record<string, string> }
): Promise<{ threadId: string; created: boolean }> {
  const sid = String(sessionId || '').trim();
  const body: Record<string, unknown> = {};
  if (options?.cliEnv && Object.keys(options.cliEnv).length > 0) {
    body.cliEnv = options.cliEnv;
  }
  const r = await fetch(
    `/api/sessions/${encodeURIComponent(sid)}/external-threads/${encodeURIComponent(provider)}/ensure`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await parseJson(r);
  if (!r.ok) {
    const base = String(data.error || '').trim();
    const detail = typeof data.detail === 'string' && data.detail.trim() ? data.detail.trim() : '';
    if (detail) throw new Error(base ? `${base}：${detail}` : detail);
    if (base) throw new Error(base);
    throw new Error(`关联 Cursor 对话失败（HTTP ${r.status}）`);
  }
  const threadId = typeof data.threadId === 'string' ? data.threadId.trim() : '';
  if (!threadId) throw new Error('服务器未返回有效关联结果');
  return {
    threadId,
    created: Boolean(data.created),
  };
}

export async function apiSaveParagraph(sessionId: string, content: string) {
  const r = await fetch(`/api/sessions/${sessionId}/paragraphs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `保存段落失败 (${r.status})`));
  return data;
}

export async function fetchSessionList(params: Record<string, unknown> = {}) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', String(params.q));
  if (params.filter && params.filter !== 'all') sp.set('filter', String(params.filter));
  if (params.page != null) sp.set('page', String(params.page));
  if (params.pageSize != null) sp.set('pageSize', String(params.pageSize));
  const qs = sp.toString();
  const r = await fetch(qs ? `/api/sessions?${qs}` : '/api/sessions');
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `加载会话列表失败 (${r.status})`));
  const rawSessions = Array.isArray(data.sessions) ? (data.sessions as Record<string, unknown>[]) : [];
  return {
    sessions: rawSessions.map(normalizeSessionListItem),
    total: typeof data.total === 'number' ? data.total : rawSessions.length,
    page: (data.page as number) || 1,
    pageSize: (data.pageSize as number) || 10,
  };
}

export async function fetchSessionDetail(sessionId: string) {
  const r = await fetch(`/api/sessions/${sessionId}`);
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `加载会话失败 (${r.status})`));
  return data;
}

export async function apiDeleteSessionParagraphs(sessionId: string) {
  const r = await fetch(`/api/sessions/${sessionId}/paragraphs`, { method: 'DELETE' });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `清空段落失败 (${r.status})`));
  return data;
}

export async function apiDeleteSession(sessionId: string) {
  const r = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `删除会话失败 (${r.status})`));
  return data;
}

/** `POST /api/sessions/batch-delete`，body `{ ids }`，单次最多 100 条。 */
export async function apiBatchDeleteSessions(ids: string[]) {
  const r = await fetch('/api/sessions/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `批量删除失败 (${r.status})`));
  return {
    deleted: typeof data.deleted === 'number' ? data.deleted : 0,
    ok: Boolean(data.ok),
  };
}

export async function apiAgentChat(bodyIn: {
  messages: unknown[];
  system?: string;
  model?: string;
  dashscopeApiKey?: string;
}) {
  const body: Record<string, unknown> = {
    messages: bodyIn.messages,
    system: bodyIn.system,
    model: bodyIn.model || undefined,
  };
  if (typeof bodyIn.dashscopeApiKey === 'string' && bodyIn.dashscopeApiKey.trim()) {
    body.dashscopeApiKey = bodyIn.dashscopeApiKey.trim();
  }
  const r = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `对话请求失败 (${r.status})`));
  return data;
}

export async function apiAgentChatTurn(bodyIn: {
  modeId: string;
  threadId?: string | null;
  userText: string;
  system?: string;
  model?: string;
  dashscopeApiKey?: string;
  sessionId?: string | null;
}) {
  const body: Record<string, unknown> = {
    modeId: bodyIn.modeId,
    threadId: bodyIn.threadId || null,
    userText: bodyIn.userText,
    system: bodyIn.system,
    model: bodyIn.model || undefined,
  };
  if (typeof bodyIn.sessionId === 'string' && bodyIn.sessionId.trim()) {
    body.sessionId = bodyIn.sessionId.trim();
  }
  if (typeof bodyIn.dashscopeApiKey === 'string' && bodyIn.dashscopeApiKey.trim()) {
    body.dashscopeApiKey = bodyIn.dashscopeApiKey.trim();
  }
  const r = await fetch('/api/agent/chat-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `对话失败 (${r.status})`));
  return data;
}

export async function apiAgentChatTurnStream(
  bodyIn: {
    modeId: string;
    threadId?: string | null;
    userText: string;
    system?: string;
    model?: string;
    dashscopeApiKey?: string;
    sessionId?: string | null;
  },
  onEvent: (ev: Record<string, unknown>) => void
) {
  const body: Record<string, unknown> = {
    modeId: bodyIn.modeId,
    threadId: bodyIn.threadId || null,
    userText: bodyIn.userText,
    system: bodyIn.system,
    model: bodyIn.model || undefined,
  };
  if (typeof bodyIn.sessionId === 'string' && bodyIn.sessionId.trim()) {
    body.sessionId = bodyIn.sessionId.trim();
  }
  if (typeof bodyIn.dashscopeApiKey === 'string' && bodyIn.dashscopeApiKey.trim()) {
    body.dashscopeApiKey = bodyIn.dashscopeApiKey.trim();
  }
  const r = await fetch('/api/agent/chat-turn-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const data = await parseJson(r);
    throw new Error(String(data.error || `对话失败 (${r.status})`));
  }
  if (!r.body) {
    throw new Error('浏览器不支持流式读取响应');
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const lines = block.split('\n');
      let dataLine = '';
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('data:')) {
          dataLine += t.slice(5).trimStart();
        }
      }
      if (!dataLine || dataLine === '[DONE]') continue;
      try {
        const j = JSON.parse(dataLine) as Record<string, unknown>;
        if (j.type === 'error') {
          throw new Error(String(j.error || '对话流失败'));
        }
        onEvent(j);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}

export async function fetchChatThread(threadId: string) {
  const r = await fetch(`/api/chat/threads/${threadId}`);
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `加载对话失败 (${r.status})`));
  return data;
}

export async function apiDeleteChatMessages(threadId: string) {
  const r = await fetch(`/api/chat/threads/${threadId}/messages`, { method: 'DELETE' });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `清空对话失败 (${r.status})`));
  return data;
}

export async function apiDeleteChatThread(threadId: string) {
  const r = await fetch(`/api/chat/threads/${threadId}`, { method: 'DELETE' });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `删除对话线程失败 (${r.status})`));
  return data;
}

export async function fetchQuickInputs() {
  const r = await fetch('/api/quick-inputs');
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `加载快捷上下文失败 (${r.status})`));
  return (data.items as unknown[]) || [];
}

export async function apiCreateQuickInput(body: Record<string, unknown>) {
  const r = await fetch('/api/quick-inputs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `创建失败 (${r.status})`));
  return data;
}

export async function apiUpdateQuickInput(id: string, patch: Record<string, unknown>) {
  const r = await fetch(`/api/quick-inputs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `更新失败 (${r.status})`));
  return data;
}

export async function apiDeleteQuickInput(id: string) {
  const r = await fetch(`/api/quick-inputs/${id}`, { method: 'DELETE' });
  const data = await parseJson(r);
  if (!r.ok) throw new Error(String(data.error || `删除失败 (${r.status})`));
  return data;
}
