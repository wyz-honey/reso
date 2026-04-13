import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import OutputsPage from './pages/OutputsPage.js';
import OutputDetailPage from './pages/OutputDetailPage.js';
import SettingsPage from './pages/SettingsPage.js';
import ModelProvidersPage from './pages/ModelProvidersPage.js';
import QuickInputsPage from './pages/QuickInputsPage.js';
import SessionsPage from './pages/SessionsPage.js';
import './App.css';

const SIDEBAR_COLLAPSED_KEY = 'reso_sidebar_collapsed_v1';

function loadSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** 工作台：四宫格面板 */
function IconWorkbench() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" strokeLinejoin="round" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" strokeLinejoin="round" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" strokeLinejoin="round" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** 输入 · 快捷上下文：闪电 */
function IconQuick() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 输入 · 会话：对话气泡 */
function IconConversation() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H8l-5 3v-3.5A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 10h.01M12 10h.01M16 10h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 输出 · 目标管理：靶心 */
function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" strokeLinecap="round" />
      <circle cx="12" cy="12" r="5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 系统 · 设置：滑块 */
function IconSliders() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="3" y1="7" x2="13" y2="7" strokeLinecap="round" />
      <circle cx="17" cy="7" r="2" />
      <line x1="8" y1="12" x2="20" y2="12" strokeLinecap="round" />
      <circle cx="5" cy="12" r="2" />
      <line x1="3" y1="17" x2="15" y2="17" strokeLinecap="round" />
      <circle cx="19" cy="17" r="2" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 6 9 12l6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const [navCollapsed, setNavCollapsed] = useState(loadSidebarCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, navCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [navCollapsed]);

  const toggleNav = useCallback(() => {
    setNavCollapsed((c) => !c);
  }, []);

  return (
    <div className={`shell ${navCollapsed ? 'shell--nav-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-brand">
          Reso
          <span className="sidebar-tagline">Voice</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link nav-link--solo ${isActive ? 'active' : ''}`}>
            <IconWorkbench />
            <span className="nav-link-label">工作台</span>
          </NavLink>
          <div className="sidebar-nav-group">
            <div className="sidebar-nav-label">输入</div>
            <NavLink to="/sessions" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <IconConversation />
              <span className="nav-link-label">会话</span>
            </NavLink>
            <NavLink to="/quick-inputs" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <IconQuick />
              <span className="nav-link-label">快捷上下文</span>
            </NavLink>
          </div>
          <div className="sidebar-nav-group">
            <div className="sidebar-nav-label">输出</div>
            <NavLink
              to="/outputs"
              end
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <IconTarget />
              <span className="nav-link-label">目标管理</span>
            </NavLink>
          </div>
          <div className="sidebar-nav-group">
            <div className="sidebar-nav-label">系统</div>
            <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <IconSliders />
              <span className="nav-link-label">设置</span>
            </NavLink>
          </div>
        </nav>
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={toggleNav}
          title={navCollapsed ? '展开导航' : '收起导航'}
          aria-expanded={!navCollapsed}
          aria-label={navCollapsed ? '展开导航' : '收起导航'}
        >
          {navCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/quick-inputs" element={<QuickInputsPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/outputs/:outputId" element={<OutputDetailPage />} />
          <Route path="/outputs" element={<OutputsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/model-providers" element={<ModelProvidersPage />} />
        </Routes>
      </main>
    </div>
  );
}
