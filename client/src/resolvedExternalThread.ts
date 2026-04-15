import { CURSOR_EXTERNAL_THREAD_PROVIDER } from './constants/builtins';

/**
 * 与 session_external_threads.provider 对应；默认 cursor_agent。
 * 服务端 RESO_EXTERNAL_THREAD_PROVIDER 经 /api/meta 下发后写入此处。
 */
let cached = CURSOR_EXTERNAL_THREAD_PROVIDER;

export function setResolvedExternalThreadProviderFromServer(value: string | undefined): void {
  const v = String(value ?? '').trim();
  cached = v || CURSOR_EXTERNAL_THREAD_PROVIDER;
}

export function getResolvedExternalThreadProvider(): string {
  return cached || CURSOR_EXTERNAL_THREAD_PROVIDER;
}
