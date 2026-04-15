import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { applyUiCommands } from '../agentRemote/applyUiCommands';
import { uiControlWsUrl } from '../pages/home/workbenchUrls';

/**
 * 订阅 /ws/ui-control，将服务端推送的 ui_commands 交给白名单执行器（导航 + 受控 store）。
 * 开发环境默认开启；生产需设置 VITE_UI_CONTROL_ENABLED=1，且若服务端配置了 RESO_UI_CONTROL_SECRET，
 * 需在构建环境注入 VITE_RESO_UI_CONTROL_TOKEN（与密钥一致）以便 WebSocket subscribe。
 */
export function AgentRemoteUiBridge() {
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    const enabled =
      import.meta.env.DEV || String(import.meta.env.VITE_UI_CONTROL_ENABLED ?? '') === '1';
    if (!enabled) return;

    const url = uiControlWsUrl();
    if (!url) return;

    const ws = new WebSocket(url);
    const token = String(import.meta.env.VITE_RESO_UI_CONTROL_TOKEN ?? '').trim();

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', ...(token ? { token } : {}) }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as { type?: string; commands?: unknown[] };
        if (data.type !== 'ui_commands' || !Array.isArray(data.commands)) return;
        applyUiCommands(data.commands, { navigate: (p) => navRef.current(p) });
      } catch {
        /* ignore malformed */
      }
    };

    return () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return null;
}
