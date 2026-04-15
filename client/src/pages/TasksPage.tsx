import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  apiCreateTask,
  apiDeleteTask,
  apiUpdateTask,
  fetchTasks,
  type TaskRecord,
} from '../api';
import '../App.css';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  ready: '就绪',
  scheduled: '已排期',
  in_progress: '进行中',
  done: '完成',
  cancelled: '已取消',
};

const emptyForm = {
  name: '',
  description: '',
  instruction: '',
  status: 'draft',
  tags: '',
  expected_at: '',
  scheduled_at: '',
  target_output_id: '',
  batch_key: '',
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

export default function TasksPage() {
  const [items, setItems] = useState<TaskRecord[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const modalCardRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { items: list, statuses: st } = await fetchTasks({
        status: filterStatus || undefined,
        tag: filterTag.trim() || undefined,
      });
      setItems(list);
      setStatuses(st.length ? st : Object.keys(STATUS_LABEL));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterTag]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQ(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const filteredItems = useMemo(() => {
    if (!searchQ) return items;
    const q = searchQ.toLowerCase();
    return items.filter(
      (row) =>
        (row.name || '').toLowerCase().includes(q) ||
        (row.description || '').toLowerCase().includes(q) ||
        (row.instruction || '').toLowerCase().includes(q) ||
        (row.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [items, searchQ]);

  const closeFormModal = useCallback(() => {
    setFormModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }, []);

  const cancelModal = useCallback(() => {
    closeFormModal();
    setMsg('');
  }, [closeFormModal]);

  useEffect(() => {
    if (!formModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formModalOpen, cancelModal]);

  useEffect(() => {
    if (!formModalOpen) return;
    const t = window.setTimeout(() => {
      const el = modalCardRef.current?.querySelector?.('input, textarea, select');
      (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.focus?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [formModalOpen]);

  const openNewModal = () => {
    setMsg('');
    setEditingId(null);
    setForm(emptyForm);
    setFormModalOpen(true);
  };

  const tagsToPayload = (tagsLine: string) =>
    tagsLine
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    const name = form.name.trim();
    if (!name) {
      setMsg('请填写业务名称');
      return;
    }
    if (!form.instruction.trim()) {
      setMsg('请填写可执行指令');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        description: form.description,
        instruction: form.instruction,
        status: form.status,
        tags: tagsToPayload(form.tags),
      };
      const exp = datetimeLocalToIso(form.expected_at);
      if (exp) payload.expected_at = exp;
      const sch = datetimeLocalToIso(form.scheduled_at);
      if (sch) payload.scheduled_at = sch;
      if (form.target_output_id.trim()) payload.target_output_id = form.target_output_id.trim();
      if (form.batch_key.trim()) payload.batch_key = form.batch_key.trim();
      await apiCreateTask(payload);
      setMsg('已创建');
      closeFormModal();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row: TaskRecord) => {
    setMsg('');
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      description: row.description || '',
      instruction: row.instruction || '',
      status: row.status || 'draft',
      tags: (row.tags || []).join(', '),
      expected_at: isoToDatetimeLocal(row.expected_at),
      scheduled_at: isoToDatetimeLocal(row.scheduled_at),
      target_output_id: row.target_output_id || '',
      batch_key: row.batch_key || '',
    });
    setFormModalOpen(true);
  };

  const onUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setMsg('');
    const name = form.name.trim();
    if (!name || !form.instruction.trim()) {
      setMsg('名称与可执行指令均不能为空');
      return;
    }
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        name,
        description: form.description,
        instruction: form.instruction,
        status: form.status,
        tags: tagsToPayload(form.tags),
        expected_at: datetimeLocalToIso(form.expected_at),
        scheduled_at: datetimeLocalToIso(form.scheduled_at),
        target_output_id: form.target_output_id.trim() || null,
        batch_key: form.batch_key.trim() || null,
      };
      await apiUpdateTask(editingId, patch);
      setMsg('已保存');
      closeFormModal();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('删除该任务？')) return;
    setMsg('');
    setBusy(true);
    try {
      await apiDeleteTask(id);
      if (editingId === id) closeFormModal();
      setMsg('已删除');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(okMsg);
    } catch {
      setMsg('复制失败（浏览器权限）');
    }
  };

  return (
    <div className="sessions-page quick-inputs-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <h1 className="sessions-title">任务</h1>
            <p className="sessions-subtitle">
              将段落打磨为带明确目标的指令；单条执行、同批键批量、或预留定时（scheduled_at）。每条有固定导航路径{' '}
              <code className="sessions-code-inline">/tasks/:id</code>，可收藏或发给执行器侧使用。
            </p>
          </div>
          <button type="button" className="btn-primary-nav" disabled={busy} onClick={openNewModal}>
            新建任务
          </button>
        </div>

        <div className="sessions-filters">
          <label className="sessions-search-label">
            <span className="sessions-filter-label">搜索</span>
            <input
              type="search"
              className="sessions-search-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="名称、描述、指令或 tag…"
              autoComplete="off"
            />
          </label>
          <label className="sessions-search-label">
            <span className="sessions-filter-label">状态</span>
            <select
              className="sessions-search-input"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">全部</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] || s}
                </option>
              ))}
            </select>
          </label>
          <label className="sessions-search-label">
            <span className="sessions-filter-label">Tag 精确</span>
            <input
              className="sessions-search-input"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              placeholder="筛选含该 tag 的任务"
              autoComplete="off"
            />
          </label>
          <div className="sessions-filter-actions">
            <span className="sessions-filter-label">操作</span>
            <button
              type="button"
              className="btn-sessions-refresh"
              disabled={loading || busy}
              onClick={() => load()}
              aria-label="刷新任务列表"
            >
              刷新
            </button>
          </div>
        </div>

        {error ? <p className="sessions-error sessions-alert">{error}</p> : null}
        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="sessions-list-only sessions-list-only--flex">
          <div className="sessions-list-panel sessions-list-panel--full sessions-list-panel--stretch">
            <div className="sessions-list-head">任务列表</div>
            {loading ? (
              <p className="sessions-muted sessions-list-body-pad">加载中…</p>
            ) : items.length === 0 ? (
              <p className="sessions-muted sessions-list-body-pad">
                暂无任务。可先在工作台整理段落，再在此新建「可执行指令」。
              </p>
            ) : filteredItems.length === 0 ? (
              <p className="sessions-muted sessions-list-body-pad">没有符合当前搜索或筛选的条目。</p>
            ) : (
              <ul className="quick-inputs-grid">
                {filteredItems.map((row) => (
                  <li key={row.id} className="quick-inputs-item-card">
                    <div className="quick-inputs-item-card-header">
                      <h3 className="quick-inputs-item-card-title">
                        <Link to={row.nav_path}>{row.name}</Link>
                      </h3>
                      <span className="quick-inputs-item-card-badge" title="状态">
                        {STATUS_LABEL[row.status] || row.status}
                      </span>
                    </div>
                    {row.description ? (
                      <p className="quick-inputs-item-card-preview">{row.description}</p>
                    ) : (
                      <p className="quick-inputs-item-card-preview sessions-muted">（无描述）</p>
                    )}
                    <p className="tasks-card-meta">
                      创建 {formatShort(row.created_at)} · 期望 {formatShort(row.expected_at)}
                      {row.scheduled_at ? ` · 定时 ${formatShort(row.scheduled_at)}` : ''}
                    </p>
                    {row.batch_key ? (
                      <p className="tasks-card-meta">
                        批次 <code className="sessions-code-inline">{row.batch_key}</code>
                      </p>
                    ) : null}
                    {row.tags?.length ? (
                      <p className="tasks-card-tags">
                        {(row.tags || []).map((t) => (
                          <span key={t} className="tasks-tag-pill">
                            {t}
                          </span>
                        ))}
                      </p>
                    ) : null}
                    <div className="quick-inputs-item-card-actions">
                      <Link to={row.nav_path} className="btn-sessions-refresh tasks-link-btn">
                        打开
                      </Link>
                      <button
                        type="button"
                        className="btn-sessions-refresh"
                        disabled={busy}
                        onClick={() =>
                          copyText(`${window.location.origin}${row.nav_path}`, '已复制任务链接')
                        }
                      >
                        复制链接
                      </button>
                      <button
                        type="button"
                        className="btn-sessions-refresh"
                        disabled={busy}
                        onClick={() => startEdit(row)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn-danger-text"
                        disabled={busy}
                        onClick={() => onDelete(row.id)}
                      >
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {formModalOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelModal();
          }}
        >
          <div
            ref={modalCardRef}
            className="modal-card modal-card--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="task-modal-title" className="modal-title">
              {editingId ? '编辑任务' : '新建任务'}
            </h2>
            <p className="modal-desc">
              「可执行指令」将交给 Cursor 等目标；批次键（batch_key）相同的任务可在客户端按批驱动。
            </p>
            <form className="modal-form" onSubmit={editingId ? onUpdate : onCreate}>
              <label className="modal-label">
                业务名称
                <input
                  className="modal-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="如：接口幂等改造"
                  maxLength={200}
                  disabled={busy}
                />
              </label>
              <label className="modal-label">
                描述（概要）
                <textarea
                  className="modal-textarea"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="背景与验收要点…"
                  disabled={busy}
                />
              </label>
              <label className="modal-label">
                可执行指令
                <textarea
                  className="modal-textarea quick-inputs-modal-textarea"
                  rows={8}
                  value={form.instruction}
                  onChange={(e) => setForm((f) => ({ ...f, instruction: e.target.value }))}
                  placeholder="可直接粘贴到 Agent / CLI 的完整指令…"
                  disabled={busy}
                  spellCheck={false}
                />
              </label>
              <label className="modal-label">
                状态
                <select
                  className="modal-input"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  disabled={busy}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s] || s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modal-label">
                Tags（逗号分隔）
                <input
                  className="modal-input"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="cursor, backend"
                  disabled={busy}
                />
              </label>
              <label className="modal-label">
                期望完成（本地日期时间）
                <input
                  className="modal-input"
                  type="datetime-local"
                  value={form.expected_at}
                  onChange={(e) => setForm((f) => ({ ...f, expected_at: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="modal-label">
                定时执行（预留，本地日期时间）
                <input
                  className="modal-input"
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                  disabled={busy}
                />
              </label>
              <label className="modal-label">
                默认目标 output id（可选）
                <input
                  className="modal-input"
                  value={form.target_output_id}
                  onChange={(e) => setForm((f) => ({ ...f, target_output_id: e.target.value }))}
                  placeholder="与「目标管理」中某条 id 对齐"
                  disabled={busy}
                />
              </label>
              <label className="modal-label">
                批次键 batch_key（可选，相同键视为一批）
                <input
                  className="modal-input"
                  value={form.batch_key}
                  onChange={(e) => setForm((f) => ({ ...f, batch_key: e.target.value }))}
                  placeholder="如 sprint-42-batch-a"
                  maxLength={200}
                  disabled={busy}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-clear" disabled={busy} onClick={cancelModal}>
                  取消
                </button>
                {editingId ? (
                  <button type="submit" className="btn-primary-nav" disabled={busy}>
                    保存
                  </button>
                ) : (
                  <button type="submit" className="btn-primary-nav" disabled={busy}>
                    创建
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
