// @ts-nocheck
import { AppModalShell } from '@/components/ui/AppModalShell';
import CliAngleSlotsEditor from '../../components/CliAngleSlotsEditor';
import CliEnvEditor from '../../components/CliEnvEditor';
import CliInstructionHeader from '../../components/CliInstructionHeader';
import { normalizeCliEnvRecord } from '../../cliEnv';
import { mergeAngleSlotsWithDefaults } from '../../cliSubstitute';
import { DEFAULT_CLI_TEMPLATE } from '../../workModes';
import {
  CURSOR_AGENT_MODEL_PRESETS,
  CURSOR_AGENT_MODEL_SELECT_OTHER,
  cursorAgentModelSelectValue,
} from '../../cursorAgentModels';

export default function HomeWorkbenchCliParamsModal({
  open,
  onClose,
  isCliWorkbench,
  isXiaoaiCli,
  cursorWorkbenchTriadLabels,
  cliWorkspaceFallbackStr,
  cursorTriadInputs,
  patchCursorTriadField,
  activeMode,
  onCliTemplateChange,
  onCliWorkspaceChange,
  onCliAngleSlotsChange,
  applyWorkbenchCliExample,
  onCliEnvChange,
}) {
  return (
    <AppModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      titleId="cli-params-modal-title"
      title="CLI 入参配置"
      contentClassName="modal-card--cli-params sm:max-w-[min(96vw,720px)]"
    >
      {isCliWorkbench ? (
          <div className="cli-params-modal-body">
            {cursorWorkbenchTriadLabels.length === 0 ? (
              <p className="cli-params-cursor-empty">
                当前模板里没有 <code>&lt;模型&gt;</code>、<code>&lt;工作空间&gt;</code>、
                <code>&lt;输出路径&gt;</code> 占位，无需在此填写。
              </p>
            ) : (
              cursorWorkbenchTriadLabels.map((lab) => {
                const meta =
                  lab === '模型'
                    ? { title: '--model（CLI 模型 id）', ph: '与 `agent models` 中 id 一致' }
                    : lab === '工作空间'
                      ? {
                          title: '工作空间（编程目录）',
                          ph: cliWorkspaceFallbackStr.trim()
                            ? `未填目标路径时用服务端：${cliWorkspaceFallbackStr}`
                            : '/path/to/your/repo',
                        }
                      : { title: '输出路径（模板自定义）', ph: '按您在目标详情中的占位含义填写' };
                if (lab === '模型') {
                  const raw = cursorTriadInputs[lab] || '';
                  const sel = cursorAgentModelSelectValue(raw);
                  return (
                    <div key={lab} className="cli-mode-label cli-mode-label--stack">
                      <span className="cli-mode-label-text">{meta.title}</span>
                      <select
                        className="cli-mode-workspace cli-mode-workspace--select"
                        value={sel}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === CURSOR_AGENT_MODEL_SELECT_OTHER) {
                            patchCursorTriadField(
                              lab,
                              sel === CURSOR_AGENT_MODEL_SELECT_OTHER ? raw : ''
                            );
                          } else {
                            patchCursorTriadField(lab, v);
                          }
                        }}
                        aria-label={meta.title}
                      >
                        <option value="">请选择模型…</option>
                        {CURSOR_AGENT_MODEL_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}（{p.id}）
                          </option>
                        ))}
                        <option value={CURSOR_AGENT_MODEL_SELECT_OTHER}>其他（手动输入 id）</option>
                      </select>
                      {sel === CURSOR_AGENT_MODEL_SELECT_OTHER ? (
                        <input
                          type="text"
                          className="cli-mode-workspace cli-mode-workspace--triad-other"
                          value={raw}
                          onChange={(e) => patchCursorTriadField(lab, e.target.value)}
                          placeholder={meta.ph}
                          spellCheck={false}
                          aria-label={`${meta.title} 自定义`}
                        />
                      ) : null}
                    </div>
                  );
                }
                return (
                  <label key={lab} className="cli-mode-label">
                    {meta.title}
                    <input
                      type="text"
                      className="cli-mode-workspace"
                      value={cursorTriadInputs[lab]}
                      onChange={(e) => patchCursorTriadField(lab, e.target.value)}
                      placeholder={meta.ph}
                      spellCheck={false}
                    />
                  </label>
                );
              })
            )}
          </div>
        ) : isXiaoaiCli ? (
          <div className="cli-params-modal-body">
            <div className="cli-mode-label cli-mode-label--cli-template">
              <CliInstructionHeader onExample={applyWorkbenchCliExample} />
              <textarea
                className="cli-mode-template"
                value={activeMode.cliTemplate || DEFAULT_CLI_TEMPLATE}
                onChange={(e) => onCliTemplateChange(e.target.value)}
                spellCheck={false}
                rows={4}
                aria-label="完整指令"
              />
            </div>
            <CliAngleSlotsEditor
              slots={mergeAngleSlotsWithDefaults(
                activeMode.cliTemplate || DEFAULT_CLI_TEMPLATE,
                activeMode.angleSlots || []
              )}
              onChange={onCliAngleSlotsChange}
            />
          </div>
        ) : (
          <div className="cli-params-modal-body">
            <label className="cli-mode-label">
              命令模板
              <textarea
                className="cli-mode-template"
                value={activeMode.cliTemplate || DEFAULT_CLI_TEMPLATE}
                onChange={(e) => onCliTemplateChange(e.target.value)}
                spellCheck={false}
                rows={4}
              />
            </label>
            <label className="cli-mode-label">
              工作区路径
              <input
                type="text"
                className="cli-mode-workspace"
                value={activeMode.cliWorkspace || ''}
                onChange={(e) => onCliWorkspaceChange(e.target.value)}
                placeholder={
                  cliWorkspaceFallbackStr.trim()
                    ? `不填则用：${cliWorkspaceFallbackStr}`
                    : '项目文件夹路径'
                }
                spellCheck={false}
              />
            </label>
          </div>
        )}
        <div className="cli-params-section-env">
          <h3 className="cli-params-subtitle">环境变量（可选）</h3>
          <p className="cli-params-modal-env-note">在「目标」里也能改；这里和命令一起调方便。</p>
          <CliEnvEditor
            value={normalizeCliEnvRecord(activeMode?.cliEnv)}
            onChange={(v) => {
              if (!activeMode?.id) return;
              onCliEnvChange(v);
            }}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary-nav" onClick={onClose}>
            完成
          </button>
        </div>
    </AppModalShell>
  );
}
