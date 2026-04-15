/**
 * 落库时的助手内容格式为：
 *   stdout:\n<info.txt 原文>\n\nstderr:\n<error.txt 原文>
 * 解析历史时需拆回 info + stderr，才能走 stream-json 结构化展示。
 */
export function splitStoredCliWorkbenchAssistant(content: string): { info: string; err: string } {
  const c = String(content ?? '');
  if (c.startsWith('stdout:\n')) {
    const rest = c.slice('stdout:\n'.length);
    const sep = '\n\nstderr:\n';
    const i = rest.indexOf(sep);
    if (i >= 0) {
      return { info: rest.slice(0, i), err: rest.slice(i + sep.length) };
    }
    return { info: rest, err: '' };
  }
  return { info: c, err: '' };
}
