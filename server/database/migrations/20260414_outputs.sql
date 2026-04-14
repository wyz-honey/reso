-- 目标表：与 Drizzle schema outputs 一致；供同步工作台输出目录至服务端时使用
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
