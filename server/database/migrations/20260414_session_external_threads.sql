-- 已有库追加：与 bootstrap.sql 中 session_external_threads 一致
CREATE TABLE IF NOT EXISTS session_external_threads (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, provider)
);
