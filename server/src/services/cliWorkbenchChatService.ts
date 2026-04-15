import { randomUUID } from 'crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { chatMessages, chatThreads, sessions } from '~/database/schema.ts';
import { AppError } from '~/utils/appError.ts';
import { isValidUuid } from '~/utils/validation.ts';

/** 单条消息最大长度（TEXT）；超长截断避免拖垮 DB */
const MAX_CONTENT_CHARS = 400_000;

function clampContent(raw: string): string {
  const s = String(raw ?? '');
  if (s.length <= MAX_CONTENT_CHARS) return s;
  return `${s.slice(0, MAX_CONTENT_CHARS)}\n\n…(内容过长，已截断)`;
}

async function assertSessionExists(db: AppDb, sessionId: string): Promise<void> {
  const [row] = await db.select({ x: sql<number>`1` }).from(sessions).where(eq(sessions.id, sessionId));
  if (!row) {
    throw new AppError('Session not found', 404);
  }
}

export async function ensureCliWorkbenchThread(
  db: AppDb,
  modeId: string,
  sessionId: string
): Promise<string> {
  if (!isValidUuid(sessionId)) {
    throw new AppError('Invalid session id', 400);
  }
  const mid = String(modeId ?? '').trim();
  if (!mid) {
    throw new AppError('modeId is required', 400);
  }
  await assertSessionExists(db, sessionId);

  const [existing] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(and(eq(chatThreads.modeId, mid), eq(chatThreads.sessionId, sessionId)))
    .limit(1);
  if (existing) {
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(chatThreads).values({ id, modeId: mid, sessionId });
  return id;
}

export async function appendCliWorkbenchMessage(
  db: AppDb,
  modeId: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<{ threadId: string; messageId: string }> {
  if (role !== 'user' && role !== 'assistant') {
    throw new AppError('role must be user or assistant', 400);
  }
  const text = clampContent(String(content ?? ''));
  if (!text.trim()) {
    throw new AppError('content is required', 400);
  }
  const threadId = await ensureCliWorkbenchThread(db, modeId, sessionId);
  const messageId = randomUUID();
  await db.insert(chatMessages).values({
    id: messageId,
    threadId,
    role,
    content: text,
  });
  await db
    .update(chatThreads)
    .set({ updatedAt: sql`now()` })
    .where(eq(chatThreads.id, threadId));
  return { threadId, messageId };
}

export async function listCliWorkbenchMessages(
  db: AppDb,
  modeId: string,
  sessionId: string
): Promise<Array<{ role: string; content: string }>> {
  if (!isValidUuid(sessionId)) {
    throw new AppError('Invalid session id', 400);
  }
  const mid = String(modeId ?? '').trim();
  if (!mid) {
    throw new AppError('modeId is required', 400);
  }
  const [thread] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(and(eq(chatThreads.modeId, mid), eq(chatThreads.sessionId, sessionId)))
    .limit(1);
  if (!thread) {
    return [];
  }
  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, thread.id))
    .orderBy(asc(chatMessages.createdAt));
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content }));
}
