/**
 * 内置输出目标 id（与目录数据、localStorage 键一致）。
 */
export const BUILTIN_OUTPUT_ID = {
  ASR: 'builtin-asr',
  AGENT: 'builtin-agent',
  CURSOR: 'builtin-cursor',
  QODER: 'builtin-qoder',
} as const;

/** 与 session_external_threads.provider、服务端 RESO_EXTERNAL_THREAD_PROVIDER 对应 */
export const CURSOR_EXTERNAL_THREAD_PROVIDER = 'cursor_agent';

/** 内置 Qoder 工作台在 session_external_threads 中的 provider 键（与 Cursor 的 cursor_agent 并列） */
export const QODER_EXTERNAL_THREAD_PROVIDER = 'qoder_agent';
