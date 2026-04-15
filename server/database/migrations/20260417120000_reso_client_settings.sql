CREATE TABLE IF NOT EXISTS reso_client_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  voice_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_providers JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO reso_client_settings (id, voice_settings, model_providers)
VALUES ('default', '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
