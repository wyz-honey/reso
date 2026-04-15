import { randomUUID } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { tasks } from '~/database/schema.ts';
import { AppError } from '~/utils/appError.ts';
import { isValidUuid } from '~/utils/validation.ts';

export const TASK_STATUSES = [
  'draft',
  'ready',
  'scheduled',
  'in_progress',
  'done',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskRow = {
  id: string;
  name: string;
  description: string;
  instruction: string;
  status: TaskStatus;
  tags: string[];
  expected_at: string | null;
  scheduled_at: string | null;
  target_output_id: string | null;
  source_paragraph_id: string | null;
  batch_key: string | null;
  created_at: string;
  updated_at: string;
  /** 前端路由，便于书签与分享 */
  nav_path: string;
};

function tsIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return String(v);
}

function tsIsoRequired(v: unknown): string {
  return tsIso(v) ?? '';
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (!t || t.length > 64) continue;
    if (out.length >= 32) break;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function parseTagsField(body: Record<string, unknown>): string[] {
  if (body.tags != null) return normalizeTags(body.tags);
  if (typeof body.tag === 'string' && body.tag.trim()) {
    return normalizeTags(body.tag.split(/[,，]/).map((s) => s.trim()));
  }
  return [];
}

function assertStatus(s: string): asserts s is TaskStatus {
  if (!TASK_STATUSES.includes(s as TaskStatus)) {
    throw new AppError(`invalid status: ${s}`, 400);
  }
}

function mapRow(r: {
  id: string;
  name: string;
  description: string;
  instruction: string;
  status: string;
  tags: unknown;
  expected_at: Date | null;
  scheduled_at: Date | null;
  target_output_id: string | null;
  source_paragraph_id: string | null;
  batch_key: string | null;
  created_at: Date;
  updated_at: Date;
}): TaskRow {
  const id = String(r.id);
  const tags = normalizeTags(r.tags);
  let st = String(r.status || 'draft');
  if (!TASK_STATUSES.includes(st as TaskStatus)) {
    st = 'draft';
  }
  assertStatus(st);
  return {
    id,
    name: String(r.name ?? ''),
    description: String(r.description ?? ''),
    instruction: String(r.instruction ?? ''),
    status: st,
    tags,
    expected_at: tsIso(r.expected_at),
    scheduled_at: tsIso(r.scheduled_at),
    target_output_id: r.target_output_id != null ? String(r.target_output_id) : null,
    source_paragraph_id: r.source_paragraph_id != null ? String(r.source_paragraph_id) : null,
    batch_key: r.batch_key != null && String(r.batch_key).trim() ? String(r.batch_key).trim() : null,
    created_at: tsIsoRequired(r.created_at),
    updated_at: tsIsoRequired(r.updated_at),
    nav_path: `/tasks/${id}`,
  };
}

export async function listTasks(
  db: AppDb,
  filters: { status?: string | undefined; tag?: string | undefined }
): Promise<TaskRow[]> {
  const status = filters.status?.trim();
  const tag = filters.tag?.trim().toLowerCase();

  const conds = [];
  if (status) {
    assertStatus(status);
    conds.push(eq(tasks.status, status));
  }
  if (tag) {
    conds.push(
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${tasks.tags}) AS t(x)
        WHERE lower(trim(t.x)) = ${tag}
      )`
    );
  }

  const base = db
    .select({
      id: tasks.id,
      name: tasks.name,
      description: tasks.description,
      instruction: tasks.instruction,
      status: tasks.status,
      tags: tasks.tags,
      expected_at: tasks.expectedAt,
      scheduled_at: tasks.scheduledAt,
      target_output_id: tasks.targetOutputId,
      source_paragraph_id: tasks.sourceParagraphId,
      batch_key: tasks.batchKey,
      created_at: tasks.createdAt,
      updated_at: tasks.updatedAt,
    })
    .from(tasks);

  const rows =
    conds.length === 0
      ? await base.orderBy(desc(tasks.createdAt))
      : await base
          .where(conds.length === 1 ? conds[0]! : and(...conds))
          .orderBy(desc(tasks.createdAt));
  return rows.map((r) =>
    mapRow({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description),
      instruction: String(r.instruction),
      status: String(r.status),
      tags: r.tags,
      expected_at: r.expected_at,
      scheduled_at: r.scheduled_at,
      target_output_id: r.target_output_id,
      source_paragraph_id: r.source_paragraph_id,
      batch_key: r.batch_key,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })
  );
}

export async function getTaskById(db: AppDb, id: string): Promise<TaskRow | null> {
  if (!isValidUuid(id)) return null;
  const [r] = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      description: tasks.description,
      instruction: tasks.instruction,
      status: tasks.status,
      tags: tasks.tags,
      expected_at: tasks.expectedAt,
      scheduled_at: tasks.scheduledAt,
      target_output_id: tasks.targetOutputId,
      source_paragraph_id: tasks.sourceParagraphId,
      batch_key: tasks.batchKey,
      created_at: tasks.createdAt,
      updated_at: tasks.updatedAt,
    })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!r) return null;
  return mapRow({
    id: String(r.id),
    name: String(r.name),
    description: String(r.description),
    instruction: String(r.instruction),
    status: String(r.status),
    tags: r.tags,
    expected_at: r.expected_at,
    scheduled_at: r.scheduled_at,
    target_output_id: r.target_output_id,
    source_paragraph_id: r.source_paragraph_id,
    batch_key: r.batch_key,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}

function parseOptionalTs(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new AppError('invalid datetime', 400);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new AppError('invalid datetime', 400);
  return d;
}

export async function createTask(db: AppDb, body: Record<string, unknown>): Promise<TaskRow> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 200) {
    throw new AppError('name required, max 200 chars', 400);
  }
  const description = typeof body.description === 'string' ? body.description : '';
  if (description.length > 20000) {
    throw new AppError('description too long', 400);
  }
  const instruction = typeof body.instruction === 'string' ? body.instruction : '';
  if (!instruction.trim()) {
    throw new AppError('instruction required', 400);
  }
  if (instruction.length > 200000) {
    throw new AppError('instruction too long', 400);
  }
  let status: TaskStatus = 'draft';
  if (body.status != null) {
    const s = String(body.status).trim();
    assertStatus(s);
    status = s;
  }
  const tags = parseTagsField(body);
  const expectedAt = parseOptionalTs(body.expected_at);
  const scheduledAt = parseOptionalTs(body.scheduled_at);
  const targetOutputId =
    body.target_output_id != null && String(body.target_output_id).trim()
      ? String(body.target_output_id).trim().slice(0, 256)
      : null;
  let sourceParagraphId: string | null = null;
  if (body.source_paragraph_id != null && String(body.source_paragraph_id).trim()) {
    const sid = String(body.source_paragraph_id).trim();
    if (!isValidUuid(sid)) throw new AppError('invalid source_paragraph_id', 400);
    sourceParagraphId = sid;
  }
  const batchKeyRaw = typeof body.batch_key === 'string' ? body.batch_key.trim() : '';
  const batchKey = batchKeyRaw && batchKeyRaw.length <= 200 ? batchKeyRaw : null;

  const id = randomUUID();
  const [row] = await db
    .insert(tasks)
    .values({
      id,
      name,
      description,
      instruction,
      status,
      tags,
      expectedAt: expectedAt === undefined ? null : expectedAt,
      scheduledAt: scheduledAt === undefined ? null : scheduledAt,
      targetOutputId,
      sourceParagraphId,
      batchKey,
    })
    .returning({
      id: tasks.id,
      name: tasks.name,
      description: tasks.description,
      instruction: tasks.instruction,
      status: tasks.status,
      tags: tasks.tags,
      expected_at: tasks.expectedAt,
      scheduled_at: tasks.scheduledAt,
      target_output_id: tasks.targetOutputId,
      source_paragraph_id: tasks.sourceParagraphId,
      batch_key: tasks.batchKey,
      created_at: tasks.createdAt,
      updated_at: tasks.updatedAt,
    });

  if (!row) throw new AppError('create failed', 500);
  return mapRow(row);
}

export async function patchTask(db: AppDb, id: string, patch: Record<string, unknown>): Promise<TaskRow> {
  if (!isValidUuid(id)) {
    throw new AppError('Invalid id', 400);
  }
  const updates: Record<string, unknown> = { updatedAt: sql`now()` };
  let touched = false;

  if (patch.name != null) {
    const name = typeof patch.name === 'string' ? patch.name.trim() : '';
    if (!name || name.length > 200) throw new AppError('invalid name', 400);
    updates.name = name;
    touched = true;
  }
  if (patch.description != null) {
    const description = typeof patch.description === 'string' ? patch.description : '';
    if (description.length > 20000) throw new AppError('description too long', 400);
    updates.description = description;
    touched = true;
  }
  if (patch.instruction != null) {
    const instruction = typeof patch.instruction === 'string' ? patch.instruction : '';
    if (!instruction.trim()) throw new AppError('instruction cannot be empty', 400);
    if (instruction.length > 200000) throw new AppError('instruction too long', 400);
    updates.instruction = instruction;
    touched = true;
  }
  if (patch.status != null) {
    const s = String(patch.status).trim();
    assertStatus(s);
    updates.status = s;
    touched = true;
  }
  if (patch.tags != null || patch.tag != null) {
    updates.tags = parseTagsField(patch);
    touched = true;
  }
  if (patch.expected_at !== undefined) {
    const v = parseOptionalTs(patch.expected_at);
    updates.expectedAt = v === undefined ? null : v;
    touched = true;
  }
  if (patch.scheduled_at !== undefined) {
    const v = parseOptionalTs(patch.scheduled_at);
    updates.scheduledAt = v === undefined ? null : v;
    touched = true;
  }
  if (patch.target_output_id !== undefined) {
    const t = patch.target_output_id;
    if (t === null || t === '') {
      updates.targetOutputId = null;
    } else if (typeof t === 'string' && t.trim()) {
      updates.targetOutputId = t.trim().slice(0, 256);
    } else {
      throw new AppError('invalid target_output_id', 400);
    }
    touched = true;
  }
  if (patch.source_paragraph_id !== undefined) {
    const t = patch.source_paragraph_id;
    if (t === null || t === '') {
      updates.sourceParagraphId = null;
    } else if (typeof t === 'string' && isValidUuid(t.trim())) {
      updates.sourceParagraphId = t.trim();
    } else {
      throw new AppError('invalid source_paragraph_id', 400);
    }
    touched = true;
  }
  if (patch.batch_key !== undefined) {
    const t = patch.batch_key;
    if (t === null || t === '') {
      updates.batchKey = null;
    } else if (typeof t === 'string') {
      const bk = t.trim();
      if (bk.length > 200) throw new AppError('batch_key too long', 400);
      updates.batchKey = bk || null;
    } else {
      throw new AppError('invalid batch_key', 400);
    }
    touched = true;
  }

  if (!touched) {
    throw new AppError('no fields to update', 400);
  }

  const [row] = await db
    .update(tasks)
    .set(updates as typeof tasks.$inferInsert)
    .where(eq(tasks.id, id))
    .returning({
      id: tasks.id,
      name: tasks.name,
      description: tasks.description,
      instruction: tasks.instruction,
      status: tasks.status,
      tags: tasks.tags,
      expected_at: tasks.expectedAt,
      scheduled_at: tasks.scheduledAt,
      target_output_id: tasks.targetOutputId,
      source_paragraph_id: tasks.sourceParagraphId,
      batch_key: tasks.batchKey,
      created_at: tasks.createdAt,
      updated_at: tasks.updatedAt,
    });

  if (!row) {
    throw new AppError('Not found', 404);
  }
  return mapRow(row);
}

export async function deleteTask(db: AppDb, id: string): Promise<void> {
  if (!isValidUuid(id)) {
    throw new AppError('Invalid id', 400);
  }
  const del = await db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
  if (del.length === 0) {
    throw new AppError('Not found', 404);
  }
}
