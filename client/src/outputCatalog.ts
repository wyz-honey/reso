/**
 * 输出目录：内置 + 自定义（localStorage）。
 * 新建输出仅支持 HTTP、CLI；历史数据仍可能含 agent_chat / command 等。
 */

import { mergeAngleSlotsWithDefaults } from './cliSubstitute.js';
import { useOutputRevisionStore } from './stores/outputRevisionStore.js';

const CUSTOM_KEY = 'reso_custom_outputs_v1';

export const CURSOR_CLI_DEFAULT_TEMPLATE = `agent \\
-p <输入> \\
-w <工作空间> \\
--force \\
--output-format stream-json \\
--model <模型> \\
> <输出正常信息地址> \\
2> <输出错误信息地址>`;
const BUILTIN_OVERRIDE_KEY = 'reso_builtin_output_overrides_v1';
const LEGACY_MODES_KEY = 'reso_work_modes_custom_v1';

export const NEW_OUTPUT_DELIVERY_TYPES = [
  { value: 'http', label: 'HTTP' },
  { value: 'xiaoai', label: 'CLI' },
] as const;

export const HTTP_PROTOCOL_LABELS = {
  openai_chat: 'OpenAI Chat',
  agui: 'AGUI',
} as const;

export const DELIVERY_TYPE_LABELS = {
  paragraph_clipboard: '标准模式',
  agent_chat: 'RESO',
  http: 'HTTP',
  xiaoai: 'CLI',
  cursor_cli: 'Cursor',
  stream: '流式（旧）',
  command: 'CLI（旧）',
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
  if (dt === 'agent_chat' || dt === 'xiaoai' || dt === 'command' || dt === 'cursor_cli')
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
  }
  cur[id] = next;
  writeBuiltinOverrides(cur);
}

export function getBuiltinOutputs() {
  return [
    {
      id: 'builtin-asr',
      builtin: true,
      targetKind: TARGET_KINDS.api,
      createdAt: null,
      updatedAt: null,
      name: '标准模式',
      description:
        '语音转写进入正文区；确认后复制到剪贴板并持久化保存，适合纪要、草稿流水线。',
      deliveryType: 'paragraph_clipboard',
      requestUrl: 'POST /api/sessions/:sessionId/paragraphs',
      outputShape: '响应 JSON：{ id, sessionId, paragraphIndex }；请求体：{ content }。',
      extensions: {},
    },
    {
      id: 'builtin-agent',
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
      id: 'builtin-cursor',
      builtin: true,
      targetKind: TARGET_KINDS.agent,
      createdAt: null,
      updatedAt: null,
      name: 'Cursor',
      description:
        '本机执行 `agent`：正文进 `-p`；标准输出/错误默认重定向到服务端目录 server/outputs/cursor/<会话ID>/info.txt 与 error.txt，工作台 WebSocket 实时展示。',
      deliveryType: 'cursor_cli',
      requestUrl: '（本机）拼接 agent 指令并复制到剪贴板',
      outputShape:
        '占位：<输入>、<工作空间>（-w）、<模型>、<输出正常信息地址>、<输出错误信息地址>；后两项默认可为系统类型，路径由会话绑定解析。',
      extensions: {
        commandTemplate: CURSOR_CLI_DEFAULT_TEMPLATE,
        angleSlots: mergeAngleSlotsWithDefaults(CURSOR_CLI_DEFAULT_TEMPLATE, []),
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
    const extensions = patchExt ? { ...baseExt, ...patchExt } : { ...baseExt };
    return {
      ...b,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : b.name,
      description: typeof p.description === 'string' ? p.description : b.description,
      requestUrl: typeof p.requestUrl === 'string' ? p.requestUrl : b.requestUrl,
      outputShape: typeof p.outputShape === 'string' ? p.outputShape : b.outputShape,
      extensions,
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
    return {
      ...row,
      ...patch,
      targetKind: nextTk,
      updatedAt: now,
    };
  });
  writeCustom(list);
  return list;
}
