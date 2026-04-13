import { randomUUID } from 'crypto';
import { asc, eq, sql } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { quickInputs } from '~/database/schema.ts';
import { AppError } from '~/utils/appError.ts';
import { isValidUuid } from '~/utils/validation.ts';
import { serviceWarn } from '~/utils/logger.ts';

export type QuickInputListRow = {
  id: string;
  label: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function tsIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return String(v ?? '');
}

export async function listQuickInputs(db: AppDb) {
  return db
    .select({
      id: quickInputs.id,
      label: quickInputs.label,
      content: quickInputs.content,
      sort_order: quickInputs.sortOrder,
      created_at: quickInputs.createdAt,
      updated_at: quickInputs.updatedAt,
    })
    .from(quickInputs)
    .orderBy(asc(quickInputs.sortOrder), asc(quickInputs.createdAt));
}

/** Drizzle 抛错时（如 tsx watch 热重载后偶发）用 Pool 直查，JSON 形状与前端一致。 */
export async function listQuickInputsResilient(db: AppDb): Promise<QuickInputListRow[]> {
  try {
    const rows = await listQuickInputs(db);
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      content: r.content,
      sort_order: Number(r.sort_order),
      created_at: tsIso(r.created_at),
      updated_at: tsIso(r.updated_at),
    }));
  } catch (e) {
    serviceWarn('quick-inputs', 'Drizzle listQuickInputs failed; using raw SQL fallback', {
      message: e instanceof Error ? e.message : String(e),
    });
    const { rows } = await db.$client.query<{
      id: string;
      label: string;
      content: string;
      sort_order: number;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, label, content, sort_order, created_at, updated_at
       FROM quick_inputs
       ORDER BY sort_order ASC, created_at ASC`
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      content: r.content,
      sort_order: Number(r.sort_order),
      created_at: tsIso(r.created_at),
      updated_at: tsIso(r.updated_at),
    }));
  }
}

export async function createQuickInput(
  db: AppDb,
  body: { label?: unknown; content?: unknown; sort_order?: unknown }
) {
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const content = typeof body.content === 'string' ? body.content : '';
  if (!label || label.length > 200) {
    throw new AppError('label required, max 200 chars', 400);
  }
  if (!content.trim()) {
    throw new AppError('content required', 400);
  }
  if (content.length > 100000) {
    throw new AppError('content too long', 400);
  }
  let sortOrder = 0;
  if (body.sort_order != null) {
    const n = parseInt(String(body.sort_order), 10);
    if (!Number.isNaN(n)) sortOrder = n;
  } else {
    try {
      const [mx] = await db
        .select({
          n: sql<number>`(COALESCE(MAX(${quickInputs.sortOrder}), -1) + 1)::int`.mapWith(Number),
        })
        .from(quickInputs);
      sortOrder = mx?.n ?? 0;
    } catch {
      sortOrder = 0;
    }
  }
  const id = randomUUID();
  const [row] = await db
    .insert(quickInputs)
    .values({ id, label, content, sortOrder })
    .returning({
      id: quickInputs.id,
      label: quickInputs.label,
      content: quickInputs.content,
      sort_order: quickInputs.sortOrder,
      created_at: quickInputs.createdAt,
      updated_at: quickInputs.updatedAt,
    });
  return row;
}

export async function patchQuickInput(db: AppDb, id: string, patch: Record<string, unknown>) {
  if (!isValidUuid(id)) {
    throw new AppError('Invalid id', 400);
  }
  const updates: {
    label?: string;
    content?: string;
    sortOrder?: number;
    updatedAt: ReturnType<typeof sql>;
  } = { updatedAt: sql`now()` };
  let touched = false;
  if (patch.label != null) {
    const label = typeof patch.label === 'string' ? patch.label.trim() : '';
    if (!label || label.length > 200) {
      throw new AppError('invalid label', 400);
    }
    updates.label = label;
    touched = true;
  }
  if (patch.content != null) {
    const c = typeof patch.content === 'string' ? patch.content : '';
    if (!c.trim()) {
      throw new AppError('content cannot be empty', 400);
    }
    if (c.length > 100000) {
      throw new AppError('content too long', 400);
    }
    updates.content = c;
    touched = true;
  }
  if (patch.sort_order != null) {
    const so = parseInt(String(patch.sort_order), 10);
    if (!Number.isNaN(so)) {
      updates.sortOrder = so;
      touched = true;
    }
  }
  if (!touched) {
    throw new AppError('no fields to update', 400);
  }
  const [row] = await db
    .update(quickInputs)
    .set(updates)
    .where(eq(quickInputs.id, id))
    .returning({
      id: quickInputs.id,
      label: quickInputs.label,
      content: quickInputs.content,
      sort_order: quickInputs.sortOrder,
      created_at: quickInputs.createdAt,
      updated_at: quickInputs.updatedAt,
    });
  if (!row) {
    throw new AppError('Not found', 404);
  }
  return row;
}

export async function deleteQuickInput(db: AppDb, id: string): Promise<void> {
  if (!isValidUuid(id)) {
    throw new AppError('Invalid id', 400);
  }
  const deleted = await db.delete(quickInputs).where(eq(quickInputs.id, id)).returning({ id: quickInputs.id });
  if (deleted.length === 0) {
    throw new AppError('Not found', 404);
  }
}
