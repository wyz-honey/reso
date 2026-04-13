/** 配置 CLI 模板中每个 &lt;标签&gt; 的系统（多选一）或自定义字面量 */
import { ANGLE_SYSTEM_FIELDS } from '../cliSubstitute.js';

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
];

export default function CliAngleSlotsEditor({ slots, onChange }) {
  if (!slots?.length) return null;

  const patch = (index, partial) => {
    const next = slots.map((s, i) => (i === index ? { ...s, ...partial } : s));
    onChange(next);
  };

  return (
    <div className="cli-angle-slots-editor">
      <div className="cli-angle-slots-editor-title">尖括号占位</div>
      <p className="cli-angle-slots-editor-hint">
        「系统」从运行时上下文取值（段落 / 绑定会话 / CLI 工作区）；模型名等请选「自定义」并填写字面量。
      </p>
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
                      const field = ANGLE_SYSTEM_FIELDS.includes(slot.systemField)
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
                    value={ANGLE_SYSTEM_FIELDS.includes(slot.systemField) ? slot.systemField : 'paragraph'}
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
