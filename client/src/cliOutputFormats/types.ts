/**
 * 结构化 CLI 输出：按 delivery / 格式扩展。
 * Cursor `agent --output-format stream-json` 为 NDJSON，每行一个 JSON 事件。
 */

export type CliOutputFormatId = 'cursor_stream_json' | 'plain';

export type CursorStreamBlock =
  | { kind: 'system'; payload: Record<string, unknown> }
  | { kind: 'user'; text: string }
  /** phase: streaming = 当前轮思考尚未收到 completed（适合瞬时展示）；done = 已结束，默认折叠 */
  | { kind: 'thinking'; text: string; phase: 'streaming' | 'done' }
  | { kind: 'assistant'; text: string; modelCallId?: string }
  | {
      kind: 'tool';
      callId: string;
      toolKey: string;
      title: string;
      argsLine: string;
      resultLine?: string;
      state: 'started' | 'completed';
      /** write/edit + 可选 read 快照推导出的改动对比 */
      editDiff?: { path?: string; before: string; after: string };
    }
  | {
      kind: 'result';
      success: boolean;
      durationMs?: number;
      text: string;
      usage?: Record<string, unknown>;
    }
  | { kind: 'unknown'; type: string; preview: string };

export type PlainBlock = { kind: 'plain'; text: string };

export type CliParsedBlock = CursorStreamBlock | PlainBlock;

export interface ParsedCliOutput {
  formatId: CliOutputFormatId;
  blocks: CliParsedBlock[];
}
