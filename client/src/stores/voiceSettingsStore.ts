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

/** 句末语气词（与句首同类），前可带轻读停顿标点 */
const ORAL_TRAIL_SYLLABLES_RE =
  /(?:[，,、\s\u3000。！？.!?])*(?:嗯+|啊+|呃+|额+|欸+|诶+)(?:[。！？.!?\s\u3000]*)?$/u;

function stripInvisibleChars(text: string): string {
  return text.replace(/[\u200b-\u200d\ufeff\u2060\u00ad]/g, '');
}

/** 折叠识别结果里重复的句读、去掉零宽字符等，不改动正常单次标点 */
function stripMiddleNoisePunctuation(text: string): string {
  let s = text;
  s = s.replace(/(?:。){2,}/g, '。');
  s = s.replace(/(?:，){2,}/g, '，');
  s = s.replace(/(?:、){2,}/g, '、');
  s = s.replace(/(?:…){2,}/g, '…');
  s = s.replace(/\.{3,}/g, '.');
  s = s.replace(/(?:[,]){3,}/g, ',');
  s = s.replace(/\u00b7{2,}/g, '\u00b7');
  return s;
}

/**
 * 合并相邻的句号类符号（含全角/半角混用、中间夹空白），避免「。。。」「。 。」等
 */
function normalizeAsrPeriodClusters(text: string): string {
  let s = text;
  s = s.replace(/[。．]{2,}/g, '。');
  s = s.replace(/(?:[。．](?:\s|\u3000)*){2,}/g, '。');
  s = s.replace(/([。．])\s+(?=[。．])/g, '$1');
  return s;
}

/** 去掉首尾常见单字语气词（与「过滤语气词」互补，在客户端再清一层） */
function stripDefaultOralFillerEdges(text: string): string {
  let s = text;
  for (let i = 0; i < 24; i++) {
    const before = s;
    s = s.replace(ORAL_LEAD_SYLLABLES_RE, '').replace(ORAL_TRAIL_SYLLABLES_RE, '').trim();
    if (s === before) break;
  }
  return s;
}

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

/** 识别结果段首不应出现句号/叹问号（模型或拼接 glitch） */
function stripLeadingSentencePunctuation(text: string): string {
  return text.replace(/^[。．.！!？?…\s\u3000]+/u, '');
}

/**
 * 口语识别里常出现「每个短分句都给句号」：
 * 例：我们。现在。开始。=> 我们，现在，开始。
 * 仅在「句号两侧都是中文且前一段较短」时柔化为逗号，降低误伤完整书面句。
 */
function softenOralPeriodOveruse(text: string): string {
  return text.replace(/([\u4e00-\u9fff]{1,10})[。．.](?=[\u4e00-\u9fff])/gu, '$1，');
}

export function normalizeTranscriptText(raw: string, v: VoiceSettings): string {
  let t = String(raw ?? '');
  t = stripInvisibleChars(t);
  t = stripMiddleNoisePunctuation(t);
  t = normalizeAsrPeriodClusters(t);
  t = softenOralPeriodOveruse(t);
  t = stripDefaultOralFillerEdges(t);
  if (v.oralStripEnabled) {
    const phrases = oralStripPhrasesFromText(v.oralStripPhrasesText);
    if (phrases.length) t = stripOralEdges(t, phrases);
    else t = stripOralEdges(t, []);
  }
  t = normalizeAsrPeriodClusters(t);
  t = softenOralPeriodOveruse(t);
  t = stripLeadingSentencePunctuation(t);
  return t.replace(/\s{2,}/g, ' ').trim();
}

/**
 * 将新识别片段拼入正文前：去掉「段首孤儿句号」、以及与上一段末尾重复的句号（避免 。。）
 */
const LEAD_SENT_PUNCT_RE = /^[。．.！!？?…\s\u3000]+/u;

export function dedupeTranscriptJoin(prev: string, piece: string): string {
  const p = String(piece ?? '');
  const prevTrim = String(prev ?? '').replace(/\s+$/u, '');
  if (!prevTrim) {
    return p.replace(LEAD_SENT_PUNCT_RE, '').trimStart();
  }
  let out = p;
  const tr = out.trimStart();
  if (!tr) return p;
  if (/[。！？….!?…]\s*$/.test(prevTrim) && /^[。．.]/.test(tr)) {
    out = out.replace(/^[。．.\s\u3000]+/u, '').trimStart();
  } else if (/[。！？….!?…]\s*$/.test(prevTrim) && /^[！!？?]/.test(out.trimStart())) {
    out = out.replace(/^[！!？?\s\u3000]+/u, '').trimStart();
  } else if (
    prevTrim &&
    !/[。！？….!?…，,、]\s*$/u.test(prevTrim) &&
    /^[。．.](?:[\s\u3000]*)(?=[\u4e00-\u9fff])/u.test(out.trimStart())
  ) {
    /** 上一段未停句却新出「。+汉字」多为误加句号 */
    out = out.replace(/^[。．.\s\u3000]+/u, '').trimStart();
  }
  return out;
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

/** 将服务端 `voice_settings` JSON 解析为当前客户端形态（未知字段按默认处理） */
export function parseVoiceSettingsFromServer(raw: unknown): VoiceSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalizeState({});
  return normalizeState(raw as Partial<VoiceSettings> & Record<string, unknown>);
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
