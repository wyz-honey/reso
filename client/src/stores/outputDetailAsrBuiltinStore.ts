// @ts-nocheck
import { create } from 'zustand';
import { parseOutputVoiceControl, type OutputVoiceControl } from '../outputVoiceControl';

type Row = Record<string, unknown>;

export const useOutputDetailAsrBuiltinStore = create((set) => ({
  voiceControl: parseOutputVoiceControl(undefined, 'paragraph_clipboard') as OutputVoiceControl,
  setVoiceControl: (voiceControl: OutputVoiceControl) => set({ voiceControl }),
  msg: '',
  setMsg: (msg: string) => set({ msg }),

  hydrateFromRow: (row: Row) => {
    const ext =
      row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
        ? row.extensions
        : {};
    set({
      voiceControl: parseOutputVoiceControl(ext.voiceControl, 'paragraph_clipboard'),
      msg: '',
    });
  },
}));
