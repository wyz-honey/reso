import { looksLikeCursorStreamJson, parseCursorStreamJson } from './cursorStreamJson.js';
import { parsePlainCliStdout } from './plain.js';
import type { ParsedCliOutput } from './types.js';

export type { CliOutputFormatId, CliParsedBlock, CursorStreamBlock, ParsedCliOutput } from './types.js';
export { looksLikeCursorStreamJson, parseCursorStreamJson } from './cursorStreamJson.js';
export { parsePlainCliStdout } from './plain.js';

/**
 * 按输出目标类型选择解析策略。后续可为 xiaoai / 其他 CLI 增加分支或模板字段。
 */
export function parseCliOutputForDelivery(
  deliveryType: string,
  info: string,
  _error: string
): ParsedCliOutput {
  const i = String(info ?? '');
  if (deliveryType === 'cursor_cli' && looksLikeCursorStreamJson(i)) {
    return parseCursorStreamJson(i);
  }
  if (deliveryType === 'cursor_cli') {
    return parsePlainCliStdout(i);
  }
  return parsePlainCliStdout(i);
}
