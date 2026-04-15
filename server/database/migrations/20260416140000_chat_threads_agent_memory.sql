ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS agent_memory text NOT NULL DEFAULT '';
