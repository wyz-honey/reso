import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import {
  ASR_MODEL_ID_RE,
  DASHSCOPE_URL,
  DEFAULT_ASR_MODEL,
} from '~/config/constants.ts';

export function resolveAsrModel(override: unknown): string {
  if (typeof override === 'string' && override.trim()) {
    const m = override.trim();
    if (ASR_MODEL_ID_RE.test(m)) return m;
  }
  return DEFAULT_ASR_MODEL;
}

function makeTaskId(): string {
  return randomUUID().replace(/-/g, '');
}

export interface DashScopeAsrSession {
  taskId: string;
  sendAudio(chunk: Buffer): void;
  finish(): void;
  close(): void;
}

/** 与百炼 Paraformer 实时识别 WebSocket 文档一致 */
export type AsrConnectOptions = {
  /** 过滤「嗯、啊」等语气词；默认 true */
  disfluencyRemovalEnabled?: boolean;
  /** 如 `['zh']` 提升中文场景准确率；空数组表示不传（模型自动语种） */
  languageHints?: string[];
  /** VAD 断句静音阈值 ms，范围 200–6000，默认由服务端决定 */
  maxSentenceSilenceMs?: number;
  /**
   * Paraformer v2+：长连接下持续发静音时保持任务不超时断开（百炼文档 heartbeat）。
   * 默认 true；设为 false 可关闭。
   */
  heartbeatEnabled?: boolean;
};

function buildAsrParameters(opts?: AsrConnectOptions, modelId?: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    format: 'pcm',
    sample_rate: 16000,
  };
  base.disfluency_removal_enabled = opts?.disfluencyRemovalEnabled !== false;
  const hints = opts?.languageHints?.map((s) => String(s).trim().toLowerCase()).filter(Boolean) ?? [];
  if (hints.length > 0) {
    base.language_hints = hints;
  }
  const ms = opts?.maxSentenceSilenceMs;
  if (typeof ms === 'number' && ms >= 200 && ms <= 6000) {
    base.max_sentence_silence = Math.round(ms);
  }
  const mid = String(modelId || '');
  if (opts?.heartbeatEnabled !== false && /v2/i.test(mid)) {
    base.heartbeat = true;
  }
  return base;
}

export function connectDashScope(
  apiKey: string,
  asrModelOverride: string,
  onUpstreamMessage: (msg: Record<string, unknown>) => void,
  onUpstreamClose: () => void,
  asrOptions?: AsrConnectOptions
): DashScopeAsrSession {
  const taskId = makeTaskId();
  const dash = new WebSocket(DASHSCOPE_URL, {
    headers: { Authorization: `bearer ${apiKey}` },
  });
  const model = resolveAsrModel(asrModelOverride);

  const runTask = {
    header: {
      action: 'run-task',
      task_id: taskId,
      streaming: 'duplex',
    },
    payload: {
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model,
      parameters: buildAsrParameters(asrOptions, model),
      input: {},
    },
  };

  let taskStarted = false;
  const pendingAudio: Buffer[] = [];

  dash.on('open', () => {
    dash.send(JSON.stringify(runTask));
  });

  dash.on('message', (data, isBinary) => {
    if (isBinary) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      return;
    }
    const header = msg.header as { event?: string } | undefined;
    const event = header?.event;
    if (event === 'task-started') {
      taskStarted = true;
      while (pendingAudio.length) {
        const chunk = pendingAudio.shift();
        if (chunk && dash.readyState === WebSocket.OPEN) dash.send(chunk);
      }
    }
    onUpstreamMessage(msg);
  });

  dash.on('close', () => onUpstreamClose());
  dash.on('error', () => {});

  return {
    taskId,
    sendAudio(chunk: Buffer) {
      if (taskStarted && dash.readyState === WebSocket.OPEN) {
        dash.send(chunk);
      } else {
        pendingAudio.push(chunk);
      }
    },
    finish() {
      if (dash.readyState !== WebSocket.OPEN) return;
      const finish = {
        header: {
          action: 'finish-task',
          task_id: taskId,
          streaming: 'duplex',
        },
        payload: { input: {} },
      };
      dash.send(JSON.stringify(finish));
    },
    close() {
      if (dash.readyState === WebSocket.OPEN || dash.readyState === WebSocket.CONNECTING) {
        dash.close();
      }
    },
  };
}
