// @ts-nocheck
import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { NavLink, useParams } from 'react-router-dom';
import OutputVoiceControlSection from '../components/OutputVoiceControlSection';
import { serializeOutputVoiceControl } from '../outputVoiceControl';
import { BUILTIN_OUTPUT_ID } from '../constants/builtins';
import {
  CURSOR_CLI_DEFAULT_TEMPLATE,
  listAllOutputs,
  saveBuiltinOutputOverride,
  updateCustomOutput,
} from '../outputCatalog';
import CliAngleSlotsEditor from '../components/CliAngleSlotsEditor';
import CliInstructionHeader from '../components/CliInstructionHeader';
import CliEnvEditor from '../components/CliEnvEditor';
import { mergeTargetEnvLayers, normalizeCliEnvRecord } from '../cliEnv';
import { buildAllCustomAngleSlots, mergeAngleSlotsWithDefaults } from '../cliSubstitute';
import { deriveCursorCliWorkspace } from '../cursorTriad';
import ResoAgentPage from './ResoAgentPage';
import '../App.css';
import { useOutputDetailShellStore } from '../stores/outputDetailShellStore';
import { useOutputDetailCursorStore } from '../stores/outputDetailCursorStore';
import { useOutputDetailAsrBuiltinStore } from '../stores/outputDetailAsrBuiltinStore';

function formatTs(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 19);
  return d.toLocaleString();
}

function CursorOutputDetail({ row, onSaved }) {
  const hydrateFromRow = useOutputDetailCursorStore((s) => s.hydrateFromRow);
  useEffect(() => {
    hydrateFromRow(row);
  }, [row, hydrateFromRow]);

  const {
    name,
    setName,
    description,
    setDescription,
    commandTemplate,
    angleSlots,
    setAngleSlots,
    voiceControl,
    setVoiceControl,
    targetEnv,
    setTargetEnv,
    msg,
    setMsg,
    err,
    setErr,
    onTemplateChange,
  } = useOutputDetailCursorStore(
    useShallow((s) => ({
      name: s.name,
      setName: s.setName,
      description: s.description,
      setDescription: s.setDescription,
      commandTemplate: s.commandTemplate,
      angleSlots: s.angleSlots,
      setAngleSlots: s.setAngleSlots,
      voiceControl: s.voiceControl,
      setVoiceControl: s.setVoiceControl,
      targetEnv: s.targetEnv,
      setTargetEnv: s.setTargetEnv,
      msg: s.msg,
      setMsg: s.setMsg,
      err: s.err,
      setErr: s.setErr,
      onTemplateChange: s.onTemplateChange,
    }))
  );

  const onSave = (e) => {
    e.preventDefault();
    const ext =
      row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
        ? row.extensions
        : {};
    const st = useOutputDetailCursorStore.getState();
    st.setErr('');
    const tmpl = st.commandTemplate.trim();
    if (!tmpl) {
      st.setErr('请填写执行指令');
      return;
    }
    const mergedSlots = mergeAngleSlotsWithDefaults(tmpl, st.angleSlots);
    const prevWs = typeof ext.cliWorkspace === 'string' ? ext.cliWorkspace : '';
    const envNorm = normalizeCliEnvRecord(st.targetEnv);
    const nextExt = {
      commandTemplate: tmpl,
      angleSlots: mergedSlots,
      cliWorkspace: deriveCursorCliWorkspace(mergedSlots, prevWs),
      voiceControl: serializeOutputVoiceControl(st.voiceControl),
      environment: envNorm,
      cliEnv: envNorm,
    };
    try {
      if (row.builtin) {
        saveBuiltinOutputOverride(row.id, {
          name: st.name.trim(),
          description: st.description,
          requestUrl: '',
          outputShape: '',
          environment: envNorm,
          extensions: nextExt,
        });
      } else {
        updateCustomOutput(row.id, {
          name: st.name.trim(),
          description: st.description,
          requestUrl: '',
          outputShape: '',
          environment: envNorm,
          extensions: nextExt,
        });
      }
      st.setMsg('已保存');
      onSaved?.();
      setTimeout(() => useOutputDetailCursorStore.getState().setMsg(''), 2200);
    } catch (e2) {
      useOutputDetailCursorStore.getState().setErr(e2.message || '保存失败');
    }
  };

  return (
    <div className="sessions-page reso-agent-page output-detail-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <NavLink to="/outputs" className="reso-agent-back">
              ← 目标管理
            </NavLink>
            <h1 className="sessions-title">
              {row.deliveryType === 'qoder_cli' ? 'Qoder' : 'Cursor'} 目标
            </h1>
            <p className="sessions-subtitle">
              {row.deliveryType === 'qoder_cli' ? (
                <>
                  在下面编辑<strong>一条</strong>要执行的 CLI；尖括号里的名字会在「动态参数」里逐项配置（系统从工作台上下文取，或自定义写死）。
                  输出重定向到服务端 <code className="settings-code">outputs/qoder/&lt;会话&gt;/</code>；正文即每次的{' '}
                  <code className="settings-code">-p</code> 提示词。
                </>
              ) : (
                <>
                  在下面编辑<strong>一条</strong>要执行的 CLI；尖括号里的名字会在「动态参数」里逐项配置（系统从工作台上下文取，或自定义写死）。
                  绑定数据库会话后自动关联 Cursor 线程；复制/发送时若无 <code className="settings-code">--resume</code> 会自动插入。正文即每次的{' '}
                  <code className="settings-code">-p</code>。
                </>
              )}
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
          </section>

          <section className="settings-category">
            <h2 className="settings-section-title">执行指令</h2>
            <p className="settings-category-lead">
              与终端里要跑的命令一致；用 <code className="settings-code">&lt;标签&gt;</code>{' '}
              标记可变部分，下面「动态参数」会按每个标签单独配置。
            </p>
            <div className="outputs-expand-label outputs-expand-label--cli-template">
              <CliInstructionHeader
                title="执行指令"
                onExample={() => {
                  const t = CURSOR_CLI_DEFAULT_TEMPLATE;
                  useOutputDetailCursorStore.setState({
                    commandTemplate: t,
                    angleSlots: buildAllCustomAngleSlots(t),
                  });
                }}
              />
              <textarea
                className="settings-textarea outputs-expand-textarea--mono"
                value={commandTemplate}
                onChange={(e) => onTemplateChange(e.target.value)}
                spellCheck={false}
                rows={10}
                aria-label="Cursor 执行指令"
              />
            </div>
            <CliAngleSlotsEditor
              slots={mergeAngleSlotsWithDefaults(commandTemplate, angleSlots)}
              onChange={setAngleSlots}
              sectionTitle="动态参数"
              sectionHint="与指令里的尖括号一一对应。编程目录选「系统 · 工作区路径」时，默认值仍保存在本目标（上次保存的 extensions）；若选「自定义」则路径以这里填写的为准。"
              useCursorAgentModelPicker
            />
          </section>

          <section className="settings-category">
            <h2 className="settings-section-title">环境变量（可选）</h2>
            <p className="settings-category-lead">
              服务端执行 <code className="settings-code">agent create-chat</code> 等时，可按此处补全进程环境（与顶部工作台一致）。
            </p>
            <CliEnvEditor value={targetEnv} onChange={setTargetEnv} lead={null} />
          </section>

          <OutputVoiceControlSection
            value={voiceControl}
            onChange={setVoiceControl}
            lead="工作台在 Cursor 目标下识别时，按此处规则自动提交或仅手动发送。"
          />

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

function AsrBuiltinDetail({ row, onSaved }) {
  const hydrateFromRow = useOutputDetailAsrBuiltinStore((s) => s.hydrateFromRow);
  useEffect(() => {
    hydrateFromRow(row);
  }, [row, hydrateFromRow]);

  const { voiceControl, setVoiceControl, msg, setMsg } = useOutputDetailAsrBuiltinStore(
    useShallow((s) => ({
      voiceControl: s.voiceControl,
      setVoiceControl: s.setVoiceControl,
      msg: s.msg,
      setMsg: s.setMsg,
    }))
  );

  const onSave = (e) => {
    e.preventDefault();
    const st = useOutputDetailAsrBuiltinStore.getState();
    saveBuiltinOutputOverride(row.id, {
      extensions: { voiceControl: serializeOutputVoiceControl(st.voiceControl) },
    });
    st.setMsg('已保存');
    onSaved?.();
    setTimeout(() => useOutputDetailAsrBuiltinStore.getState().setMsg(''), 2200);
  };

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
              内置标准模式：可配置识别结束策略；行为说明见下方只读摘要。
            </p>
            <p className="reso-agent-meta">
              <code className="reso-agent-id">{row.id}</code>
            </p>
          </div>
        </div>
        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}
        <form className="settings-card reso-agent-form" onSubmit={onSave}>
          <section className="settings-category">
            <h2 className="settings-section-title">说明（只读）</h2>
            <p className="sessions-muted">{row.description}</p>
            <p className="sessions-muted">
              <strong>请求说明</strong> {row.requestUrl}
            </p>
            <p className="sessions-muted">
              <strong>输出结构</strong> {row.outputShape}
            </p>
          </section>
          <OutputVoiceControlSection
            value={voiceControl}
            onChange={setVoiceControl}
            lead="工作台在标准模式下识别时，按此处规则自动保存或仅手动提交。"
          />
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

export default function OutputDetailPage() {
  const { outputId } = useParams();
  const tick = useOutputDetailShellStore((s) => s.tick);
  const setTick = useOutputDetailShellStore((s) => s.setTick);

  const bump = useCallback(() => setTick((t) => t + 1), [setTick]);

  useEffect(() => {
    const fn = () => bump();
    window.addEventListener('reso-outputs-changed', fn);
    return () => window.removeEventListener('reso-outputs-changed', fn);
  }, [bump]);

  if (outputId === BUILTIN_OUTPUT_ID.AGENT) {
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

  if (row.id === BUILTIN_OUTPUT_ID.ASR) {
    return <AsrBuiltinDetail key={`${row.id}-${tick}`} row={row} onSaved={bump} />;
  }

  if (row.deliveryType === 'cursor_cli' || row.deliveryType === 'qoder_cli') {
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
