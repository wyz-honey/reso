// @ts-nocheck
import { AppModalShell } from '@/components/ui/AppModalShell';
import CliInstructionHeader from '../../components/CliInstructionHeader';
import { buildAllCustomAngleSlots, mergeAngleSlotsWithDefaults } from '../../cliSubstitute';
import { DEFAULT_CLI_TEMPLATE } from '../../workModes';
import { useHomeWorkbenchUiStore } from '../../stores/homeWorkbenchUiStore';

export default function HomeWorkbenchAddModeModal({ customModes, onSubmit, onDeleteCustomMode }) {
  const modeModalOpen = useHomeWorkbenchUiStore((s) => s.modeModalOpen);
  const setModeModalOpen = useHomeWorkbenchUiStore((s) => s.setModeModalOpen);
  const newModeKind = useHomeWorkbenchUiStore((s) => s.newModeKind);
  const setNewModeKind = useHomeWorkbenchUiStore((s) => s.setNewModeKind);
  const newModeName = useHomeWorkbenchUiStore((s) => s.newModeName);
  const setNewModeName = useHomeWorkbenchUiStore((s) => s.setNewModeName);
  const newHttpUrl = useHomeWorkbenchUiStore((s) => s.newHttpUrl);
  const setNewHttpUrl = useHomeWorkbenchUiStore((s) => s.setNewHttpUrl);
  const newHttpProtocol = useHomeWorkbenchUiStore((s) => s.newHttpProtocol);
  const setNewHttpProtocol = useHomeWorkbenchUiStore((s) => s.setNewHttpProtocol);
  const newXiaoaiTemplate = useHomeWorkbenchUiStore((s) => s.newXiaoaiTemplate);
  const setNewXiaoaiTemplate = useHomeWorkbenchUiStore((s) => s.setNewXiaoaiTemplate);
  const setNewCliAngleSlotsPreset = useHomeWorkbenchUiStore((s) => s.setNewCliAngleSlotsPreset);

  const closeModal = () => {
    setModeModalOpen(false);
    setNewCliAngleSlotsPreset(null);
  };

  return (
    <AppModalShell
      open={modeModalOpen}
      onOpenChange={(next) => {
        if (!next) closeModal();
      }}
      titleId="mode-modal-title"
      title="添加自定义目标"
      description={
        newModeKind === 'xiaoai'
          ? 'CLI：完整指令可用尖括号占位与 {{变量}}；点「示例」可载入默认命令且占位均为自定义。仅保存在本机浏览器。'
          : 'HTTP：向指定 URL POST JSON（OpenAI Chat 或 AGUI 体）。仅保存在本机浏览器。'
      }
    >
      <form onSubmit={onSubmit} className="modal-form">
          <label className="modal-label">
            类型
            <select
              className="modal-input"
              value={newModeKind}
              onChange={(e) => {
                const k = e.target.value;
                setNewModeKind(k);
                if (k === 'xiaoai' && !newXiaoaiTemplate.trim()) {
                  setNewXiaoaiTemplate(DEFAULT_CLI_TEMPLATE);
                  setNewCliAngleSlotsPreset(null);
                }
              }}
            >
              <option value="http">HTTP</option>
              <option value="xiaoai">CLI</option>
            </select>
          </label>
          <label className="modal-label">
            名称
            <input
              className="modal-input"
              value={newModeName}
              onChange={(e) => setNewModeName(e.target.value)}
              placeholder={newModeKind === 'xiaoai' ? '例如：本地 agent 流水线' : '例如：自建网关'}
              required
            />
          </label>
          {newModeKind === 'http' ? (
            <>
              <label className="modal-label">
                请求 URL
                <input
                  className="modal-input"
                  type="url"
                  value={newHttpUrl}
                  onChange={(e) => setNewHttpUrl(e.target.value)}
                  placeholder="https://…"
                  required
                  spellCheck={false}
                />
              </label>
              <label className="modal-label">
                协议
                <select
                  className="modal-input"
                  value={newHttpProtocol}
                  onChange={(e) => setNewHttpProtocol(e.target.value)}
                >
                  <option value="openai_chat">OpenAI Chat</option>
                  <option value="agui">AGUI</option>
                </select>
              </label>
            </>
          ) : (
            <div className="modal-label modal-label--cli-template">
              <CliInstructionHeader
                onExample={() => {
                  setNewXiaoaiTemplate(DEFAULT_CLI_TEMPLATE);
                  setNewCliAngleSlotsPreset(buildAllCustomAngleSlots(DEFAULT_CLI_TEMPLATE));
                }}
              />
              <textarea
                className="modal-textarea"
                value={newXiaoaiTemplate}
                onChange={(e) => {
                  const v = e.target.value;
                  setNewXiaoaiTemplate(v);
                  setNewCliAngleSlotsPreset((prev) =>
                    prev != null ? mergeAngleSlotsWithDefaults(v, prev) : null
                  );
                }}
                placeholder={DEFAULT_CLI_TEMPLATE}
                rows={5}
                spellCheck={false}
                required
                aria-label="完整指令"
              />
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-clear" onClick={closeModal}>
              取消
            </button>
            <button type="submit" className="btn-copy">
              添加
            </button>
          </div>
        </form>
        {customModes.length > 0 ? (
          <div className="modal-custom-list">
            <div className="modal-custom-head">已保存的自定义</div>
            <ul>
              {customModes.map((m) => (
                <li key={m.id} className="modal-custom-row">
                  <span>
                    {m.name}
                    <span className="modal-custom-kind">
                      {m.kind === 'http'
                        ? ' · HTTP'
                          : m.kind === 'cli'
                          ? m.cliVariant === 'xiaoai'
                            ? ' · CLI'
                            : m.cliVariant === 'cursor'
                              ? ' · Cursor'
                              : m.cliVariant === 'qoder'
                                ? ' · Qoder'
                                : ' · CLI(旧)'
                          : ' · RESO'}
                    </span>
                  </span>
                  <button type="button" className="btn-danger-text" onClick={() => onDeleteCustomMode(m.id)}>
                    删除
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
    </AppModalShell>
  );
}
