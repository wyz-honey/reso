import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
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
        <p className="settings-subtitle">
          <strong>识别结束策略</strong>（结束词 / 静音超时等）已改为各<strong>目标</strong>的必配项，请在
          <NavLink to="/outputs" className="sessions-inline-link">
            目标管理
          </NavLink>
          中进入对应目标详情配置。此处仅保留百炼识别参数与正文口语清理。
          RESO 模型与提示词在
          <NavLink to="/outputs/builtin-agent" className="sessions-inline-link">
            RESO 目标详情
          </NavLink>
          ；供应商与 API Key 见
          <NavLink to="/model-providers" className="sessions-inline-link">
            模型目录（高级）
          </NavLink>
          。
        </p>
      </div>

      <form className="settings-card" onSubmit={onSave}>
        <section className="settings-category" aria-labelledby="settings-cat-asr">
          <h2 id="settings-cat-asr" className="settings-section-title">
            语音识别与正文清理
          </h2>
          <p className="settings-category-lead">
            以下选项在下次点击「开始识别」时生效。引擎侧过滤语气词依赖百炼文档中的{' '}
            <code>disfluency_removal_enabled</code>；语种提示用 <code>language_hints</code> 提升中文等场景准确率。
          </p>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={asrDisfluencyRemoval}
              onChange={(e) => setAsrDisfluencyRemoval(e.target.checked)}
            />
            引擎内过滤语气词（嗯、啊等，推荐开启）
          </label>

          <label className="settings-label">
            语种提示（空格/逗号分隔，留空=自动识别）
            <input
              type="text"
              className="settings-input"
              value={asrLanguageHintsText}
              onChange={(e) => setAsrLanguageHintsText(e.target.value)}
              placeholder="zh"
            />
            <span className="settings-hint">
              常用：<code>zh</code> 中文、<code>en</code> 英文、<code>yue</code> 粤语；仅允许百炼文档列出的代码。
            </span>
          </label>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={oralStripEnabled}
              onChange={(e) => setOralStripEnabled(e.target.checked)}
            />
            写入正文前再做一层<strong>首尾</strong>口语清理（见下框；句中不误删）
          </label>

          <label className="settings-label">
            首尾要削掉的口语（每行一条，仅出现在<strong>开头</strong>或长度≥2 且出现在<strong>结尾</strong>时移除）
            <textarea
              className="settings-textarea"
              rows={4}
              value={oralStripPhrasesText}
              onChange={(e) => setOralStripPhrasesText(e.target.value)}
              placeholder={'那个\n就是\n然后\n所以说'}
              disabled={!oralStripEnabled}
            />
            <span className="settings-hint">
              另会自动去掉句首连续的「嗯/啊/呃…」+ 标点。勿填过短且易出现在句中的单字（如「好」），以免误伤。
            </span>
          </label>
        </section>

        <div className="settings-actions">
          <button type="submit" className="btn-primary-nav">
            保存到本机
          </button>
          {savedFlash ? <span className="settings-saved">已保存</span> : null}
        </div>
      </form>
    </div>
  );
}
