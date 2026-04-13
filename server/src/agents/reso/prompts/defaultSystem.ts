/** 与客户端 workModes 默认内置 Agent 提示对齐；客户端仍可通过请求体覆盖 */
export const DEFAULT_RESO_SYSTEM_PROMPT =
  '你是一个简洁、有帮助的中文助手。回答尽量清晰、分点说明。';

/** 解析 RESO 对话使用的 system：客户端非空优先，否则服务端默认 */
export function resolveResoSystemPrompt(clientSystem: unknown): string {
  if (typeof clientSystem === 'string' && clientSystem.trim()) {
    return clientSystem.trim();
  }
  return DEFAULT_RESO_SYSTEM_PROMPT;
}
