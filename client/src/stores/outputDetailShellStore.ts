import { create } from 'zustand';

type State = {
  tick: number;
  setTick: (v: number | ((p: number) => number)) => void;
};

function upd<T>(prev: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

export const useOutputDetailShellStore = create<State>((set) => ({
  tick: 0,
  setTick: (tick) => set((s) => ({ tick: upd(s.tick, tick) })),
}));
