import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const END_MODES = {
  manual: 'manual',
  silence: 'silence',
  phrase: 'phrase',
  both: 'both',
} as const;

export type EndMode = (typeof END_MODES)[keyof typeof END_MODES];

export const AGENT_VOICE_SILENCE_SEC = 1.2;

export const BAILIAN_CHAT_MODEL_OPTIONS = [
  { value: '', label: '默认（服务端 .env 的 DASHSCOPE_CHAT_MODEL）' },
  { value: 'qwen-plus', label: 'qwen-plus' },
  { value: 'qwen-turbo', label: 'qwen-turbo' },
  { value: 'qwen-max', label: 'qwen-max' },
  { value: 'qwen-long', label: 'qwen-long' },
  { value: 'qwen-vl-plus', label: 'qwen-vl-plus' },
  { value: 'qwen2.5-7b-instruct', label: 'qwen2.5-7b-instruct' },
  { value: 'qwen2.5-14b-instruct', label: 'qwen2.5-14b-instruct' },
  { value: 'qwen2.5-32b-instruct', label: 'qwen2.5-32b-instruct' },
  { value: 'qwen2.5-72b-instruct', label: 'qwen2.5-72b-instruct' },
] as const;

export const CUSTOM_CHAT_MODEL_VALUE = '__custom__';

const PRESET_MODEL_SET = new Set<string>(
  BAILIAN_CHAT_MODEL_OPTIONS.map((o) => o.value as string)
);

export function splitAgentModelForUi(saved: string | undefined) {
  const m = typeof saved === 'string' ? saved.trim() : '';
  if (!m) return { select: '', custom: '' };
  if (PRESET_MODEL_SET.has(m)) return { select: m, custom: '' };
  return { select: CUSTOM_CHAT_MODEL_VALUE, custom: m };
}

const KEY = 'reso_voice_settings_v1';

const DEFAULTS = {
  endMode: END_MODES.phrase as EndMode,
  silenceSeconds: 5,
  endPhrases: ['over', '结束', '完毕'],
  stripEndPhrase: true,
  stopMicAfterAuto: true,
  agentModel: '',
  dashscopeApiKey: '',
};

export type VoiceSettings = typeof DEFAULTS & { endPhrases: string[]; endMode: EndMode };

function normalizePhrases(list: unknown): string[] {
  if (!Array.isArray(list)) return [...DEFAULTS.endPhrases];
  const out = list.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : [...DEFAULTS.endPhrases];
}

function normalizeState(partial: Partial<VoiceSettings>): VoiceSettings {
  const o = partial;
  const silenceSeconds = Math.max(
    1,
    Math.min(60, Number(o.silenceSeconds ?? DEFAULTS.silenceSeconds) || DEFAULTS.silenceSeconds)
  );
  const validModes = new Set(Object.values(END_MODES));
  let endMode: EndMode = validModes.has(o.endMode as EndMode)
    ? (o.endMode as EndMode)
    : DEFAULTS.endMode;
  if (o.endMode != null && !validModes.has(o.endMode as EndMode) && typeof o.endMode === 'string') {
    const lower = o.endMode.toLowerCase();
    if (lower === 'phrase' || lower === '结束词') endMode = END_MODES.phrase;
    else if (lower === 'silence' || lower === '静音') endMode = END_MODES.silence;
    else if (lower === 'both') endMode = END_MODES.both;
    else if (lower === 'manual' || lower === '手动') endMode = END_MODES.manual;
  }
  return {
    ...DEFAULTS,
    ...o,
    endMode,
    silenceSeconds,
    endPhrases: normalizePhrases(o.endPhrases),
    stripEndPhrase: o.stripEndPhrase !== false,
    stopMicAfterAuto: o.stopMicAfterAuto !== false,
    agentModel: typeof o.agentModel === 'string' ? o.agentModel.trim() : '',
    dashscopeApiKey: typeof o.dashscopeApiKey === 'string' ? o.dashscopeApiKey.trim() : '',
  };
}

function joinPhrasesForHint(phrases: string[], max = 4): string {
  const p = (phrases || []).map((s) => String(s).trim()).filter(Boolean);
  if (!p.length) return 'over、结束';
  const head = p.slice(0, max);
  const tail = p.length > max ? '…' : '';
  return `${head.join('、')}${tail}`;
}

type VoiceStore = VoiceSettings & {
  saveVoiceSettings: (patch: Partial<VoiceSettings>) => VoiceSettings;
};

export const useVoiceSettingsStore = create<VoiceStore>()(
  persist(
    (set, get) => ({
      ...normalizeState({}),
      saveVoiceSettings: (patch) => {
        const cur = get();
        const next = normalizeState({
          ...cur,
          ...patch,
          endPhrases: patch.endPhrases != null ? normalizePhrases(patch.endPhrases) : cur.endPhrases,
          silenceSeconds:
            patch.silenceSeconds != null
              ? Math.max(1, Math.min(60, Number(patch.silenceSeconds) || cur.silenceSeconds))
              : cur.silenceSeconds,
          agentModel:
            patch.agentModel != null ? String(patch.agentModel).trim() : cur.agentModel,
          dashscopeApiKey:
            patch.dashscopeApiKey != null
              ? String(patch.dashscopeApiKey).trim()
              : cur.dashscopeApiKey,
        });
        set(next);
        try {
          window.dispatchEvent(new CustomEvent('reso-settings-changed'));
        } catch {
          /* ignore */
        }
        return next;
      },
    }),
    {
      name: KEY,
      partialize: (s) => ({
        endMode: s.endMode,
        silenceSeconds: s.silenceSeconds,
        endPhrases: s.endPhrases,
        stripEndPhrase: s.stripEndPhrase,
        stopMicAfterAuto: s.stopMicAfterAuto,
        agentModel: s.agentModel,
        dashscopeApiKey: s.dashscopeApiKey,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeState((persisted as Partial<VoiceSettings>) || {}),
      }),
    }
  )
);

export function getVoiceSettings(): VoiceSettings {
  return normalizeState(useVoiceSettingsStore.getState());
}

export function saveVoiceSettings(patch: Partial<VoiceSettings>): VoiceSettings {
  return useVoiceSettingsStore.getState().saveVoiceSettings(patch);
}

export function getVoiceControlSummary(isAgentMode: boolean): string {
  if (isAgentMode) {
    return `约 ${AGENT_VOICE_SILENCE_SEC} 秒无新识别后自动发送，保持聆听`;
  }
  const v = getVoiceSettings();
  if (v.endMode === END_MODES.manual) {
    return '仅手动点发送，不自动';
  }
  if (v.endMode === END_MODES.silence) {
    return `静音约 ${v.silenceSeconds} 秒后自动发送`;
  }
  if (v.endMode === END_MODES.phrase) {
    return `说 ${joinPhrasesForHint(v.endPhrases)} 等结束后自动发送`;
  }
  if (v.endMode === END_MODES.both) {
    return `说 ${joinPhrasesForHint(v.endPhrases)} 或静音 ${v.silenceSeconds}s 后自动发送`;
  }
  return '结束策略见设置';
}

export function stripTrailingPunctuation(text: string): string {
  return String(text).replace(/[。！？!?.，,、\s\u3000]+$/gu, '').trim();
}

export function matchesEndPhrase(text: string, phrases: string[]): boolean {
  const n = stripTrailingPunctuation(text).toLowerCase();
  if (!n) return false;
  for (const raw of phrases) {
    const p = String(raw).trim().toLowerCase();
    if (!p) continue;
    if (n === p) return true;
    if (n.endsWith(p)) {
      if (n.length === p.length) return true;
      const boundary = n[n.length - p.length - 1];
      if (/[\s\u3000。，、；：,.!?]/.test(boundary)) return true;
    }
  }
  return false;
}

export function stripMatchedPhrase(text: string, phrases: string[]): string {
  const s0 = String(text).trim();
  const base = stripTrailingPunctuation(s0);
  const bl = base.toLowerCase();
  for (const raw of phrases) {
    const p = String(raw).trim();
    if (!p) continue;
    const pl = p.toLowerCase();
    if (!bl.endsWith(pl)) continue;
    if (bl.length > pl.length) {
      const c = bl[bl.length - pl.length - 1];
      if (!/[\s\u3000。，、；：,.!?]/.test(c)) continue;
    }
    const idx = base.length - p.length;
    return base.slice(0, idx).replace(/[\s\u3000。，、]+$/u, '').trim();
  }
  return base;
}
