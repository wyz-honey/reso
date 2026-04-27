-- 组织展示与默认组织；成员级禁用某些目标（output / agent）

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_single_default
  ON organizations (is_default)
  WHERE is_default = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_slug_lower
  ON organizations (lower(slug))
  WHERE slug IS NOT NULL AND length(trim(slug)) > 0;

-- 管理员禁止某成员使用某个 output id（不设 FK 以便兼容任意 agent / 自定义目标 id）
CREATE TABLE IF NOT EXISTS organization_member_output_denies (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  output_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, session_id, output_id)
);

CREATE INDEX IF NOT EXISTS idx_org_member_output_denies_session ON organization_member_output_denies(session_id);
