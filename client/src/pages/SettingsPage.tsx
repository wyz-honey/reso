import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  END_MODES,
  type EndMode,
  getVoiceSettings,
  saveVoiceSettings,
} from '../stores/voiceSettingsStore.js';
import '../App.css';

const END_MODE_OPTIONS = [
  { value: END_MODES.manual, label: '手动（仅点击按钮发送/保存）' },
  { value: END_MODES.silence, label: '静音超时（说完停一会儿自动提交，对讲机感）' },
  { value: END_MODES.phrase, label: '结束词（如说 over / 结束 后自动提交）' },
  { value: END_MODES.both, label: '静音 + 结束词（任一触发）' },
];

export default function SettingsPage() {
  const [endMode, setEndMode] = useState(() => getVoiceSettings().endMode);
  const [silenceSeconds, setSilenceSeconds] = useState(() => getVoiceSettings().silenceSeconds);
  const [endPhrasesText, setEndPhrasesText] = useState(() =>
    getVoiceSettings().endPhrases.join('\n')
  );
  const [stripEndPhrase, setStripEndPhrase] = useState(() => getVoiceSettings().stripEndPhrase);
  const [stopMicAfterAuto, setStopMicAfterAuto] = useState(() => getVoiceSettings().stopMicAfterAuto);
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
      setEndMode(s.endMode);
      setSilenceSeconds(s.silenceSeconds);
      setEndPhrasesText(s.endPhrases.join('\n'));
      setStripEndPhrase(s.stripEndPhrase);
      setStopMicAfterAuto(s.stopMicAfterAuto);
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
    const phrases = endPhrasesText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    saveVoiceSettings({
      endMode,
      silenceSeconds: Number(silenceSeconds) || 5,
      endPhrases: phrases,
      stripEndPhrase,
      stopMicAfterAuto,
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
          按分类整理；开放<strong>系统控制</strong>（识别结束策略、百炼识别参数与口语清理）。
          RESO 对话用的模型与提示词在
          <NavLink to="/outputs/builtin-agent" className="sessions-inline-link">
            RESO 目标详情
          </NavLink>
          配置；若需新增供应商或填写 API Key，可打开
          <NavLink to="/model-providers" className="sessions-inline-link">
            模型目录（高级）
          </NavLink>
          。
        </p>
      </div>

      <form className="settings-card" onSubmit={onSave}>
        <section className="settings-category" aria-labelledby="settings-cat-system">
          <h2 id="settings-cat-system" className="settings-section-title">
            系统控制
          </h2>
          <p className="settings-category-lead">
            控制在<strong>正在识别</strong>时如何判定「一句说完」并自动提交。标准 / HTTP / CLI 等遵循下方选项；<strong>
              RESO 对话模式
            </strong>
            单独使用「短停顿后自动发送」，不依赖结束词。
          </p>

          <label className="settings-label">
            结束方式
            <select
              className="settings-select"
              value={endMode}
              onChange={(e) => setEndMode(e.target.value as EndMode)}
            >
              {END_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="settings-hint">
              未保存过设置时，默认选「结束词」。若此处与预期不符，请选好后点底部「保存到本机」。
            </span>
          </label>

          {(endMode === END_MODES.silence || endMode === END_MODES.both) && (
            <label className="settings-label">
              静音时长（秒）
              <input
                type="number"
                className="settings-input"
                min={1}
                max={60}
                value={silenceSeconds}
                onChange={(e) => setSilenceSeconds(Number(e.target.value))}
              />
              <span className="settings-hint">
                识别过程中，若超过该时间没有新的识别结果，则自动按当前模式提交（复制并保存、发 RESO、HTTP
                或 CLI）。
              </span>
            </label>
          )}

          {(endMode === END_MODES.phrase || endMode === END_MODES.both) && (
            <label className="settings-label">
              结束词（每行一个，不区分大小写）
              <textarea
                className="settings-textarea"
                rows={5}
                value={endPhrasesText}
                onChange={(e) => setEndPhrasesText(e.target.value)}
                placeholder={'over\n结束\n完毕'}
              />
              <span className="settings-hint">
                当<strong>一句完整识别结果</strong>结束后，若当前正文以某结束词结尾（或整句就是该词），则触发自动提交。
              </span>
            </label>
          )}

          {(endMode === END_MODES.phrase || endMode === END_MODES.both) && (
            <p className="settings-hint settings-hint--block">
              说出结束词并成句后，会自动<strong>保存</strong>（标准模式）或<strong>保存并发送</strong>（RESO /
              HTTP / CLI）
              ；写入数据库与发模型的内容会<strong>自动去掉</strong>结束词。
              结束后<strong>不会关闭麦克风</strong>，仍为「正在聆听」，可继续说下一段。
            </p>
          )}

          {(endMode === END_MODES.silence || endMode === END_MODES.both) && (
            <label className="settings-check">
              <input
                type="checkbox"
                checked={stripEndPhrase}
                onChange={(e) => setStripEndPhrase(e.target.checked)}
              />
              静音超时自动提交时：若句尾像结束词，也从正文去掉再入库
            </label>
          )}

          {(endMode === END_MODES.silence || endMode === END_MODES.both) && (
            <label className="settings-check">
              <input
                type="checkbox"
                checked={stopMicAfterAuto}
                onChange={(e) => setStopMicAfterAuto(e.target.checked)}
              />
              仅当<strong>静音超时</strong>自动提交成功后停止识别（对讲机式一句一停）；结束词触发不会关麦。
            </label>
          )}

          <h3 className="settings-subsection-title">语音识别（百炼 Paraformer）</h3>
          <p className="settings-hint settings-hint--block">
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
