import { create } from 'zustand';

type GuardHandlers = {
  shouldBlock: () => boolean;
  onLeaveConfirmed: () => void;
};

type State = GuardHandlers & {
  pendingPath: string | null;
  register: (handlers: GuardHandlers) => void;
  unregister: () => void;
  requestNavigate: (path: string) => void;
  clearPending: () => void;
};

const idleHandlers: GuardHandlers = {
  shouldBlock: () => false,
  onLeaveConfirmed: () => {},
};

export const useWorkbenchNavigationGuardStore = create<State>((set) => ({
  ...idleHandlers,
  pendingPath: null,
  register: (handlers) => set({ ...handlers }),
  unregister: () => set({ ...idleHandlers, pendingPath: null }),
  requestNavigate: (path) => set({ pendingPath: path }),
  clearPending: () => set({ pendingPath: null }),
}));
