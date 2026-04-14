import type { CliOutputFormatId, ParsedCliOutput, PlainBlock } from './types';

/** 非 stream-json 时的兜底：整段原文展示 */
export function parsePlainCliStdout(info: string): ParsedCliOutput {
  const text = String(info ?? '').replace(/\s+$/, '');
  const blocks: PlainBlock[] = [];
  if (text) blocks.push({ kind: 'plain', text });
  return { formatId: 'plain' as CliOutputFormatId, blocks };
}
