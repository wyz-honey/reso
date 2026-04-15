import { useNavigate } from 'react-router-dom';
import { AppModalShell } from '@/components/ui/AppModalShell';
import { Button } from '@/components/ui/button';
import { useWorkbenchNavigationGuardStore } from '../stores/workbenchNavigationGuardStore';

export default function LeaveWorkbenchListeningModal() {
  const navigate = useNavigate();
  const pendingPath = useWorkbenchNavigationGuardStore((s) => s.pendingPath);
  const clearPending = useWorkbenchNavigationGuardStore((s) => s.clearPending);

  const open = Boolean(pendingPath);

  const stay = () => {
    clearPending();
  };

  const leave = () => {
    const { onLeaveConfirmed, pendingPath: path } = useWorkbenchNavigationGuardStore.getState();
    onLeaveConfirmed();
    clearPending();
    if (path) navigate(path);
  };

  return (
    <AppModalShell
      open={open}
      onOpenChange={(next) => {
        if (!next) stay();
      }}
      titleId="leave-workbench-listening-title"
      title="要离开工作台吗？"
      description="当前正在语音识别（麦克风可能已开启）。离开将停止识别并断开与服务端的连接。"
    >
      <div className="modal-actions">
        <Button type="button" variant="outline" onClick={stay}>
          留在工作台
        </Button>
        <Button type="button" variant="default" onClick={leave}>
          停止识别并离开
        </Button>
      </div>
    </AppModalShell>
  );
}
