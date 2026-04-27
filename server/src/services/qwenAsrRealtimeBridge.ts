import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { DASHSCOPE_REALTIME_WS_BASE } from '~/config/constants.ts';

/** 与 Paraformer 桥 `connectDashScope` 相同的会话句柄，便于 WebSocket 层统一调度 */
export interface QwenAsrRealtimeSession {
  taskId: string;
  sendAudio(chunk: Buffer): void;
  finish(): void;
  close(): void;
}

export type QwenAsrRealtimeConnectOptions = {
  /** 主语种提示，如 zh / en */
  language?: string;
  /** 与 Paraformer max_sentence_silence 对齐：VAD 判停静音时长 ms，默认 400 */
  silenceDurationMs?: number;
};

type DownstreamPayload =
  | { type: 'ready' }
  | { type: 'transcript'; text: string; sentenceEnd: boolean }
  | { type: 'done' }
  | { type: 'error'; message: string };

function eventId(): string {
  return `event_${randomUUID().replace(/-/g, '')}`;
}

/** 空字符串不参与 ?? 合并；Realtime 的 delta 事件常在 `delta` 上给增量而 `text` 为空 */
function firstNonEmptyString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.length) return v;
  }
  return '';
}

function itemTranscriptionKey(msg: Record<string, unknown>): string {
  const id = msg.item_id;
  return typeof id === 'string' && id.trim() ? id.trim() : '_';
}

function pickErrorMessage(data: Record<string, unknown>): string {
  const err = data.error as Record<string, unknown> | undefined;
  const msg =
    (typeof err?.message === 'string' && err.message) ||
    (typeof data.message === 'string' && data.message) ||
    'upstream error';
  return msg;
}

/** 走百炼 OpenAI-Realtime 兼容 WS（/api-ws/v1/realtime）的 Qwen3 实时 ASR 模型 */
export function isQwenAsrRealtimeModel(model: string): boolean {
  return /^qwen3-asr-flash-realtime/i.test(model.trim());
}

/**
 * Qwen3 ASR Flash Realtime：session.update + input_audio_buffer.append（Server VAD），
 * 停止时 session.finish；对外仍使用与 Paraformer 桥相同的二进制 PCM 入站协议。
 */
export function connectQwenAsrRealtime(
  apiKey: string,
  model: string,
  emit: (msg: DownstreamPayload) => void,
  onUpstreamClose: () => void,
  opts?: QwenAsrRealtimeConnectOptions
): QwenAsrRealtimeSession {
  const taskId = randomUUID().replace(/-/g, '');
  const base = DASHSCOPE_REALTIME_WS_BASE.replace(/\/$/, '');
  const url = `${base}?model=${encodeURIComponent(model)}`;
  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  let sessionConfigured = false;
  const pendingAudio: Buffer[] = [];
  let finishRequested = false;
  let doneEmitted = false;
  /** 同一 item 上 delta 为增量，需累加后下发 partial，客户端才有「边听边出字」 */
  const partialTranscriptByItem = new Map<string, string>();

  const emitDoneOnce = () => {
    if (doneEmitted) return;
    doneEmitted = true;
    emit({ type: 'done' });
  };

  const flushPending = () => {
    while (pendingAudio.length && ws.readyState === WebSocket.OPEN) {
      const chunk = pendingAudio.shift();
      if (!chunk?.length) continue;
      ws.send(
        JSON.stringify({
          event_id: eventId(),
          type: 'input_audio_buffer.append',
          audio: chunk.toString('base64'),
        })
      );
    }
  };

  const sendSessionUpdate = () => {
    const lang = (opts?.language || 'zh').trim().toLowerCase() || 'zh';
    let silenceMs = typeof opts?.silenceDurationMs === 'number' ? Math.round(opts.silenceDurationMs) : 400;
    if (silenceMs < 200) silenceMs = 200;
    if (silenceMs > 6000) silenceMs = 6000;

    const session = {
      modalities: ['text'],
      input_audio_format: 'pcm',
      sample_rate: 16000,
      input_audio_transcription: {
        language: lang,
      },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.0,
        silence_duration_ms: silenceMs,
      },
    };

    ws.send(
      JSON.stringify({
        event_id: eventId(),
        type: 'session.update',
        session,
      })
    );
  };

  ws.on('open', () => {
    sendSessionUpdate();
  });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      return;
    }
    const typ = typeof msg.type === 'string' ? msg.type : '';

    if (typ === 'session.updated') {
      if (!sessionConfigured) {
        sessionConfigured = true;
        emit({ type: 'ready' });
        flushPending();
      }
      return;
    }

    if (typ === 'error') {
      emit({ type: 'error', message: pickErrorMessage(msg) });
      return;
    }

    if (typ === 'conversation.item.input_audio_transcription.delta') {
      const key = itemTranscriptionKey(msg);
      const chunk = firstNonEmptyString(msg.delta, msg.text, msg.transcript);
      if (!chunk) return;
      const prev = partialTranscriptByItem.get(key) ?? '';
      const next = prev + chunk;
      partialTranscriptByItem.set(key, next);
      emit({ type: 'transcript', text: next, sentenceEnd: false });
      return;
    }

    if (typ === 'conversation.item.input_audio_transcription.text') {
      const key = itemTranscriptionKey(msg);
      const t = firstNonEmptyString(msg.text, msg.transcript, msg.delta);
      if (!t) return;
      const prev = partialTranscriptByItem.get(key) ?? '';
      let next = t;
      if (prev && !t.startsWith(prev)) {
        if (t.length < prev.length && prev.startsWith(t)) {
          next = t;
        } else if (!prev.startsWith(t)) {
          next = prev + t;
        }
      }
      partialTranscriptByItem.set(key, next);
      emit({ type: 'transcript', text: next, sentenceEnd: false });
      return;
    }

    if (typ === 'conversation.item.input_audio_transcription.completed') {
      const key = itemTranscriptionKey(msg);
      const text = firstNonEmptyString(msg.transcript, msg.text, msg.delta);
      partialTranscriptByItem.delete(key);
      if (text) emit({ type: 'transcript', text, sentenceEnd: true });
      return;
    }

    if (typ === 'session.finished') {
      const text = firstNonEmptyString(msg.transcript, msg.text, msg.delta);
      partialTranscriptByItem.clear();
      if (text.trim()) {
        emit({ type: 'transcript', text: text.trim(), sentenceEnd: true });
      }
      emitDoneOnce();
      if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'session finished');
      return;
    }
  });

  ws.on('close', () => {
    if (finishRequested && !doneEmitted) {
      emitDoneOnce();
    }
    onUpstreamClose();
  });

  ws.on('error', () => {
    emit({ type: 'error', message: 'Qwen ASR Realtime WebSocket 错误' });
  });

  return {
    taskId,
    sendAudio(chunk: Buffer) {
      if (!chunk.length) return;
      if (sessionConfigured && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            event_id: eventId(),
            type: 'input_audio_buffer.append',
            audio: chunk.toString('base64'),
          })
        );
      } else {
        pendingAudio.push(chunk);
      }
    },
    finish() {
      finishRequested = true;
      if (ws.readyState !== WebSocket.OPEN) {
        emitDoneOnce();
        return;
      }
      if (!sessionConfigured) {
        pendingAudio.length = 0;
      }
      ws.send(
        JSON.stringify({
          event_id: eventId(),
          type: 'session.finish',
        })
      );
    },
    close() {
      pendingAudio.length = 0;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
}
