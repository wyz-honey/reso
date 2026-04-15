import { create } from 'zustand';

const SIDEBAR_COLLAPSED_KEY = 'reso_sidebar_collapsed_v1';

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

type State = {
  navCollapsed: boolean;
  setNavCollapsed: (v: boolean | ((c: boolean) => boolean)) => void;
};

export const useAppShellStore = create<State>((set) => ({
  navCollapsed: loadSidebarCollapsed(),
  setNavCollapsed: (v) =>
    set((s) => ({
      navCollapsed: typeof v === 'function' ? (v as (c: boolean) => boolean)(s.navCollapsed) : v,
    })),
}));

export function persistNavCollapsed(navCollapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, navCollapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}
