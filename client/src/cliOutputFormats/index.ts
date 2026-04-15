import { looksLikeCursorStreamJson, parseCursorStreamJson } from './cursorStreamJson';
import { parsePlainCliStdout } from './plain';
import type { ParsedCliOutput } from './types';

export type { CliOutputFormatId, CliParsedBlock, CursorStreamBlock, ParsedCliOutput } from './types';
export {
  isInternalCursorUserText,
  looksLikeCursorStreamJson,
  parseCursorStreamJson,
  sanitizeCursorStderrForDisplay,
} from './cursorStreamJson';
export { parsePlainCliStdout } from './plain';

/**
 * 按输出目标类型选择解析策略。后续可为 xiaoai / 其他 CLI 增加分支或模板字段。
 */
export function parseCliOutputForDelivery(
  deliveryType: string,
  info: string,
  _error: string
): ParsedCliOutput {
  const i = String(info ?? '');
  if (
    (deliveryType === 'cursor_cli' || deliveryType === 'qoder_cli') &&
    looksLikeCursorStreamJson(i)
  ) {
    return parseCursorStreamJson(i);
  }
  if (deliveryType === 'cursor_cli' || deliveryType === 'qoder_cli') {
    return parsePlainCliStdout(i);
  }
  return parsePlainCliStdout(i);
}
