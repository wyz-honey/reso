import { getModel } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';
import { DASHSCOPE_CHAT_BASE } from '~/config/constants.ts';

/**
 * OpenAI-Completions 形态的 pi-ai Model，baseUrl 指向百炼 compatible-mode（与原先 dashscopeChat 一致）。
 */
export function createDashscopeOpenAiCompletionsModel(modelId: string): Model<'openai-completions'> {
  const trimmed = modelId.trim();
  const template = getModel('openrouter', 'qwen/qwen-plus');
  if (!template || template.api !== 'openai-completions') {
    throw new Error('pi-ai: missing openai-completions template model');
  }
  const baseUrl = DASHSCOPE_CHAT_BASE.replace(/\/$/, '');
  return {
    ...template,
    id: trimmed || template.id,
    name: trimmed || template.name,
    baseUrl,
    /** 勿保留 openrouter：否则 pi-ai 的 detectCompat 仍按 OpenRouter 推断，请求体易与百炼不兼容。 */
    provider: 'dashscope',
    compat: {
      ...template.compat,
      thinkingFormat: 'qwen',
      /** 百炼 compatible-mode 常对 stream_options / include_usage 返回 400 */
      supportsUsageInStreaming: false,
      /** 避免在 tools 上带 strict 等字段触发部分网关 400 */
      supportsStrictMode: false,
      /** 与原先手写 dashscopeChat 一致：不显式传 store */
      supportsStore: false,
    },
  };
}
