import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { organizations } from '~/database/schema.ts';
import { AppError } from '~/utils/appError.ts';
import { isValidUuid } from '~/utils/validation.ts';

export type CreateOrganizationInput = {
  name: string;
  description?: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

function tsIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return String(v ?? '');
}

function mapOrgRow(r: {
  id: unknown;
  name: unknown;
  description?: unknown;
  created_at: unknown;
  updated_at: unknown;
}): OrganizationRow {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    description: String(r.description ?? ''),
    created_at: tsIso(r.created_at),
    updated_at: tsIso(r.updated_at),
  };
}

export async function createOrganization(
  db: AppDb,
  nameOrInput: string | CreateOrganizationInput
): Promise<OrganizationRow> {
  const input: CreateOrganizationInput =
    typeof nameOrInput === 'string' ? { name: nameOrInput } : nameOrInput;
  const n = String(input.name || '').trim();
  if (!n || n.length > 200) throw new AppError('name required, max 200 chars', 400);
  const description =
    typeof input.description === 'string' ? input.description.trim().slice(0, 8000) : '';

  const orgId = randomUUID();
  await db.insert(organizations).values({
    id: orgId,
    name: n,
    description,
  });

  const [row] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      created_at: organizations.createdAt,
      updated_at: organizations.updatedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) throw new AppError('create org failed', 500);
  return mapOrgRow(row);
}

export async function listOrganizations(db: AppDb): Promise<OrganizationRow[]> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      created_at: organizations.createdAt,
      updated_at: organizations.updatedAt,
    })
    .from(organizations)
    .orderBy(desc(organizations.createdAt));
  return rows.map((r) => mapOrgRow(r));
}

export async function getOrganizationDetail(db: AppDb, orgId: string) {
  if (!isValidUuid(orgId)) throw new AppError('invalid organization id', 400);
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      created_at: organizations.createdAt,
      updated_at: organizations.updatedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new AppError('organization not found', 404);
  return { organization: mapOrgRow(org) };
}

export async function patchOrganization(
  db: AppDb,
  organizationId: string,
  patch: Record<string, unknown>
): Promise<OrganizationRow> {
  if (!isValidUuid(organizationId)) throw new AppError('invalid organization id', 400);
  const updates: Partial<typeof organizations.$inferInsert> = {};

  if (patch.name != null) {
    const name = typeof patch.name === 'string' ? patch.name.trim() : '';
    if (!name || name.length > 200) throw new AppError('invalid name', 400);
    updates.name = name;
  }
  if (patch.description !== undefined) {
    updates.description =
      typeof patch.description === 'string' ? patch.description.trim().slice(0, 8000) : '';
  }

  if (Object.keys(updates).length === 0) throw new AppError('no fields to update', 400);
  updates.updatedAt = new Date();

  const [row] = await db
    .update(organizations)
    .set(updates)
    .where(eq(organizations.id, organizationId))
    .returning({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      created_at: organizations.createdAt,
      updated_at: organizations.updatedAt,
    });
  if (!row) throw new AppError('organization not found', 404);
  return mapOrgRow(row);
}
