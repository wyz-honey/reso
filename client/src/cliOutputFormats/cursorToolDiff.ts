function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

export type ToolEditDiff = { path?: string; before: string; after: string };

function readPath(inner: Record<string, unknown> | null): string | undefined {
  const args = asRecord(inner?.args);
  return typeof args?.path === 'string' ? args.path : undefined;
}

function readSuccessContent(inner: Record<string, unknown> | null): string | undefined {
  const result = asRecord(inner?.result);
  const success = asRecord(result?.success);
  return typeof success?.content === 'string' ? success.content : undefined;
}

function readWriteFileText(inner: Record<string, unknown> | null): string | undefined {
  const args = asRecord(inner?.args);
  return typeof args?.fileText === 'string' ? args.fileText : undefined;
}

/** 从 edit 类 args 尽量抽出 old/new（字段名随 Cursor 版本可能变化） */
function extractEditFromArgs(inner: Record<string, unknown> | null): ToolEditDiff | null {
  const args = asRecord(inner?.args);
  if (!args) return null;
  const path = typeof args.path === 'string' ? args.path : undefined;

  if (typeof args.oldString === 'string' || typeof args.newString === 'string') {
    return {
      path,
      before: typeof args.oldString === 'string' ? args.oldString : '',
      after: typeof args.newString === 'string' ? args.newString : '',
    };
  }

  const edits = args.edits;
  if (Array.isArray(edits)) {
    let before = '';
    let after = '';
    for (const e of edits) {
      const er = asRecord(e);
      if (!er) continue;
      const o =
        typeof er.oldString === 'string'
          ? er.oldString
          : typeof er.oldText === 'string'
            ? er.oldText
            : typeof er.old_string === 'string'
              ? er.old_string
              : '';
      const n =
        typeof er.newString === 'string'
          ? er.newString
          : typeof er.newText === 'string'
            ? er.newText
            : typeof er.new_string === 'string'
              ? er.new_string
              : '';
      before += o;
      after += n;
    }
    if (before !== '' || after !== '') return { path, before, after };
  }

  return null;
}

/**
 * 在 read 完成时更新路径快照；在 write/edit 完成时生成 diff 并更新快照。
 */
export function applyToolToSnapshots(
  toolKey: string,
  inner: Record<string, unknown> | null,
  pathSnapshots: Map<string, string>
): ToolEditDiff | undefined {
  if (!inner) return undefined;

  if (toolKey === 'read') {
    const path = readPath(inner);
    const content = readSuccessContent(inner);
    if (path && content !== undefined) pathSnapshots.set(path, content);
    return undefined;
  }

  if (toolKey === 'write') {
    const path = readPath(inner);
    const fileText = readWriteFileText(inner);
    if (!path || fileText === undefined) return undefined;
    const before = pathSnapshots.has(path) ? pathSnapshots.get(path)! : '';
    const after = fileText;
    pathSnapshots.set(path, after);
    if (before === after) return undefined;
    return { path, before, after };
  }

  if (toolKey === 'edit') {
    const pair = extractEditFromArgs(inner);
    if (!pair || (pair.before === '' && pair.after === '')) return undefined;
    const path = pair.path;
    if (path) {
      const prev = pathSnapshots.get(path);
      if (prev !== undefined && pair.before && prev.includes(pair.before)) {
        const mergedAfter = prev.replace(pair.before, pair.after);
        pathSnapshots.set(path, mergedAfter);
        return { path, before: prev, after: mergedAfter };
      }
    }
    return pair;
  }

  return undefined;
}
