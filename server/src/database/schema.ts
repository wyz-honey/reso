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
    /** RESO Pi 智能体：线程级知识记忆（纯文本，由工具追加） */
    agentMemory: text('agent_memory').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    modeSessionUniq: uniqueIndex('idx_chat_threads_mode_session')
      .on(t.modeId, t.sessionId)
      .where(sql`${t.sessionId} IS NOT NULL`),
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

/** 单租户工作台：语音设置 + 模型目录 JSON，与客户端 zustand 持久化结构对应 */
export const resoClientSettings = pgTable('reso_client_settings', {
  id: text('id').primaryKey(),
  voiceSettings: jsonb('voice_settings')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  modelProviders: jsonb('model_providers')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 从段落提炼的可执行任务：名称、概要、给执行器（如 Cursor）的正文、状态与时间维度。
 * batch_key 相同表示同一批，便于客户端批量驱动 CLI；scheduled_at 供后续定时调度使用。
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** 可直接交给目标执行器的指令正文 */
    instruction: text('instruction').notNull(),
    status: text('status').notNull().default('draft'),
    tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    expectedAt: timestamp('expected_at', { withTimezone: true }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    /** 可选：Cron 表达式（与 scheduled_at 可配合使用） */
    scheduleCron: text('schedule_cron'),
    /** 可选：默认工作台目标 output id */
    targetOutputId: text('target_output_id'),
    /** 可选：来源段落 */
    sourceParagraphId: uuid('source_paragraph_id').references(() => paragraphs.id, {
      onDelete: 'set null',
    }),
    /** 相同非空 batch_key 的任务视为一批（批量 Cursor 等场景） */
    batchKey: text('batch_key'),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_tasks_status').on(t.status),
    createdIdx: index('idx_tasks_created_at').on(t.createdAt),
    scheduledIdx: index('idx_tasks_scheduled_at').on(t.scheduledAt),
    batchIdx: index('idx_tasks_batch_key').on(t.batchKey),
    orgIdx: index('idx_tasks_organization_id').on(t.organizationId),
  })
);
