export type ChatRole = 'user' | 'assistant' | 'system';

/** OpenAI 兼容 chat/completions messages 条目 */
export interface UpstreamChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatMessageRow {
  role: ChatRole;
  content: string;
}

export interface ChatThreadRow {
  id: string;
  mode_id: string;
  created_at: Date;
  updated_at: Date;
}
