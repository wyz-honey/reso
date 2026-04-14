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

const ASR_LANG_ALLOWED = new Set(['zh', 'en', 'ja', 'yue', 'ko', 'de', 'fr', 'ru']);

/** 仅含与「系统设置」相关的项；识别结束策略在各目标中配置 */
const DEFAULTS = {
  agentModel: '',
  dashscopeApiKey: '',
  asrDisfluencyRemoval: true,
  asrLanguageHintsText: 'zh',
  oralStripEnabled: false,
  oralStripPhrasesText: '',
};

export type VoiceSettings = typeof DEFAULTS;

function parseAsrLanguageHintsText(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULTS.asrLanguageHintsText;
  return raw.trim();
}

function parseOralStripPhrasesText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw;
}

/** 解析为百炼允许的 language_hints；非法码丢弃 */
export function getAsrLanguageHintsArray(hintsText: string): string[] {
  const parts = String(hintsText || '')
    .split(/[\s,，、]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (ASR_LANG_ALLOWED.has(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

const ORAL_LEAD_SYLLABLES_RE = /^(嗯+|啊+|呃+|额+|欸+|诶+)[，,、\s\u3000]*/u;

function oralStripPhrasesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function stripOralEdges(text: string, phrases: string[]): string {
  let t = text;
  let guard = 0;
  while (guard++ < 40) {
    let hit = false;
    const tr = t.trimStart();
    for (const p of phrases) {
      if (!p) continue;
      if (tr.startsWith(p)) {
        t = tr.slice(p.length).replace(/^[，,、；;：:\s\u3000]+/, '');
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  guard = 0;
  while (guard++ < 40) {
    let hit = false;
    const tr = t.trimEnd();
    for (const p of phrases) {
      if (!p || p.length < 2) continue;
      if (tr.endsWith(p)) {
        t = tr.slice(0, -p.length).replace(/[，,、；;：:\s\u3000]+$/u, '');
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  return t.trim();
}

export function normalizeTranscriptText(raw: string, v: VoiceSettings): string {
  let t = String(raw ?? '');
  if (!v.oralStripEnabled) return t;
  t = t.replace(ORAL_LEAD_SYLLABLES_RE, '');
  const phrases = oralStripPhrasesFromText(v.oralStripPhrasesText);
  if (phrases.length) t = stripOralEdges(t, phrases);
  else t = stripOralEdges(t, []);
  return t.replace(/\s{2,}/g, ' ').trim();
}

function normalizeState(partial: Partial<VoiceSettings> & Record<string, unknown>): VoiceSettings {
  const o = partial;
  return {
    agentModel: typeof o.agentModel === 'string' ? o.agentModel.trim() : '',
    dashscopeApiKey: typeof o.dashscopeApiKey === 'string' ? o.dashscopeApiKey.trim() : '',
    asrDisfluencyRemoval: o.asrDisfluencyRemoval !== false,
    asrLanguageHintsText: parseAsrLanguageHintsText(o.asrLanguageHintsText),
    oralStripEnabled: o.oralStripEnabled === true,
    oralStripPhrasesText: parseOralStripPhrasesText(o.oralStripPhrasesText),
  };
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
        const next = normalizeState({ ...cur, ...patch });
        set(next);
        try {
          window.dispatchEvent(new CustomEvent('reso-settings-changed'));
        } catch {
          /* ignore */
        }
        return getVoiceSettings();
      },
    }),
    {
      name: KEY,
      partialize: (s) => ({
        agentModel: s.agentModel,
        dashscopeApiKey: s.dashscopeApiKey,
        asrDisfluencyRemoval: s.asrDisfluencyRemoval,
        asrLanguageHintsText: s.asrLanguageHintsText,
        oralStripEnabled: s.oralStripEnabled,
        oralStripPhrasesText: s.oralStripPhrasesText,
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
