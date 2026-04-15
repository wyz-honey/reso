import { useEffect, useMemo, useState } from 'react';
import {
  MODEL_CATEGORY_LABELS,
  MODEL_CATEGORIES,
  setDefaultModelIds,
  useModelProvidersStore,
} from '../stores/modelProvidersStore';
import { getVoiceSettings, saveVoiceSettings } from '../stores/voiceSettingsStore';
import '../App.css';

export default function SettingsPage() {
  const [asrDisfluencyRemoval, setAsrDisfluencyRemoval] = useState(
    () => getVoiceSettings().asrDisfluencyRemoval
  );
  const [asrLanguageHintsText, setAsrLanguageHintsText] = useState(
    () => getVoiceSettings().asrLanguageHintsText
  );
  const [oralStripEnabled, setOralStripEnabled] = useState(() => getVoiceSettings().oralStripEnabled);
  const [oralStripPhrasesText, setOralStripPhrasesText] = useState(
    () => getVoiceSettings().oralStripPhrasesText
  );
  const [savedFlash, setSavedFlash] = useState(false);

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
      </div>

      <form className="settings-card" onSubmit={onSave}>
        <section className="settings-category" aria-labelledby="settings-cat-asr">
          <h2 id="settings-cat-asr" className="settings-section-title">
            语音识别
          </h2>

          <label className="settings-label">
            {MODEL_CATEGORY_LABELS.speech}
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
