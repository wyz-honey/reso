import { useMemo } from 'react';
import { diffLinesToOps } from '../cliOutputFormats/cursorLineDiff.js';

export default function CursorCliDiffView({
  path,
  before,
  after,
}: {
  path?: string;
  before: string;
  after: string;
}) {
  const ops = useMemo(() => diffLinesToOps(before, after), [before, after]);

  if (ops.length === 0) return null;

  return (
    <div className="cursor-cli-diff">
      <div className="cursor-cli-diff-head">
        <span className="cursor-cli-diff-title">改动对比</span>
        {path ? <code className="cursor-cli-diff-path">{path}</code> : null}
      </div>
      <div className="cursor-cli-diff-table" role="table" aria-label="行级 diff">
        {ops.map((op, idx) => (
          <div
            key={`${op.t}-${idx}`}
            className={`cursor-cli-diff-row cursor-cli-diff-row--${op.t}`}
            role="row"
          >
            <span className="cursor-cli-diff-marker" aria-hidden>
              {op.t === 'add' ? '+' : op.t === 'del' ? '−' : ' '}
            </span>
            <pre className="cursor-cli-diff-line">{op.line}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
