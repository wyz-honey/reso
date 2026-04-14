/** 配置 CLI 模板中每个 &lt;标签&gt; 的系统（多选一）或自定义字面量 */
import {
  ANGLE_SYSTEM_FIELDS,
  shouldDefaultCustomSource,
  type AngleSlot,
} from '../cliSubstitute';
import {
  CURSOR_AGENT_MODEL_PRESETS,
  CURSOR_AGENT_MODEL_SELECT_OTHER,
  cursorAgentModelSelectValue,
} from '../cursorAgentModels';

const SYSTEM_FIELD_OPTIONS = [
  { value: 'paragraph', label: '识别段落', hint: 'system.paragraph' },
  { value: 'sessionId', label: '当前会话 ID', hint: 'system.sessionId' },
  { value: 'workspace', label: '工作区路径', hint: 'system.workspace' },
  {
    value: 'cursorStdout',
    label: 'Cursor 标准输出文件',
    hint: 'server/outputs/cursor/<会话>/info.txt',
  },
  {
    value: 'cursorStderr',
    label: 'Cursor 错误输出文件',
    hint: 'server/outputs/cursor/<会话>/error.txt',
  },
  {
    value: 'externalThread',
    label: '外部 CLI 线程 ID',
    hint: 'session_external_threads（侧栏绑定）',
  },
];

export default function CliAngleSlotsEditor({
  slots,
  onChange,
  sectionTitle = '尖括号占位',
  sectionHint,
  useCursorAgentModelPicker = false,
}: {
  slots: AngleSlot[];
  onChange: (next: AngleSlot[]) => void;
  sectionTitle?: string;
  sectionHint?: string;
  /** Cursor 目标：&lt;模型&gt; 用固定 id 下拉（与 `agent --model` 一致），仍可选「其他」手写 */
  useCursorAgentModelPicker?: boolean;
}) {
  if (!slots?.length) return null;

  const hintText =
    sectionHint ??
    (useCursorAgentModelPicker
      ? '「系统」从运行时上下文取值。Cursor 的 &lt;模型&gt; 请从下拉选 CLI 模型 id，或与 `agent models` 不一致时选「其他」手写。'
      : '「系统」从运行时上下文取值（段落 / 绑定会话 / CLI 工作区）；模型名等请选「自定义」并填写字面量。');

  const patch = (index, partial) => {
    const next = slots.map((s, i) => (i === index ? { ...s, ...partial } : s));
    onChange(next);
  };

  return (
    <div className="cli-angle-slots-editor">
      <div className="cli-angle-slots-editor-title">{sectionTitle}</div>
      <p className="cli-angle-slots-editor-hint">{hintText}</p>
      <ul className="cli-angle-slots-list">
        {slots.map((slot, i) => (
          <li key={slot.key || `${slot.label}-${i}`} className="cli-angle-slot-item">
            <div className="cli-angle-slot-row-top">
              <span className="cli-angle-slot-badge" title={slot.key}>
                &lt;{slot.label}&gt;
              </span>
              <label className="cli-angle-slot-type-field">
                <span className="cli-angle-slot-field-label">取值类型</span>
                <select
                  className="cli-angle-slot-select"
                  value={slot.source === 'custom' ? 'custom' : 'system'}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      patch(i, { source: 'custom', systemField: 'paragraph' });
                    } else {
                      const field = (ANGLE_SYSTEM_FIELDS as readonly string[]).includes(slot.systemField)
                        ? slot.systemField
                        : 'paragraph';
                      patch(i, { source: 'system', systemField: field });
                    }
                  }}
                >
                  <option value="system">系统</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
            </div>
            <div className="cli-angle-slot-row-value">
              {slot.source === 'system' ? (
                <label className="cli-angle-slot-value-field">
                  <span className="cli-angle-slot-field-label">系统字段</span>
                  <select
                    className="cli-angle-slot-select"
                    value={
                      (ANGLE_SYSTEM_FIELDS as readonly string[]).includes(slot.systemField)
                        ? slot.systemField
                        : 'paragraph'
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if ((ANGLE_SYSTEM_FIELDS as readonly string[]).includes(v)) {
                        patch(i, { source: 'system', systemField: v });
                      }
                    }}
                  >
                    {SYSTEM_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}（{opt.hint}）
                      </option>
                    ))}
                  </select>
                  <p className="cli-angle-slot-system-note cli-angle-slot-system-note--compact">
                    确认指令时替换为实际值（段落会按 shell 单引号转义）。
                  </p>
                </label>
              ) : useCursorAgentModelPicker && shouldDefaultCustomSource(slot.label) ? (
                <label className="cli-angle-slot-value-field">
                  <span className="cli-angle-slot-field-label">模型 id（--model）</span>
                  <select
                    className="cli-angle-slot-select"
                    value={cursorAgentModelSelectValue(slot.customValue)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CURSOR_AGENT_MODEL_SELECT_OTHER) {
                        patch(i, {
                          customValue:
                            slot.customValue &&
                            cursorAgentModelSelectValue(slot.customValue) ===
                              CURSOR_AGENT_MODEL_SELECT_OTHER
                              ? slot.customValue
                              : '',
                        });
                      } else {
                        patch(i, { customValue: v });
                      }
                    }}
                  >
                    <option value="">请选择…</option>
                    {CURSOR_AGENT_MODEL_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}（{p.id}）
                      </option>
                    ))}
                    <option value={CURSOR_AGENT_MODEL_SELECT_OTHER}>其他（手动输入 id）</option>
                  </select>
                  {cursorAgentModelSelectValue(slot.customValue) ===
                  CURSOR_AGENT_MODEL_SELECT_OTHER ? (
                    <input
                      type="text"
                      className="cli-angle-slot-input cli-angle-slot-input--mt"
                      value={slot.customValue || ''}
                      onChange={(e) => patch(i, { customValue: e.target.value })}
                      placeholder="与 `agent models` 中 id 一致"
                      spellCheck={false}
                    />
                  ) : null}
                </label>
              ) : (
                <label className="cli-angle-slot-value-field">
                  <span className="cli-angle-slot-field-label">值</span>
                  <input
                    type="text"
                    className="cli-angle-slot-input"
                    value={slot.customValue || ''}
                    onChange={(e) => patch(i, { customValue: e.target.value })}
                    placeholder="填入命令中的原文，按您输入原样插入"
                    spellCheck={false}
                  />
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
