// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BUILTIN_OUTPUT_ID } from '../constants/builtins';
import {
  DELIVERY_TYPE_LABELS,
  HTTP_PROTOCOL_LABELS,
  NEW_OUTPUT_DELIVERY_TYPES,
  TARGET_KIND_LABELS,
  addCustomOutput,
  listAllOutputs,
  newOutputId,
  updateCustomOutput,
} from '../outputCatalog';
import CliAngleSlotsEditor from '../components/CliAngleSlotsEditor';
import CliEnvEditor from '../components/CliEnvEditor';
import CliInstructionHeader from '../components/CliInstructionHeader';
import { mergeTargetEnvLayers, normalizeCliEnvRecord } from '../cliEnv';
import { buildAllCustomAngleSlots, mergeAngleSlotsWithDefaults } from '../cliSubstitute';
import OutputVoiceControlSection from '../components/OutputVoiceControlSection';
import {
  parseOutputVoiceControl,
  serializeOutputVoiceControl,
} from '../outputVoiceControl';
import {
  DEFAULT_CLI_TEMPLATE,
  getAllModes,
  removeCustomMode,
  updateLegacyCustomMode,
} from '../workModes';
import '../App.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function formatTargetTs(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
    return d.toLocaleString();
  } catch {
    return '—';
  }
}

function emptyDraft() {
  return {
    name: '',
    description: '',
    deliveryType: 'http',
    httpProtocol: 'openai_chat',
    requestUrl: '',
    outputShape: '',
    extJson: '{}',
    commandTemplate: '',
    cliTemplate: DEFAULT_CLI_TEMPLATE,
    cliWorkspace: '',
    systemPrompt: '',
    angleSlots: [],
    voiceControl: parseOutputVoiceControl(undefined, 'http'),
    targetEnv: {},
  };
}

function rowToDraft(row) {
  const ext =
    row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
      ? row.extensions
      : {};
  const mode = getAllModes().find((m) => m.id === row.id);
  return {
    name: row.name || '',
    description: row.description || '',
    deliveryType: row.deliveryType || 'paragraph_clipboard',
    requestUrl: row.requestUrl || '',
    outputShape: row.outputShape || '',
    extJson: JSON.stringify(ext, null, 2),
    httpProtocol: ext.httpProtocol === 'agui' ? 'agui' : 'openai_chat',
    commandTemplate:
      row.deliveryType === 'xiaoai'
        ? typeof ext.commandTemplate === 'string'
          ? ext.commandTemplate
          : mode?.kind === 'cli' && mode.cliVariant === 'xiaoai'
            ? mode.cliTemplate || ''
            : ''
        : '',
    cliTemplate:
      row.deliveryType === 'command'
        ? mode?.kind === 'cli'
          ? mode.cliTemplate || DEFAULT_CLI_TEMPLATE
          : typeof ext.cliTemplate === 'string'
            ? ext.cliTemplate
            : DEFAULT_CLI_TEMPLATE
        : DEFAULT_CLI_TEMPLATE,
    cliWorkspace:
      row.deliveryType === 'command'
        ? mode?.kind === 'cli'
          ? mode.cliWorkspace || ''
          : typeof ext.cliWorkspace === 'string'
            ? ext.cliWorkspace
            : ''
        : '',
    systemPrompt:
      row.legacy && row.deliveryType === 'agent_chat'
        ? typeof ext.systemPrompt === 'string'
          ? ext.systemPrompt
          : ''
        : '',
    angleSlots:
      row.deliveryType === 'xiaoai' && Array.isArray(ext.angleSlots) ? ext.angleSlots : [],
    voiceControl: parseOutputVoiceControl(ext.voiceControl, row.deliveryType),
    targetEnv: mergeTargetEnvLayers(ext.cliEnv, ext.environment, row.environment),
  };
}

export default function OutputsPage() {
  const [tick, setTick] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterKind, setFilterKind] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState(() => emptyDraft());
  const [formErr, setFormErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearchQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [searchQ, filterType, filterKind]);

  useEffect(() => {
    const fn = () => setTick((x) => x + 1);
    window.addEventListener('reso-outputs-changed', fn);
    window.addEventListener('reso-providers-changed', fn);
    return () => {
      window.removeEventListener('reso-outputs-changed', fn);
      window.removeEventListener('reso-providers-changed', fn);
    };
  }, []);

  const rows = useMemo(() => listAllOutputs(), [tick]);

  const filtered = useMemo(() => {
    const q = searchQ.toLowerCase();
    return rows.filter((o) => {
      if (filterType !== 'all' && o.deliveryType !== filterType) return false;
      if (filterKind !== 'all' && o.targetKind !== filterKind) return false;
      if (!q) return true;
      const blob = `${o.name} ${o.description} ${o.id} ${o.requestUrl} ${o.outputShape}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, searchQ, filterType, filterKind]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const pageSafe = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  useEffect(() => {
    setPage((p) => (p > totalPages ? totalPages : p));
  }, [totalPages]);

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  const openExpand = (row) => {
    if (
      row.builtin &&
      (row.id === BUILTIN_OUTPUT_ID.ASR || row.id === BUILTIN_OUTPUT_ID.AGENT)
    )
      return;
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    setDraft(rowToDraft(row));
    setFormErr('');
    setMsg('');
  };

  const saveCustom = (id) => {
    setFormErr('');
    const row = listAllOutputs().find((r) => r.id === id);
    if (row?.legacy) {
      if (!draft.name.trim()) {
        setFormErr('请填写名称');
        return;
      }
      if (row.deliveryType === 'agent_chat') {
        updateLegacyCustomMode(id, {
          name: draft.name.trim(),
          systemPrompt: draft.systemPrompt,
        });
      } else {
        updateLegacyCustomMode(id, {
          name: draft.name.trim(),
          cliTemplate: draft.cliTemplate || DEFAULT_CLI_TEMPLATE,
          cliWorkspace: draft.cliWorkspace || '',
        });
      }
      setMsg('已保存');
      refresh();
      return;
    }
    let extensions = {};
    if (draft.deliveryType === 'http') {
      const proto = draft.httpProtocol === 'agui' ? 'agui' : 'openai_chat';
      const url = draft.requestUrl.trim();
      extensions = { httpProtocol: proto, requestUrl: url };
    } else if (draft.deliveryType === 'xiaoai') {
      const tmpl = (draft.commandTemplate || '').trim();
      extensions = {
        commandTemplate: tmpl,
        angleSlots: mergeAngleSlotsWithDefaults(tmpl, draft.angleSlots || []),
      };
    } else if (draft.deliveryType === 'command') {
      extensions = {
        cliTemplate: (draft.cliTemplate || DEFAULT_CLI_TEMPLATE).trim(),
        cliWorkspace: (draft.cliWorkspace || '').trim(),
      };
    } else if (draft.deliveryType === 'agent_chat') {
      const prevExt =
        row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
          ? { ...row.extensions }
          : {};
      extensions = { ...prevExt };
    } else {
      try {
        extensions = draft.extJson.trim() ? JSON.parse(draft.extJson) : {};
        if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) {
          throw new Error('扩展须为 JSON 对象');
        }
      } catch (e) {
        setFormErr(e.message || '扩展 JSON 无效');
        return;
      }
    }
    extensions = {
      ...(typeof extensions === 'object' && extensions && !Array.isArray(extensions)
        ? extensions
        : {}),
      voiceControl: serializeOutputVoiceControl(draft.voiceControl),
    };
    const envNorm = normalizeCliEnvRecord(draft.targetEnv);
    if (['http', 'xiaoai', 'command', 'agent_chat'].includes(draft.deliveryType)) {
      extensions.environment = envNorm;
      extensions.cliEnv = envNorm;
    }
    if (!draft.name.trim()) {
      setFormErr('请填写名称');
      return;
    }
    if (draft.deliveryType === 'xiaoai' && !(draft.commandTemplate || '').trim()) {
      setFormErr('请填写完整指令');
      return;
    }
    if (draft.deliveryType === 'http' && !(draft.requestUrl || '').trim()) {
      setFormErr('请填写请求 URL');
      return;
    }
    updateCustomOutput(id, {
      name: draft.name.trim(),
      description: draft.description.trim(),
      deliveryType: draft.deliveryType,
      requestUrl: draft.requestUrl.trim(),
      outputShape: draft.outputShape.trim(),
      extensions,
      ...(['http', 'xiaoai', 'command', 'agent_chat'].includes(draft.deliveryType)
        ? { environment: envNorm }
        : {}),
    });
    setMsg('已保存');
    refresh();
  };

  const onRemove = (id) => {
    if (!window.confirm('删除该自定义输出？工作台模式选择里将同步移除。')) return;
    removeCustomMode(id);
    if (expandedId === id) setExpandedId(null);
    setMsg('已删除');
    refresh();
  };

  const submitModal = (e) => {
    e.preventDefault();
    setFormErr('');
    let extensions = {};
    if (modalDraft.deliveryType === 'http') {
      const proto = modalDraft.httpProtocol === 'agui' ? 'agui' : 'openai_chat';
      const url = modalDraft.requestUrl.trim();
      if (!url) {
        setFormErr('请填写请求 URL');
        return;
      }
      extensions = { httpProtocol: proto, requestUrl: url };
    } else if (modalDraft.deliveryType === 'xiaoai') {
      const tmpl = (modalDraft.commandTemplate || '').trim();
      if (!tmpl) {
        setFormErr('请填写完整指令');
        return;
      }
      extensions = {
        commandTemplate: tmpl,
        angleSlots: mergeAngleSlotsWithDefaults(tmpl, modalDraft.angleSlots || []),
      };
    }
    extensions = {
      ...(typeof extensions === 'object' && extensions && !Array.isArray(extensions)
        ? extensions
        : {}),
      voiceControl: serializeOutputVoiceControl(modalDraft.voiceControl),
    };
    const envNormModal = normalizeCliEnvRecord(modalDraft.targetEnv);
    extensions.environment = envNormModal;
    extensions.cliEnv = envNormModal;
    if (!modalDraft.name.trim()) {
      setFormErr('请填写名称');
      return;
    }
    const id = newOutputId();
    const outShape =
      modalDraft.deliveryType === 'http'
        ? modalDraft.outputShape.trim() ||
          (modalDraft.httpProtocol === 'agui'
            ? 'AGUI：默认 { user_message, session_id }。'
            : 'OpenAI Chat：{ model?, messages }。')
        : modalDraft.outputShape.trim() ||
          '尖括号占位可配置系统/自定义；亦支持 {{paragraph}}、{{sessionId}}、{{workspace}}。';
    addCustomOutput({
      id,
      builtin: false,
      name: modalDraft.name.trim(),
      description: modalDraft.description.trim(),
      deliveryType: modalDraft.deliveryType,
      requestUrl:
        modalDraft.deliveryType === 'http'
          ? modalDraft.requestUrl.trim()
          : modalDraft.deliveryType === 'xiaoai'
            ? '（本机）拼指令并复制剪贴板'
            : modalDraft.requestUrl.trim(),
      outputShape: outShape,
      extensions,
      environment: envNormModal,
    });
    setModalOpen(false);
    setModalDraft(emptyDraft());
    setMsg('已添加输出');
    refresh();
  };

  return (
    <div className="sessions-page outputs-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <h1 className="sessions-title">目标管理</h1>
            <p className="sessions-subtitle">
              与工作台「工作模式」目录一致。每条目标含大分类（Agent / API）、创建/更新时间（自定义项）。
              内置目标点击进<strong>详情页</strong>；自定义目标在列表中展开编辑。
            </p>
          </div>
          <button
            type="button"
            className="btn-primary-nav"
            onClick={() => {
              setFormErr('');
              setModalDraft(emptyDraft());
              setModalOpen(true);
            }}
          >
            新建输出
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
              placeholder="名称、描述、ID、请求说明…"
              autoComplete="off"
            />
          </label>
          <label className="sessions-filter-field">
            <span className="sessions-filter-label">大分类</span>
            <select
              className="sessions-filter-select"
              value={filterKind}
              onChange={(e) => {
                setFilterKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">全部</option>
              {Object.entries(TARGET_KIND_LABELS).map(([k, lab]) => (
                <option key={k} value={k}>
                  {lab}
                </option>
              ))}
            </select>
          </label>
          <label className="sessions-filter-field">
            <span className="sessions-filter-label">投递</span>
            <select
              className="sessions-filter-select"
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">全部</option>
              {Object.entries(DELIVERY_TYPE_LABELS).map(([k, lab]) => (
                <option key={k} value={k}>
                  {lab}
                </option>
              ))}
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
            <button type="button" className="btn-sessions-refresh" onClick={() => refresh()}>
              刷新
            </button>
          </div>
        </div>

        {formErr ? <p className="sessions-error sessions-alert">{formErr}</p> : null}
        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="sessions-list-only sessions-list-only--flex">
          <div className="sessions-list-panel sessions-list-panel--full sessions-list-panel--stretch">
            <div className="sessions-list-head">目标列表</div>
            {filtered.length === 0 ? (
              <p className="sessions-muted sessions-list-body-pad">
                {searchQ || filterType !== 'all' || filterKind !== 'all'
                  ? '没有符合条件的输出。'
                  : '暂无。点击「新建输出」添加。'}
              </p>
            ) : (
              <ul className="sessions-list sessions-list--scroll outputs-list">
                {paged.map((o) => {
                  const kindLab = TARGET_KIND_LABELS[o.targetKind] || o.targetKind;
                  const rowFoot = (
                    <div className="sessions-list-row-foot">
                      <span className="outputs-type-pill outputs-type-pill--kind" title="大分类">
                        {kindLab}
                      </span>
                      <span className="outputs-type-pill">
                        {DELIVERY_TYPE_LABELS[o.deliveryType] || o.deliveryType}
                      </span>
                      <span className="outputs-target-ts" title="创建 · 更新">
                        {formatTargetTs(o.createdAt)} · {formatTargetTs(o.updatedAt)}
                      </span>
                      <span className="sessions-list-id" title={o.id}>
                        {o.id.length > 14 ? `${o.id.slice(0, 10)}…` : o.id}
                      </span>
                    </div>
                  );

                  if (o.builtin && o.id === BUILTIN_OUTPUT_ID.ASR) {
                    return (
                      <li key={o.id} className="outputs-list-item">
                        <NavLink
                          to={`/outputs/${o.id}`}
                          className="sessions-list-row sessions-list-row--rich outputs-list-row--link"
                        >
                          <div className="sessions-list-row-text">
                            <div className="sessions-list-row-title">
                              {o.name}
                              <span className="outputs-badge outputs-badge--builtin">内置</span>
                              <span className="outputs-badge outputs-badge--readonly">只读</span>
                            </div>
                            <div className="sessions-list-row-preview">
                              {(o.description || '').slice(0, 200)}
                              {(o.description || '').length > 200 ? '…' : ''}
                            </div>
                            {rowFoot}
                          </div>
                          <div className="sessions-list-row-meta">
                            <span className="outputs-row-action">详情</span>
                          </div>
                        </NavLink>
                      </li>
                    );
                  }

                  if (o.builtin && o.id === BUILTIN_OUTPUT_ID.AGENT) {
                    return (
                      <li key={o.id} className="outputs-list-item">
                        <NavLink
                          to={`/outputs/${o.id}`}
                          className="sessions-list-row sessions-list-row--rich outputs-list-row--link"
                        >
                          <div className="sessions-list-row-text">
                            <div className="sessions-list-row-title">
                              {o.name}
                              <span className="outputs-badge outputs-badge--builtin">内置</span>
                              <span className="outputs-badge outputs-badge--agent">智能体</span>
                            </div>
                            <div className="sessions-list-row-preview">
                              {(o.description || '').slice(0, 200)}
                              {(o.description || '').length > 200 ? '…' : ''}
                            </div>
                            {rowFoot}
                          </div>
                          <div className="sessions-list-row-meta">
                            <span className="outputs-row-action">详情</span>
                          </div>
                        </NavLink>
                      </li>
                    );
                  }

                  if (o.builtin && o.id === BUILTIN_OUTPUT_ID.CURSOR) {
                    return (
                      <li key={o.id} className="outputs-list-item">
                        <NavLink
                          to={`/outputs/${o.id}`}
                          className="sessions-list-row sessions-list-row--rich outputs-list-row--link"
                        >
                          <div className="sessions-list-row-text">
                            <div className="sessions-list-row-title">
                              {o.name}
                              <span className="outputs-badge outputs-badge--builtin">内置</span>
                              <span className="outputs-badge outputs-badge--agent">Agent·CLI</span>
                            </div>
                            <div className="sessions-list-row-preview">
                              {(o.description || '').slice(0, 200)}
                              {(o.description || '').length > 200 ? '…' : ''}
                            </div>
                            {rowFoot}
                          </div>
                          <div className="sessions-list-row-meta">
                            <span className="outputs-row-action">详情</span>
                          </div>
                        </NavLink>
                      </li>
                    );
                  }

                  return (
                    <li key={o.id} className="outputs-list-item">
                      <button
                        type="button"
                        className="sessions-list-row sessions-list-row--rich outputs-list-row-btn"
                        onClick={() => openExpand(o)}
                        aria-expanded={expandedId === o.id}
                      >
                        <div className="sessions-list-row-text">
                          <div className="sessions-list-row-title">
                            {o.name}
                            {o.builtin ? (
                              <span className="outputs-badge outputs-badge--builtin">内置</span>
                            ) : o.legacy ? (
                              <span className="outputs-badge outputs-badge--legacy">旧版</span>
                            ) : (
                              <span className="outputs-badge outputs-badge--custom">自定义</span>
                            )}
                          </div>
                          <div className="sessions-list-row-preview">
                            {(o.description || '').slice(0, 200)}
                            {(o.description || '').length > 200 ? '…' : ''}
                          </div>
                          {rowFoot}
                        </div>
                        <div className="sessions-list-row-meta">
                          <span className="sessions-list-chevron" aria-hidden>
                            {expandedId === o.id ? '▼' : '▶'}
                          </span>
                        </div>
                      </button>

                    {expandedId === o.id ? (
                      <div className="outputs-expand">
                        <div className="outputs-expand-section">
                          <h3 className="outputs-expand-section-title">基本信息</h3>
                          <label className="outputs-expand-label">
                            名称
                            <input
                              className="sessions-search-input"
                              value={draft.name}
                              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                            />
                          </label>
                          {o.legacy && !o.builtin ? (
                            <p className="outputs-legacy-hint">
                              此为旧版存储条目：保存时仅同步名称与系统提示 / CLI 模板；若要编辑完整说明，请新建输出后删除此项。
                            </p>
                          ) : null}
                          {(o.builtin || !o.legacy) && (
                            <>
                              <label className="outputs-expand-label">
                                描述
                                <textarea
                                  className="outputs-expand-textarea"
                                  rows={3}
                                  value={draft.description}
                                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                                />
                              </label>
                              <label className="outputs-expand-label">
                                请求地址 / 说明
                                <input
                                  className="sessions-search-input"
                                  value={draft.requestUrl}
                                  onChange={(e) => setDraft((d) => ({ ...d, requestUrl: e.target.value }))}
                                />
                              </label>
                              <label className="outputs-expand-label">
                                输出结构说明
                                <textarea
                                  className="outputs-expand-textarea"
                                  rows={4}
                                  value={draft.outputShape}
                                  onChange={(e) => setDraft((d) => ({ ...d, outputShape: e.target.value }))}
                                />
                              </label>
                            </>
                          )}

                          {o.legacy && o.deliveryType === 'agent_chat' ? (
                            <label className="outputs-expand-label">
                              系统提示（旧版条目）
                              <textarea
                                className="outputs-expand-textarea"
                                rows={5}
                                value={draft.systemPrompt}
                                onChange={(e) => setDraft((d) => ({ ...d, systemPrompt: e.target.value }))}
                              />
                            </label>
                          ) : null}
                        </div>

                        {!o.builtin && !o.legacy ? (
                          <div className="outputs-expand-section">
                            <h3 className="outputs-expand-section-title">投递与连接</h3>
                            <label className="outputs-expand-label">
                              投递类型
                              <select
                                className="sessions-filter-select outputs-expand-select"
                                value={draft.deliveryType}
                                onChange={(e) => setDraft((d) => ({ ...d, deliveryType: e.target.value }))}
                              >
                                {NEW_OUTPUT_DELIVERY_TYPES.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                                {['agent_chat', 'command', 'stream'].includes(draft.deliveryType) ? (
                                  <option value={draft.deliveryType}>
                                    {DELIVERY_TYPE_LABELS[draft.deliveryType] || draft.deliveryType}（当前·旧）
                                  </option>
                                ) : null}
                              </select>
                            </label>

                            {draft.deliveryType === 'http' ? (
                              <>
                                <label className="outputs-expand-label">
                                  请求 URL
                                  <input
                                    className="sessions-search-input"
                                    value={draft.requestUrl}
                                    onChange={(e) => setDraft((d) => ({ ...d, requestUrl: e.target.value }))}
                                    placeholder="https://…"
                                  />
                                </label>
                                <label className="outputs-expand-label">
                                  协议
                                  <select
                                    className="sessions-filter-select outputs-expand-select"
                                    value={draft.httpProtocol}
                                    onChange={(e) => setDraft((d) => ({ ...d, httpProtocol: e.target.value }))}
                                  >
                                    {Object.entries(HTTP_PROTOCOL_LABELS).map(([k, lab]) => (
                                      <option key={k} value={k}>
                                        {lab}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </>
                            ) : null}

                            {draft.deliveryType === 'xiaoai' ? (
                              <>
                                <div className="outputs-expand-label outputs-expand-label--cli-template">
                                  <CliInstructionHeader
                                    onExample={() =>
                                      setDraft((d) => ({
                                        ...d,
                                        commandTemplate: DEFAULT_CLI_TEMPLATE,
                                        angleSlots: buildAllCustomAngleSlots(DEFAULT_CLI_TEMPLATE),
                                      }))
                                    }
                                  />
                                  <textarea
                                    className="outputs-expand-textarea outputs-expand-textarea--mono"
                                    rows={4}
                                    value={draft.commandTemplate}
                                    aria-label="完整指令"
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setDraft((d) => ({
                                        ...d,
                                        commandTemplate: v,
                                        angleSlots: mergeAngleSlotsWithDefaults(v, d.angleSlots || []),
                                      }));
                                    }}
                                  />
                                </div>
                                <CliAngleSlotsEditor
                                  slots={mergeAngleSlotsWithDefaults(
                                    draft.commandTemplate,
                                    draft.angleSlots || []
                                  )}
                                  onChange={(next) => setDraft((d) => ({ ...d, angleSlots: next }))}
                                />
                              </>
                            ) : null}

                            {!['http', 'xiaoai', 'agent_chat', 'command'].includes(draft.deliveryType) ? (
                              <label className="outputs-expand-label">
                                扩展（JSON 对象）
                                <textarea
                                  className="outputs-expand-textarea outputs-expand-textarea--mono"
                                  rows={4}
                                  value={draft.extJson}
                                  onChange={(e) => setDraft((d) => ({ ...d, extJson: e.target.value }))}
                                />
                              </label>
                            ) : null}

                            {draft.deliveryType === 'command' ? (
                              <>
                                <label className="outputs-expand-label">
                                  CLI 命令模板（旧）
                                  <textarea
                                    className="outputs-expand-textarea outputs-expand-textarea--mono"
                                    rows={3}
                                    value={draft.cliTemplate}
                                    onChange={(e) => setDraft((d) => ({ ...d, cliTemplate: e.target.value }))}
                                  />
                                </label>
                                <label className="outputs-expand-label">
                                  工作区路径
                                  <input
                                    className="sessions-search-input"
                                    value={draft.cliWorkspace}
                                    onChange={(e) => setDraft((d) => ({ ...d, cliWorkspace: e.target.value }))}
                                  />
                                </label>
                              </>
                            ) : null}
                          </div>
                        ) : null}

                        {!o.legacy ? (
                          <div className="outputs-expand-env-before-voice">
                            <h3 className="cli-params-subtitle">环境变量（可选）</h3>
                            <CliEnvEditor
                              value={normalizeCliEnvRecord(draft.targetEnv)}
                              onChange={(next) => setDraft((d) => ({ ...d, targetEnv: next }))}
                              lead={
                                draft.deliveryType === 'http' ? (
                                  <>
                                    随请求附加 <code className="settings-code">X-Reso-Target-Env</code>；对方需允许该头。
                                  </>
                                ) : undefined
                              }
                            />
                          </div>
                        ) : null}

                        {!o.legacy ? (
                          <div className="outputs-expand-voice">
                            <OutputVoiceControlSection
                              value={draft.voiceControl}
                              onChange={(next) => setDraft((d) => ({ ...d, voiceControl: next }))}
                              lead="工作台在本目标下识别时，按此处规则自动提交或仅手动发送。"
                            />
                          </div>
                        ) : null}

                        <div className="outputs-expand-actions">
                          <button type="button" className="btn-copy" onClick={() => saveCustom(o.id)}>
                            保存
                          </button>
                          <button type="button" className="btn-danger-text" onClick={() => onRemove(o.id)}>
                            删除
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                  );
                })}
              </ul>
            )}

            {filtered.length > 0 ? (
              <div className="sessions-pagination">
                <span className="sessions-pagination-info">
                  共 {filtered.length} 条 · 第 {pageSafe} / {totalPages} 页
                </span>
                <div className="sessions-pagination-btns">
                  <button
                    type="button"
                    className="btn-pagination"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    className="btn-pagination"
                    disabled={pageSafe >= totalPages}
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

      {modalOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="outputs-modal-title"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="modal-card modal-card--wide">
            <h2 id="outputs-modal-title" className="modal-title">
              新建输出
            </h2>
            <p className="modal-desc">将出现在目标列表与工作台模式选择中，仅保存在本机浏览器。</p>
            <form onSubmit={submitModal} className="modal-form">
              {formErr ? <p className="outputs-form-err">{formErr}</p> : null}
              <label className="modal-label">
                名称
                <input
                  className="modal-input"
                  value={modalDraft.name}
                  onChange={(e) => setModalDraft((d) => ({ ...d, name: e.target.value }))}
                  required
                />
              </label>
              <label className="modal-label">
                描述
                <textarea
                  className="modal-textarea"
                  rows={2}
                  value={modalDraft.description}
                  onChange={(e) => setModalDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </label>
              <label className="modal-label">
                投递类型
                <select
                  className="modal-input"
                  value={modalDraft.deliveryType}
                  onChange={(e) => {
                    const deliveryType = e.target.value;
                    setModalDraft((d) => {
                      if (deliveryType === 'xiaoai' && !(d.commandTemplate || '').trim()) {
                        const t = DEFAULT_CLI_TEMPLATE;
                        return {
                          ...d,
                          deliveryType,
                          commandTemplate: t,
                          angleSlots: mergeAngleSlotsWithDefaults(t, []),
                        };
                      }
                      return { ...d, deliveryType };
                    });
                  }}
                >
                  {NEW_OUTPUT_DELIVERY_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {modalDraft.deliveryType === 'http' ? (
                <>
                  <label className="modal-label">
                    请求 URL
                    <input
                      className="modal-input"
                      type="url"
                      value={modalDraft.requestUrl}
                      onChange={(e) => setModalDraft((d) => ({ ...d, requestUrl: e.target.value }))}
                      placeholder="https://…"
                      required
                    />
                  </label>
                  <label className="modal-label">
                    协议
                    <select
                      className="modal-input"
                      value={modalDraft.httpProtocol}
                      onChange={(e) => setModalDraft((d) => ({ ...d, httpProtocol: e.target.value }))}
                    >
                      {Object.entries(HTTP_PROTOCOL_LABELS).map(([k, lab]) => (
                        <option key={k} value={k}>
                          {lab}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <div className="modal-label modal-label--cli-template">
                    <CliInstructionHeader
                      onExample={() =>
                        setModalDraft((d) => ({
                          ...d,
                          commandTemplate: DEFAULT_CLI_TEMPLATE,
                          angleSlots: buildAllCustomAngleSlots(DEFAULT_CLI_TEMPLATE),
                        }))
                      }
                    />
                    <textarea
                      className="modal-textarea"
                      rows={5}
                      value={modalDraft.commandTemplate}
                      aria-label="完整指令"
                      onChange={(e) => {
                        const v = e.target.value;
                        setModalDraft((d) => ({
                          ...d,
                          commandTemplate: v,
                          angleSlots: mergeAngleSlotsWithDefaults(v, d.angleSlots || []),
                        }));
                      }}
                      spellCheck={false}
                    />
                  </div>
                  <CliAngleSlotsEditor
                    slots={mergeAngleSlotsWithDefaults(
                      modalDraft.commandTemplate,
                      modalDraft.angleSlots || []
                    )}
                    onChange={(next) => setModalDraft((d) => ({ ...d, angleSlots: next }))}
                  />
                </>
              )}
              <label className="modal-label">
                输出结构说明（可选）
                <textarea
                  className="modal-textarea"
                  rows={2}
                  value={modalDraft.outputShape}
                  onChange={(e) => setModalDraft((d) => ({ ...d, outputShape: e.target.value }))}
                />
              </label>
              <div className="modal-env-before-voice">
                <h3 className="cli-params-subtitle">环境变量（可选）</h3>
                <CliEnvEditor
                  value={normalizeCliEnvRecord(modalDraft.targetEnv)}
                  onChange={(next) => setModalDraft((d) => ({ ...d, targetEnv: next }))}
                  lead={
                    modalDraft.deliveryType === 'http' ? (
                      <>
                        随 POST 附加 <code className="settings-code">X-Reso-Target-Env</code>；注意 CORS。
                      </>
                    ) : undefined
                  }
                />
              </div>
              <div className="modal-voice-block">
                <OutputVoiceControlSection
                  value={modalDraft.voiceControl}
                  onChange={(next) => setModalDraft((d) => ({ ...d, voiceControl: next }))}
                  lead="工作台在本目标下识别时，按此处规则自动提交或仅手动发送。"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-clear" onClick={() => setModalOpen(false)}>
                  取消
                </button>
                <button type="submit" className="btn-copy">
                  添加
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
