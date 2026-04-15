CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  target_output_id TEXT,
  source_paragraph_id UUID REFERENCES paragraphs(id) ON DELETE SET NULL,
  batch_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_at ON tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tasks_batch_key ON tasks(batch_key);
