import { randomUUID } from 'crypto';
import { and, count, desc, eq, exists, ilike, inArray, notExists, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { paragraphs, sessions } from '~/database/schema.ts';
import { AppError } from '~/utils/appError.ts';
import { isValidUuid } from '~/utils/validation.ts';

function clipSessionText(s: string, max: number): string {
  const t = s.trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export async function createSession(db: AppDb): Promise<string> {
  const id = randomUUID();
  await db.insert(sessions).values({ id });
  return id;
}

export async function listSessions(
  db: AppDb,
  opts: {
    q: string;
    filter: 'all' | 'with' | 'empty';
    page: number;
    pageSize: number;
  }
) {
  const { q, filter, page, pageSize } = opts;
  const offset = (page - 1) * pageSize;
  /** 勿用 `alias(sessions,'s')`：标量子查询里 `${s.id}` 与外层关联在部分驱动下会错，导致段数、摘要恒空 */
  const conditions: SQL[] = [];

  if (filter === 'with') {
    conditions.push(
      exists(db.select().from(paragraphs).where(eq(paragraphs.sessionId, sessions.id)))
    );
  } else if (filter === 'empty') {
    conditions.push(
      notExists(db.select().from(paragraphs).where(eq(paragraphs.sessionId, sessions.id)))
    );
  }

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(sql<string>`${sessions.id}::text`, pattern),
        exists(
          db
            .select()
            .from(paragraphs)
            .where(and(eq(paragraphs.sessionId, sessions.id), ilike(paragraphs.content, pattern)))
        )
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ c: count() })
    .from(sessions)
    .where(whereClause);
  const total = Number(countRow?.c ?? 0);

  /**
   * 段数用 JOIN 聚合（避免失效的关联标量子查询）。
   * 子查询里的聚合必须用 `.as('cnt')`：否则 Drizzle 不允许外层引用 `paragraphCounts.cnt`，段数会一直是空/0。
   */
  const paragraphCounts = db
    .select({
      sessionId: paragraphs.sessionId,
      cnt: count(paragraphs.id).as('cnt'),
    })
    .from(paragraphs)
    .groupBy(paragraphs.sessionId)
    .as('paragraph_counts');

  const rows = await db
    .select({
      id: sessions.id,
      created_at: sessions.createdAt,
      paragraph_count: paragraphCounts.cnt,
      list_title_raw: sql<string>`(
        SELECT trim(both FROM split_part(COALESCE(trim(${paragraphs.content}), ''), E'\n', 1))
        FROM ${paragraphs}
        WHERE ${paragraphs.sessionId} = ${sessions.id}
        ORDER BY ${paragraphs.createdAt} DESC
        LIMIT 1
      )`,
      preview_raw: sql<string>`(
        SELECT left(trim(COALESCE(${paragraphs.content}, '')), 220)
        FROM ${paragraphs}
        WHERE ${paragraphs.sessionId} = ${sessions.id}
        ORDER BY ${paragraphs.createdAt} DESC
        LIMIT 1
      )`,
    })
    .from(sessions)
    .leftJoin(paragraphCounts, eq(paragraphCounts.sessionId, sessions.id))
    .where(whereClause)
    .orderBy(desc(sessions.createdAt))
    .limit(pageSize)
    .offset(offset);

  const sessionList = rows.map((r) => {
    const pc = r.paragraph_count;
    const paragraphCount =
      pc == null
        ? 0
        : typeof pc === 'bigint'
          ? Number(pc)
          : typeof pc === 'number' && !Number.isNaN(pc)
            ? pc
            : Number(pc) || 0;
    return {
      id: r.id,
      created_at: r.created_at,
      paragraph_count: paragraphCount,
      list_title: clipSessionText(String(r.list_title_raw ?? ''), 64),
      preview: clipSessionText(String(r.preview_raw ?? ''), 200),
    };
  });

  return { sessions: sessionList, total, page, pageSize };
}

export async function getSessionWithParagraphs(db: AppDb, sessionId: string) {
  if (!isValidUuid(sessionId)) {
    throw new AppError('Invalid session id', 400);
  }
  const [sess] = await db
    .select({ id: sessions.id, created_at: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!sess) {
    throw new AppError('Session not found', 404);
  }
  const paras = await db
    .select({
      id: paragraphs.id,
      content: paragraphs.content,
      created_at: paragraphs.createdAt,
    })
    .from(paragraphs)
    .where(eq(paragraphs.sessionId, sessionId))
    .orderBy(desc(paragraphs.createdAt));
  return { session: sess, paragraphs: paras };
}

export async function clearParagraphs(db: AppDb, sessionId: string): Promise<number> {
  if (!isValidUuid(sessionId)) {
    throw new AppError('Invalid session id', 400);
  }
  const [existsRow] = await db
    .select({ x: sql<number>`1` })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!existsRow) {
    throw new AppError('Session not found', 404);
  }
  const deleted = await db.delete(paragraphs).where(eq(paragraphs.sessionId, sessionId)).returning({ id: paragraphs.id });
  return deleted.length;
}

export async function deleteSession(db: AppDb, sessionId: string): Promise<void> {
  if (!isValidUuid(sessionId)) {
    throw new AppError('Invalid session id', 400);
  }
  const removed = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning({ id: sessions.id });
  if (removed.length === 0) {
    throw new AppError('Session not found', 404);
  }
}

const BATCH_DELETE_MAX = 100;

/** 按 ID 批量删除会话（关联段落由外键级联删除）。忽略无效 UUID；不存在的 ID 静默跳过。 */
export async function deleteSessionsByIds(db: AppDb, ids: string[]): Promise<number> {
  const unique = [...new Set(ids.map((x) => String(x || '').trim()))];
  const valid = unique.filter(isValidUuid).slice(0, BATCH_DELETE_MAX);
  if (valid.length === 0) return 0;
  const removed = await db.delete(sessions).where(inArray(sessions.id, valid)).returning({ id: sessions.id });
  return removed.length;
}

export async function addParagraph(
  db: AppDb,
  sessionId: string,
  content: string
): Promise<{ id: string; sessionId: string; paragraphIndex: number }> {
  if (!isValidUuid(sessionId)) {
    throw new AppError('Invalid session id', 400);
  }
  if (!content.trim()) {
    throw new AppError('content is required', 400);
  }
  const [existsRow] = await db
    .select({ x: sql<number>`1` })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!existsRow) {
    throw new AppError('Session not found', 404);
  }
  const paragraphId = randomUUID();
  await db.insert(paragraphs).values({ id: paragraphId, sessionId, content });
  const [cntRow] = await db
    .select({ c: count() })
    .from(paragraphs)
    .where(eq(paragraphs.sessionId, sessionId));
  const paragraphIndex = Number(cntRow?.c ?? 1);
  return { id: paragraphId, sessionId, paragraphIndex };
}
