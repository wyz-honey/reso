import { create } from 'zustand';
import { getAllModes, loadActiveModeId } from '../workModes';

export type WorkbenchMode = ReturnType<typeof getAllModes>[number];

function resolveInitialActiveId(modes: ReturnType<typeof getAllModes>): string {
  const id = loadActiveModeId();
  return modes.some((m) => String(m.id) === id) ? id : String(modes[0]?.id ?? '');
}

type ModesList = ReturnType<typeof getAllModes>;

type State = {
  modes: ModesList;
  activeModeId: string;
  setModes: (next: ModesList | ((prev: ModesList) => ModesList)) => void;
  setActiveModeId: (next: string | ((cur: string) => string)) => void;
  /** Re-read modes from catalog (outputs / localStorage) and fix active id if missing */
  refreshModesFromCatalog: () => void;
};

export const useHomeWorkbenchModesStore = create<State>((set, get) => ({
  modes: getAllModes(),
  activeModeId: resolveInitialActiveId(getAllModes()),
  setModes: (updater) =>
    set((s) => ({
      modes: typeof updater === 'function' ? (updater as (p: ModesList) => ModesList)(s.modes) : updater,
    })),
  setActiveModeId: (updater) =>
    set((s) => ({
      activeModeId:
        typeof updater === 'function' ? (updater as (c: string) => string)(s.activeModeId) : updater,
    })),
  refreshModesFromCatalog: () => {
    const next = getAllModes();
    const { activeModeId: cur } = get();
    set({
      modes: next,
      activeModeId: next.some((m) => String(m.id) === cur) ? cur : String(next[0]?.id ?? ''),
    });
  },
}));
