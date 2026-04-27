-- 精简组织（仅名称、描述）；移除角色及关联表；任务去掉 organization_role_id

ALTER TABLE tasks DROP COLUMN IF EXISTS organization_role_id;

DROP TABLE IF EXISTS organization_member_output_denies;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organization_role_handoffs;
DROP TABLE IF EXISTS organization_contexts;
DROP TABLE IF EXISTS organization_roles;

DROP INDEX IF EXISTS uq_organizations_single_default;
DROP INDEX IF EXISTS uq_organizations_slug_lower;

ALTER TABLE organizations DROP COLUMN IF EXISTS logo_url;
ALTER TABLE organizations DROP COLUMN IF EXISTS slug;
ALTER TABLE organizations DROP COLUMN IF EXISTS is_default;
ALTER TABLE organizations DROP COLUMN IF EXISTS settings;
