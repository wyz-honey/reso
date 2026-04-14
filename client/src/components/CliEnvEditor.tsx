import { useMemo, type ReactNode } from 'react';
import { CLI_ENV_NAME_RE, normalizeCliEnvRecord } from '../cliEnv';

type Row = { key: string; value: string };

function recordToRows(rec: Record<string, string>): Row[] {
  const keys = Object.keys(rec);
  if (keys.length === 0) return [{ key: '', value: '' }];
  return keys.map((k) => ({ key: k, value: rec[k] ?? '' }));
}

function rowsToRecord(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = String(r.key || '').trim();
    if (!CLI_ENV_NAME_RE.test(k)) continue;
    const vRaw = String(r.value ?? '');
    if (!vRaw.trim()) continue;
    out[k] = vRaw;
  }
  return out;
}

const DEFAULT_LEAD = (
  <>
    服务端执行 <code className="settings-code">agent create-chat</code> 等子进程时：若 Reso
    进程环境里<strong>尚未设置</strong>同名变量，将用此处值注入；已设置则沿用系统环境。
  </>
);

export default function CliEnvEditor({
  value,
  onChange,
  lead,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** 为 null 时不显示说明；缺省为 CLI 子进程提示 */
  lead?: ReactNode | null;
}) {
  const rows = useMemo(() => recordToRows(normalizeCliEnvRecord(value)), [value]);

  const patch = (nextRows: Row[]) => {
    onChange(rowsToRecord(nextRows));
  };

  const setRow = (i: number, field: 'key' | 'value', v: string) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [field]: v } : r));
    patch(next);
  };

  const addRow = () => {
    patch([...rows, { key: '', value: '' }]);
  };

  const removeRow = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    patch(next.length ? next : [{ key: '', value: '' }]);
  };

  const leadNode = lead === undefined ? DEFAULT_LEAD : lead;

  return (
    <div className="cli-env-editor">
      {leadNode ? <p className="cli-env-editor-hint">{leadNode}</p> : null}
      <div className="cli-env-editor-rows" role="group" aria-label="环境变量">
        {rows.map((row, i) => (
          <div key={i} className="cli-env-editor-row">
            <input
              type="text"
              className="cli-env-editor-key"
              value={row.key}
              onChange={(e) => setRow(i, 'key', e.target.value)}
              placeholder="变量名，如 CURSOR_API_KEY"
              spellCheck={false}
              autoComplete="off"
              aria-label={`环境变量名 ${i + 1}`}
            />
            <input
              type="password"
              className="cli-env-editor-val"
              value={row.value}
              onChange={(e) => setRow(i, 'value', e.target.value)}
              placeholder="值（仅保存在本机浏览器）"
              spellCheck={false}
              autoComplete="off"
              aria-label={`环境变量值 ${i + 1}`}
            />
            <button
              type="button"
              className="cli-env-editor-remove"
              onClick={() => removeRow(i)}
              aria-label={`删除第 ${i + 1} 行`}
            >
              删除
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="cli-env-editor-add" onClick={addRow}>
        添加变量
      </button>
    </div>
  );
}
