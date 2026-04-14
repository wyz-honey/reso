import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import OutputVoiceControlSection from '../components/OutputVoiceControlSection';
import {
  parseOutputVoiceControl,
  serializeOutputVoiceControl,
  type OutputVoiceControl,
} from '../outputVoiceControl';
import CliEnvEditor from '../components/CliEnvEditor';
import { mergeTargetEnvLayers, normalizeCliEnvRecord } from '../cliEnv';
import { listAllOutputs, saveBuiltinOutputOverride } from '../outputCatalog';
import {
  getResoAgentBinding,
  listModelsForProviderAndCategory,
  loadModelProviderState,
  MODEL_CATEGORIES,
  saveResoAgentBinding,
  useModelProvidersStore,
} from '../stores/modelProvidersStore';
import { useOutputRevisionStore } from '../stores/outputRevisionStore';
import { getBuiltinAgentDefaultPrompt, saveBuiltinAgentPrompt } from '../workModes';
import '../App.css';

const BUILTIN_AGENT_ID = 'builtin-agent';

type CatalogRow = {
  id: string;
  name?: unknown;
  description?: unknown;
  requestUrl?: unknown;
  outputShape?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function formatTs(iso: string | null | undefined) {
  if (!iso || typeof iso !== 'string') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 19);
  return d.toLocaleString();
}

export default function ResoAgentPage() {
  const outputRevision = useOutputRevisionStore((s) => s.revision);
  const mpSlice = useModelProvidersStore(
    useShallow((s) => ({
      resoAgent: s.resoAgent,
      defaults: s.defaults,
      providers: s.providers,
      models: s.models,
    }))
  );
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requestUrl, setRequestUrl] = useState('');
  const [outputShape, setOutputShape] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [resoProviderId, setResoProviderId] = useState('');
  const [resoChatModelId, setResoChatModelId] = useState('');
  const [voiceControl, setVoiceControl] = useState<OutputVoiceControl>(() =>
    parseOutputVoiceControl(undefined, 'agent_chat')
  );
  const [targetEnv, setTargetEnv] = useState<Record<string, string>>({});

  const refreshBinding = useCallback(() => {
    const row = listAllOutputs().find((r) => (r as CatalogRow).id === BUILTIN_AGENT_ID) as
      | CatalogRow
      | undefined;
    if (row) {
      setName(String(row.name ?? ''));
      setDescription(String(row.description ?? ''));
      setRequestUrl(String(row.requestUrl ?? ''));
      setOutputShape(String(row.outputShape ?? ''));
    }
    setSystemPrompt(getBuiltinAgentDefaultPrompt());
    const full = listAllOutputs().find((r) => (r as CatalogRow).id === BUILTIN_AGENT_ID) as
      | Record<string, unknown>
      | undefined;
    const ext =
      full?.extensions && typeof full.extensions === 'object' && !Array.isArray(full.extensions)
        ? (full.extensions as Record<string, unknown>)
        : {};
    setVoiceControl(parseOutputVoiceControl(ext.voiceControl, 'agent_chat'));
    setTargetEnv(
      mergeTargetEnvLayers(ext.cliEnv, ext.environment, full?.environment as Record<string, unknown>)
    );

    const mp = loadModelProviderState();
    const ra = getResoAgentBinding();
    const pid = ra.providerId || mp.providers[0]?.id || '';
    let chatId = ra.modelId || mp.defaults.chatModelId || '';
    if (!mp.models.some((m) => m.id === chatId)) {
      chatId =
        mp.models.find((m) => m.providerId === pid && m.category === MODEL_CATEGORIES.chat)?.id ||
        mp.models.find((m) => m.category === MODEL_CATEGORIES.chat)?.id ||
        '';
    }
    setResoProviderId(pid);
    setResoChatModelId(chatId);
  }, []);

  useEffect(() => {
    refreshBinding();
  }, [outputRevision, mpSlice, refreshBinding]);

  const row = useMemo(
    () =>
      listAllOutputs().find((r) => (r as CatalogRow).id === BUILTIN_AGENT_ID) as CatalogRow | undefined,
    [outputRevision]
  );
  const chatOptions = listModelsForProviderAndCategory(resoProviderId, MODEL_CATEGORIES.chat);
  const providers = loadModelProviderState().providers;

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const envNorm = normalizeCliEnvRecord(targetEnv);
      saveBuiltinOutputOverride(BUILTIN_AGENT_ID, {
        name: name.trim(),
        description,
        requestUrl,
        outputShape,
        environment: envNorm,
        extensions: {
          voiceControl: serializeOutputVoiceControl(voiceControl),
          environment: envNorm,
          cliEnv: envNorm,
        },
      });
      saveBuiltinAgentPrompt(systemPrompt);
      saveResoAgentBinding({
        providerId: resoProviderId ? resoProviderId : null,
        modelId: resoChatModelId ? resoChatModelId : null,
      });
      setMsg('已保存');
      setTimeout(() => setMsg(''), 2200);
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    }
  };

  return (
    <div className="sessions-page reso-agent-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <NavLink to="/outputs" className="reso-agent-back">
              ← 目标管理
            </NavLink>
            <h1 className="sessions-title">RESO 智能体</h1>
            <p className="sessions-subtitle">
              内置对话智能体：配置名称与说明、系统提示词、供应商与对话模型。工具与技能即将支持。
            </p>
            {row ? (
              <p className="reso-agent-meta">
                <span className="outputs-type-pill outputs-type-pill--kind">Agent</span>
                <code className="reso-agent-id" title={String(row.id)}>
                  {String(row.id)}
                </code>
                <span className="sessions-muted">
                  创建 {formatTs(String(row.createdAt ?? ''))} · 更新{' '}
                  {formatTs(String(row.updatedAt ?? ''))}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {err ? <p className="sessions-error sessions-alert">{err}</p> : null}
        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <form className="settings-card reso-agent-form" onSubmit={onSave}>
          <section className="settings-category">
            <h2 className="settings-section-title">基本信息</h2>
            <label className="settings-label">
              名称
              <input
                className="settings-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
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
              <input
                className="settings-input"
                value={requestUrl}
                onChange={(e) => setRequestUrl(e.target.value)}
              />
            </label>
            <label className="settings-label">
              输出结构（OpenAI 兼容流式等）
              <textarea
                className="settings-textarea"
                rows={4}
                value={outputShape}
                onChange={(e) => setOutputShape(e.target.value)}
              />
            </label>
          </section>

          <section className="settings-category">
            <h2 className="settings-section-title">模型</h2>
            <p className="settings-category-lead">
              使用本机「模型供应商」存储的目录与 Key（未在主导航展示，数据仍生效）。
            </p>
            <label className="settings-label">
              供应商
              <select
                className="settings-select"
                value={resoProviderId}
                onChange={(e) => {
                  const pid = e.target.value;
                  const opts = listModelsForProviderAndCategory(pid, MODEL_CATEGORIES.chat);
                  const next =
                    opts.find((m) => m.id === resoChatModelId)?.id || opts[0]?.id || '';
                  setResoProviderId(pid);
                  setResoChatModelId(next);
                }}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.kind}）
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-label">
              对话模型
              <select
                className="settings-select"
                value={resoChatModelId}
                onChange={(e) => setResoChatModelId(e.target.value)}
              >
                {chatOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}（{m.apiModelId}）
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="settings-category">
            <h2 className="settings-section-title">系统提示词</h2>
            <label className="settings-label">
              提示词
              <textarea
                className="settings-textarea"
                rows={10}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="定义助手角色与回答风格；保存后工作台 RESO 模式立即生效。"
              />
            </label>
          </section>

          <fieldset className="outputs-tools-fieldset reso-agent-tools" disabled>
            <legend>工具与技能</legend>
            <p className="sessions-muted">即将到来：挂载工具、Agent Skills 等；当前不可用。</p>
          </fieldset>

          <section className="settings-category">
            <h2 className="settings-section-title">环境变量（可选）</h2>
            <p className="settings-category-lead">
              保存在本目标上，供后续 HTTP/CLI 扩展或与网关约定使用；当前对话 API 未自动注入，可不填。
            </p>
            <CliEnvEditor value={targetEnv} onChange={setTargetEnv} lead={null} />
          </section>

          <OutputVoiceControlSection
            value={voiceControl}
            onChange={setVoiceControl}
            lead="工作台在本目标下识别时，按此处规则自动提交或仅手动发送。"
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
