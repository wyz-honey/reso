-- 组织、角色、成员、协作边、共享上下文；任务表关联组织与角色

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_roles (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  /** 与 outputs.id 对齐，供前端预选「角色默认目标」 */
  default_target_output_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_roles_slug UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_organization_roles_org ON organization_roles(organization_id);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  organization_role_id UUID NOT NULL REFERENCES organization_roles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_role ON organization_members(organization_role_id);

CREATE TABLE IF NOT EXISTS organization_role_handoffs (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_slug TEXT NOT NULL,
  to_slug TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  CONSTRAINT uq_org_handoffs UNIQUE (organization_id, from_slug, to_slug)
);

CREATE INDEX IF NOT EXISTS idx_organization_role_handoffs_org ON organization_role_handoffs(organization_id);

CREATE TABLE IF NOT EXISTS organization_contexts (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  /** text | repo_bundle 等，服务端按 kind 拼接 dynamic 字段 */
  kind TEXT NOT NULL DEFAULT 'text',
  dynamic_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  /** NULL：组织内全部角色可见；非空 JSON 数组：仅列出的 organization_role.id 可见 */
  visibility_role_ids JSONB,
  created_by_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_by_organization_role_id UUID REFERENCES organization_roles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_contexts_org ON organization_contexts(organization_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS organization_role_id UUID REFERENCES organization_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id);
