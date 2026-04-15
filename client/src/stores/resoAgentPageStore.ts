import { create } from 'zustand';
import {
  parseOutputVoiceControl,
  type OutputVoiceControl,
} from '../outputVoiceControl';

function upd<T>(prev: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

type State = {
  msg: string;
  setMsg: (v: string) => void;
  err: string;
  setErr: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  requestUrl: string;
  setRequestUrl: (v: string) => void;
  outputShape: string;
  setOutputShape: (v: string) => void;
  systemPrompt: string;
  setSystemPrompt: (v: string) => void;
  resoProviderId: string;
  setResoProviderId: (v: string) => void;
  resoChatModelId: string;
  setResoChatModelId: (v: string) => void;
  voiceControl: OutputVoiceControl;
  setVoiceControl: (v: OutputVoiceControl | ((p: OutputVoiceControl) => OutputVoiceControl)) => void;
  targetEnv: Record<string, string>;
  setTargetEnv: (v: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) => void;
};

export const useResoAgentPageStore = create<State>((set) => ({
  msg: '',
  setMsg: (msg) => set({ msg }),
  err: '',
  setErr: (err) => set({ err }),
  name: '',
  setName: (name) => set({ name }),
  description: '',
  setDescription: (description) => set({ description }),
  requestUrl: '',
  setRequestUrl: (requestUrl) => set({ requestUrl }),
  outputShape: '',
  setOutputShape: (outputShape) => set({ outputShape }),
  systemPrompt: '',
  setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
  resoProviderId: '',
  setResoProviderId: (resoProviderId) => set({ resoProviderId }),
  resoChatModelId: '',
  setResoChatModelId: (resoChatModelId) => set({ resoChatModelId }),
  voiceControl: parseOutputVoiceControl(undefined, 'agent_chat'),
  setVoiceControl: (voiceControl) =>
    set((s) => ({
      voiceControl: upd(s.voiceControl, voiceControl),
    })),
  targetEnv: {},
  setTargetEnv: (targetEnv) =>
    set((s) => ({
      targetEnv: upd(s.targetEnv, targetEnv),
    })),
}));
