// @ts-nocheck — page state lives in Zustand; shallow selector typing deferred
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  apiCreateQuickInput,
  apiDeleteQuickInput,
  apiUpdateQuickInput,
  fetchQuickInputs,
} from '../api';
import '../App.css';
import { AppModalShell } from '@/components/ui/AppModalShell';
import { emptyForm, useQuickInputsPageStore } from '../stores/quickInputsPageStore';

function notifyQuickInputsChanged() {
  try {
    window.dispatchEvent(new CustomEvent('reso-quick-inputs-changed'));
  } catch {
    /* ignore */
  }
}

export default function QuickInputsPage() {
  const {
    items,
    setItems,
    loading,
    setLoading,
    error,
    setError,
    msg,
    setMsg,
    form,
    setForm,
    editingId,
    setEditingId,
    busy,
    setBusy,
    formModalOpen,
    setFormModalOpen,
    searchInput,
    setSearchInput,
    searchQ,
    setSearchQ,
  } = useQuickInputsPageStore(
    useShallow((s) => ({
      items: s.items,
      setItems: s.setItems,
      loading: s.loading,
      setLoading: s.setLoading,
      error: s.error,
      setError: s.setError,
      msg: s.msg,
      setMsg: s.setMsg,
      form: s.form,
      setForm: s.setForm,
      editingId: s.editingId,
      setEditingId: s.setEditingId,
      busy: s.busy,
      setBusy: s.setBusy,
      formModalOpen: s.formModalOpen,
      setFormModalOpen: s.setFormModalOpen,
      searchInput: s.searchInput,
      setSearchInput: s.setSearchInput,
      searchQ: s.searchQ,
      setSearchQ: s.setSearchQ,
    }))
  );
  const modalCardRef = useRef(null);

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
  }, [setError, setItems, setLoading]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setSearchQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput, setSearchQ]);

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
  }, [setEditingId, setForm, setFormModalOpen]);

  const cancelModal = useCallback(() => {
    closeFormModal();
    setMsg('');
  }, [closeFormModal, setMsg]);

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
    if (!window.confirm('删除这条备忘？工作台上的标签也会更新。')) return;
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
            <h1 className="sessions-title">备忘片段</h1>
            <p className="sessions-subtitle">常用句子，工作台里一点就插入。</p>
          </div>
          <button type="button" className="btn-primary-nav" disabled={busy} onClick={openNewModal}>
            新建
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
              aria-label="刷新列表"
            >
              刷新
            </button>
          </div>
        </div>

        {error ? <p className="sessions-error sessions-alert">{error}</p> : null}
        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="sessions-list-only sessions-list-only--flex">
          <div className="sessions-list-panel sessions-list-panel--full sessions-list-panel--stretch">
            <div className="sessions-list-head">列表</div>
            {loading ? (
              <p className="sessions-muted sessions-list-body-pad">加载中…</p>
            ) : items.length === 0 ? (
              <p className="sessions-muted sessions-list-body-pad">
                暂无条目，点右上角「新建」。
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

      <AppModalShell
        open={formModalOpen}
        onOpenChange={(next) => {
          if (!next) cancelModal();
        }}
        titleId="quick-input-modal-title"
        title={editingId ? '编辑备忘' : '新建备忘'}
        description="工作台上方显示成小标签；点一下插到光标处，没光标就加在末尾。"
        contentClassName="modal-card--wide sm:max-w-[min(96vw,720px)]"
      >
        <div ref={modalCardRef}>
          <form className="modal-form" onSubmit={editingId ? onUpdate : onCreate}>
              <label className="modal-label">
                标签（显示名）
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
      </AppModalShell>
    </div>
  );
}
