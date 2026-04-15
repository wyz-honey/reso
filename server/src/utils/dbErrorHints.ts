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

/**
 * 未执行 chat_threads.session_id 相关迁移时，按 mode_id + session_id 查询会报 Failed query / 42703 等。
 */
export function rethrowWithChatThreadsSessionHint(e: unknown): never {
  const chain = collectErrorChain(e);
  if (
    /chat_threads/i.test(chain) &&
    /session_id/i.test(chain) &&
    (/Failed query/i.test(chain) ||
      /42703/i.test(chain) ||
      /42P01/i.test(chain) ||
      /does not exist/i.test(chain) ||
      /undefined_column/i.test(chain))
  ) {
    throw new AppError(
      '数据库表 chat_threads 缺少列 session_id 或迁移未跑完。请在 PostgreSQL 依次执行：server/database/migrations/20260415120000_chat_threads_session_id.sql 与 server/database/migrations/20260416120000_chat_threads_mode_session_partial.sql；新库可执行 server/database/bootstrap.sql。',
      503
    );
  }
  throw e;
}
