// @ts-nocheck — page state lives in Zustand; shallow selector typing deferred
import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  apiBatchDeleteSessions,
  apiCreateSession,
  apiDeleteSession,
  fetchSessionDetail,
  fetchSessionList,
} from '../api';
import '../App.css';
import { useSessionsPageStore } from '../stores/sessionsPageStore';

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  } catch {
    return String(iso);
  }
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const PARA_PAGE_OPTIONS = [10, 20, 50];
const BATCH_DELETE_LIMIT = 100;

export default function SessionsPage() {
  const {
    list,
    setList,
    total,
    setTotal,
    page,
    setPage,
    pageSize,
    setPageSize,
    searchInput,
    setSearchInput,
    searchQ,
    setSearchQ,
    filter,
    setFilter,
    loading,
    setLoading,
    error,
    setError,
    view,
    setView,
    detailId,
    setDetailId,
    detail,
    setDetail,
    detailLoading,
    setDetailLoading,
    busy,
    setBusy,
    msg,
    setMsg,
    paraSearchInput,
    setParaSearchInput,
    paraSearchQ,
    setParaSearchQ,
    paraPage,
    setParaPage,
    paraPageSize,
    setParaPageSize,
    detailRefreshing,
    setDetailRefreshing,
    copiedParaId,
    setCopiedParaId,
    selectedIds,
    setSelectedIds,
  } = useSessionsPageStore(
    useShallow((s) => ({
      list: s.list,
      setList: s.setList,
      total: s.total,
      setTotal: s.setTotal,
      page: s.page,
      setPage: s.setPage,
      pageSize: s.pageSize,
      setPageSize: s.setPageSize,
      searchInput: s.searchInput,
      setSearchInput: s.setSearchInput,
      searchQ: s.searchQ,
      setSearchQ: s.setSearchQ,
      filter: s.filter,
      setFilter: s.setFilter,
      loading: s.loading,
      setLoading: s.setLoading,
      error: s.error,
      setError: s.setError,
      view: s.view,
      setView: s.setView,
      detailId: s.detailId,
      setDetailId: s.setDetailId,
      detail: s.detail,
      setDetail: s.setDetail,
      detailLoading: s.detailLoading,
      setDetailLoading: s.setDetailLoading,
      busy: s.busy,
      setBusy: s.setBusy,
      msg: s.msg,
      setMsg: s.setMsg,
      paraSearchInput: s.paraSearchInput,
      setParaSearchInput: s.setParaSearchInput,
      paraSearchQ: s.paraSearchQ,
      setParaSearchQ: s.setParaSearchQ,
      paraPage: s.paraPage,
      setParaPage: s.setParaPage,
      paraPageSize: s.paraPageSize,
      setParaPageSize: s.setParaPageSize,
      detailRefreshing: s.detailRefreshing,
      setDetailRefreshing: s.setDetailRefreshing,
      copiedParaId: s.copiedParaId,
      setCopiedParaId: s.setCopiedParaId,
      selectedIds: s.selectedIds,
      setSelectedIds: s.setSelectedIds,
    }))
  );

  useEffect(() => {
    const t = setTimeout(() => setSearchQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const t = setTimeout(() => setParaSearchQ(paraSearchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [paraSearchInput]);

  useEffect(() => {
    setParaPage(1);
  }, [detailId, paraSearchQ]);

  useEffect(() => {
    setParaPage(1);
  }, [paraPageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchQ]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQ, filter, pageSize]);

  useEffect(() => {
    if (total === 0) return;
    const tp = Math.max(1, Math.ceil(total / pageSize));
    setPage((p) => (p > tp ? tp : p));
  }, [total, pageSize]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSessionList({
        q: searchQ || undefined,
        filter,
        page,
        pageSize,
      });
      setList(data.sessions);
      setTotal(data.total);
    } catch (e) {
      setError(e.message || '加载失败');
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [searchQ, filter, page, pageSize]);

  useEffect(() => {
    if (view !== 'list') return;
    loadList();
  }, [view, loadList]);

  const loadDetail = async (id, { soft }: { soft?: boolean } = {}) => {
    if (soft) {
      setDetailRefreshing(true);
    } else {
      setDetailLoading(true);
    }
    setMsg('');
    try {
      const data = await fetchSessionDetail(id);
      setDetail(data);
    } catch (e) {
      if (!soft) setDetail(null);
      setMsg(e.message || '加载详情失败');
    } finally {
      if (soft) {
        setDetailRefreshing(false);
      } else {
        setDetailLoading(false);
      }
    }
  };

  const openSession = (id) => {
    setParaSearchInput('');
    setParaSearchQ('');
    setParaPage(1);
    setDetailId(id);
    setView('detail');
    loadDetail(id);
  };

  const backToList = () => {
    setView('list');
    setDetailId(null);
    setDetail(null);
    loadList();
  };

  const onNewSession = async () => {
    setBusy(true);
    setMsg('');
    try {
      await apiCreateSession();
      setPage(1);
      await loadList();
      setMsg('已新建会话，在列表中点击进入可查看段落');
    } catch (e) {
      setMsg(e.message || '新建失败');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteSession = async () => {
    if (!detailId) return;
    if (!window.confirm('确定删除整个会话及其所有段落？此操作不可恢复。')) return;
    setBusy(true);
    setMsg('');
    try {
      await apiDeleteSession(detailId);
      setMsg('已删除会话');
      backToList();
    } catch (e) {
      setMsg(e.message || '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const listIds = useMemo(() => list.map((row) => row.id), [list]);
  const allOnPageSelected =
    listIds.length > 0 && listIds.every((id) => selectedIds.has(id));
  const someOnPageSelected = listIds.some((id) => selectedIds.has(id));

  const toggleSelectAllPage = () => {
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const n = new Set(prev);
        listIds.forEach((id) => n.delete(id));
        return n;
      }
      return new Set([...prev, ...listIds]);
    });
  };

  const batchOverLimit = selectedIds.size > BATCH_DELETE_LIMIT;

  const onBatchDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || ids.length > BATCH_DELETE_LIMIT) return;
    if (
      !window.confirm(
        `确定删除选中的 ${ids.length} 个会话及其全部段落？此操作不可恢复。`
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const { deleted } = await apiBatchDeleteSessions(ids);
      setSelectedIds(new Set());
      setMsg(`已删除 ${deleted} 个会话`);
      await loadList();
    } catch (e) {
      setMsg(e.message || '批量删除失败');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const pageSafe = Math.min(page, totalPages);

  const paragraphsChronoAsc = useMemo(() => {
    if (!detail?.paragraphs?.length) return [];
    return [...detail.paragraphs].sort(
      (a, b) =>
        new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime()
    );
  }, [detail?.paragraphs]);

  const filteredParagraphs = useMemo(() => {
    if (!detail?.paragraphs?.length) return [];
    const q = paraSearchQ.toLowerCase();
    const base = !q
      ? [...detail.paragraphs]
      : detail.paragraphs.filter((p) => (p.content || '').toLowerCase().includes(q));
    return base.sort(
      (a, b) =>
        new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()
    );
  }, [detail?.paragraphs, paraSearchQ]);

  const paraTotalPages = Math.max(1, Math.ceil(filteredParagraphs.length / paraPageSize) || 1);
  const paraPageSafe = Math.min(paraPage, paraTotalPages);

  const pagedParagraphRows = useMemo(() => {
    const start = (paraPageSafe - 1) * paraPageSize;
    const slice = filteredParagraphs.slice(start, start + paraPageSize);
    return slice.map((p) => ({
      paragraph: p,
      origIndex: paragraphsChronoAsc.findIndex((x) => x.id === p.id) + 1,
    }));
  }, [filteredParagraphs, paraPageSafe, paraPageSize, paragraphsChronoAsc]);

  const filteredParaCount = filteredParagraphs.length;
  useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredParaCount / paraPageSize) || 1);
    setParaPage((p) => (p > tp ? tp : p));
  }, [filteredParaCount, paraPageSize]);

  const copyParagraph = async (p) => {
    const text = p?.content != null ? String(p.content) : '';
    try {
      await navigator.clipboard.writeText(text);
      setCopiedParaId(p.id);
      window.setTimeout(() => {
        setCopiedParaId((cur) => (cur === p.id ? null : cur));
      }, 2000);
    } catch {
      setMsg('复制失败，请检查浏览器剪贴板权限');
    }
  };

  return (
    <div className="sessions-page">
      {view === 'list' ? (
        <div className="sessions-view-stack">
          <div className="sessions-toolbar">
            <div className="sessions-title-wrap">
              <h1 className="sessions-title">会话</h1>
              <p className="sessions-subtitle">
                列表按<strong>创建时间倒序</strong>（新的在上）；标题与摘要取该会话内<strong>最新保存</strong>
                的一段。可搜索、筛选、分页。
              </p>
            </div>
            <button type="button" className="btn-primary-nav" disabled={busy} onClick={onNewSession}>
              新建会话
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
                placeholder="会话 ID 或段落正文…"
                autoComplete="off"
              />
            </label>
            <label className="sessions-filter-field">
              <span className="sessions-filter-label">筛选</span>
              <select
                className="sessions-filter-select"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">全部</option>
                <option value="with">有段落</option>
                <option value="empty">无段落</option>
              </select>
            </label>
            <label className="sessions-filter-field">
              <span className="sessions-filter-label">每页</span>
              <select
                className="sessions-filter-select"
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} 条
                  </option>
                ))}
              </select>
            </label>
            <div className="sessions-filter-actions">
              <span className="sessions-filter-label">操作</span>
              <button
                type="button"
                className="btn-sessions-refresh"
                disabled={loading || busy}
                onClick={() => loadList()}
                aria-label="按当前搜索与筛选刷新会话列表"
              >
                刷新
              </button>
            </div>
          </div>

          {error ? <p className="sessions-error sessions-alert">{error}</p> : null}
          {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

          <div className="sessions-list-only sessions-list-only--flex">
            <div className="sessions-list-panel sessions-list-panel--full sessions-list-panel--stretch">
              <div
                className={`sessions-list-head sessions-list-head--row${
                  selectedIds.size > 0 ? ' sessions-list-head--selection-active' : ''
                }`}
              >
                <span className="sessions-list-head-title">会话列表</span>
                {!loading && list.length > 0 ? (
                  <label className="sessions-list-head-select">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
                      }}
                      onChange={toggleSelectAllPage}
                      aria-label="全选当前页会话"
                    />
                    <span>本页全选</span>
                  </label>
                ) : null}
              </div>
              {!loading && list.length > 0 && selectedIds.size > 0 ? (
                <div className="sessions-selection-bar" role="region" aria-label="已选会话的批量操作">
                  <div className="sessions-selection-bar-inner">
                    <div className="sessions-selection-copy">
                      <span className="sessions-selection-count">
                        已选择 <strong>{selectedIds.size}</strong> 个会话
                      </span>
                      <span className="sessions-selection-hint">
                        可翻页继续勾选；修改搜索、筛选或每页条数会清空选择。
                      </span>
                    </div>
                    <div className="sessions-selection-actions">
                      <button
                        type="button"
                        className="btn-selection-secondary"
                        disabled={busy}
                        onClick={() => setSelectedIds(new Set())}
                      >
                        清除选择
                      </button>
                      <button
                        type="button"
                        className="btn-selection-delete"
                        disabled={busy || batchOverLimit}
                        onClick={onBatchDelete}
                        title={
                          batchOverLimit
                            ? `单次最多删除 ${BATCH_DELETE_LIMIT} 条`
                            : '删除所选会话及全部段落'
                        }
                      >
                        删除所选
                      </button>
                    </div>
                  </div>
                  {batchOverLimit ? (
                    <p className="sessions-selection-warn" role="alert">
                      单次最多删除 {BATCH_DELETE_LIMIT} 条，请先取消部分勾选。
                    </p>
                  ) : null}
                </div>
              ) : null}
              {loading ? (
                <p className="sessions-muted sessions-list-body-pad">加载中…</p>
              ) : list.length === 0 ? (
                <p className="sessions-muted sessions-list-body-pad">
                  {searchQ || filter !== 'all'
                    ? '没有符合条件的会话，可调整搜索或筛选。'
                    : '暂无会话，点击右上角「新建会话」。'}
                </p>
              ) : (
                <>
                  <ul className="sessions-list sessions-list--scroll">
                    {list.map((row) => {
                      const pc = Number(row.paragraph_count);
                      const hasPara = !Number.isNaN(pc) && pc > 0;
                      const title =
                        (typeof row.list_title === 'string' && row.list_title.trim()) ||
                        (hasPara ? '（无标题）' : '暂无内容');
                      const preview =
                        (typeof row.preview === 'string' && row.preview.trim()) ||
                        (hasPara ? '（摘要为空）' : '暂无已保存片段');
                      return (
                        <li key={row.id} className="sessions-list-item">
                          <div className="sessions-list-item-wrap">
                            <label
                              className="sessions-list-item-check sessions-list-item-check--tr"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedIds.has(row.id)}
                                onChange={() => toggleSelect(row.id)}
                                aria-label={`选择会话 ${row.id.slice(0, 8)}…`}
                              />
                            </label>
                            <button
                              type="button"
                              className="sessions-list-row sessions-list-row--rich sessions-list-row--with-check-tr"
                              onClick={() => openSession(row.id)}
                            >
                            <div className="sessions-list-row-text">
                              <div className="sessions-list-row-title">{title}</div>
                              <div className="sessions-list-row-preview">{preview}</div>
                              <div className="sessions-list-row-foot">
                                <span className="sessions-list-time">{formatTime(row.created_at)}</span>
                                <span className="sessions-list-id" title={row.id}>
                                  {row.id.slice(0, 8)}…
                                </span>
                              </div>
                            </div>
                            <div className="sessions-list-row-meta">
                              <span className="sessions-badge">
                                {Number.isNaN(pc) ? 0 : pc} 段
                              </span>
                              <span className="sessions-list-chevron" aria-hidden>
                                →
                              </span>
                            </div>
                          </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {!loading && list.length > 0 ? (
                <div className="sessions-pagination">
                  <span className="sessions-pagination-info">
                    共 {total} 条 · 第 {pageSafe} / {totalPages} 页
                  </span>
                  <div className="sessions-pagination-btns">
                    <button
                      type="button"
                      className="btn-pagination"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      className="btn-pagination"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="sessions-view-stack sessions-view-stack--detail">
          <div className="sessions-detail-toolbar">
            <button type="button" className="btn-back-sessions" onClick={backToList}>
              ← 返回会话列表
            </button>
          </div>

          {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

          <div className="sessions-detail-full sessions-detail-full--scroll">
            {detailLoading ? (
              <p className="sessions-muted sessions-detail-inner-pad">加载中…</p>
            ) : detail ? (
              <>
                <div className="sessions-detail-fixed">
                  <div className="sessions-detail-head">
                    <div>
                      <div className="sessions-detail-label">会话 ID</div>
                      <div className="sessions-detail-id" title={detail.session.id}>
                        {detail.session.id}
                      </div>
                      <div className="sessions-muted sessions-detail-created">
                        创建于 {formatTime(detail.session.created_at)}
                      </div>
                    </div>
                    <div className="sessions-detail-actions">
                      <button type="button" className="btn-danger" disabled={busy} onClick={onDeleteSession}>
                        删除会话
                      </button>
                    </div>
                  </div>
                  <h3 className="sessions-paragraphs-title">
                    段落列表
                    <span className="sessions-paragraphs-order-hint">（倒序：最新在上；段号为录入先后）</span>
                  </h3>
                  {detail.paragraphs.length === 0 ? (
                    <p className="sessions-muted sessions-detail-inner-pad">该会话下还没有保存的段落。</p>
                  ) : (
                    <div className="sessions-para-toolbar">
                      <label className="sessions-para-search">
                        <span className="sessions-filter-label">搜索段落</span>
                        <input
                          type="search"
                          className="sessions-search-input"
                          value={paraSearchInput}
                          onChange={(e) => setParaSearchInput(e.target.value)}
                          placeholder="正文关键字…"
                          autoComplete="off"
                        />
                      </label>
                      <label className="sessions-para-pagesize">
                        <span className="sessions-filter-label">每页</span>
                        <select
                          className="sessions-filter-select"
                          value={String(paraPageSize)}
                          onChange={(e) => {
                            setParaPageSize(Number(e.target.value));
                            setParaPage(1);
                          }}
                        >
                          {PARA_PAGE_OPTIONS.map((n) => (
                            <option key={n} value={String(n)}>
                              {n} 段
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="sessions-para-actions">
                        <span className="sessions-filter-label">段落</span>
                        <button
                          type="button"
                          className="btn-sessions-refresh"
                          disabled={detailRefreshing || busy || !detailId}
                          onClick={() => loadDetail(detailId, { soft: true })}
                        >
                          刷新
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {detail.paragraphs.length > 0 ? (
                  <>
                    <div className="paragraphs-scroll">
                      {filteredParagraphs.length === 0 ? (
                        <p className="sessions-muted sessions-detail-inner-pad">没有匹配的段落。</p>
                      ) : (
                        <ul className="paragraphs-list paragraphs-list--in-scroll">
                          {pagedParagraphRows.map(({ paragraph: p, origIndex }) => (
                            <li key={p.id} className="paragraph-card">
                              <div className="paragraph-card-head">
                                <div className="paragraph-meta">
                                  第 {origIndex} 段 · {formatTime(p.created_at)}
                                </div>
                                <button
                                  type="button"
                                  className="btn-paragraph-copy"
                                  onClick={() => copyParagraph(p)}
                                >
                                  {copiedParaId === p.id ? '已复制' : '复制'}
                                </button>
                              </div>
                              <pre className="paragraph-body">{p.content}</pre>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {filteredParagraphs.length > 0 ? (
                      <div className="sessions-pagination sessions-pagination--tight">
                        <span className="sessions-pagination-info">
                          段落 {filteredParagraphs.length} 条 · 第 {paraPageSafe} / {paraTotalPages} 页
                        </span>
                        <div className="sessions-pagination-btns">
                          <button
                            type="button"
                            className="btn-pagination"
                            disabled={paraPageSafe <= 1}
                            onClick={() => setParaPage((x) => Math.max(1, x - 1))}
                          >
                            上一页
                          </button>
                          <button
                            type="button"
                            className="btn-pagination"
                            disabled={paraPageSafe >= paraTotalPages}
                            onClick={() => setParaPage((x) => Math.min(paraTotalPages, x + 1))}
                          >
                            下一页
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <p className="sessions-muted sessions-detail-inner-pad">无法加载该会话</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
