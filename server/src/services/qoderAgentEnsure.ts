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

/** 从一次 Print 流式输出里尽量提取 Qoder 会话 id（常为 UUID） */
const RESUME_ID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function extractResumeIdFromCliOutput(stdout: string, stderr: string): string | null {
  const blob = `${String(stdout || '')}\n${String(stderr || '')}`;
  const matches = blob.match(RESUME_ID_RE);
  if (!matches?.length) return null;
  return matches[matches.length - 1].trim();
}

async function runQoderBootstrapSession(
  qoderBin: string,
  cliEnvFill?: Record<string, string>
): Promise<string> {
  const env = mergeProcessEnvFillMissing(process.env, cliEnvFill || {});
  const workspace = (process.env.RESO_QODER_BOOTSTRAP_WORKSPACE || process.cwd()).trim() || process.cwd();
  const prompt = (process.env.RESO_QODER_BOOTSTRAP_PROMPT ?? '.').trim() || '.';
  const maxTurns = String(process.env.RESO_QODER_BOOTSTRAP_MAX_TURNS ?? '1').trim() || '1';

  try {
    const { stdout, stderr } = await execFileAsync(
      qoderBin,
      ['--print', '-q', '-p', prompt, '-w', workspace, '--output-format', 'stream-json', '--max-turns', maxTurns],
      {
        maxBuffer: 8 * 1024 * 1024,
        timeout: 180_000,
        env,
      }
    );
    if (stderr && String(stderr).trim()) {
      serviceWarn('qoder-agent', 'bootstrap stderr', { chunk: String(stderr).slice(0, 500) });
    }
    const id = extractResumeIdFromCliOutput(String(stdout || ''), String(stderr || ''));
    if (id) return id;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; stdout?: string; signal?: string };
    if (err.code === 'ENOENT') {
      throw new AppError(
        '未找到 Qoder CLI：请将 qodercli 加入 PATH，或设置环境变量 RESO_QODER_CLI_BIN 为可执行文件路径',
        503
      );
    }
    if (err.signal === 'SIGTERM') {
      throw new AppError('qodercli 首启 bootstrap 超时，请重试', 504);
    }
    const msg = err instanceof Error ? err.message : String(e);
    throw new AppError(`执行 qodercli bootstrap 失败：${msg}`, 502);
  }

  const fromEnv = String(process.env.RESO_QODER_DEFAULT_RESUME_ID ?? '').trim();
  if (fromEnv) return fromEnv;

  throw new AppError(
    'Qoder prepare：未在 CLI 输出中解析到可用会话 id（供 `-r`）。可在环境变量中设置 RESO_QODER_DEFAULT_RESUME_ID（来自 TUI `/resume` 的会话 id），或调整 RESO_QODER_BOOTSTRAP_PROMPT / WORKSPACE 后重试。',
    502
  );
}

const qoderEnsureLocks = new Map<string, Promise<{ threadId: string; created: boolean }>>();

/**
 * 与 Cursor 的 `agent create-chat` 对齐：库中无记录时在本机跑一次极短 Print 任务，从输出中解析会话 id 并写入库表。
 * 文档：https://docs.qoder.com/zh/cli/using-cli
 */
export async function ensureSessionExternalThreadWithQoderCli(
  db: AppDb,
  sessionId: string,
  provider: string,
  options?: { cliEnv?: Record<string, string> }
): Promise<{ threadId: string; created: boolean }> {
  const sid = assertValidSessionId(sessionId);
  const prov = assertValidProvider(provider);

  const lockKey = `${sid}:${prov}`;
  const pending = qoderEnsureLocks.get(lockKey);
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

      const bin = (process.env.RESO_QODER_CLI_BIN || 'qodercli').trim() || 'qodercli';
      const resumeId = await runQoderBootstrapSession(bin, options?.cliEnv);
      await upsertSessionExternalThread(db, sid, prov, resumeId);
      return { threadId: resumeId, created: true };
    } catch (e) {
      throwIfMissingSessionExternalThreadsTable(e);
      throw e;
    }
  })().finally(() => {
    qoderEnsureLocks.delete(lockKey);
  });

  qoderEnsureLocks.set(lockKey, work);
  return work;
}
