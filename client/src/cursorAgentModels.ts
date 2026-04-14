/**
 * Cursor CLI `agent --model <id>` 的固定 id 列表。
 * 核心条目来自本机 `agent models` / `agent --list-models` 的常见输出；
 * 另含 Cursor 后台 API 文档中的示例 id（不同订阅下实际可用集合以 CLI 为准）。
 */
export const CURSOR_AGENT_MODEL_SELECT_OTHER = '__reso_cursor_model_other__';

export const CURSOR_AGENT_MODEL_PRESETS: readonly { id: string; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'composer-2-fast', label: 'Composer 2 Fast（CLI 默认）' },
  { id: 'composer-2', label: 'Composer 2' },
  { id: 'composer-1.5', label: 'Composer 1.5' },
  { id: 'grok-4-20', label: 'Grok 4.20' },
  { id: 'grok-4-20-thinking', label: 'Grok 4.20 Thinking' },
  { id: 'kimi-k2.5', label: 'Kimi K2.5' },
  { id: 'claude-4-sonnet-thinking', label: 'Claude 4 Sonnet（thinking）' },
  { id: 'claude-4-opus-thinking', label: 'Claude 4 Opus（thinking）' },
  { id: 'o3', label: 'o3' },
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-5-codex', label: 'GPT-5 Codex' },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro' },
];

const PRESET_IDS = new Set(CURSOR_AGENT_MODEL_PRESETS.map((p) => p.id));

/** 下拉框当前 value：预设 id 或「其他」哨兵 */
export function cursorAgentModelSelectValue(customValue: unknown): string {
  const v = String(customValue ?? '').trim();
  if (!v) return '';
  if (PRESET_IDS.has(v)) return v;
  return CURSOR_AGENT_MODEL_SELECT_OTHER;
}
