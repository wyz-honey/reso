import { create } from 'zustand';
import type { ModelCategory } from './modelProvidersStore';
import { MODEL_CATEGORIES } from './modelProvidersStore';

function upd<T>(prev: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

type NewModel = {
  category: ModelCategory;
  apiModelId: string;
  label: string;
};

type State = {
  tick: number;
  setTick: (v: number | ((p: number) => number)) => void;
  msg: string;
  setMsg: (v: string) => void;
  newModel: NewModel;
  setNewModel: (v: NewModel | ((p: NewModel) => NewModel)) => void;
};

export const useModelProvidersPageUiStore = create<State>((set) => ({
  tick: 0,
  setTick: (tick) => set((s) => ({ tick: upd(s.tick, tick) })),
  msg: '',
  setMsg: (msg) => set({ msg }),
  newModel: {
    category: MODEL_CATEGORIES.chat,
    apiModelId: '',
    label: '',
  },
  setNewModel: (newModel) =>
    set((s) => ({
      newModel: upd(s.newModel, newModel),
    })),
}));
