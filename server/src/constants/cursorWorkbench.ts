/** 与客户端 constants/builtins CURSOR_EXTERNAL_THREAD_PROVIDER 保持一致 */
export const CURSOR_EXTERNAL_THREAD_PROVIDER = 'cursor_agent';

/** 与客户端 QODER_EXTERNAL_THREAD_PROVIDER 一致 */
export const QODER_EXTERNAL_THREAD_PROVIDER = 'qoder_agent';

/** /ws/cursor-tail：目录 watch 后的合并推送间隔 */
export const CURSOR_TAIL_WS_DEBOUNCE_MS = 50;

/**
 * 与 fs.watch 互补：块缓冲下目录事件可能稀疏，轮询把增长中的文件推到前端。
 */
export const CURSOR_TAIL_WS_POLL_INTERVAL_MS = 120;

/** POST /api/cursor/run 允许的最大命令字符数 */
export const CURSOR_RUN_MAX_COMMAND_CHARS = 256 * 1024;

/** stop 先发 SIGTERM，超时后再 SIGKILL */
export const CURSOR_RUN_STOP_SIGKILL_AFTER_MS = 4000;
