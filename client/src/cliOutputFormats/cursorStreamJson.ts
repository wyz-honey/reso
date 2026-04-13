import { applyToolToSnapshots } from './cursorToolDiff.js';
import type { CliOutputFormatId, CursorStreamBlock, ParsedCliOutput } from './types.js';

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function extractMessageText(message: unknown): string {
  const m = asRecord(message);
  if (!m) return '';
  const content = m.content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const p of content) {
    const o = asRecord(p);
    if (!o) continue;
    if (o.type === 'text' && typeof o.text === 'string') parts.push(o.text);
  }
  return parts.join('');
}

function firstToolKey(toolCall: unknown): { key: string; inner: Record<string, unknown> | null } {
  const o = asRecord(toolCall);
  if (!o) return { key: 'tool', inner: null };
  const keys = Object.keys(o).filter((k) => k.endsWith('ToolCall'));
  if (keys.length === 0) return { key: 'tool', inner: null };
  const key = keys[0];
  const inner = asRecord(o[key]);
  return { key: key.replace(/ToolCall$/, ''), inner };
}

function summarizeArgs(inner: Record<string, unknown> | null): string {
  if (!inner) return '';
  const args = inner.args;
  const a = asRecord(args);
  if (!a) return '';
  try {
    return JSON.stringify(a);
  } catch {
    return String(args);
  }
}

function summarizeToolResult(inner: Record<string, unknown> | null): string | undefined {
  if (!inner) return undefined;
  const result = inner.result;
  const r = asRecord(result);
  if (!r) return undefined;
  const success = asRecord(r.success);
  if (success) {
    if (typeof success.content === 'string') {
      const t = success.content;
      return t.length > 2000 ? `${t.slice(0, 2000)}…` : t;
    }
    if (Array.isArray(success.files)) {
      return `files: ${success.files.join(', ')}`;
    }
    try {
      const s = JSON.stringify(success);
      return s.length > 2400 ? `${s.slice(0, 2400)}…` : s;
    } catch {
      return String(success);
    }
  }
  try {
    const s = JSON.stringify(r);
    return s.length > 1200 ? `${s.slice(0, 1200)}…` : s;
  } catch {
    return String(r);
  }
}

function linePreview(obj: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(obj);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return String(obj.type ?? '?');
  }
}

export function looksLikeCursorStreamJson(info: string): boolean {
  const lines = String(info || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  try {
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    return first.type === 'system' && first.subtype === 'init';
  } catch {
    return false;
  }
}

function parseNdjsonRecords(raw: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const v = JSON.parse(t) as unknown;
      const o = asRecord(v);
      if (o) out.push(o);
    } catch {
      /* 半行或损坏行：跳过 */
    }
  }
  return out;
}

/**
 * 将 Cursor CLI stream-json NDJSON 解析为有序块（思考合并、工具按 call_id 合并 started→completed）。
 */
export function parseCursorStreamJson(info: string): ParsedCliOutput {
  const records = parseNdjsonRecords(info);
  const blocks: CursorStreamBlock[] = [];
  let thinkingBuf = '';
  const pathSnapshots = new Map<string, string>();
  const pendingTools = new Map<
    string,
    { toolKey: string; title: string; argsLine: string; inner: Record<string, unknown> | null }
  >();

  const flushThinkingDone = () => {
    if (!thinkingBuf) return;
    blocks.push({ kind: 'thinking', text: thinkingBuf, phase: 'done' });
    thinkingBuf = '';
  };

  /** 被其它事件打断、或文件截断：仍保留为「进行中」样式 */
  const flushThinkingStreaming = () => {
    if (!thinkingBuf) return;
    blocks.push({ kind: 'thinking', text: thinkingBuf, phase: 'streaming' });
    thinkingBuf = '';
  };

  for (const row of records) {
    const type = typeof row.type === 'string' ? row.type : '';

    if (type === 'system') {
      flushThinkingStreaming();
      blocks.push({ kind: 'system', payload: { ...row } });
      continue;
    }

    if (type === 'user') {
      flushThinkingStreaming();
      const text = extractMessageText(row.message);
      blocks.push({ kind: 'user', text });
      continue;
    }

    if (type === 'thinking') {
      const sub = typeof row.subtype === 'string' ? row.subtype : '';
      if (sub === 'delta' && typeof row.text === 'string') thinkingBuf += row.text;
      else if (sub === 'completed') flushThinkingDone();
      continue;
    }

    if (type === 'assistant') {
      flushThinkingStreaming();
      const text = extractMessageText(row.message);
      const modelCallId = typeof row.model_call_id === 'string' ? row.model_call_id : undefined;
      blocks.push({ kind: 'assistant', text, modelCallId });
      continue;
    }

    if (type === 'tool_call') {
      flushThinkingStreaming();
      const sub = typeof row.subtype === 'string' ? row.subtype : '';
      const callId = typeof row.call_id === 'string' ? row.call_id : '';
      const { key, inner } = firstToolKey(row.tool_call);
      const title = key;
      const argsLine = summarizeArgs(inner);

      if (sub === 'started' && callId) {
        pendingTools.set(callId, { toolKey: key, title, argsLine, inner });
        blocks.push({
          kind: 'tool',
          callId,
          toolKey: key,
          title,
          argsLine,
          state: 'started',
        });
        continue;
      }

      if (sub === 'completed' && callId) {
        const resultLine = summarizeToolResult(inner);
        const prev = pendingTools.get(callId);
        if (prev) pendingTools.delete(callId);
        const mergedArgs = prev?.argsLine ?? argsLine;
        const mergedTitle = prev?.title ?? title;
        const mergedKey = prev?.toolKey ?? key;
        const editDiff = applyToolToSnapshots(mergedKey, inner, pathSnapshots);

        let merged = false;
        for (let j = blocks.length - 1; j >= 0; j--) {
          const b = blocks[j];
          if (b.kind === 'tool' && b.callId === callId && b.state === 'started') {
            blocks[j] = {
              kind: 'tool',
              callId,
              toolKey: mergedKey,
              title: mergedTitle,
              argsLine: mergedArgs,
              resultLine,
              state: 'completed',
              ...(editDiff ? { editDiff } : {}),
            };
            merged = true;
            break;
          }
        }
        if (!merged) {
          blocks.push({
            kind: 'tool',
            callId,
            toolKey: mergedKey,
            title: mergedTitle,
            argsLine: mergedArgs,
            resultLine,
            state: 'completed',
            ...(editDiff ? { editDiff } : {}),
          });
        }
        continue;
      }

      blocks.push({
        kind: 'unknown',
        type: 'tool_call',
        preview: linePreview(row),
      });
      continue;
    }

    if (type === 'result') {
      flushThinkingStreaming();
      const success = row.is_error !== true && row.subtype === 'success';
      const durationRaw = row.duration_ms;
      const durationMs =
        typeof durationRaw === 'number' && !Number.isNaN(durationRaw)
          ? durationRaw
          : undefined;
      const text = typeof row.result === 'string' ? row.result : '';
      const usage = asRecord(row.usage) ?? undefined;
      blocks.push({
        kind: 'result',
        success,
        durationMs,
        text,
        usage: usage ? { ...usage } : undefined,
      });
      continue;
    }

    flushThinkingStreaming();
    blocks.push({
      kind: 'unknown',
      type: type || 'unknown',
      preview: linePreview(row),
    });
  }

  flushThinkingStreaming();

  return { formatId: 'cursor_stream_json' as CliOutputFormatId, blocks };
}
