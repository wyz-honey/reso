import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paragraphs = pgTable('paragraphs', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Reso 会话与外部 CLI（Cursor agent、Qoder 等）线程 ID 的映射，(session_id, provider) 唯一 */
export const sessionExternalThreads = pgTable(
  'session_external_threads',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    threadId: text('thread_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.provider] }),
  })
);

export const chatThreads = pgTable(
  'chat_threads',
  {
    id: uuid('id').primaryKey(),
    modeId: text('mode_id').notNull(),
    /** 绑定 RESO 会话时：同一 (mode_id, session_id) 仅一条线程（如 Cursor CLI 工作台对话落库） */
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    modeSessionUniq: uniqueIndex('idx_chat_threads_mode_session').on(t.modeId, t.sessionId),
    sessionIdx: index('idx_chat_threads_session_id').on(t.sessionId),
  })
);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey(),
  threadId: uuid('thread_id')
    .notNull()
    .references(() => chatThreads.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const quickInputs = pgTable('quick_inputs', {
  id: uuid('id').primaryKey(),
  label: text('label').notNull(),
  content: text('content').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 工作台「目标」与客户端 outputCatalog 条目一一对应。
 * 结构化列存主字段；识别结束策略、CLI 占位、httpProtocol 等放在 extensions（与前端 extensions JSON 一致）。
 */
export const outputs = pgTable(
  'outputs',
  {
    id: text('id').primaryKey(),
    builtin: boolean('builtin').notNull().default(false),
    legacy: boolean('legacy').notNull().default(false),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    deliveryType: text('delivery_type').notNull(),
    requestUrl: text('request_url').notNull().default(''),
    outputShape: text('output_shape').notNull().default(''),
    targetKind: text('target_kind').notNull(),
    extensions: jsonb('extensions')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** 目标级环境变量（可选）；与客户端 extensions.environment / 旧 cliEnv 对齐，供 CLI 子进程与 HTTP 头发送 */
    environment: jsonb('environment')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    deliveryIdx: index('idx_outputs_delivery_type').on(t.deliveryType),
    kindIdx: index('idx_outputs_target_kind').on(t.targetKind),
  })
);
