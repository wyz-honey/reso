import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiPatchOrganization, fetchOrganizationDetail, type OrganizationSummary } from '../api';
import '../App.css';

function formatOrgTime(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso).slice(0, 16);
  }
}

export default function OrganizationDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const id = String(orgId || '').trim();

  const [org, setOrg] = useState<OrganizationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const load = useCallback(async () => {
    if (!id) {
      setOrg(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const d = await fetchOrganizationDetail(id);
      const o = d.organization as OrganizationSummary | undefined;
      if (!o) {
        setOrg(null);
        setError('未找到组织');
        return;
      }
      setOrg(o);
      setEditName(o.name || '');
      setEditDesc(o.description || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载详情失败');
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const nm = editName.trim();
    if (!nm) {
      setMsg('名称不能为空');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const row = await apiPatchOrganization(id, { name: nm, description: editDesc });
      setOrg(row);
      setMsg('已保存');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  if (!id) {
    return (
      <div className="sessions-page">
        <p className="sessions-error sessions-list-body-pad">缺少组织 id</p>
        <Link to="/organizations" className="btn-sessions-refresh">
          返回组织列表
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="sessions-page">
        <p className="sessions-muted sessions-list-body-pad">加载中…</p>
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="sessions-page">
        <p className="sessions-error sessions-list-body-pad">{error || '未找到组织'}</p>
        <Link to="/organizations" className="btn-sessions-refresh">
          返回组织列表
        </Link>
      </div>
    );
  }

  return (
    <div className="sessions-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <h1 className="sessions-title">{org.name}</h1>
            <p className="sessions-subtitle">更新于 {formatOrgTime(org.updated_at)}</p>
          </div>
          <div className="sessions-filter-actions">
            <Link to="/organizations" className="btn-sessions-refresh">
              返回列表
            </Link>
          </div>
        </div>

        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="sessions-list-body-pad" style={{ maxWidth: '52rem' }}>
          <h3 className="sessions-detail-section-title">资料</h3>
          <form className="sessions-filters" onSubmit={onSave} style={{ flexDirection: 'column', gap: '0.5rem' }}>
            <label className="sessions-search-label">
              <span className="sessions-filter-label">名称</span>
              <input
                type="text"
                className="sessions-search-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={200}
                required
              />
            </label>
            <textarea
              className="modal-textarea quick-inputs-modal-textarea"
              rows={5}
              placeholder="描述"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
            <button type="submit" className="btn-primary-nav" disabled={busy}>
              保存
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
