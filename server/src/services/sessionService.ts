import { randomUUID } from 'crypto';
import { and, count, desc, eq, exists, ilike, inArray, notExists, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { paragraphs, sessions } from '~/database/schema.ts';
import { AppError } from '~/utils/appError.ts';
import { isValidUuid } from '~/utils/validation.ts';

/** 列表批量查段落时用 Map 键，避免 driver 在 uuid 上返回类型不一致导致 get 不到 */
function sessionIdKey(id: unknown): string {
  return String(id ?? '').trim().toLowerCase();
}

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
   * 列表与详情拆开查：单条 SQL 里对 `sessions` 做关联子查询 / 复杂 JOIN 时，部分环境下段数与「最新一段」会整表落空（列表全 0、无摘要），详情 `WHERE session_id = $1` 仍正常。
   * 这里只取当前页 session id，再用 `IN (...)` 批量拉段落统计与最新正文，在内存里合并。
   */
  const sessionRows = await db
    .select({
      id: sessions.id,
      created_at: sessions.createdAt,
    })
    .from(sessions)
    .where(whereClause)
    .orderBy(desc(sessions.createdAt))
    .limit(pageSize)
    .offset(offset);

  const ids = sessionRows.map((r) => String(r.id).trim()).filter(isValidUuid);
  if (ids.length === 0) {
    return { sessions: [], total, page, pageSize };
  }

  /**
   * 与详情页同构的 Drizzle 查询（按 session 单条 `eq`），避免批量 SQL 在部分环境下匹配不到行。
   * 顺序执行，减轻连接池压力；每页最多 50 条 ≈ 100 次往返，可接受。
   */
  const countMap = new Map<string, number>();
  const latestContentBySession = new Map<string, string>();
  for (const sid of ids) {
    const key = sessionIdKey(sid);
    const [cntRow] = await db
      .select({ c: count() })
      .from(paragraphs)
      .where(eq(paragraphs.sessionId, sid));
    const [latestRow] = await db
      .select({ content: paragraphs.content })
      .from(paragraphs)
      .where(eq(paragraphs.sessionId, sid))
      .orderBy(desc(paragraphs.createdAt))
      .limit(1);
    countMap.set(key, Number(cntRow?.c ?? 0));
    latestContentBySession.set(key, String(latestRow?.content ?? ''));
  }

  const firstLine = (content: string): string => {
    const t = content.trim();
    if (!t) return '';
    const n = t.indexOf('\n');
    return (n === -1 ? t : t.slice(0, n)).trim();
  };

  const sessionList = sessionRows.map((r) => {
    const key = sessionIdKey(r.id);
    const paragraphCount = countMap.get(key) ?? 0;
    const latestContent = latestContentBySession.get(key) ?? '';
    return {
      id: r.id,
      created_at: r.created_at,
      paragraph_count: paragraphCount,
      list_title: clipSessionText(firstLine(latestContent), 64),
      preview: clipSessionText(latestContent.trim(), 200),
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
