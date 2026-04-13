import { AppError } from '~/utils/appError.ts';
import {
  CHAT_MODEL_ID_RE,
  DASHSCOPE_CHAT_BASE,
  DASHSCOPE_CHAT_MODEL,
} from '~/config/constants.ts';
import type { UpstreamChatMessage } from '~/entities/chat.ts';

export function resolveChatModel(override: unknown): string {
  if (typeof override === 'string' && override.trim()) {
    const m = override.trim();
    if (CHAT_MODEL_ID_RE.test(m)) return m;
  }
  return DASHSCOPE_CHAT_MODEL;
}

export function resolveDashscopeApiKey(bodyKey: unknown): string {
  const fromBody = typeof bodyKey === 'string' ? bodyKey.trim() : '';
  if (fromBody.length >= 8 && fromBody.length <= 512) return fromBody;
  const fromEnv = process.env.DASHSCOPE_API_KEY;
  return typeof fromEnv === 'string' && fromEnv.trim() ? fromEnv.trim() : '';
}

export async function invokeQwenChat(
  payloadMessages: UpstreamChatMessage[],
  modelOverride: unknown,
  apiKeyOverride: unknown
): Promise<string> {
  const apiKey = resolveDashscopeApiKey(apiKeyOverride);
  if (!apiKey) {
    throw new AppError(
      '缺少百炼 API Key：请在设置页填写或配置服务端 DASHSCOPE_API_KEY',
      503
    );
  }
  const model = resolveChatModel(modelOverride);
  const url = `${DASHSCOPE_CHAT_BASE.replace(/\/$/, '')}/chat/completions`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: payloadMessages,
    }),
  });
  const data = (await r.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
    msg?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!r.ok) {
    throw new AppError(
      data.error?.message || data.message || data.msg || `Upstream ${r.status}`,
      r.status >= 400 && r.status < 600 ? r.status : 502
    );
  }
  return data.choices?.[0]?.message?.content ?? '';
}

export async function invokeQwenChatStream(
  payloadMessages: UpstreamChatMessage[],
  modelOverride: unknown,
  apiKeyOverride: unknown,
  onDelta: (piece: string) => void
): Promise<void> {
  const apiKey = resolveDashscopeApiKey(apiKeyOverride);
  if (!apiKey) {
    throw new AppError(
      '缺少百炼 API Key：请在设置页填写或配置服务端 DASHSCOPE_API_KEY',
      503
    );
  }
  const model = resolveChatModel(modelOverride);
  const url = `${DASHSCOPE_CHAT_BASE.replace(/\/$/, '')}/chat/completions`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: payloadMessages,
      stream: true,
    }),
  });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
      msg?: string;
    };
    throw new AppError(
      data.error?.message || data.message || data.msg || `Upstream ${r.status}`,
      r.status >= 400 && r.status < 600 ? r.status : 502
    );
  }
  if (!r.body) {
    throw new AppError('上游未返回流式正文', 502);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (!line || line.startsWith(':')) continue;
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (typeof piece === 'string' && piece.length > 0) onDelta(piece);
      } catch {
        /* ignore */
      }
    }
  }
}
