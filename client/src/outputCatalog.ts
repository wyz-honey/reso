/**
 * 输出目录：内置 + 自定义（localStorage）。
 * 新建输出仅支持 HTTP、CLI；历史数据仍可能含 agent_chat / command 等。
 */

import { normalizeCliEnvRecord } from './cliEnv';
import { mergeAngleSlotsWithDefaults } from './cliSubstitute';
import { BUILTIN_OUTPUT_ID } from './constants/builtins';
import { useOutputRevisionStore } from './stores/outputRevisionStore';

const CUSTOM_KEY = 'reso_custom_outputs_v1';

export const CURSOR_CLI_DEFAULT_TEMPLATE = `agent \\
-p <输入> \\
--workspace <工作空间> \\
--force \\
--output-format stream-json \\
--model <模型> \\
> <输出正常信息地址> \\
2> <输出错误信息地址>`;

/**
 * 与 Qoder 官方 Print 模式一致：`qodercli --print`、非交互示例中的 `-q -p`、`-w`、`--output-format`。
 * @see https://docs.qoder.com/zh/cli/using-cli
 */
export const QODER_CLI_DEFAULT_TEMPLATE = `qodercli \\
--print \\
-q \\
-p <输入> \\
-w <工作空间> \\
--output-format stream-json \\
--yolo \\
> <输出正常信息地址> \\
2> <输出错误信息地址>`;
const BUILTIN_OVERRIDE_KEY = 'reso_builtin_output_overrides_v1';
const LEGACY_MODES_KEY = 'reso_work_modes_custom_v1';

export const NEW_OUTPUT_DELIVERY_TYPES = [
  { value: 'http', label: '网络' },
  { value: 'xiaoai', label: '终端' },
] as const;

export const HTTP_PROTOCOL_LABELS = {
  openai_chat: '常见聊天接口',
  agui: '流式多事件',
} as const;

export const DELIVERY_TYPE_LABELS = {
  paragraph_clipboard: '自然语言识别',
  agent_chat: 'RESO',
  http: '网络',
  xiaoai: '终端',
  cursor_cli: 'Cursor',
  qoder_cli: 'Qoder',
  stream: '流式（旧）',
  command: '终端（旧）',
} as const;

export const TARGET_KINDS = {
  agent: 'agent',
  api: 'api',
} as const;

export type TargetKind = (typeof TARGET_KINDS)[keyof typeof TARGET_KINDS];

export const TARGET_KIND_LABELS = {
  [TARGET_KINDS.agent]: 'Agent',
  [TARGET_KINDS.api]: 'API',
} as const;

export function inferTargetKind(deliveryType: string | undefined): TargetKind {
  const dt = String(deliveryType || '');
  if (dt === 'http' || dt === 'paragraph_clipboard' || dt === 'stream') return TARGET_KINDS.api;
  if (
    dt === 'agent_chat' ||
    dt === 'xiaoai' ||
    dt === 'command' ||
    dt === 'cursor_cli' ||
    dt === 'qoder_cli'
  )
    return TARGET_KINDS.agent;
  return TARGET_KINDS.api;
}

function enrichOutputRow(row: unknown) {
  if (!row || typeof row !== 'object') return row;
  const o = row as Record<string, unknown>;
  const targetKind =
    o.targetKind === TARGET_KINDS.agent || o.targetKind === TARGET_KINDS.api
      ? (o.targetKind as TargetKind)
      : inferTargetKind(String(o.deliveryType ?? ''));
  return {
    ...o,
    targetKind,
    createdAt: o.createdAt != null ? o.createdAt : null,
    updatedAt: o.updatedAt != null ? o.updatedAt : null,
  };
}

function notifyOutputsChanged() {
  useOutputRevisionStore.getState().bumpOutputs();
  try {
    window.dispatchEvent(new CustomEvent('reso-outputs-changed'));
  } catch {
    /* ignore */
  }
}

export function newOutputId() {
  return `out_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function readBuiltinOverrides(): Record<string, Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(BUILTIN_OVERRIDE_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function writeBuiltinOverrides(obj: Record<string, unknown>) {
  localStorage.setItem(BUILTIN_OVERRIDE_KEY, JSON.stringify(obj));
  notifyOutputsChanged();
}

export function saveBuiltinOutputOverride(
  id: string,
  patch: Record<string, unknown> & { extensions?: Record<string, unknown> }
) {
  const cur = readBuiltinOverrides();
  const prev =
    cur[id] && typeof cur[id] === 'object' ? (cur[id] as Record<string, unknown>) : {};
  const next: Record<string, unknown> = {
    ...prev,
    ...patch,
    name: patch.name !== undefined ? String(patch.name) : prev.name,
    description: patch.description !== undefined ? String(patch.description) : prev.description,
    requestUrl: patch.requestUrl !== undefined ? String(patch.requestUrl) : prev.requestUrl,
    outputShape: patch.outputShape !== undefined ? String(patch.outputShape) : prev.outputShape,
  };
  if (patch.environment !== undefined) {
    next.environment =
      patch.environment && typeof patch.environment === 'object' && !Array.isArray(patch.environment)
        ? normalizeCliEnvRecord(patch.environment)
        : {};
  }
  if (patch.extensions !== undefined) {
    next.extensions =
      patch.extensions && typeof patch.extensions === 'object' && !Array.isArray(patch.extensions)
        ? {
            ...((prev.extensions && typeof prev.extensions === 'object'
              ? prev.extensions
              : {}) as object),
            ...patch.extensions,
          }
        : prev.extensions;
    if (
      (id === BUILTIN_OUTPUT_ID.CURSOR || id === BUILTIN_OUTPUT_ID.QODER) &&
      next.extensions &&
      typeof next.extensions === 'object'
    ) {
      const { externalThreadProvider: _etp, ...rest } = next.extensions as Record<string, unknown>;
      next.extensions = rest;
    }
  }
  cur[id] = next;
  writeBuiltinOverrides(cur);
}

export function getBuiltinOutputs() {
  return [
    {
      id: BUILTIN_OUTPUT_ID.ASR,
      builtin: true,
      targetKind: TARGET_KINDS.api,
      createdAt: null,
      updatedAt: null,
      name: '自然语言识别',
      description:
        '语音转写进入正文区；确认后复制到剪贴板并持久化保存，适合纪要、草稿流水线。',
      deliveryType: 'paragraph_clipboard',
      requestUrl: 'POST /api/sessions/:sessionId/paragraphs',
      outputShape: '响应 JSON：{ id, sessionId, paragraphIndex }；请求体：{ content }。',
      extensions: {},
    },
    {
      id: BUILTIN_OUTPUT_ID.AGENT,
      builtin: true,
      targetKind: TARGET_KINDS.agent,
      createdAt: null,
      updatedAt: null,
      name: 'RESO',
      description:
        '当前 Reso 本尊智能体：正文作为 user 消息走百炼兼容 Chat，线程与消息落在 chat_threads / chat_messages。',
      deliveryType: 'agent_chat',
      requestUrl: 'POST /api/agent/chat-turn（默认）',
      outputShape: '响应 JSON：{ threadId, message, messages[] }。',
      extensions: {},
    },
    {
      id: BUILTIN_OUTPUT_ID.CURSOR,
      builtin: true,
      targetKind: TARGET_KINDS.agent,
      createdAt: null,
      updatedAt: null,
      name: 'Cursor',
      description:
        '本机执行 `agent`：正文进 `-p`；标准输出/错误默认重定向到服务端目录 server/outputs/cursor/<会话ID>/info.txt 与 error.txt，工作台 WebSocket 实时展示。',
      deliveryType: 'cursor_cli',
      requestUrl: '',
      outputShape: '',
      extensions: {
        commandTemplate: CURSOR_CLI_DEFAULT_TEMPLATE,
        angleSlots: mergeAngleSlotsWithDefaults(CURSOR_CLI_DEFAULT_TEMPLATE, []),
      },
    },
    {
      id: BUILTIN_OUTPUT_ID.QODER,
      builtin: true,
      targetKind: TARGET_KINDS.agent,
      createdAt: null,
      updatedAt: null,
      name: 'Qoder',
      description:
        '本机执行 `qodercli --print -q -p …`（与官方文档 Print 模式一致）；正文进 `-p`；`-r` 由工作台在发送时自动插入（等同 Cursor 侧 `--resume`）；stdout/stderr 重定向到 server/outputs/qoder/<会话ID>/info.txt 与 error.txt。详见 https://docs.qoder.com/zh/cli/using-cli',
      deliveryType: 'qoder_cli',
      requestUrl: '',
      outputShape: '',
      extensions: {
        commandTemplate: QODER_CLI_DEFAULT_TEMPLATE,
        angleSlots: mergeAngleSlotsWithDefaults(QODER_CLI_DEFAULT_TEMPLATE, []),
      },
    },
  ];
}

export function getMergedBuiltinOutputs() {
  const ov = readBuiltinOverrides();
  return getBuiltinOutputs().map((b) => {
    const p = ov[b.id as string];
    if (!p || typeof p !== 'object') return { ...b };
    const baseExt =
      b.extensions && typeof b.extensions === 'object' && !Array.isArray(b.extensions)
        ? b.extensions
        : {};
    const patchExt =
      p.extensions && typeof p.extensions === 'object' && !Array.isArray(p.extensions)
        ? p.extensions
        : null;
    let extensions = patchExt ? { ...baseExt, ...patchExt } : { ...baseExt };
    if (
      (b.id === BUILTIN_OUTPUT_ID.CURSOR || b.id === BUILTIN_OUTPUT_ID.QODER) &&
      extensions &&
      typeof extensions === 'object'
    ) {
      const { externalThreadProvider: _e, ...rest } = extensions as Record<string, unknown>;
      extensions = rest;
    }
    const topEnv =
      p.environment && typeof p.environment === 'object' && !Array.isArray(p.environment)
        ? normalizeCliEnvRecord(p.environment)
        : undefined;
    return {
      ...b,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : b.name,
      description: typeof p.description === 'string' ? p.description : b.description,
      requestUrl: typeof p.requestUrl === 'string' ? p.requestUrl : b.requestUrl,
      outputShape: typeof p.outputShape === 'string' ? p.outputShape : b.outputShape,
      extensions,
      ...(topEnv && Object.keys(topEnv).length > 0 ? { environment: topEnv } : {}),
    };
  });
}

function readLegacyWorkModesRows(): Array<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(LEGACY_MODES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (m: Record<string, unknown>) =>
        m &&
        typeof m.id === 'string' &&
        typeof m.name === 'string' &&
        (m.kind === 'agent' || m.kind === 'cli') &&
        m.builtIn === false
    );
  } catch {
    return [];
  }
}

function legacyModeToOutputRow(m: Record<string, unknown>) {
  if (m.kind === 'agent') {
    return {
      id: m.id,
      builtin: false,
      legacy: true,
      targetKind: TARGET_KINDS.agent,
      createdAt: null,
      updatedAt: null,
      name: m.name,
      description: '（旧版存储中的自定义模式，可迁移为 HTTP/CLI 后删除。）',
      deliveryType: 'agent_chat',
      requestUrl: 'POST /api/agent/chat-turn（默认）',
      outputShape: '与 RESO 对话相同。',
      extensions: { systemPrompt: typeof m.systemPrompt === 'string' ? m.systemPrompt : '' },
    };
  }
  return {
    id: m.id,
    builtin: false,
    legacy: true,
    targetKind: TARGET_KINDS.agent,
    createdAt: null,
    updatedAt: null,
    name: m.name,
    description: '（旧版存储中的自定义模式。）',
    deliveryType: 'command',
    requestUrl: '（旧）CLI 模板',
    outputShape: '占位符与旧 CLI 相同。',
    extensions: {
      cliTemplate: typeof m.cliTemplate === 'string' ? m.cliTemplate : '',
      cliWorkspace: typeof m.cliWorkspace === 'string' ? m.cliWorkspace : '',
    },
  };
}

export function listAllOutputs() {
  const main = [...getMergedBuiltinOutputs(), ...getCustomOutputs()];
  const ids = new Set(main.map((x: { id?: string }) => (x as { id: string }).id));
  const legacyRows = readLegacyWorkModesRows()
    .filter((m) => !ids.has(m.id as string))
    .map(legacyModeToOutputRow);
  return [...main, ...legacyRows].map(enrichOutputRow);
}

function readCustom(): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeCustom(list: unknown[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  notifyOutputsChanged();
}

export function getCustomOutputs() {
  return readCustom();
}

export function saveCustomOutputs(list: unknown[]) {
  writeCustom(list);
}

export function addCustomOutput(entry: Record<string, unknown>) {
  const list = readCustom();
  const now = new Date().toISOString();
  const tk = (entry.targetKind as TargetKind) || inferTargetKind(entry.deliveryType as string);
  list.push({
    ...entry,
    targetKind: tk,
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
  });
  writeCustom(list);
  return list;
}

export function removeCustomOutput(id: string) {
  const list = readCustom().filter((x) => (x as { id: string }).id !== id);
  writeCustom(list);
  return list;
}

export function updateCustomOutput(id: string, patch: Record<string, unknown>) {
  const now = new Date().toISOString();
  const list = readCustom().map((x) => {
    const row = x as Record<string, unknown>;
    if (row.id !== id) return x;
    const nextDt = patch.deliveryType != null ? patch.deliveryType : row.deliveryType;
    const nextTk =
      patch.targetKind === TARGET_KINDS.agent || patch.targetKind === TARGET_KINDS.api
        ? patch.targetKind
        : inferTargetKind(nextDt as string);
    let patchOut = patch;
    if (
      (nextDt === 'cursor_cli' || nextDt === 'qoder_cli') &&
      patch.extensions &&
      typeof patch.extensions === 'object' &&
      !Array.isArray(patch.extensions)
    ) {
      const ex = { ...(patch.extensions as Record<string, unknown>) };
      delete ex.externalThreadProvider;
      patchOut = { ...patch, extensions: ex };
    }
    return {
      ...row,
      ...patchOut,
      targetKind: nextTk,
      updatedAt: now,
    };
  });
  writeCustom(list);
  return list;
}
