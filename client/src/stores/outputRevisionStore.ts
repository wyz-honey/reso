import { create } from 'zustand';

/** 与 outputCatalog / workModes 联动：localStorage 变更后 bump 以触发依赖组件刷新 */
export const useOutputRevisionStore = create<{
  revision: number;
  bumpOutputs: () => void;
}>((set) => ({
  revision: 0,
  bumpOutputs: () => set((s) => ({ revision: s.revision + 1 })),
}));
