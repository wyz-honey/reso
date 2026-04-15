import type { AssistantMessage, Message, UserMessage } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** 将 DB 中的 user/assistant 纯文本行转为 pi-ai Message[]（供 Agent 初始 transcript）。 */
export function threadRowsToPiMessages(
  rows: Array<{ role: string; content: string }>,
  model: Model<'openai-completions'>
): Message[] {
  const out: Message[] = [];
  const ts = () => Date.now();
  for (const row of rows) {
    if (row.role === 'user') {
      const m: UserMessage = {
        role: 'user',
        content: row.content,
        timestamp: ts(),
      };
      out.push(m);
    } else if (row.role === 'assistant') {
      const m: AssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: row.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: { ...EMPTY_USAGE, cost: { ...EMPTY_USAGE.cost } },
        stopReason: 'stop',
        timestamp: ts(),
      };
      out.push(m);
    }
  }
  return out;
}
