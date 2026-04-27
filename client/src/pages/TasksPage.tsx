import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  apiCreateTask,
  apiDeleteTask,
  apiUpdateTask,
  fetchTasks,
  type TaskRecord,
} from '../api';
import { listAllOutputs } from '../outputCatalog';
import '../App.css';

type TaskOutputOption = { id: string; name?: string };

const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: '每小时', expr: '0 * * * *' },
  { label: '每天 9:00', expr: '0 9 * * *' },
  { label: '工作日 9:00', expr: '0 9 * * 1-5' },
  { label: '每周一 9:00', expr: '0 9 * * 1' },
  { label: '每月 1 日 9:00', expr: '0 9 1 * *' },
];

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
  detail: '',
  status: 'draft',
  tags: '',
  executionMode: 'immediate' as 'immediate' | 'cron',
  scheduleCron: '',
  targetOutputId: '',
};

function executionDefaultStatus(mode: 'immediate' | 'cron'): string {
  return mode === 'cron' ? 'scheduled' : 'ready';
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
  const [form, setForm] = useState(() => ({ ...emptyForm }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [outputRows, setOutputRows] = useState<TaskOutputOption[]>(() => listAllOutputs() as TaskOutputOption[]);
  const modalCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fn = () => setOutputRows(listAllOutputs() as TaskOutputOption[]);
    window.addEventListener('reso-outputs-changed', fn);
    return () => window.removeEventListener('reso-outputs-changed', fn);
  }, []);

  useEffect(() => {
    if (formModalOpen) setOutputRows(listAllOutputs() as TaskOutputOption[]);
  }, [formModalOpen]);

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
    setForm({ ...emptyForm });
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
    setForm({ ...emptyForm });
    setFormModalOpen(true);
  };

  const outputIdSet = useMemo(() => new Set(outputRows.map((o) => o.id)), [outputRows]);

  const outputLabel = useCallback(
    (id: string | null | undefined) => {
      if (!id) return '';
      const o = outputRows.find((r) => r.id === id);
      return o ? `${o.name || id}（${id}）` : id;
    },
    [outputRows]
  );

  const tagsToPayload = (tagsLine: string) =>
    tagsLine
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    const name = form.name.trim();
    const detail = form.detail.trim();
    if (!name) {
      setMsg('请填写名称');
      return;
    }
    if (!detail) {
      setMsg('请填写详细');
      return;
    }
    if (form.executionMode === 'cron' && !form.scheduleCron.trim()) {
      setMsg('Cron 模式下请填写表达式或点选快捷方案');
      return;
    }
    const tid = form.targetOutputId.trim();
    if (tid && !outputIdSet.has(tid)) {
      setMsg('执行目标须从当前目标列表中选择');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        description: detail,
        instruction: detail,
        tags: tagsToPayload(form.tags),
        status: executionDefaultStatus(form.executionMode),
        schedule_cron: form.executionMode === 'cron' ? form.scheduleCron.trim() : null,
      };
      if (tid) payload.target_output_id = tid;
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
    const cron = (row.schedule_cron || '').trim();
    const executionMode: 'immediate' | 'cron' = cron ? 'cron' : 'immediate';
    const detail = (row.description || '').trim() || (row.instruction || '').trim();
    setForm({
      name: row.name || '',
      detail,
      status: row.status || 'draft',
      tags: (row.tags || []).join(', '),
      executionMode,
      scheduleCron: cron,
      targetOutputId: (row.target_output_id || '').trim(),
    });
    setFormModalOpen(true);
  };

  const onUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setMsg('');
    const name = form.name.trim();
    const detail = form.detail.trim();
    if (!name || !detail) {
      setMsg('名称与详细均不能为空');
      return;
    }
    if (form.executionMode === 'cron' && !form.scheduleCron.trim()) {
      setMsg('Cron 模式下请填写表达式或点选快捷方案');
      return;
    }
    const tid = form.targetOutputId.trim();
    if (tid && !outputIdSet.has(tid)) {
      setMsg('执行目标须从当前目标列表中选择');
      return;
    }
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        name,
        description: detail,
        instruction: detail,
        status: form.status,
        tags: tagsToPayload(form.tags),
        target_output_id: tid || null,
        schedule_cron: form.executionMode === 'cron' ? form.scheduleCron.trim() : null,
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
            <p className="sessions-subtitle">名称、详细与执行设置；随时打开或分享。</p>
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
              placeholder="名称、描述或内容…"
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
            <span className="sessions-filter-label">标签</span>
            <input
              className="sessions-search-input"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              placeholder="按标签筛选"
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
              <p className="sessions-muted sessions-list-body-pad">暂无任务。点右上角新建。</p>
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
                      <p className="quick-inputs-item-card-preview sessions-muted">（无详细）</p>
                    )}
                    <p className="tasks-card-meta">
                      创建 {formatShort(row.created_at)}
                      {row.expected_at ? ` · 期望 ${formatShort(row.expected_at)}` : ''}
                      {row.scheduled_at ? ` · 计划 ${formatShort(row.scheduled_at)}` : ''}
                    </p>
                    {row.target_output_id ? (
                      <p className="tasks-card-meta">目标：{outputLabel(row.target_output_id)}</p>
                    ) : null}
                    {row.schedule_cron ? (
                      <p className="tasks-card-meta" title="Cron">
                        Cron：<code>{row.schedule_cron}</code>
                      </p>
                    ) : null}
                    {row.batch_key ? (
                      <p className="tasks-card-meta">
                        同批：{row.batch_key}
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
              填写名称与详细说明；执行目标请从当前「目标」列表中选择；创建后可在列表中打开。
            </p>
            <form className="modal-form" onSubmit={editingId ? onUpdate : onCreate}>
              <label className="modal-label">
                名称
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
                详细
                <textarea
                  className="modal-textarea quick-inputs-modal-textarea"
                  rows={6}
                  value={form.detail}
                  onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                  placeholder="背景、步骤或验收要点…"
                  disabled={busy}
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
                    value={form.targetOutputId}
                    onChange={(e) => setForm((f) => ({ ...f, targetOutputId: e.target.value }))}
                    disabled={busy}
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
                      name="exec-mode"
                      checked={form.executionMode === 'immediate'}
                      onChange={() => setForm((f) => ({ ...f, executionMode: 'immediate', scheduleCron: '' }))}
                      disabled={busy}
                    />
                    创建后立即执行（状态为「就绪」）
                  </label>
                  <label
                    className="sessions-inline-check"
                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.35rem' }}
                  >
                    <input
                      type="radio"
                      name="exec-mode"
                      checked={form.executionMode === 'cron'}
                      onChange={() => setForm((f) => ({ ...f, executionMode: 'cron' }))}
                      disabled={busy}
                    />
                    按 Cron 表达式定时（状态为「已排期」）
                  </label>
                </div>
                {form.executionMode === 'cron' ? (
                  <div style={{ marginTop: '0.5rem' }}>
                    <label className="modal-label">
                      Cron 表达式
                      <input
                        className="modal-input"
                        value={form.scheduleCron}
                        onChange={(e) => setForm((f) => ({ ...f, scheduleCron: e.target.value }))}
                        placeholder="分 时 日 月 周，如 0 9 * * *"
                        disabled={busy}
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
                          disabled={busy}
                          onClick={() => setForm((f) => ({ ...f, scheduleCron: p.expr, executionMode: 'cron' }))}
                        >
                          {p.label}
                        </button>
                      ))}
                    </p>
                  </div>
                ) : null}
              </fieldset>

              {editingId ? (
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
              ) : null}
              <label className="modal-label">
                标签（逗号分隔）
                <input
                  className="modal-input"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="cursor, backend"
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
