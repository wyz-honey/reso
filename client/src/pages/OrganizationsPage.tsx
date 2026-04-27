import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppModalShell } from '../components/ui/AppModalShell';
import { apiCreateOrganization, fetchOrganizations, type OrganizationSummary } from '../api';
import '../App.css';

function formatOrgTime(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso).slice(0, 16);
  }
}

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [orgSearchInput, setOrgSearchInput] = useState('');

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchOrganizations();
      setOrgs(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  const onCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = newOrgName.trim();
    if (!n) {
      setMsg('请填写组织名称');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const row = await apiCreateOrganization({
        name: n,
        description: newOrgDesc.trim() || undefined,
      });
      setNewOrgName('');
      setNewOrgDesc('');
      setCreateModalOpen(false);
      await loadOrgs();
      navigate(`/organizations/${row.id}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const filteredOrgs = useMemo(() => {
    const q = orgSearchInput.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        (o.name || '').toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q)
    );
  }, [orgs, orgSearchInput]);

  return (
    <div className="sessions-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <h1 className="sessions-title">组织</h1>
            <p className="sessions-subtitle">仅名称与描述；点进条目可编辑。</p>
          </div>
          <button type="button" className="btn-primary-nav" disabled={busy} onClick={() => setCreateModalOpen(true)}>
            新建组织
          </button>
        </div>

        <div className="sessions-filters">
          <label className="sessions-search-label">
            <span className="sessions-filter-label">搜索</span>
            <input
              type="search"
              className="sessions-search-input"
              value={orgSearchInput}
              onChange={(e) => setOrgSearchInput(e.target.value)}
              placeholder="名称或描述…"
              autoComplete="off"
            />
          </label>
          <div className="sessions-filter-actions">
            <span className="sessions-filter-label">操作</span>
            <button
              type="button"
              className="btn-sessions-refresh"
              disabled={loading || busy}
              onClick={() => void loadOrgs()}
            >
              刷新
            </button>
          </div>
        </div>

        {error ? <p className="sessions-error sessions-alert">{error}</p> : null}
        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="sessions-list-only sessions-list-only--flex">
          <div className="sessions-list-panel sessions-list-panel--full sessions-list-panel--stretch">
            <div className="sessions-list-head">
              <span className="sessions-list-head-title">组织列表</span>
            </div>
            {loading ? (
              <p className="sessions-muted sessions-list-body-pad">加载中…</p>
            ) : orgs.length === 0 ? (
              <p className="sessions-muted sessions-list-body-pad">暂无组织，点右上角「新建组织」。</p>
            ) : filteredOrgs.length === 0 ? (
              <p className="sessions-muted sessions-list-body-pad">没有符合搜索的条目。</p>
            ) : (
              <ul className="sessions-list sessions-list--scroll">
                {filteredOrgs.map((o) => {
                  const desc = (o.description || '').trim();
                  const preview =
                    desc.length > 0 ? (desc.length > 120 ? `${desc.slice(0, 120)}…` : desc) : '暂无描述';
                  return (
                    <li key={o.id} className="sessions-list-item">
                      <Link
                        to={`/organizations/${o.id}`}
                        className="sessions-list-row sessions-list-row--rich"
                        onClick={() => setMsg('')}
                      >
                        <div className="sessions-list-row-text">
                          <div className="sessions-list-row-title">{o.name}</div>
                          <div className="sessions-list-row-preview">{preview}</div>
                          <div className="sessions-list-row-foot">
                            <span className="sessions-list-time">{formatOrgTime(o.created_at)}</span>
                            <span className="sessions-list-id" title={o.id}>
                              {o.id.slice(0, 8)}…
                            </span>
                          </div>
                        </div>
                        <div className="sessions-list-row-meta">
                          <span className="sessions-list-chevron" aria-hidden>
                            →
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <AppModalShell
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        titleId="org-create-modal-title"
        title="新建组织"
        description="创建后将进入详情页，可继续编辑名称与描述。"
        contentClassName="sm:max-w-[min(96vw,480px)]"
      >
        <form className="modal-form" onSubmit={onCreateOrg}>
          <label className="modal-label">
            名称
            <input
              className="modal-input"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="团队或项目名"
              maxLength={200}
              required
            />
          </label>
          <label className="modal-label">
            描述（可选）
            <textarea
              className="modal-textarea"
              rows={2}
              value={newOrgDesc}
              onChange={(e) => setNewOrgDesc(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-clear" onClick={() => setCreateModalOpen(false)}>
              取消
            </button>
            <button type="submit" className="btn-copy" disabled={busy}>
              创建
            </button>
          </div>
        </form>
      </AppModalShell>
    </div>
  );
}
