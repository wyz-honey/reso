import type { ChatRole, UpstreamChatMessage } from '~/entities/chat.ts';
import { resolveResoSystemPrompt } from '~/agents/reso/prompts/defaultSystem.ts';

/**
 * 从客户端消息列表构建上游 payload（含 system）。
 * 用于 POST /api/agent/chat。
 */
export function buildStatelessPayload(
  messages: Array<{ role?: string; content?: string }>,
  system: unknown
): UpstreamChatMessage[] {
  const cleaned = messages.filter(
    (m) =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.length > 0
  );
  const payload: UpstreamChatMessage[] = [];
  const sys = resolveResoSystemPrompt(system);
  payload.push({ role: 'system', content: sys });
  for (const m of cleaned) {
    payload.push({ role: m.role as 'user' | 'assistant', content: m.content! });
  }
  return payload;
}

/**
 * 从线程历史行构建上游消息（system + 按序 user/assistant）。
 */
export function buildThreadPayload(
  historyRows: Array<{ role: string; content: string }>,
  system: unknown
): UpstreamChatMessage[] {
  const payload: UpstreamChatMessage[] = [];
  const sys = resolveResoSystemPrompt(system);
  payload.push({ role: 'system', content: sys });
  for (const row of historyRows) {
    if (row.role === 'user' || row.role === 'assistant') {
      payload.push({ role: row.role, content: row.content });
    }
  }
  return payload;
}

export type { UpstreamChatMessage } from '~/entities/chat.ts';
export { resolveResoSystemPrompt, DEFAULT_RESO_SYSTEM_PROMPT } from '~/agents/reso/prompts/defaultSystem.ts';
export { RESO_TOOL_DEFINITIONS } from '~/agents/reso/tools/definitions.ts';
export { resoToolRegistry, registerResoTool } from '~/agents/reso/tools/registry.ts';
