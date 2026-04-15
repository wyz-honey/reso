import { Agent } from '@mariozechner/pi-agent-core';
import { streamSimple } from '@mariozechner/pi-ai';
import type { Message } from '@mariozechner/pi-ai';
import type { AppDb } from '~/database/db.ts';
import { resolveResoSystemPrompt } from '~/agents/reso/prompts/defaultSystem.ts';
import { createAgUiPiBridge } from '~/agents/reso/agUiBridge.ts';
import { createDashscopeOpenAiCompletionsModel } from '~/agents/reso/dashscopePiModel.ts';
import { buildResoAgentTools } from '~/agents/reso/resoAgentTools.ts';
import { threadRowsToPiMessages } from '~/agents/reso/threadMessagesToPi.ts';
import {
  finalizeChatTurnStream,
  getChatThreadAgentMemory,
  loadThreadHistory,
} from '~/services/chatThreadService.ts';
import { resolveChatModel, resolveDashscopeApiKey } from '~/services/dashscopeChat.ts';
import { AppError } from '~/utils/appError.ts';

function buildSystemWithMemory(base: string, memory: string): string {
  const m = memory.trim();
  if (!m) return base;
  return `${base}\n\n## 线程知识记忆（可通过工具 reso_memory_read / reso_memory_append 维护）\n${m}`;
}

function extractDisplayTextFromNewMessages(msgs: Message[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'assistant') continue;
    if (m.errorMessage?.trim()) {
      return m.errorMessage.trim();
    }
    const texts = m.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text);
    const joined = texts.join('').trim();
    if (joined) return joined;
    const hasTools = m.content.some((c) => c.type === 'toolCall');
    if (hasTools) {
      return '（本轮已通过工具完成；若无自然语言总结可继续追问。）';
    }
  }
  return '';
}

type SseWriter = (obj: Record<string, unknown>) => void;

/**
 * 使用 pi-agent-core + 百炼 compatible-mode；SSE 上推送 AG-UI 事件并在末尾写 `done`（含 DB 全量消息）。
 */
export async function runResoPiChatStream(params: {
  db: AppDb;
  threadId: string;
  system: unknown;
  modelOverride: unknown;
  dashscopeApiKey: unknown;
  writeSse: SseWriter;
}): Promise<void> {
  const { db, threadId, writeSse } = params;
  const apiKey = resolveDashscopeApiKey(params.dashscopeApiKey);
  if (!apiKey) {
    throw new AppError(
      '缺少百炼 API Key：请在设置页填写或配置服务端 DASHSCOPE_API_KEY',
      503
    );
  }

  const modelId = resolveChatModel(params.modelOverride);
  const model = createDashscopeOpenAiCompletionsModel(modelId);
  const hist = await loadThreadHistory(db, threadId);
  const memory = await getChatThreadAgentMemory(db, threadId);
  const systemPrompt = buildSystemWithMemory(resolveResoSystemPrompt(params.system), memory);

  const piMessages = threadRowsToPiMessages(hist, model);
  const beforeLen = piMessages.length;
  const runId = crypto.randomUUID();
  const bridge = createAgUiPiBridge({ threadId, runId, writeSse });

  const tools = buildResoAgentTools({ db, threadId });

  const agent = new Agent({
    streamFn: streamSimple,
    getApiKey: () => apiKey,
    sessionId: threadId,
    initialState: {
      systemPrompt,
      model,
      tools,
      messages: piMessages,
    },
    toolExecution: 'sequential',
  });

  agent.subscribe(async (event) => {
    bridge.onAgentEvent(event);
  });

  await agent.continue();

  const after = agent.state.messages;
  const appended = after.slice(beforeLen);
  const assistantText = extractDisplayTextFromNewMessages(appended);

  const messages = await finalizeChatTurnStream(db, threadId, assistantText);
  writeSse({ type: 'done', messages });
}
