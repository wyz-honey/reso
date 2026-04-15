-- 允许多条 session_id 为 NULL 的线程；仅在绑定会话时约束 (mode_id, session_id) 唯一
DROP INDEX IF EXISTS idx_chat_threads_mode_session;
CREATE UNIQUE INDEX idx_chat_threads_mode_session ON chat_threads (mode_id, session_id)
  WHERE session_id IS NOT NULL;
