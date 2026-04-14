import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apiCreateQuickInput,
  apiDeleteQuickInput,
  apiUpdateQuickInput,
  fetchQuickInputs,
} from '../api';
import '../App.css';

function notifyQuickInputsChanged() {
  try {
    window.dispatchEvent(new CustomEvent('reso-quick-inputs-changed'));
  } catch {
    /* ignore */
  }
}

const emptyForm = { label: '', content: '', sort_order: '' };

export default function QuickInputsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const modalCardRef = useRef(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQ, setSearchQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchQuickInputs();
      setItems(list);
    } catch (e) {
      setError(e.message || '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setSearchQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filteredItems = useMemo(() => {
    if (!searchQ) return items;
    const q = searchQ.toLowerCase();
    return items.filter(
      (row) =>
        (row.label || '').toLowerCase().includes(q) || (row.content || '').toLowerCase().includes(q)
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
    const onKey = (e) => {
      if (e.key === 'Escape') cancelModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formModalOpen, cancelModal]);

  useEffect(() => {
    if (!formModalOpen) return;
    const t = window.setTimeout(() => {
      modalCardRef.current?.querySelector?.('input, textarea, select')?.focus?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [formModalOpen]);

  const openNewModal = () => {
    setMsg('');
    setEditingId(null);
    setForm(emptyForm);
    setFormModalOpen(true);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setMsg('');
    const label = form.label.trim();
    const content = form.content;
    if (!label) {
      setMsg('请填写标签名');
      return;
    }
    if (!content.trim()) {
      setMsg('请填写插入内容');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { label, content };
      if (form.sort_order !== '' && form.sort_order != null) {
        const n = parseInt(String(form.sort_order), 10);
        if (!Number.isNaN(n)) payload.sort_order = n;
      }
      await apiCreateQuickInput(payload);
      setMsg('已添加');
      closeFormModal();
      notifyQuickInputsChanged();
      await load();
    } catch (err) {
      setMsg(err.message || '添加失败');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row) => {
    setMsg('');
    setEditingId(row.id);
    setForm({
      label: row.label || '',
      content: row.content || '',
      sort_order: row.sort_order != null ? String(row.sort_order) : '',
    });
    setFormModalOpen(true);
  };

  const onUpdate = async (e) => {
    e.preventDefault();
    if (!editingId) return;
    setMsg('');
    const label = form.label.trim();
    const content = form.content;
    if (!label || !content.trim()) {
      setMsg('标签与内容均不能为空');
      return;
    }
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { label, content };
      if (form.sort_order !== '' && form.sort_order != null) {
        const n = parseInt(String(form.sort_order), 10);
        if (!Number.isNaN(n)) patch.sort_order = n;
      }
      await apiUpdateQuickInput(editingId, patch);
      setMsg('已保存');
      closeFormModal();
      notifyQuickInputsChanged();
      await load();
    } catch (err) {
      setMsg(err.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('删除该快捷上下文？工作台标签将同步更新。')) return;
    setMsg('');
    setBusy(true);
    try {
      await apiDeleteQuickInput(id);
      if (editingId === id) closeFormModal();
      setMsg('已删除');
      notifyQuickInputsChanged();
      await load();
    } catch (err) {
      setMsg(err.message || '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sessions-page quick-inputs-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <h1 className="sessions-title">快捷上下文</h1>
            <p className="sessions-subtitle">
              预设片段用于工作台：在正文编辑区上方以标签展示，点击即可插入光标处（未聚焦编辑区时追加到末尾）。数据存 PostgreSQL。
            </p>
          </div>
          <button type="button" className="btn-primary-nav" disabled={busy} onClick={openNewModal}>
            新建快捷上下文
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
              placeholder="标签或插入内容…"
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
              aria-label="刷新快捷上下文列表"
            >
              刷新
            </button>
          </div>
        </div>

        {error ? <p className="sessions-error sessions-alert">{error}</p> : null}
        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="sessions-list-only sessions-list-only--flex">
          <div className="sessions-list-panel sessions-list-panel--full sessions-list-panel--stretch">
            <div className="sessions-list-head">快捷上下文列表</div>
            {loading ? (
              <p className="sessions-muted sessions-list-body-pad">加载中…</p>
            ) : items.length === 0 ? (
              <p className="sessions-muted sessions-list-body-pad">
                暂无条目，点击右上角「新建快捷上下文」。
              </p>
            ) : filteredItems.length === 0 ? (
              <p className="sessions-muted sessions-list-body-pad">
                没有符合当前搜索的条目，可调整关键词或清空搜索。
              </p>
            ) : (
              <ul className="quick-inputs-grid">
                {filteredItems.map((row) => (
                  <li key={row.id} className="quick-inputs-item-card">
                    <div className="quick-inputs-item-card-header">
                      <h3 className="quick-inputs-item-card-title">{row.label}</h3>
                      <span className="quick-inputs-item-card-badge" title="排序值">
                        #{row.sort_order ?? 0}
                      </span>
                    </div>
                    <p className="quick-inputs-item-card-preview">{row.content}</p>
                    <div className="quick-inputs-item-card-actions">
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
          aria-labelledby="quick-input-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              cancelModal();
            }
          }}
        >
          <div
            ref={modalCardRef}
            className="modal-card modal-card--wide"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="quick-input-modal-title" className="modal-title">
              {editingId ? '编辑快捷上下文' : '新建快捷上下文'}
            </h2>
            <p className="modal-desc">
              工作台正文上方以标签展示；点击标签插入到光标处（未聚焦编辑区时追加到末尾）。
            </p>
            <form className="modal-form" onSubmit={editingId ? onUpdate : onCreate}>
              <label className="modal-label">
                标签（工作台显示为 tag）
                <input
                  className="modal-input"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="如：会议背景"
                  maxLength={200}
                  disabled={busy}
                />
              </label>
              <label className="modal-label">
                插入内容
                <textarea
                  className="modal-textarea quick-inputs-modal-textarea"
                  rows={6}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="点击标签后插入到编辑区的全文…"
                  disabled={busy}
                  spellCheck={false}
                />
              </label>
              <label className="modal-label">
                排序（数字越小越靠前，可空则自动排在最后）
                <input
                  className="modal-input"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  placeholder="自动"
                  disabled={busy}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-clear" disabled={busy} onClick={cancelModal}>
                  取消
                </button>
                {editingId ? (
                  <button type="submit" className="btn-primary-nav" disabled={busy}>
                    保存修改
                  </button>
                ) : (
                  <button type="submit" className="btn-primary-nav" disabled={busy}>
                    添加
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
