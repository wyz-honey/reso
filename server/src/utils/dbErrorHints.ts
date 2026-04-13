import { AppError } from '~/utils/appError.ts';

/** 拼接 Error.cause 链，便于识别底层 PG 报错 */
export function collectErrorChain(e: unknown): string {
  const out: string[] = [];
  let cur: unknown = e;
  for (let d = 0; d < 12 && cur != null; d++) {
    if (cur instanceof Error) {
      if (cur.message) out.push(cur.message);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else if (typeof cur === 'object' && cur !== null && 'message' in cur) {
      out.push(String((cur as { message: unknown }).message));
      cur = 'cause' in cur ? (cur as { cause?: unknown }).cause : undefined;
    } else {
      out.push(String(cur));
      break;
    }
  }
  return out.join(' · ');
}

/**
 * 旧库未跑迁移时，查询 session_external_threads 会得到 Drizzle 的 Failed query…
 */
export function throwIfMissingSessionExternalThreadsTable(e: unknown): void {
  const chain = collectErrorChain(e);
  if (!/session_external_threads/i.test(chain)) return;
  if (
    /Failed query/i.test(chain) ||
    /42P01/i.test(chain) ||
    /does not exist/i.test(chain) ||
    /undefined_table/i.test(chain)
  ) {
    throw new AppError(
      '数据库缺少表 session_external_threads。请在 PostgreSQL 执行：server/database/migrations/20260414_session_external_threads.sql；新库可执行 server/database/bootstrap.sql 全量建表。',
      503
    );
  }
}
