import { useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
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
  const speechModels = useMemo(
    () => models.filter((m) => m.category === MODEL_CATEGORIES.speech),
    [models]
  );
  const speechSelectValue = useMemo(() => {
    if (speechModels.some((m) => m.id === speechModelId)) return speechModelId;
    return speechModels[0]?.id ?? '';
  }, [speechModels, speechModelId]);

  useEffect(() => {
    const first = speechModels[0]?.id;
    if (!first || speechModels.some((m) => m.id === speechModelId)) return;
    setDefaultModelIds({ speechModelId: first });
  }, [speechModels, speechModelId]);

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
          语音转写与用语清理；识别用模型在
          <NavLink to="/model-providers" className="sessions-inline-link">
            模型与密钥
          </NavLink>
          里改。保存后存在本机，有账号时也会跟服务端对齐。
        </p>
      </div>

      <form className="settings-card" onSubmit={onSave}>
        <section className="settings-category" aria-labelledby="settings-cat-asr">
          <h2 id="settings-cat-asr" className="settings-section-title">
            语音与语义识别
          </h2>

          <label className="settings-label">
            {MODEL_CATEGORY_LABELS.speech}（工作台「开始识别」）
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
