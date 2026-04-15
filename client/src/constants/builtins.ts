/**
 * 内置输出目标 id（与目录数据、localStorage 键一致）。
 */
export const BUILTIN_OUTPUT_ID = {
  ASR: 'builtin-asr',
  AGENT: 'builtin-agent',
  CURSOR: 'builtin-cursor',
} as const;

/** 与 session_external_threads.provider、服务端 RESO_EXTERNAL_THREAD_PROVIDER 对应 */
export const CURSOR_EXTERNAL_THREAD_PROVIDER = 'cursor_agent';
