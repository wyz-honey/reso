/** 行级 diff（LCS 回溯），用于 Cursor 写文件 / 编辑类工具展示 */

export type CursorDiffOp = { t: 'eq' | 'add' | 'del'; line: string };

const MAX_LINES = 800;

export function diffLinesToOps(before: string, after: string): CursorDiffOp[] {
  const a = before.length === 0 ? [] : before.split('\n');
  const b = after.length === 0 ? [] : after.split('\n');
  const n = a.length;
  const m = b.length;
  if (n > MAX_LINES || m > MAX_LINES) {
    return [
      { t: 'eq', line: `（内容过长，仅摘要：旧 ${n} 行 → 新 ${m} 行，已跳过逐行对比）` },
    ];
  }
  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map((line) => ({ t: 'add' as const, line }));
  if (m === 0) return a.map((line) => ({ t: 'del' as const, line }));

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops: CursorDiffOp[] = [];
  let i = n;
  let j = m;
  const stack: CursorDiffOp[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ t: 'eq', line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ t: 'add', line: b[j - 1] });
      j--;
    } else if (i > 0) {
      stack.push({ t: 'del', line: a[i - 1] });
      i--;
    } else {
      stack.push({ t: 'add', line: b[j - 1] });
      j--;
    }
  }
  while (stack.length) {
    const o = stack.pop();
    if (o) ops.push(o);
  }
  return ops;
}
