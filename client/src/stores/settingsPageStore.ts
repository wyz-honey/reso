import { create } from 'zustand';
import { getVoiceSettings } from './voiceSettingsStore';

const vs = getVoiceSettings();

type State = {
  asrDisfluencyRemoval: boolean;
  setAsrDisfluencyRemoval: (v: boolean) => void;
  asrLanguageHintsText: string;
  setAsrLanguageHintsText: (v: string) => void;
  oralStripEnabled: boolean;
  setOralStripEnabled: (v: boolean) => void;
  oralStripPhrasesText: string;
  setOralStripPhrasesText: (v: string) => void;
  savedFlash: boolean;
  setSavedFlash: (v: boolean) => void;
};

export const useSettingsPageStore = create<State>((set) => ({
  asrDisfluencyRemoval: vs.asrDisfluencyRemoval,
  setAsrDisfluencyRemoval: (asrDisfluencyRemoval) => set({ asrDisfluencyRemoval }),
  asrLanguageHintsText: vs.asrLanguageHintsText,
  setAsrLanguageHintsText: (asrLanguageHintsText) => set({ asrLanguageHintsText }),
  oralStripEnabled: vs.oralStripEnabled,
  setOralStripEnabled: (oralStripEnabled) => set({ oralStripEnabled }),
  oralStripPhrasesText: vs.oralStripPhrasesText,
  setOralStripPhrasesText: (oralStripPhrasesText) => set({ oralStripPhrasesText }),
  savedFlash: false,
  setSavedFlash: (savedFlash) => set({ savedFlash }),
}));
