// @ts-nocheck
import { create } from 'zustand';
import {
  CURSOR_CLI_DEFAULT_TEMPLATE,
  QODER_CLI_DEFAULT_TEMPLATE,
} from '../outputCatalog';
import {
  parseOutputVoiceControl,
  type OutputVoiceControl,
} from '../outputVoiceControl';
import { mergeTargetEnvLayers } from '../cliEnv';
import { mergeAngleSlotsWithDefaults } from '../cliSubstitute';

function upd<T>(prev: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

type Row = Record<string, unknown>;

export const useOutputDetailCursorStore = create((set, get) => ({
  name: '',
  description: '',
  commandTemplate: '',
  angleSlots: [] as unknown[],
  voiceControl: parseOutputVoiceControl(undefined, 'cursor_cli') as OutputVoiceControl,
  targetEnv: {} as Record<string, string>,
  msg: '',
  err: '',

  setName: (name: string) => set({ name }),
  setDescription: (description: string) => set({ description }),
  setCommandTemplate: (commandTemplate: string) => set({ commandTemplate }),
  setAngleSlots: (u: unknown[] | ((p: unknown[]) => unknown[])) =>
    set((s) => ({ angleSlots: upd(s.angleSlots, u) })),
  setVoiceControl: (u: OutputVoiceControl | ((p: OutputVoiceControl) => OutputVoiceControl)) =>
    set((s) => ({ voiceControl: upd(s.voiceControl, u) })),
  setTargetEnv: (u: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) =>
    set((s) => ({ targetEnv: upd(s.targetEnv, u) })),
  setMsg: (msg: string) => set({ msg }),
  setErr: (err: string) => set({ err }),

  hydrateFromRow: (row: Row) => {
    const ext =
      row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
        ? row.extensions
        : {};
    const defaultTmpl =
      row.deliveryType === 'qoder_cli' ? QODER_CLI_DEFAULT_TEMPLATE : CURSOR_CLI_DEFAULT_TEMPLATE;
    const initialTmpl =
      typeof ext.commandTemplate === 'string' && ext.commandTemplate.trim()
        ? ext.commandTemplate.trim()
        : defaultTmpl;
    const dt = row.deliveryType === 'qoder_cli' ? 'qoder_cli' : 'cursor_cli';
    set({
      name: row.name || '',
      description: row.description || '',
      commandTemplate: initialTmpl,
      angleSlots: mergeAngleSlotsWithDefaults(
        initialTmpl,
        Array.isArray(ext.angleSlots) ? ext.angleSlots : []
      ),
      voiceControl: parseOutputVoiceControl(ext.voiceControl, dt),
      targetEnv: mergeTargetEnvLayers(ext.cliEnv, ext.environment, row.environment),
      msg: '',
      err: '',
    });
  },

  onTemplateChange: (t: string) => {
    const s = get();
    set({
      commandTemplate: t,
      angleSlots: mergeAngleSlotsWithDefaults(t, s.angleSlots),
    });
  },
}));
