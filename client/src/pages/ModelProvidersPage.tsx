import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { NavLink } from 'react-router-dom';
import { BUILTIN_OUTPUT_ID } from '../constants/builtins';
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
} from '../stores/modelProvidersStore';
import { useModelProvidersPageUiStore } from '../stores/modelProvidersPageUiStore';
import '../App.css';

export default function ModelProvidersPage() {
  const { tick, setTick, msg, setMsg, newModel, setNewModel } = useModelProvidersPageUiStore(
    useShallow((s) => ({
      tick: s.tick,
      setTick: s.setTick,
      msg: s.msg,
      setMsg: s.setMsg,
      newModel: s.newModel,
      setNewModel: s.setNewModel,
    }))
  );

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
    setMsg('已保存');
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
      setMsg('请填写上游模型名');
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
            <h1 className="sessions-title">模型与密钥</h1>
            <p className="sessions-subtitle">
              放接口地址、密钥和要用的模型。识别和对话默认从这里取；也可在
              <NavLink to={`/outputs/${BUILTIN_OUTPUT_ID.AGENT}`} className="sessions-inline-link">
                RESO 助手
              </NavLink>
              里单独改对话用的模型。
            </p>
          </div>
        </div>

        {msg ? <p className="sessions-msg sessions-alert">{msg}</p> : null}

        <div className="model-prov-grid">
          <section className="settings-card model-prov-card">
            <h2 className="settings-section-title">说明</h2>
            <ul className="model-prov-schema-list">
              <li>
                <strong>连接</strong>：起一个名字、填对方给的接口地址；密钥可只填在本机，不填则用设置或服务端里已有的。
              </li>
              <li>
                <strong>模型</strong>：分「说话识别」和「文字对话」两类，每类里选默认要用的那条。
              </li>
              <li>
                <strong>默认</strong>：全站识别、对话没单独指定时，用这里勾的默认模型。
              </li>
              <li>
                <strong>RESO 助手</strong>：内置助手可以再用自己的一套对话模型，和别的目标分开。
              </li>
            </ul>
          </section>

          {primaryProvider ? (
            <section className="settings-card model-prov-card">
              <h2 className="settings-section-title">
                当前连接 · {PROVIDER_KIND_LABELS[primaryProvider.kind] || primaryProvider.kind}
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
                  接口地址
                  <input
                    className="settings-input"
                    name="compatBaseUrl"
                    defaultValue={primaryProvider.compatBaseUrl || ''}
                    placeholder="https://…"
                  />
                </label>
                <label className="settings-label">
                  密钥（可选，仅存本机）
                  <input
                    className="settings-input"
                    name="apiKey"
                    type="password"
                    autoComplete="off"
                    defaultValue={primaryProvider.apiKey || ''}
                    placeholder="不填则用设置或服务端已有密钥"
                  />
                </label>
                <div className="model-prov-actions">
                  <button type="submit" className="btn-copy">
                    保存
                  </button>
                  <button type="button" className="btn-clear" onClick={onResetCatalog}>
                    恢复默认目录
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="settings-card model-prov-card">
            <h2 className="settings-section-title">默认模型</h2>
            <p className="settings-category-lead">识别和对话没别处指定时，用下面两个。</p>
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
                placeholder="上游模型名，如 qwen-plus"
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
                      <th>上游名</th>
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
                      <th>上游名</th>
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
