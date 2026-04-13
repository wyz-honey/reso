// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import {
  CURSOR_CLI_DEFAULT_TEMPLATE,
  CURSOR_EXTERNAL_THREAD_PROVIDER,
  listAllOutputs,
  saveBuiltinOutputOverride,
  updateCustomOutput,
} from '../outputCatalog.js';
import CliAngleSlotsEditor from '../components/CliAngleSlotsEditor.js';
import CliInstructionHeader from '../components/CliInstructionHeader.js';
import { buildAllCustomAngleSlots, mergeAngleSlotsWithDefaults } from '../cliSubstitute.js';
import ResoAgentPage from './ResoAgentPage.js';
import '../App.css';

function formatTs(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 19);
  return d.toLocaleString();
}

function CursorOutputDetail({ row, onSaved }) {
  const ext =
    row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
      ? row.extensions
      : {};
  const initialTmpl =
    typeof ext.commandTemplate === 'string' && ext.commandTemplate.trim()
      ? ext.commandTemplate.trim()
      : CURSOR_CLI_DEFAULT_TEMPLATE;
  const [name, setName] = useState(row.name || '');
  const [description, setDescription] = useState(row.description || '');
  const [requestUrl, setRequestUrl] = useState(row.requestUrl || '');
  const [outputShape, setOutputShape] = useState(row.outputShape || '');
  const [commandTemplate, setCommandTemplate] = useState(initialTmpl);
  const [angleSlots, setAngleSlots] = useState(
    () => mergeAngleSlotsWithDefaults(initialTmpl, Array.isArray(ext.angleSlots) ? ext.angleSlots : [])
  );
  const [externalThreadProvider, setExternalThreadProvider] = useState(
    () =>
      typeof ext.externalThreadProvider === 'string' && ext.externalThreadProvider.trim()
        ? ext.externalThreadProvider.trim()
        : CURSOR_EXTERNAL_THREAD_PROVIDER
  );
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const onSave = (e) => {
    e.preventDefault();
    setErr('');
    const tmpl = commandTemplate.trim();
    if (!tmpl) {
      setErr('请填写指令模板');
      return;
    }
    const nextExt = {
      commandTemplate: tmpl,
      angleSlots: mergeAngleSlotsWithDefaults(tmpl, angleSlots),
      externalThreadProvider: externalThreadProvider.trim() || CURSOR_EXTERNAL_THREAD_PROVIDER,
    };
    try {
      if (row.builtin) {
        saveBuiltinOutputOverride(row.id, {
          name: name.trim(),
          description,
          requestUrl,
          outputShape,
          extensions: nextExt,
        });
      } else {
        updateCustomOutput(row.id, {
          name: name.trim(),
          description,
          requestUrl,
          outputShape,
          extensions: nextExt,
        });
      }
      setMsg('已保存');
      onSaved?.();
      setTimeout(() => setMsg(''), 2200);
    } catch (e2) {
      setErr(e2.message || '保存失败');
    }
  };

  const onTemplateChange = (t) => {
    setCommandTemplate(t);
    setAngleSlots((prev) => mergeAngleSlotsWithDefaults(t, prev));
  };

  return (
    <div className="sessions-page reso-agent-page output-detail-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <NavLink to="/outputs" className="reso-agent-back">
              ← 目标管理
            </NavLink>
            <h1 className="sessions-title">Cursor 目标</h1>
            <p className="sessions-subtitle">
              Agent 类 CLI：工作台只会要求填写<strong>指令模板里出现</strong>的 <code className="settings-code">&lt;模型&gt;</code>、
              <code className="settings-code">&lt;工作空间&gt;</code>、<code className="settings-code">&lt;外部CLI线程&gt;</code> 等占位；
              绑定工作会话后，侧栏会自动关联 Cursor 对话（运行 Reso 服务的机器需可执行 <code className="settings-code">agent create-chat</code>）；复制/发送时会自动追加 <code className="settings-code">--resume</code>。段落为每次发送时的 <code className="settings-code">-p</code> 内容。
            </p>
            <p className="reso-agent-meta">
              <code className="reso-agent-id" title={row.id}>
                {row.id}
              </code>
              <span className="sessions-muted">
                创建 {formatTs(row.createdAt)} · 更新 {formatTs(row.updatedAt)}
              </span>
            </p>
          </div>
        </div>

        {err ? <p className="sessions-error sessions-alert">{err}</p> : null}
        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <form className="settings-card reso-agent-form" onSubmit={onSave}>
          <section className="settings-category">
            <h2 className="settings-section-title">基本信息</h2>
            <label className="settings-label">
              名称
              <input className="settings-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="settings-label">
              描述
              <textarea
                className="settings-textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="settings-label">
              请求说明（入参）
              <input className="settings-input" value={requestUrl} onChange={(e) => setRequestUrl(e.target.value)} />
            </label>
            <label className="settings-label">
              输出结构说明
              <textarea
                className="settings-textarea"
                rows={4}
                value={outputShape}
                onChange={(e) => setOutputShape(e.target.value)}
              />
            </label>
          </section>

          <section className="settings-category">
            <h2 className="settings-section-title">指令模板与占位</h2>
            <p className="settings-category-lead">
              默认含 <code className="settings-code">&lt;输入&gt;</code>、<code className="settings-code">&lt;工作空间&gt;</code>（<code className="settings-code">--workspace</code>）、
              <code className="settings-code">&lt;模型&gt;</code>、<code className="settings-code">&lt;输出正常信息地址&gt;</code>、
              <code className="settings-code">&lt;输出错误信息地址&gt;</code>；复制/发送时会在重定向前自动插入 <code className="settings-code">--resume</code>（与当前工作会话关联）。
              后两项默认可选「系统」，解析为 <code className="settings-code">server/outputs/cursor/&lt;会话ID&gt;/</code> 下文件。若模板中自行写了 <code className="settings-code">--resume</code>，则不会重复追加。
            </p>
            <details className="settings-details settings-details--advanced">
              <summary className="settings-details-summary">高级：多 CLI 厂商映射键</summary>
              <p className="settings-category-lead settings-category-lead--tight">
                一般无需修改。若接入其它 CLI（如 Qoder），可改此键以区分库表映射；默认与自动关联逻辑一致。
              </p>
              <label className="settings-label">
                映射键
                <input
                  className="settings-input"
                  value={externalThreadProvider}
                  onChange={(e) => setExternalThreadProvider(e.target.value)}
                  placeholder={CURSOR_EXTERNAL_THREAD_PROVIDER}
                  spellCheck={false}
                />
              </label>
            </details>
            <div className="outputs-expand-label outputs-expand-label--cli-template">
              <CliInstructionHeader
                onExample={() => {
                  setCommandTemplate(CURSOR_CLI_DEFAULT_TEMPLATE);
                  setAngleSlots(buildAllCustomAngleSlots(CURSOR_CLI_DEFAULT_TEMPLATE));
                }}
              />
              <textarea
                className="settings-textarea outputs-expand-textarea--mono"
                value={commandTemplate}
                onChange={(e) => onTemplateChange(e.target.value)}
                spellCheck={false}
                rows={10}
                aria-label="Cursor 指令模板"
              />
            </div>
            <CliAngleSlotsEditor
              slots={mergeAngleSlotsWithDefaults(commandTemplate, angleSlots)}
              onChange={setAngleSlots}
            />
          </section>

          <div className="settings-actions">
            <button type="submit" className="btn-primary-nav">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AsrReadonlyDetail({ row }) {
  return (
    <div className="sessions-page reso-agent-page output-detail-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <NavLink to="/outputs" className="reso-agent-back">
              ← 目标管理
            </NavLink>
            <h1 className="sessions-title">{row.name}</h1>
            <p className="sessions-subtitle">内置标准模式为只读说明，无需在此修改。</p>
            <p className="reso-agent-meta">
              <code className="reso-agent-id">{row.id}</code>
            </p>
          </div>
        </div>
        <div className="settings-card reso-agent-form">
          <p className="sessions-muted">{row.description}</p>
          <p className="sessions-muted">
            <strong>请求说明</strong> {row.requestUrl}
          </p>
          <p className="sessions-muted">
            <strong>输出结构</strong> {row.outputShape}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OutputDetailPage() {
  const { outputId } = useParams();
  const [tick, setTick] = useState(0);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const fn = () => bump();
    window.addEventListener('reso-outputs-changed', fn);
    return () => window.removeEventListener('reso-outputs-changed', fn);
  }, [bump]);

  if (outputId === 'builtin-agent') {
    return <ResoAgentPage />;
  }

  const row = useMemo(() => listAllOutputs().find((o) => o.id === outputId), [outputId, tick]);

  if (!outputId || !row) {
    return (
      <div className="sessions-page reso-agent-page">
        <div className="sessions-view-stack">
          <NavLink to="/outputs" className="reso-agent-back">
            ← 目标管理
          </NavLink>
          <p className="sessions-error sessions-alert">未找到该目标。</p>
        </div>
      </div>
    );
  }

  if (row.id === 'builtin-asr') {
    return <AsrReadonlyDetail row={row} />;
  }

  if (row.deliveryType === 'cursor_cli') {
    return <CursorOutputDetail key={`${row.id}-${tick}`} row={row} onSaved={bump} />;
  }

  return (
    <div className="sessions-page reso-agent-page output-detail-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <NavLink to="/outputs" className="reso-agent-back">
              ← 目标管理
            </NavLink>
            <h1 className="sessions-title">{row.name}</h1>
            <p className="sessions-subtitle">
              此类目标请在「目标管理」列表中点击该行展开，在列表内直接编辑并保存。
            </p>
            <p className="reso-agent-meta">
              <code className="reso-agent-id">{row.id}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
