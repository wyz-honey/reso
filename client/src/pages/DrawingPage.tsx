import { Link } from 'react-router-dom';

/**
 * 轻量「绘画」占位页：供内置 Agent 通过远程 UI 指令打开（见 /api/ui-control/push）。
 * 后续可替换为真实画布实现。
 */
export default function DrawingPage() {
  return (
    <div className="drawing-page" style={{ padding: '1.5rem', maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>绘画</h1>
      <p style={{ color: 'var(--reso-muted, #888)', marginBottom: '1rem' }}>
        此页面由远程 UI 控制通道打开，也可从工作台返回。
      </p>
      <Link to="/" style={{ textDecoration: 'underline' }}>
        返回工作台
      </Link>
    </div>
  );
}
