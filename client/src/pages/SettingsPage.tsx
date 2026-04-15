import { useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { BUILTIN_OUTPUT_ID } from '../constants/builtins';
import {
  MODEL_CATEGORY_LABELS,
  MODEL_CATEGORIES,
  setDefaultModelIds,
  useModelProvidersStore,
} from '../stores/modelProvidersStore';
import { getVoiceSettings, saveVoiceSettings } from '../stores/voiceSettingsStore';
import { useSettingsPageStore } from '../stores/settingsPageStore';
import '../App.css';

export default function SettingsPage() {
  const {
    asrDisfluencyRemoval,
    setAsrDisfluencyRemoval,
    asrLanguageHintsText,
    setAsrLanguageHintsText,
    oralStripEnabled,
    setOralStripEnabled,
    oralStripPhrasesText,
    setOralStripPhrasesText,
    savedFlash,
    setSavedFlash,
  } = useSettingsPageStore(
    useShallow((s) => ({
      asrDisfluencyRemoval: s.asrDisfluencyRemoval,
      setAsrDisfluencyRemoval: s.setAsrDisfluencyRemoval,
      asrLanguageHintsText: s.asrLanguageHintsText,
      setAsrLanguageHintsText: s.setAsrLanguageHintsText,
      oralStripEnabled: s.oralStripEnabled,
      setOralStripEnabled: s.setOralStripEnabled,
      oralStripPhrasesText: s.oralStripPhrasesText,
      setOralStripPhrasesText: s.setOralStripPhrasesText,
      savedFlash: s.savedFlash,
      setSavedFlash: s.setSavedFlash,
    }))
  );

  const models = useModelProvidersStore((s) => s.models);
  const speechModelId = useModelProvidersStore((s) => s.defaults.speechModelId);
  const chatModelId = useModelProvidersStore((s) => s.defaults.chatModelId);
  const speechModels = useMemo(
    () => models.filter((m) => m.category === MODEL_CATEGORIES.speech),
    [models]
  );
  const chatModels = useMemo(
    () => models.filter((m) => m.category === MODEL_CATEGORIES.chat),
    [models]
  );
  const speechSelectValue = useMemo(() => {
    if (speechModels.some((m) => m.id === speechModelId)) return speechModelId;
    return speechModels[0]?.id ?? '';
  }, [speechModels, speechModelId]);
  const chatSelectValue = useMemo(() => {
    if (chatModels.some((m) => m.id === chatModelId)) return chatModelId;
    return chatModels[0]?.id ?? '';
  }, [chatModels, chatModelId]);

  useEffect(() => {
    const first = speechModels[0]?.id;
    if (!first || speechModels.some((m) => m.id === speechModelId)) return;
    setDefaultModelIds({ speechModelId: first });
  }, [speechModels, speechModelId]);

  useEffect(() => {
    const first = chatModels[0]?.id;
    if (!first || chatModels.some((m) => m.id === chatModelId)) return;
    setDefaultModelIds({ chatModelId: first });
  }, [chatModels, chatModelId]);

  useEffect(() => {
    const onExt = () => {
      const s = getVoiceSettings();
      setAsrDisfluencyRemoval(s.asrDisfluencyRemoval);
      setAsrLanguageHintsText(s.asrLanguageHintsText);
      setOralStripEnabled(s.oralStripEnabled);
      setOralStripPhrasesText(s.oralStripPhrasesText);
    };
    window.addEventListener('reso-settings-changed', onExt);
    return () => window.removeEventListener('reso-settings-changed', onExt);
  }, []);

  const onSave = (e) => {
    e.preventDefault();
    saveVoiceSettings({
      asrDisfluencyRemoval,
      asrLanguageHintsText,
      oralStripEnabled,
      oralStripPhrasesText,
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };

  return (
    <div className="settings-page">
      <div className="settings-toolbar">
        <h1 className="settings-title">设置</h1>
        <p className="settings-subtitle settings-subtitle--compact">
          本页与
          <NavLink to="/model-providers" className="sessions-inline-link">
            模型目录
          </NavLink>
          会先写入本机（localStorage），并在后端已配置 Postgres 时<strong>同步到数据库</strong>（表{' '}
          <code className="settings-code">reso_client_settings</code>
          ）。会话、段落、对话线程等仍走 Postgres。
        </p>
      </div>

      <form className="settings-card" onSubmit={onSave}>
        <section className="settings-category" aria-labelledby="settings-cat-asr">
          <h2 id="settings-cat-asr" className="settings-section-title">
            语音识别
          </h2>

          <label className="settings-label">
            {MODEL_CATEGORY_LABELS.speech}（仅影响「开始识别」转文字）
            <select
              className="settings-select"
              value={speechSelectValue}
              onChange={(e) => setDefaultModelIds({ speechModelId: e.target.value })}
            >
              {speechModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}（{m.apiModelId}）
                </option>
              ))}
            </select>
          </label>

          <label className="settings-label">
            {MODEL_CATEGORY_LABELS.chat}（RESO 对话等；可被
            <NavLink
              to={`/outputs/${BUILTIN_OUTPUT_ID.AGENT}`}
              className="sessions-inline-link"
            >
              RESO 目标详情
            </NavLink>
            里的绑定覆盖）
            <select
              className="settings-select"
              value={chatSelectValue}
              onChange={(e) => setDefaultModelIds({ chatModelId: e.target.value })}
            >
              {chatModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}（{m.apiModelId}）
                </option>
              ))}
            </select>
          </label>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={asrDisfluencyRemoval}
              onChange={(e) => setAsrDisfluencyRemoval(e.target.checked)}
            />
            过滤语气词
          </label>

          <label className="settings-label">
            语种提示
            <input
              type="text"
              className="settings-input"
              value={asrLanguageHintsText}
              onChange={(e) => setAsrLanguageHintsText(e.target.value)}
              placeholder="zh"
            />
          </label>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={oralStripEnabled}
              onChange={(e) => setOralStripEnabled(e.target.checked)}
            />
            首尾口语清理
          </label>

          <label className="settings-label">
            清理短语（每行一条）
            <textarea
              className="settings-textarea"
              rows={4}
              value={oralStripPhrasesText}
              onChange={(e) => setOralStripPhrasesText(e.target.value)}
              placeholder={'那个\n就是'}
              disabled={!oralStripEnabled}
            />
          </label>
        </section>

        <div className="settings-actions">
          <button type="submit" className="btn-primary-nav">
            保存
          </button>
          {savedFlash ? <span className="settings-saved">已保存</span> : null}
        </div>
      </form>
    </div>
  );
}
