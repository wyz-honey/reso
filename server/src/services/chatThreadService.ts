import { randomUUID } from 'crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { chatMessages, chatThreads } from '~/database/schema.ts';
import { buildThreadPayload } from '~/agents/reso/index.ts';
import type { UpstreamChatMessage } from '~/entities/chat.ts';
import { AppError } from '~/utils/appError.ts';
import { isValidUuid } from '~/utils/validation.ts';
import { invokeQwenChat, invokeQwenChatStream } from '~/services/dashscopeChat.ts';

export async function ensureThreadAndAppendUser(
  db: AppDb,
  modeId: string,
  incomingThreadId: string | undefined,
  userText: string,
  sessionId?: string | null
): Promise<{ threadId: string }> {
  let threadId = incomingThreadId?.trim() || undefined;
  const boundSession =
    typeof sessionId === 'string' && isValidUuid(sessionId.trim()) ? sessionId.trim() : null;

  if (threadId) {
    if (!isValidUuid(threadId)) {
      throw new AppError('Invalid thread id', 400);
    }
    const [tr] = await db
      .select({ id: chatThreads.id, modeId: chatThreads.modeId })
      .from(chatThreads)
      .where(eq(chatThreads.id, threadId));
    if (!tr) {
      throw new AppError('Thread not found', 404);
    }
    if (tr.modeId !== modeId) {
      throw new AppError('Thread does not match modeId', 400);
    }
  } else if (boundSession) {
    const [existing] = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(and(eq(chatThreads.modeId, modeId), eq(chatThreads.sessionId, boundSession)))
      .limit(1);
    if (existing) {
      threadId = existing.id;
    } else {
      threadId = randomUUID();
      await db.insert(chatThreads).values({ id: threadId, modeId, sessionId: boundSession });
    }
  } else {
    threadId = randomUUID();
    await db.insert(chatThreads).values({ id: threadId, modeId });
  }

  const userMsgId = randomUUID();
  await db.insert(chatMessages).values({
    id: userMsgId,
    threadId,
    role: 'user',
    content: userText,
  });

  return { threadId };
}

export async function loadThreadHistory(db: AppDb, threadId: string) {
  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt));
  return rows;
}

export async function appendAssistantAndReturnMessages(
  db: AppDb,
  threadId: string,
  assistantContent: string
) {
  const asstId = randomUUID();
  await db.insert(chatMessages).values({
    id: asstId,
    threadId,
    role: 'assistant',
    content: assistantContent,
  });
  await db
    .update(chatThreads)
    .set({ updatedAt: sql`now()` })
    .where(eq(chatThreads.id, threadId));

  const all = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt));
  return all.map((r) => ({ role: r.role, content: r.content }));
}

export async function runChatTurn(
  db: AppDb,
  params: {
    modeId: string;
    threadId?: string;
    userText: string;
    system: unknown;
    modelOverride: unknown;
    dashscopeApiKey: unknown;
    sessionId?: string | null;
  }
) {
  const { threadId } = await ensureThreadAndAppendUser(
    db,
    params.modeId,
    params.threadId,
    params.userText,
    params.sessionId
  );
  const hist = await loadThreadHistory(db, threadId);
  const payloadMessages = buildThreadPayload(hist, params.system);
  const assistantContent = await invokeQwenChat(
    payloadMessages,
    params.modelOverride,
    params.dashscopeApiKey
  );
  const messages = await appendAssistantAndReturnMessages(db, threadId, assistantContent);
  return {
    threadId,
    message: { role: 'assistant' as const, content: assistantContent },
    messages,
  };
}

export async function prepareChatTurnStreamPayload(
  db: AppDb,
  params: {
    modeId: string;
    threadId?: string;
    userText: string;
    system: unknown;
    sessionId?: string | null;
  }
): Promise<{ threadId: string; payloadMessages: UpstreamChatMessage[] }> {
  const { threadId } = await ensureThreadAndAppendUser(
    db,
    params.modeId,
    params.threadId,
    params.userText,
    params.sessionId
  );
  const hist = await loadThreadHistory(db, threadId);
  const payloadMessages = buildThreadPayload(hist, params.system);
  return { threadId, payloadMessages };
}

export async function finalizeChatTurnStream(
  db: AppDb,
  threadId: string,
  assistantContent: string
): Promise<Array<{ role: string; content: string }>> {
  return appendAssistantAndReturnMessages(db, threadId, assistantContent);
}

/** HTTP GET /api/chat/threads/:id */
export async function getChatThreadBundle(db: AppDb, threadId: string) {
  const [thread] = await db
    .select({
      id: chatThreads.id,
      mode_id: chatThreads.modeId,
      created_at: chatThreads.createdAt,
      updated_at: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId));
  if (!thread) return null;
  const messages = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
      created_at: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt));
  return {
    thread,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
}

export async function deleteChatThreadMessages(db: AppDb, threadId: string): Promise<number> {
  const [existsRow] = await db
    .select({ x: sql<number>`1` })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId));
  if (!existsRow) {
    throw new AppError('Thread not found', 404);
  }
  const deleted = await db
    .delete(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .returning({ id: chatMessages.id });
  await db
    .update(chatThreads)
    .set({ updatedAt: sql`now()` })
    .where(eq(chatThreads.id, threadId));
  return deleted.length;
}

export async function deleteChatThread(db: AppDb, threadId: string): Promise<boolean> {
  const removed = await db
    .delete(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .returning({ id: chatThreads.id });
  return removed.length > 0;
}
