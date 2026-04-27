// @ts-nocheck
import HomeWorkbenchCliParamsModal from './HomeWorkbenchCliParamsModal';
import { AppModalShell } from '@/components/ui/AppModalShell';
import { useHomeWorkbenchUiStore } from '../../stores/homeWorkbenchUiStore';

export default function HomeWorkbenchModals({
  isCli,
  quickInputs,
  insertQuickContent,
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
}) {
  const cliParamsModalOpen = useHomeWorkbenchUiStore((s) => s.cliParamsModalOpen);
  const setCliParamsModalOpen = useHomeWorkbenchUiStore((s) => s.setCliParamsModalOpen);
  const quickInputsModalOpen = useHomeWorkbenchUiStore((s) => s.quickInputsModalOpen);
  const setQuickInputsModalOpen = useHomeWorkbenchUiStore((s) => s.setQuickInputsModalOpen);

  return (
    <>
      <HomeWorkbenchCliParamsModal
        open={cliParamsModalOpen && isCli}
        onClose={() => setCliParamsModalOpen(false)}
        isCliWorkbench={isCliWorkbench}
        isXiaoaiCli={isXiaoaiCli}
        cursorWorkbenchTriadLabels={cursorWorkbenchTriadLabels}
        cliWorkspaceFallbackStr={cliWorkspaceFallbackStr}
        cursorTriadInputs={cursorTriadInputs}
        patchCursorTriadField={patchCursorTriadField}
        activeMode={activeMode}
        onCliTemplateChange={onCliTemplateChange}
        onCliWorkspaceChange={onCliWorkspaceChange}
        onCliAngleSlotsChange={onCliAngleSlotsChange}
        applyWorkbenchCliExample={applyWorkbenchCliExample}
      />

      <AppModalShell
        open={quickInputsModalOpen}
        onOpenChange={setQuickInputsModalOpen}
        titleId="quick-input-select-title"
        title="选择上下文"
        description="点击一个标签将内容插入编辑区。"
      >
        <div className="quick-input-select-list" role="toolbar" aria-label="快捷上下文选择">
          {quickInputs.map((q) => (
            <button
              key={q.id}
              type="button"
              className="quick-input-tag"
              title={
                q.content && q.content.length > 100
                  ? `${q.content.slice(0, 100)}…`
                  : q.content || q.label
              }
              onClick={() => {
                insertQuickContent(q.content);
                setQuickInputsModalOpen(false);
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </AppModalShell>
    </>
  );
}
