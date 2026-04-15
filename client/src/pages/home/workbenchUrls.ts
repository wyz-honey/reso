// @ts-nocheck — Vite injects __RESO_DEV_*__ globals in dev
export function wsUrl() {
  if (typeof __RESO_DEV_ASR_WS_URL__ === 'string' && __RESO_DEV_ASR_WS_URL__) {
    return __RESO_DEV_ASR_WS_URL__;
  }
  if (import.meta.env.VITE_WS_URL) {
    try {
      const base = new URL(import.meta.env.VITE_WS_URL);
      base.pathname = '/ws/asr';
      return base.toString();
    } catch {
      /* fall through */
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/asr`;
}

export function cursorTailWsUrl() {
  if (typeof __RESO_DEV_CURSOR_WS_URL__ === 'string' && __RESO_DEV_CURSOR_WS_URL__) {
    return __RESO_DEV_CURSOR_WS_URL__;
  }
  if (import.meta.env.VITE_WS_URL) {
    try {
      const base = new URL(import.meta.env.VITE_WS_URL);
      base.pathname = '/ws/cursor-tail';
      return base.toString();
    } catch {
      /* fall through */
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/cursor-tail`;
}

export function uiControlWsUrl() {
  if (typeof __RESO_DEV_UI_CONTROL_WS_URL__ === 'string' && __RESO_DEV_UI_CONTROL_WS_URL__) {
    return __RESO_DEV_UI_CONTROL_WS_URL__;
  }
  if (import.meta.env.VITE_WS_URL) {
    try {
      const base = new URL(import.meta.env.VITE_WS_URL);
      base.pathname = '/ws/ui-control';
      return base.toString();
    } catch {
      /* fall through */
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/ui-control`;
}
