-- 新库手工执行一次即可（与 Drizzle schema 一致）
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS paragraphs (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paragraphs_session_id ON paragraphs(session_id);

CREATE TABLE IF NOT EXISTS session_external_threads (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, provider)
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY,
  mode_id TEXT NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_threads_mode_id ON chat_threads(mode_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_updated ON chat_threads(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_session_id ON chat_threads(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_mode_session ON chat_threads (mode_id, session_id)
  WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_role_check CHECK (role IN ('user', 'assistant'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);

CREATE TABLE IF NOT EXISTS quick_inputs (
  id UUID PRIMARY KEY,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quick_inputs_sort ON quick_inputs(sort_order ASC, created_at ASC);

-- 目标（输出目录）：与客户端每条目标字段对齐；extensions 含 voiceControl、angleSlots、commandTemplate、httpProtocol 等
CREATE TABLE IF NOT EXISTS outputs (
  id TEXT PRIMARY KEY,
  builtin BOOLEAN NOT NULL DEFAULT false,
  legacy BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  delivery_type TEXT NOT NULL,
  request_url TEXT NOT NULL DEFAULT '',
  output_shape TEXT NOT NULL DEFAULT '',
  target_kind TEXT NOT NULL,
  extensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  environment JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outputs_delivery_type ON outputs(delivery_type);
CREATE INDEX IF NOT EXISTS idx_outputs_target_kind ON outputs(target_kind);
