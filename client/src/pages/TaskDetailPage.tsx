import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiDeleteTask, apiUpdateTask, fetchTask, type TaskRecord } from '../api';
import { listAllOutputs } from '../outputCatalog';
import '../App.css';

type TaskOutputOption = { id: string; name?: string };

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  ready: '就绪',
  scheduled: '已排期',
  in_progress: '进行中',
  done: '完成',
  cancelled: '已取消',
};

const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: '每小时', expr: '0 * * * *' },
  { label: '每天 9:00', expr: '0 9 * * *' },
  { label: '工作日 9:00', expr: '0 9 * * 1-5' },
  { label: '每周一 9:00', expr: '0 9 * * 1' },
  { label: '每月 1 日 9:00', expr: '0 9 1 * *' },
];

function formatShort(iso: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [status, setStatus] = useState('draft');
  const [tagsLine, setTagsLine] = useState('');
  const [targetOutputId, setTargetOutputId] = useState('');
  const [executionMode, setExecutionMode] = useState<'immediate' | 'cron'>('immediate');
  const [scheduleCron, setScheduleCron] = useState('');
  const [outputRows, setOutputRows] = useState<TaskOutputOption[]>(() => listAllOutputs() as TaskOutputOption[]);

  useEffect(() => {
    const fn = () => setOutputRows(listAllOutputs() as TaskOutputOption[]);
    window.addEventListener('reso-outputs-changed', fn);
    return () => window.removeEventListener('reso-outputs-changed', fn);
  }, []);

  const outputIdSet = useMemo(() => new Set(outputRows.map((o) => o.id)), [outputRows]);

  const load = useCallback(async () => {
    const id = String(taskId || '').trim();
    if (!id) {
      setError('缺少任务 id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const row = await fetchTask(id);
      setTask(row);
      setName(row.name || '');
      const d = (row.description || '').trim() || (row.instruction || '').trim();
      setDetail(d);
      setStatus(row.status || 'draft');
      setTagsLine((row.tags || []).join(', '));
      setTargetOutputId((row.target_output_id || '').trim());
      const cron = (row.schedule_cron || '').trim();
      setExecutionMode(cron ? 'cron' : 'immediate');
      setScheduleCron(cron);
      setOutputRows(listAllOutputs() as TaskOutputOption[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const absoluteUrl = task ? `${window.location.origin}${task.nav_path}` : '';

  const copyText = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(ok);
    } catch {
      setMsg('复制失败');
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId?.trim()) return;
    setMsg('');
    const nm = name.trim();
    const det = detail.trim();
    if (!nm || !det) {
      setMsg('名称与详细不能为空');
      return;
    }
    if (executionMode === 'cron' && !scheduleCron.trim()) {
      setMsg('Cron 模式下请填写表达式或点选快捷方案');
      return;
    }
    const tid = targetOutputId.trim();
    if (tid && !outputIdSet.has(tid)) {
      setMsg('执行目标须从当前目标列表中选择');
      return;
    }
    setBusy(true);
    try {
      const tags = tagsLine
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await apiUpdateTask(taskId, {
        name: nm,
        description: det,
        instruction: det,
        status,
        tags,
        target_output_id: tid || null,
        schedule_cron: executionMode === 'cron' ? scheduleCron.trim() : null,
      });
      setMsg('已保存');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!taskId || !window.confirm('删除该任务？')) return;
    setBusy(true);
    try {
      await apiDeleteTask(taskId);
      navigate('/tasks', { replace: true });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="sessions-page">
        <p className="sessions-muted sessions-list-body-pad">加载中…</p>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="sessions-page">
        <p className="sessions-error sessions-list-body-pad">{error || '未找到任务'}</p>
        <Link to="/tasks" className="btn-sessions-refresh">
          返回任务列表
        </Link>
      </div>
    );
  }

  return (
    <div className="sessions-page quick-inputs-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <h1 className="sessions-title">{task.name}</h1>
            <p className="sessions-subtitle">
              状态 {STATUS_LABEL[task.status] || task.status} · 更新 {formatShort(task.updated_at)}
              {task.schedule_cron ? ` · Cron ${task.schedule_cron}` : ''}
            </p>
          </div>
          <div className="sessions-filter-actions">
            <Link to="/tasks" className="btn-sessions-refresh">
              返回列表
            </Link>
          </div>
        </div>

        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="task-detail-nav-card">
          <div className="task-detail-nav-row">
            <span className="sessions-filter-label">页面路径</span>
            <code className="task-detail-code">{task.nav_path}</code>
          </div>
          <div className="task-detail-nav-row">
            <span className="sessions-filter-label">分享链接</span>
            <code className="task-detail-code task-detail-code--break">{absoluteUrl}</code>
          </div>
          <div className="task-detail-nav-actions">
            <button
              type="button"
              className="btn-sessions-refresh"
              disabled={busy}
              onClick={() => copyText(absoluteUrl, '已复制链接')}
            >
              复制链接
            </button>
            <button
              type="button"
              className="btn-sessions-refresh"
              disabled={busy}
              onClick={() => copyText(task.instruction, '已复制详细')}
            >
              复制详细
            </button>
          </div>
        </div>

        <form className="task-detail-form" onSubmit={onSave}>
          <label className="modal-label">
            名称
            <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </label>
          <label className="modal-label">
            详细
            <textarea
              className="modal-textarea quick-inputs-modal-textarea"
              rows={12}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              spellCheck={false}
            />
          </label>

          <fieldset className="modal-label" style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="sessions-filter-label" style={{ marginBottom: '0.35rem' }}>
              执行设置
            </legend>
            <label className="modal-label">
              执行目标（来自当前目标列表）
              <select
                className="modal-input"
                value={targetOutputId}
                onChange={(e) => setTargetOutputId(e.target.value)}
              >
                <option value="">（不绑定）</option>
                {outputRows.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name || o.id} — {o.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-label" style={{ marginTop: '0.25rem' }}>
              <span className="sessions-filter-label" style={{ display: 'block', marginBottom: '0.35rem' }}>
                执行方式
              </span>
              <label className="sessions-inline-check" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="radio"
                  name="task-detail-exec"
                  checked={executionMode === 'immediate'}
                  onChange={() => {
                    setExecutionMode('immediate');
                    setScheduleCron('');
                  }}
                />
                非 Cron 定时（不保存 Cron 表达式）
              </label>
              <label
                className="sessions-inline-check"
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.35rem' }}
              >
                <input
                  type="radio"
                  name="task-detail-exec"
                  checked={executionMode === 'cron'}
                  onChange={() => setExecutionMode('cron')}
                />
                按 Cron 表达式定时
              </label>
            </div>
            {executionMode === 'cron' ? (
              <div style={{ marginTop: '0.5rem' }}>
                <label className="modal-label">
                  Cron 表达式
                  <input
                    className="modal-input"
                    value={scheduleCron}
                    onChange={(e) => setScheduleCron(e.target.value)}
                    placeholder="分 时 日 月 周"
                    spellCheck={false}
                  />
                </label>
                <p className="modal-desc" style={{ marginTop: '0.35rem' }}>
                  快捷：
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.expr}
                      type="button"
                      className="btn-sessions-refresh"
                      style={{ marginRight: '0.35rem', marginTop: '0.25rem' }}
                      onClick={() => {
                        setScheduleCron(p.expr);
                        setExecutionMode('cron');
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </p>
              </div>
            ) : null}
          </fieldset>

          <label className="modal-label">
            状态
            <select className="modal-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([k, lab]) => (
                <option key={k} value={k}>
                  {lab}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-label">
            标签（逗号分隔）
            <input className="modal-input" value={tagsLine} onChange={(e) => setTagsLine(e.target.value)} />
          </label>
          <p className="sessions-muted task-detail-meta">
            创建 {formatShort(task.created_at)}
            {task.source_paragraph_id ? ' · 来自会话' : ''}
            {task.expected_at ? ` · 期望 ${formatShort(task.expected_at)}` : ''}
            {task.scheduled_at ? ` · 计划 ${formatShort(task.scheduled_at)}` : ''}
            {task.batch_key ? ` · 批次 ${task.batch_key}` : ''}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-danger-text" disabled={busy} onClick={onDelete}>
              删除
            </button>
            <button type="submit" className="btn-primary-nav" disabled={busy}>
              保存修改
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
