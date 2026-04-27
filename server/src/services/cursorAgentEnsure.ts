import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { and, eq } from 'drizzle-orm';
import type { AppDb } from '~/database/db.ts';
import { sessionExternalThreads, sessions } from '~/database/schema.ts';
import { AppError } from '~/utils/appError.ts';
import { throwIfMissingSessionExternalThreadsTable } from '~/utils/dbErrorHints.ts';
import { serviceWarn } from '~/utils/logger.ts';
import {
  assertValidProvider,
  assertValidSessionId,
  upsertSessionExternalThread,
} from '~/services/sessionExternalThreadService.ts';
import { mergeProcessEnvFillMissing } from '~/utils/cliEnvMerge.ts';

const execFileAsync = promisify(execFile);

/** `agent create-chat` 子进程超时（毫秒）；冷启动/网络慢时 120s 易不够，可调大 */
function resolveCreateChatTimeoutMs(): number {
  const raw = String(process.env.RESO_CURSOR_CREATE_CHAT_TIMEOUT_MS ?? '').trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  const fallback = 300_000; /* 5 分钟 */
  const v = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(900_000, Math.max(30_000, v)); /* 30s～15min */
}

function isCreateChatTimeoutErr(e: unknown): boolean {
  const err = e as NodeJS.ErrnoException & { signal?: string; code?: string };
  if (err?.signal === 'SIGTERM') return true;
  if (err?.code === 'ERR_CHILD_PROCESS_TIMEOUT') return true;
  const msg = String(err?.message ?? e ?? '');
  return /timed out|timeout|ETIMEDOUT/i.test(msg);
}

const CHAT_ID_LINE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCreateChatId(stdout: string, stderr: string): string {
  const out = String(stdout || '').trim();
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (CHAT_ID_LINE_RE.test(lines[i])) return lines[i];
  }
  const err = String(stderr || '').trim();
  throw new AppError(
    `agent create-chat 未返回有效会话 ID。stdout: ${out.slice(0, 240)}${err ? ` stderr: ${err.slice(0, 200)}` : ''}`,
    502
  );
}

async function runAgentCreateChat(
  agentBin: string,
  cliEnvFill?: Record<string, string>
): Promise<string> {
  const timeoutMs = resolveCreateChatTimeoutMs();
  try {
    const env = mergeProcessEnvFillMissing(process.env, cliEnvFill || {});
    const { stdout, stderr } = await execFileAsync(agentBin, ['create-chat'], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: timeoutMs,
      env,
    });
    if (stderr && String(stderr).trim()) {
      serviceWarn('cursor-agent', 'create-chat stderr', { chunk: String(stderr).slice(0, 500) });
    }
    return parseCreateChatId(String(stdout || ''), String(stderr || ''));
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string; signal?: string };
    if (err.code === 'ENOENT') {
      throw new AppError(
        '未找到 Cursor CLI：请将 agent 加入 PATH，或设置环境变量 RESO_CURSOR_AGENT_BIN 为可执行文件路径',
        503
      );
    }
    if (isCreateChatTimeoutErr(e)) {
      throw new AppError(
        `agent create-chat 超时（当前上限 ${timeoutMs / 1000}s）`,
        504
      );
    }
    const msg = err instanceof Error ? err.message : String(e);
    throw new AppError(`执行 agent create-chat 失败：${msg}`, 502);
  }
}

const ensureLocks = new Map<string, Promise<{ threadId: string; created: boolean }>>();

/**
 * 若库中已有该 session+provider 的 thread_id 则直接返回；
 * 否则在本机执行 `agent create-chat` 并写入库表。
 */
export async function ensureSessionExternalThreadWithAgentCreateChat(
  db: AppDb,
  sessionId: string,
  provider: string,
  options?: { cliEnv?: Record<string, string> }
): Promise<{ threadId: string; created: boolean }> {
  const sid = assertValidSessionId(sessionId);
  const prov = assertValidProvider(provider);

  const lockKey = `${sid}:${prov}`;
  const pending = ensureLocks.get(lockKey);
  if (pending) return pending;

  const work = (async () => {
    try {
      const [sess] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sid)).limit(1);
      if (!sess) {
        throw new AppError('Session not found', 404);
      }

      const [row] = await db
        .select({ threadId: sessionExternalThreads.threadId })
        .from(sessionExternalThreads)
        .where(and(eq(sessionExternalThreads.sessionId, sid), eq(sessionExternalThreads.provider, prov)))
        .limit(1);

      const existing = String(row?.threadId || '').trim();
      if (existing) {
        return { threadId: existing, created: false };
      }

      const bin = (process.env.RESO_CURSOR_AGENT_BIN || 'agent').trim() || 'agent';
      const chatId = await runAgentCreateChat(bin, options?.cliEnv);
      await upsertSessionExternalThread(db, sid, prov, chatId);
      return { threadId: chatId, created: true };
    } catch (e) {
      throwIfMissingSessionExternalThreadsTable(e);
      throw e;
    }
  })().finally(() => {
    ensureLocks.delete(lockKey);
  });

  ensureLocks.set(lockKey, work);
  return work;
}
