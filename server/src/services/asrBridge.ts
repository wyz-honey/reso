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

export function connectDashScope(
  apiKey: string,
  asrModelOverride: string,
  onUpstreamMessage: (msg: Record<string, unknown>) => void,
  onUpstreamClose: () => void
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
      parameters: {
        format: 'pcm',
        sample_rate: 16000,
      },
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
