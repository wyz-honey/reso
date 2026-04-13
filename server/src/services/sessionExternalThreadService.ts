import { and, eq } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { sessionExternalThreads, sessions } from '~/database/schema.ts';
import { AppError } from '~/utils/appError.ts';
import { isValidUuid } from '~/utils/validation.ts';

const PROVIDER_RE = /^[a-z][a-z0-9_]{0,63}$/;
const THREAD_MAX = 2000;

export function assertValidProvider(provider: unknown): string {
  const p = String(provider ?? '').trim();
  if (!PROVIDER_RE.test(p)) {
    throw new AppError('Invalid provider (use lowercase letters, digits, underscore; max 64 chars)', 400);
  }
  return p;
}

export function assertValidSessionId(sessionId: unknown): string {
  const s = String(sessionId ?? '').trim();
  if (!isValidUuid(s)) {
    throw new AppError('Invalid session id', 400);
  }
  return s;
}

export async function listSessionExternalThreads(
  db: AppDb,
  sessionId: string
): Promise<{ provider: string; threadId: string; updatedAt: string }[]> {
  const sid = assertValidSessionId(sessionId);
  const [existsRow] = await db.select({ x: sessions.id }).from(sessions).where(eq(sessions.id, sid)).limit(1);
  if (!existsRow) {
    throw new AppError('Session not found', 404);
  }
  const rows = await db
    .select({
      provider: sessionExternalThreads.provider,
      threadId: sessionExternalThreads.threadId,
      updatedAt: sessionExternalThreads.updatedAt,
    })
    .from(sessionExternalThreads)
    .where(eq(sessionExternalThreads.sessionId, sid));
  return rows.map((r) => ({
    provider: r.provider,
    threadId: r.threadId,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function upsertSessionExternalThread(
  db: AppDb,
  sessionId: string,
  provider: string,
  threadId: string
): Promise<void> {
  const sid = assertValidSessionId(sessionId);
  const p = assertValidProvider(provider);
  const t = String(threadId ?? '').trim();

  const [existsRow] = await db.select({ x: sessions.id }).from(sessions).where(eq(sessions.id, sid)).limit(1);
  if (!existsRow) {
    throw new AppError('Session not found', 404);
  }

  if (!t) {
    await db
      .delete(sessionExternalThreads)
      .where(and(eq(sessionExternalThreads.sessionId, sid), eq(sessionExternalThreads.provider, p)));
    return;
  }
  if (t.length > THREAD_MAX) {
    throw new AppError(`threadId must be at most ${THREAD_MAX} characters`, 400);
  }

  await db
    .insert(sessionExternalThreads)
    .values({
      sessionId: sid,
      provider: p,
      threadId: t,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [sessionExternalThreads.sessionId, sessionExternalThreads.provider],
      set: { threadId: t, updatedAt: new Date() },
    });
}

export async function deleteSessionExternalThread(db: AppDb, sessionId: string, provider: string): Promise<boolean> {
  const sid = assertValidSessionId(sessionId);
  const p = assertValidProvider(provider);
  const res = await db
    .delete(sessionExternalThreads)
    .where(and(eq(sessionExternalThreads.sessionId, sid), eq(sessionExternalThreads.provider, p)))
    .returning({ sessionId: sessionExternalThreads.sessionId });
  return res.length > 0;
}
