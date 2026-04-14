/**
 * 各目标的「识别结束策略」存于 output.extensions.voiceControl（与系统设置中的 ASR 引擎参数分离）。
 */
import { END_MODES, type EndMode } from './stores/voiceSettingsStore';

export type OutputVoiceControl = {
  endMode: EndMode;
  silenceSeconds: number;
  endPhrases: string[];
  stripEndPhrase: boolean;
  stopMicAfterAuto: boolean;
};

const DEFAULT_PHRASES = ['over', '结束', '完毕'];

/** 非 Agent 目标的代码级默认 */
export const OUTPUT_VOICE_DEFAULTS: OutputVoiceControl = {
  endMode: END_MODES.phrase,
  silenceSeconds: 5,
  endPhrases: [...DEFAULT_PHRASES],
  stripEndPhrase: true,
  stopMicAfterAuto: true,
};

/** RESO（agent_chat）未单独配置时的默认：短静音、不关麦 */
export const OUTPUT_VOICE_AGENT_DEFAULTS: OutputVoiceControl = {
  endMode: END_MODES.silence,
  silenceSeconds: 1.2,
  endPhrases: [...DEFAULT_PHRASES],
  stripEndPhrase: true,
  stopMicAfterAuto: false,
};

function normalizePhrases(list: unknown): string[] {
  if (!Array.isArray(list)) return [...DEFAULT_PHRASES];
  const out = list.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : [...DEFAULT_PHRASES];
}

function normalizeEndMode(raw: unknown): EndMode {
  const valid = new Set<string>(Object.values(END_MODES));
  if (typeof raw === 'string' && valid.has(raw)) return raw as EndMode;
  return OUTPUT_VOICE_DEFAULTS.endMode;
}

export function parseOutputVoiceControl(
  raw: unknown,
  deliveryType?: string
): OutputVoiceControl {
  const base =
    deliveryType === 'agent_chat' ? { ...OUTPUT_VOICE_AGENT_DEFAULTS } : { ...OUTPUT_VOICE_DEFAULTS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const silenceSeconds = Math.max(
    0.4,
    Math.min(60, Number(o.silenceSeconds ?? base.silenceSeconds) || base.silenceSeconds)
  );
  return {
    endMode: o.endMode != null ? normalizeEndMode(o.endMode) : base.endMode,
    silenceSeconds,
    endPhrases: o.endPhrases != null ? normalizePhrases(o.endPhrases) : base.endPhrases,
    stripEndPhrase:
      o.stripEndPhrase != null ? o.stripEndPhrase !== false : base.stripEndPhrase,
    stopMicAfterAuto:
      o.stopMicAfterAuto != null ? o.stopMicAfterAuto !== false : base.stopMicAfterAuto,
  };
}

export function serializeOutputVoiceControl(v: OutputVoiceControl): Record<string, unknown> {
  return {
    endMode: v.endMode,
    silenceSeconds: v.silenceSeconds,
    endPhrases: [...v.endPhrases],
    stripEndPhrase: v.stripEndPhrase,
    stopMicAfterAuto: v.stopMicAfterAuto,
  };
}

function joinPhrasesForHint(phrases: string[], max = 4): string {
  const p = (phrases || []).map((s) => String(s).trim()).filter(Boolean);
  if (!p.length) return 'over、结束';
  const head = p.slice(0, max);
  const tail = p.length > max ? '…' : '';
  return `${head.join('、')}${tail}`;
}

/** 工作台顶栏提示：与当前目标的 voiceControl 一致 */
export function formatOutputVoiceControlHint(v: OutputVoiceControl): string {
  if (v.endMode === END_MODES.manual) {
    return '仅手动点发送，不自动（见当前目标详情中的结束策略）';
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
  return '结束策略见当前目标配置';
}
