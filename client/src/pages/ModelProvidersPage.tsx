import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  MODEL_CATEGORY_LABELS,
  MODEL_CATEGORIES,
  type ModelCategory,
  PROVIDER_KIND_LABELS,
  addModel,
  loadModelProviderState,
  removeModel,
  resetModelProvidersCatalog,
  setDefaultModelIds,
  updateProvider,
} from '../stores/modelProvidersStore.js';
import '../App.css';

export default function ModelProvidersPage() {
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState('');
  const [newModel, setNewModel] = useState<{
    category: ModelCategory;
    apiModelId: string;
    label: string;
  }>({
    category: MODEL_CATEGORIES.chat,
    apiModelId: '',
    label: '',
  });

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    window.addEventListener('reso-providers-changed', fn);
    return () => window.removeEventListener('reso-providers-changed', fn);
  }, []);

  const state = useMemo(() => loadModelProviderState(), [tick]);
  const primaryProvider = state.providers[0];

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const onSaveProvider = (e) => {
    e.preventDefault();
    if (!primaryProvider) return;
    const fd = new FormData(e.target);
    updateProvider(primaryProvider.id, {
      name: String(fd.get('name') ?? ''),
      compatBaseUrl: String(fd.get('compatBaseUrl') ?? ''),
      apiKey: String(fd.get('apiKey') ?? ''),
    });
    setMsg('已保存供应商');
    refresh();
    setTimeout(() => setMsg(''), 2400);
  };

  const onResetCatalog = () => {
    if (!window.confirm('将重置为默认供应商与模型列表（当前配置会丢失）。确定？')) return;
    resetModelProvidersCatalog();
    setMsg('已恢复默认目录');
    refresh();
  };

  const onAddModel = (e) => {
    e.preventDefault();
    if (!primaryProvider) return;
    const cat = newModel.category;
    const aid = newModel.apiModelId.trim();
    if (!aid) {
      setMsg('请填写 API 模型 ID');
      return;
    }
    addModel({
      providerId: primaryProvider.id,
      category: cat,
      apiModelId: aid,
      label: newModel.label.trim() || aid,
    });
    setNewModel((s) => ({ ...s, apiModelId: '', label: '' }));
    setMsg('已添加模型');
    refresh();
    setTimeout(() => setMsg(''), 2000);
  };

  const speechModels = state.models.filter((m) => m.category === MODEL_CATEGORIES.speech);
  const chatModels = state.models.filter((m) => m.category === MODEL_CATEGORIES.chat);

  return (
    <div className="sessions-page model-providers-page">
      <div className="sessions-view-stack">
        <div className="sessions-toolbar">
          <div className="sessions-title-wrap">
            <h1 className="sessions-title">模型供应商</h1>
            <p className="sessions-subtitle">
              集中管理<strong> API Key</strong>、<strong>兼容接口地址</strong>与<strong>按场景分类的模型</strong>
              （语音识别 / 对话 LLM）。标准模式识别与 RESO 对话会优先使用此处默认；也可在
              <NavLink to="/outputs/builtin-agent" className="sessions-inline-link">
                RESO 目标详情
              </NavLink>
              中覆盖对话供应商与模型。
            </p>
          </div>
        </div>

        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="model-prov-grid">
          <section className="settings-card model-prov-card">
            <h2 className="settings-section-title">数据结构说明</h2>
            <ul className="model-prov-schema-list">
              <li>
                <strong>供应商 Provider</strong>：连接方式（当前仅百炼 Compatible）、显示名、可选本机 API Key（留空则用服务端
                .env 或「设置」里的 Key）。
              </li>
              <li>
                <strong>模型 Model</strong>：挂在某一供应商下，带 <code className="settings-code">category</code>{' '}
               （speech / chat）与实际上游 <code className="settings-code">apiModelId</code>。
              </li>
              <li>
                <strong>defaults</strong>：全平台默认的「识别用模型」「对话用模型」。
              </li>
              <li>
                <strong>resoAgent</strong>：仅影响内置 RESO 目标的对话侧绑定，便于与 HTTP 自定义目标区分。
              </li>
            </ul>
          </section>

          {primaryProvider ? (
            <section className="settings-card model-prov-card">
              <h2 className="settings-section-title">
                供应商 · {PROVIDER_KIND_LABELS[primaryProvider.kind] || primaryProvider.kind}
              </h2>
              <form className="model-prov-form" onSubmit={onSaveProvider}>
                <label className="settings-label">
                  显示名称
                  <input
                    className="settings-input"
                    name="name"
                    defaultValue={primaryProvider.name}
                    required
                  />
                </label>
                <label className="settings-label">
                  Compatible Base URL
                  <input
                    className="settings-input"
                    name="compatBaseUrl"
                    defaultValue={primaryProvider.compatBaseUrl || ''}
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                  />
                </label>
                <label className="settings-label">
                  API Key（可选，仅存本机）
                  <input
                    className="settings-input"
                    name="apiKey"
                    type="password"
                    autoComplete="off"
                    defaultValue={primaryProvider.apiKey || ''}
                    placeholder="留空则使用设置页或服务端环境变量"
                  />
                </label>
                <div className="model-prov-actions">
                  <button type="submit" className="btn-copy">
                    保存供应商
                  </button>
                  <button type="button" className="btn-clear" onClick={onResetCatalog}>
                    恢复默认目录
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="settings-card model-prov-card">
            <h2 className="settings-section-title">默认绑定</h2>
            <p className="settings-category-lead">
              标准模式实时识别、以及未在 RESO 目标中单独指定时使用下列默认。
            </p>
            <div className="model-prov-defaults">
              <label className="settings-label">
                {MODEL_CATEGORY_LABELS.speech}
                <select
                  className="settings-select"
                  value={state.defaults.speechModelId}
                  onChange={(e) => {
                    setDefaultModelIds({ speechModelId: e.target.value });
                    refresh();
                  }}
                >
                  {speechModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}（{m.apiModelId}）
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-label">
                {MODEL_CATEGORY_LABELS.chat}
                <select
                  className="settings-select"
                  value={state.defaults.chatModelId}
                  onChange={(e) => {
                    setDefaultModelIds({ chatModelId: e.target.value });
                    refresh();
                  }}
                >
                  {chatModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}（{m.apiModelId}）
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="settings-card model-prov-card model-prov-card--wide">
            <h2 className="settings-section-title">模型目录</h2>
            <form className="model-prov-add-row" onSubmit={onAddModel}>
              <select
                className="settings-select"
                value={newModel.category}
                onChange={(e) =>
                  setNewModel((s) => ({
                    ...s,
                    category: e.target.value as ModelCategory,
                  }))
                }
              >
                <option value={MODEL_CATEGORIES.speech}>{MODEL_CATEGORY_LABELS.speech}</option>
                <option value={MODEL_CATEGORIES.chat}>{MODEL_CATEGORY_LABELS.chat}</option>
              </select>
              <input
                className="settings-input"
                placeholder="API 模型 ID，如 qwen-plus"
                value={newModel.apiModelId}
                onChange={(e) => setNewModel((s) => ({ ...s, apiModelId: e.target.value }))}
              />
              <input
                className="settings-input"
                placeholder="显示名（可选）"
                value={newModel.label}
                onChange={(e) => setNewModel((s) => ({ ...s, label: e.target.value }))}
              />
              <button type="submit" className="btn-copy">
                添加
              </button>
            </form>

            <div className="model-prov-tables">
              <div>
                <h3 className="model-prov-subhead">{MODEL_CATEGORY_LABELS.speech}</h3>
                <table className="model-prov-table">
                  <thead>
                    <tr>
                      <th>显示名</th>
                      <th>apiModelId</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {speechModels.map((m) => (
                      <tr key={m.id}>
                        <td>{m.label}</td>
                        <td>
                          <code className="settings-code">{m.apiModelId}</code>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-danger-text"
                            onClick={() => {
                              removeModel(m.id);
                              refresh();
                            }}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="model-prov-subhead">{MODEL_CATEGORY_LABELS.chat}</h3>
                <table className="model-prov-table">
                  <thead>
                    <tr>
                      <th>显示名</th>
                      <th>apiModelId</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {chatModels.map((m) => (
                      <tr key={m.id}>
                        <td>{m.label}</td>
                        <td>
                          <code className="settings-code">{m.apiModelId}</code>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-danger-text"
                            onClick={() => {
                              removeModel(m.id);
                              refresh();
                            }}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
