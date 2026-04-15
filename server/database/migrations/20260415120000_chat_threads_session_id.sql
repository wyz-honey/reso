ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chat_threads_session_id ON chat_threads(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_mode_session ON chat_threads (mode_id, session_id);
