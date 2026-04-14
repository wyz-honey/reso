import { END_MODES, type EndMode } from '../stores/voiceSettingsStore';
import type { OutputVoiceControl } from '../outputVoiceControl';

const END_MODE_OPTIONS = [
  { value: END_MODES.manual, label: '手动（仅点击按钮发送/保存）' },
  { value: END_MODES.silence, label: '静音超时（说完停一会儿自动提交）' },
  { value: END_MODES.phrase, label: '结束词（如说 over / 结束 后自动提交）' },
  { value: END_MODES.both, label: '静音 + 结束词（任一触发）' },
];

export default function OutputVoiceControlSection({
  value,
  onChange,
  title = '识别结束策略',
  lead,
}: {
  value: OutputVoiceControl;
  onChange: (next: OutputVoiceControl) => void;
  title?: string;
  lead?: string;
}) {
  const patch = (p: Partial<OutputVoiceControl>) => onChange({ ...value, ...p });

  return (
    <section className="settings-category" aria-label={title}>
      <h2 className="settings-section-title">{title}</h2>
      {lead ? <p className="settings-category-lead">{lead}</p> : null}

      <label className="settings-label">
        结束方式
        <select
          className="settings-select"
          value={value.endMode}
          onChange={(e) => patch({ endMode: e.target.value as EndMode })}
        >
          {END_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {(value.endMode === END_MODES.silence || value.endMode === END_MODES.both) && (
        <label className="settings-label">
          静音时长（秒）
          <input
            type="number"
            className="settings-input"
            min={0.4}
            max={60}
            step={0.1}
            value={value.silenceSeconds}
            onChange={(e) => patch({ silenceSeconds: Number(e.target.value) })}
          />
        </label>
      )}

      {(value.endMode === END_MODES.phrase || value.endMode === END_MODES.both) && (
        <label className="settings-label">
          结束词（每行一个，不区分大小写）
          <textarea
            className="settings-textarea"
            rows={4}
            value={value.endPhrases.join('\n')}
            onChange={(e) =>
              patch({
                endPhrases: e.target.value
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .filter(Boolean),
              })
            }
            placeholder={'over\n结束\n完毕'}
          />
        </label>
      )}

      {(value.endMode === END_MODES.silence || value.endMode === END_MODES.both) && (
        <>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={value.stripEndPhrase}
              onChange={(e) => patch({ stripEndPhrase: e.target.checked })}
            />
            静音超时自动提交时：若句尾像结束词，也从正文去掉再提交
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={value.stopMicAfterAuto}
              onChange={(e) => patch({ stopMicAfterAuto: e.target.checked })}
            />
            静音超时自动提交成功后停止识别（结束词触发默认不关麦）
          </label>
        </>
      )}
    </section>
  );
}
