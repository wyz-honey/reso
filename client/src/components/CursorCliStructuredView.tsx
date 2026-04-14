import AssistantMarkdown from './AssistantMarkdown';
import CursorCliDiffView from './CursorCliDiffView';
import type { CliParsedBlock, ParsedCliOutput } from '../cliOutputFormats/types';

function formatUsage(u: Record<string, unknown> | undefined): string {
  if (!u) return '';
  const parts: string[] = [];
  for (const k of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
    const v = u[k];
    if (typeof v === 'number' && v > 0) parts.push(`${k}: ${v}`);
  }
  return parts.join(' · ');
}

function BlockView({ b }: { b: CliParsedBlock }) {
  if (b.kind === 'plain') {
    return (
      <div className="cursor-cli-block cursor-cli-block--plain">
        <div className="cursor-cli-block-label">输出</div>
        <pre className="cursor-cli-pre cursor-cli-pre--wrap">{b.text}</pre>
      </div>
    );
  }

  if (b.kind === 'system') {
    const model = typeof b.payload.model === 'string' ? b.payload.model : '';
    const cwd = typeof b.payload.cwd === 'string' ? b.payload.cwd : '';
    const sid = typeof b.payload.session_id === 'string' ? b.payload.session_id : '';
    return (
      <details className="cursor-cli-block cursor-cli-block--system" open={false}>
        <summary className="cursor-cli-summary">系统 · 初始化</summary>
        <div className="cursor-cli-system-meta">
          {model ? <span>model: {model}</span> : null}
          {cwd ? <span>cwd: {cwd}</span> : null}
          {sid ? <span>session: {sid.slice(0, 8)}…</span> : null}
        </div>
        <pre className="cursor-cli-pre">{JSON.stringify(b.payload, null, 2)}</pre>
      </details>
    );
  }

  if (b.kind === 'user') {
    return (
      <div className="cursor-cli-block cursor-cli-block--user">
        <div className="cursor-cli-block-label">用户</div>
        <div className="cursor-cli-user-text">{b.text || '（空）'}</div>
      </div>
    );
  }

  if (b.kind === 'thinking') {
    if (!b.text.trim()) return null;
    if (b.phase === 'streaming') {
      return (
        <div className="cursor-cli-block cursor-cli-block--thinking cursor-cli-thinking--live">
          <div className="cursor-cli-thinking-live-head">
            <span className="cursor-cli-thinking-pulse" aria-hidden />
            <span className="cursor-cli-block-label cursor-cli-block-label--inline">思考中</span>
          </div>
          <div className="cursor-cli-thinking-body cursor-cli-thinking-body--live">
            {b.text}
            <span className="cursor-cli-thinking-caret" aria-hidden />
          </div>
        </div>
      );
    }
    return (
      <details className="cursor-cli-block cursor-cli-block--thinking cursor-cli-thinking--done" open={false}>
        <summary className="cursor-cli-summary">思考 · 已完成</summary>
        <div className="cursor-cli-thinking-body">{b.text}</div>
      </details>
    );
  }

  if (b.kind === 'assistant') {
    if (!b.text.trim()) return null;
    return (
      <div className="cursor-cli-block cursor-cli-block--assistant">
        <div className="cursor-cli-block-label">助手</div>
        <div className="cursor-cli-md">
          <AssistantMarkdown text={b.text} />
        </div>
      </div>
    );
  }

  if (b.kind === 'tool') {
    return (
      <details
        className="cursor-cli-block cursor-cli-block--thinking cursor-cli-thinking--done"
        open={false}
      >
        <summary className="cursor-cli-summary">
          工具 · {b.title}
          {b.state === 'started' ? (
            <>
              {' '}
              <span className="cursor-cli-pill cursor-cli-pill--pending">进行中</span>
            </>
          ) : null}
        </summary>
        <div className="cursor-cli-thinking-body cursor-cli-tool-detail-stack">
          {b.argsLine ? (
            <pre className="cursor-cli-pre cursor-cli-pre--args">{b.argsLine}</pre>
          ) : null}
          {b.editDiff ? (
            <CursorCliDiffView
              path={b.editDiff.path}
              before={b.editDiff.before}
              after={b.editDiff.after}
            />
          ) : null}
          {b.resultLine && !b.editDiff ? (
            <div className="cursor-cli-tool-result">
              <span className="cursor-cli-tool-result-label">结果</span>
              <pre className="cursor-cli-pre cursor-cli-pre--wrap">{b.resultLine}</pre>
            </div>
          ) : b.state === 'started' ? (
            <p className="cursor-cli-tool-wait">等待结果…</p>
          ) : null}
        </div>
      </details>
    );
  }

  if (b.kind === 'result') {
    const u = formatUsage(b.usage);
    return (
      <div
        className={`cursor-cli-block cursor-cli-block--result cursor-cli-block--result-summary ${b.success ? 'cursor-cli-block--ok' : 'cursor-cli-block--err'}`}
      >
        <div className="cursor-cli-result-lines">
          <div className="cursor-cli-result-line cursor-cli-result-line--status">
            结束 · {b.success ? '成功' : '失败'}
          </div>
          {b.durationMs != null ? (
            <div className="cursor-cli-result-line cursor-cli-result-line--duration">
              {b.durationMs} ms
            </div>
          ) : null}
          {u ? <div className="cursor-cli-result-line cursor-cli-result-line--usage">{u}</div> : null}
        </div>
      </div>
    );
  }

  if (b.kind === 'unknown') {
    return (
      <div className="cursor-cli-block cursor-cli-block--unknown">
        <div className="cursor-cli-block-label">未识别 · {b.type}</div>
        <pre className="cursor-cli-pre cursor-cli-pre--wrap">{b.preview}</pre>
      </div>
    );
  }

  return null;
}

export default function CursorCliStructuredView({
  parsed,
  stderr,
  formatHint,
}: {
  parsed: ParsedCliOutput;
  stderr: string;
  /** cursor 模式下非 stream-json 时的提示 */
  formatHint?: string | null;
}) {
  const err = String(stderr ?? '').trim();

  return (
    <div className="cursor-cli-structured">
      {formatHint ? <p className="cursor-cli-format-hint">{formatHint}</p> : null}
      {parsed.blocks.map((b, i) => (
        <BlockView key={`${parsed.formatId}-${i}-${b.kind}`} b={b} />
      ))}
      {err ? (
        <div className="cursor-cli-block cursor-cli-block--stderr">
          <div className="cursor-cli-block-label">标准错误</div>
          <pre className="cursor-cli-pre cursor-cli-pre--wrap">{err}</pre>
        </div>
      ) : null}
    </div>
  );
}
