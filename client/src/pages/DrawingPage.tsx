import { Link } from 'react-router-dom';

export default function DrawingPage() {
  return (
    <div className="drawing-page" style={{ padding: '1.5rem', maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>绘画</h1>
      <p style={{ color: 'var(--reso-muted, #888)', marginBottom: '1rem' }}>画板占位页。</p>
      <Link to="/" style={{ textDecoration: 'underline' }}>
        返回工作台
      </Link>
    </div>
  );
}
