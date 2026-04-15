import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiDeleteTask, apiUpdateTask, fetchTask, type TaskRecord } from '../api';
import '../App.css';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  ready: '就绪',
  scheduled: '已排期',
  in_progress: '进行中',
  done: '完成',
  cancelled: '已取消',
};

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string | null {
  const t = local.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

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
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState('');
  const [status, setStatus] = useState('draft');
  const [tagsLine, setTagsLine] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [targetOutputId, setTargetOutputId] = useState('');
  const [batchKey, setBatchKey] = useState('');

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
      setDescription(row.description || '');
      setInstruction(row.instruction || '');
      setStatus(row.status || 'draft');
      setTagsLine((row.tags || []).join(', '));
      setExpectedAt(isoToDatetimeLocal(row.expected_at));
      setScheduledAt(isoToDatetimeLocal(row.scheduled_at));
      setTargetOutputId(row.target_output_id || '');
      setBatchKey(row.batch_key || '');
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
    if (!nm || !instruction.trim()) {
      setMsg('名称与可执行指令不能为空');
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
        description,
        instruction,
        status,
        tags,
        expected_at: datetimeLocalToIso(expectedAt),
        scheduled_at: datetimeLocalToIso(scheduledAt),
        target_output_id: targetOutputId.trim() || null,
        batch_key: batchKey.trim() || null,
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
            <span className="sessions-filter-label">导航路径</span>
            <code className="task-detail-code">{task.nav_path}</code>
          </div>
          <div className="task-detail-nav-row">
            <span className="sessions-filter-label">完整 URL</span>
            <code className="task-detail-code task-detail-code--break">{absoluteUrl}</code>
          </div>
          <div className="task-detail-nav-actions">
            <button
              type="button"
              className="btn-sessions-refresh"
              disabled={busy}
              onClick={() => copyText(absoluteUrl, '已复制完整 URL')}
            >
              复制 URL
            </button>
            <button
              type="button"
              className="btn-sessions-refresh"
              disabled={busy}
              onClick={() => copyText(task.instruction, '已复制可执行指令')}
            >
              复制指令
            </button>
          </div>
        </div>

        <form className="task-detail-form" onSubmit={onSave}>
          <label className="modal-label">
            业务名称
            <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </label>
          <label className="modal-label">
            描述
            <textarea
              className="modal-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="modal-label">
            可执行指令
            <textarea
              className="modal-textarea quick-inputs-modal-textarea"
              rows={12}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              spellCheck={false}
            />
          </label>
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
            Tags（逗号分隔）
            <input className="modal-input" value={tagsLine} onChange={(e) => setTagsLine(e.target.value)} />
          </label>
          <label className="modal-label">
            期望完成
            <input
              className="modal-input"
              type="datetime-local"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
            />
          </label>
          <label className="modal-label">
            定时执行（预留）
            <input
              className="modal-input"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </label>
          <label className="modal-label">
            默认目标 output id
            <input
              className="modal-input"
              value={targetOutputId}
              onChange={(e) => setTargetOutputId(e.target.value)}
            />
          </label>
          <label className="modal-label">
            批次键 batch_key
            <input
              className="modal-input"
              value={batchKey}
              onChange={(e) => setBatchKey(e.target.value)}
              maxLength={200}
            />
          </label>
          <p className="sessions-muted task-detail-meta">
            创建 {formatShort(task.created_at)} · 来源段落 id {task.source_paragraph_id || '—'}
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
