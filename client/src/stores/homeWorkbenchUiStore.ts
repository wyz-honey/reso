import { create } from 'zustand';

type AnglePreset = unknown;

type State = {
  modeModalOpen: boolean;
  cliParamsModalOpen: boolean;
  newModeName: string;
  newModeKind: string;
  newHttpUrl: string;
  newHttpProtocol: string;
  newXiaoaiTemplate: string;
  newCliAngleSlotsPreset: AnglePreset | null;
  setModeModalOpen: (v: boolean) => void;
  setCliParamsModalOpen: (v: boolean) => void;
  setNewModeName: (v: string) => void;
  setNewModeKind: (v: string) => void;
  setNewHttpUrl: (v: string) => void;
  setNewHttpProtocol: (v: string) => void;
  setNewXiaoaiTemplate: (v: string) => void;
  setNewCliAngleSlotsPreset: (
    v: AnglePreset | null | ((prev: AnglePreset | null) => AnglePreset | null)
  ) => void;
  /** WorkModeSelect「添加自定义」入口 */
  openAddCustomModeModal: () => void;
};

export const useHomeWorkbenchUiStore = create<State>((set) => ({
  modeModalOpen: false,
  cliParamsModalOpen: false,
  newModeName: '',
  newModeKind: 'http',
  newHttpUrl: '',
  newHttpProtocol: 'openai_chat',
  newXiaoaiTemplate: '',
  newCliAngleSlotsPreset: null,
  setModeModalOpen: (v) => set({ modeModalOpen: v }),
  setCliParamsModalOpen: (v) => set({ cliParamsModalOpen: v }),
  setNewModeName: (v) => set({ newModeName: v }),
  setNewModeKind: (v) => set({ newModeKind: v }),
  setNewHttpUrl: (v) => set({ newHttpUrl: v }),
  setNewHttpProtocol: (v) => set({ newHttpProtocol: v }),
  setNewXiaoaiTemplate: (v) => set({ newXiaoaiTemplate: v }),
  setNewCliAngleSlotsPreset: (v) =>
    set((s) => ({
      newCliAngleSlotsPreset: typeof v === 'function' ? (v as (p: AnglePreset | null) => AnglePreset | null)(s.newCliAngleSlotsPreset) : v,
    })),
  openAddCustomModeModal: () =>
    set({ newModeKind: 'http', newCliAngleSlotsPreset: null, modeModalOpen: true }),
}));
