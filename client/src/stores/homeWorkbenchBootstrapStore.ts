// @ts-nocheck
import { create } from 'zustand';

export const useHomeWorkbenchBootstrapStore = create((set) => ({
  quickInputs: [] as unknown[],
  setQuickInputs: (quickInputs: unknown[]) => set({ quickInputs }),

  serverWorkspaceFallback: undefined as string | undefined,
  setServerWorkspaceFallback: (serverWorkspaceFallback: string | undefined) =>
    set({ serverWorkspaceFallback }),

  workspacePickSessions: [] as unknown[],
  setWorkspacePickSessions: (workspacePickSessions: unknown[]) => set({ workspacePickSessions }),

  workspacePickLoading: false,
  setWorkspacePickLoading: (workspacePickLoading: boolean) => set({ workspacePickLoading }),

  workspacePickErr: '',
  setWorkspacePickErr: (workspacePickErr: string) => set({ workspacePickErr }),
}));
