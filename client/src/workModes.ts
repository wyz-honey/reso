import { mergeTargetEnvLayers, normalizeCliEnvRecord } from './cliEnv';
import { BUILTIN_OUTPUT_ID, QODER_EXTERNAL_THREAD_PROVIDER } from './constants/builtins';
import { mergeAngleSlotsWithDefaults } from './cliSubstitute';
import {
  addCustomOutput,
  CURSOR_CLI_DEFAULT_TEMPLATE,
  QODER_CLI_DEFAULT_TEMPLATE,
  getCustomOutputs,
  listAllOutputs,
  newOutputId,
  removeCustomOutput,
  saveBuiltinOutputOverride,
  updateCustomOutput,
} from './outputCatalog';
import { parseOutputVoiceControl } from './outputVoiceControl';
import { getResolvedExternalThreadProvider } from './resolvedExternalThread';
import { useOutputRevisionStore } from './stores/outputRevisionStore';

const STORAGE_CUSTOM = 'reso_work_modes_custom_v1';
const STORAGE_ACTIVE = 'reso_active_mode_id_v1';
const STORAGE_BUILTIN_AGENT_PROMPT = 'reso_builtin_agent_system_v1';

export const DEFAULT_CLI_TEMPLATE =
  'agent -p <输入> --model <模型> --resume=<会话> --output-format stream-json --force --workspace <工作空间>';

const DEFAULT_BUILTIN_AGENT_PROMPT =
  '你是一个简洁、有帮助的中文助手。回答尽量清晰、分点说明。';

export function getBuiltinAgentDefaultPrompt(): string {
  try {
    const raw = localStorage.getItem(STORAGE_BUILTIN_AGENT_PROMPT);
    if (raw != null && String(raw).trim()) return String(raw).trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_BUILTIN_AGENT_PROMPT;
}

export function saveBuiltinAgentPrompt(text: unknown): void {
  const s = String(text ?? '').trim();
  if (s) {
    localStorage.setItem(STORAGE_BUILTIN_AGENT_PROMPT, s);
  } else {
    localStorage.removeItem(STORAGE_BUILTIN_AGENT_PROMPT);
  }
  useOutputRevisionStore.getState().bumpOutputs();
  try {
    window.dispatchEvent(new CustomEvent('reso-outputs-changed'));
  } catch {
    /* ignore */
  }
}

function readCustomModesRaw(): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeCustomModes(list: unknown[]) {
  localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(list));
}

function readCustomModes() {
  return readCustomModesRaw().filter(
    (m) =>
      m &&
      typeof m.id === 'string' &&
      typeof m.name === 'string' &&
      (m.kind === 'agent' || m.kind === 'cli') &&
      m.builtIn === false
  );
}

function mapOutputRowToMode(o: Record<string, unknown>) {
  const ext = (
    o.extensions && typeof o.extensions === 'object' && !Array.isArray(o.extensions)
      ? o.extensions
      : {}
  ) as Record<string, unknown>;
  const targetEnv = mergeTargetEnvLayers(ext.cliEnv, ext.environment, o.environment);
  const voiceControl = parseOutputVoiceControl(ext.voiceControl, String(o.deliveryType || ''));
  switch (o.deliveryType) {
    case 'paragraph_clipboard':
      return {
        id: o.id,
        name: o.name,
        kind: 'asr',
        builtIn: !!o.builtin,
        systemPrompt: '',
        voiceControl,
      };
    case 'agent_chat': {
      if (o.builtin && o.id === BUILTIN_OUTPUT_ID.AGENT) {
        return {
          id: o.id,
          name: o.name,
          kind: 'agent',
          builtIn: true,
          systemPrompt: getBuiltinAgentDefaultPrompt(),
          cliEnv: targetEnv,
          voiceControl,
        };
      }
      const systemPrompt =
        typeof ext.systemPrompt === 'string' && ext.systemPrompt.trim()
          ? ext.systemPrompt.trim()
          : getBuiltinAgentDefaultPrompt();
      return {
        id: o.id,
        name: o.name,
        kind: 'agent',
        builtIn: !!o.builtin,
        systemPrompt,
        cliEnv: targetEnv,
        voiceControl,
      };
    }
    case 'http': {
      const proto = ext.httpProtocol === 'agui' ? 'agui' : 'openai_chat';
      const url =
        typeof ext.requestUrl === 'string' && ext.requestUrl.trim()
          ? ext.requestUrl.trim()
          : String(o.requestUrl || '').trim();
      return {
        id: o.id,
        name: o.name,
        kind: 'http',
        builtIn: !!o.builtin,
        systemPrompt: '',
        requestUrl: url,
        httpProtocol: proto,
        cliEnv: targetEnv,
        voiceControl,
      };
    }
    case 'xiaoai': {
      const tmpl =
        typeof ext.commandTemplate === 'string' && ext.commandTemplate.trim()
          ? ext.commandTemplate.trim()
          : DEFAULT_CLI_TEMPLATE;
      const angleSlots = Array.isArray(ext.angleSlots) ? ext.angleSlots : [];
      return {
        id: o.id,
        name: o.name,
        kind: 'cli',
        builtIn: !!o.builtin,
        systemPrompt: '',
        cliTemplate: tmpl,
        cliWorkspace: typeof ext.cliWorkspace === 'string' ? ext.cliWorkspace : '',
        angleSlots,
        cliVariant: 'xiaoai',
        cliEnv: targetEnv,
        voiceControl,
      };
    }
    case 'command': {
      const cliTemplate =
        typeof ext.cliTemplate === 'string' && ext.cliTemplate.trim()
          ? ext.cliTemplate.trim()
          : DEFAULT_CLI_TEMPLATE;
      return {
        id: o.id,
        name: o.name,
        kind: 'cli',
        builtIn: !!o.builtin,
        systemPrompt: '',
        cliTemplate,
        cliWorkspace: typeof ext.cliWorkspace === 'string' ? ext.cliWorkspace : '',
        cliVariant: 'command',
        cliEnv: targetEnv,
        voiceControl,
      };
    }
    case 'cursor_cli':
    case 'qoder_cli': {
      const isQoder = String(o.deliveryType || '') === 'qoder_cli';
      const defaultTmpl = isQoder ? QODER_CLI_DEFAULT_TEMPLATE : CURSOR_CLI_DEFAULT_TEMPLATE;
      const tmpl =
        typeof ext.commandTemplate === 'string' && ext.commandTemplate.trim()
          ? ext.commandTemplate.trim()
          : defaultTmpl;
      const angleSlots = Array.isArray(ext.angleSlots) ? ext.angleSlots : [];
      return {
        id: o.id,
        name: o.name,
        kind: 'cli',
        builtIn: !!o.builtin,
        systemPrompt: '',
        cliTemplate: tmpl,
        cliWorkspace: typeof ext.cliWorkspace === 'string' ? ext.cliWorkspace : '',
        angleSlots: mergeAngleSlotsWithDefaults(tmpl, angleSlots),
        cliVariant: isQoder ? 'qoder' : 'cursor',
        externalThreadProvider: isQoder
          ? QODER_EXTERNAL_THREAD_PROVIDER
          : getResolvedExternalThreadProvider(),
        cliEnv: targetEnv,
        voiceControl,
      };
    }
    case 'stream':
    default:
      return {
        id: o.id,
        name: o.name,
        kind: 'asr',
        builtIn: !!o.builtin,
        systemPrompt: '',
        voiceControl,
      };
  }
}

export function getAllModes() {
  const fromCatalog = listAllOutputs().map(mapOutputRowToMode);
  const ids = new Set(fromCatalog.map((m) => String(m.id)));
  const legacyRaw = readCustomModes().filter((m) => !ids.has(String(m.id)));
  const legacy = legacyRaw.map((m) => ({
    ...(m as Record<string, unknown>),
    voiceControl:
      m.kind === 'agent'
        ? parseOutputVoiceControl(undefined, 'agent_chat')
        : parseOutputVoiceControl(undefined, 'command'),
  })) as (typeof fromCatalog)[number][];
  return [...fromCatalog, ...legacy];
}

export function addCustomHttpMode({
  name,
  requestUrl,
  httpProtocol,
}: {
  name?: string;
  requestUrl?: string;
  httpProtocol?: string;
}) {
  const n = (name || '').trim();
  if (!n) throw new Error('请填写模式名称');
  const url = (requestUrl || '').trim();
  if (!url) throw new Error('请填写 HTTP 请求 URL');
  const id = newOutputId();
  const proto = httpProtocol === 'agui' ? 'agui' : 'openai_chat';
  addCustomOutput({
    id,
    builtin: false,
    name: n,
    description: '',
    deliveryType: 'http',
    requestUrl: url,
    outputShape:
      proto === 'agui'
        ? 'AGUI：默认发送 { user_message, session_id }（可按需在后端适配）。'
        : 'OpenAI Chat 兼容：{ model?, messages: [{ role, content }] }。',
    extensions: { httpProtocol: proto, requestUrl: url },
  });
  return { modes: getAllModes(), newId: id };
}

export function addCustomXiaoaiMode({
  name,
  commandTemplate,
  angleSlots,
}: {
  name?: string;
  commandTemplate?: string;
  angleSlots?: unknown;
} = {}) {
  const n = (name || '').trim();
  if (!n) throw new Error('请填写模式名称');
  const tmpl = (commandTemplate || '').trim();
  if (!tmpl) throw new Error('请填写完整指令');
  const id = newOutputId();
  const slotSeed = angleSlots !== undefined ? angleSlots : [];
  addCustomOutput({
    id,
    builtin: false,
    name: n,
    description: '',
    deliveryType: 'xiaoai',
    requestUrl: '（本机）拼指令并复制到剪贴板',
    outputShape:
      '尖括号占位可在目标管理中配置系统/自定义；亦支持 {{paragraph}}、{{sessionId}}、{{workspace}} 等。',
    extensions: {
      commandTemplate: tmpl,
      angleSlots: mergeAngleSlotsWithDefaults(tmpl, slotSeed),
    },
  });
  return { modes: getAllModes(), newId: id };
}

export function addCustomAgentMode({
  name,
  systemPrompt,
}: {
  name?: string;
  systemPrompt?: string;
}) {
  const n = (name || '').trim();
  if (!n) throw new Error('请填写模式名称');
  const id = newOutputId();
  addCustomOutput({
    id,
    builtin: false,
    name: n,
    description: '',
    deliveryType: 'agent_chat',
    requestUrl: 'POST /api/agent/chat-turn（默认）',
    outputShape: '响应 JSON：{ threadId, message, messages[] }。',
    extensions: { systemPrompt: (systemPrompt || '').trim() },
  });
  return { modes: getAllModes(), newId: id };
}

export function addCustomCliMode({
  name,
  cliTemplate,
  cliWorkspace,
}: {
  name?: string;
  cliTemplate?: string;
  cliWorkspace?: string;
}) {
  const n = (name || '').trim();
  if (!n) throw new Error('请填写模式名称');
  const id = newOutputId();
  addCustomOutput({
    id,
    builtin: false,
    name: n,
    description: '',
    deliveryType: 'command',
    requestUrl: '（本机）buildCliCommand + clipboard',
    outputShape: '占位符：<段落作为输入>、<sessionid>、<指定路径> 或双花括号形式。',
    extensions: {
      cliTemplate: (cliTemplate || DEFAULT_CLI_TEMPLATE).trim(),
      cliWorkspace: (cliWorkspace || '').trim(),
    },
  });
  return { modes: getAllModes(), newId: id };
}

export function updateHttpModeFields(
  modeId: string,
  patch: { requestUrl?: string; httpProtocol?: string; cliEnv?: Record<string, string> }
) {
  const row = getCustomOutputs().find((x) => (x as { id: string }).id === modeId) as
    | Record<string, unknown>
    | undefined;
  if (!row || row.deliveryType !== 'http') return getAllModes();
  const ext = {
    ...((row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
      ? row.extensions
      : {}) as object),
  } as Record<string, unknown>;
  let requestUrl = row.requestUrl as string;
  if (patch.requestUrl !== undefined) {
    requestUrl = String(patch.requestUrl);
    ext.requestUrl = requestUrl;
  }
  if (patch.httpProtocol !== undefined) {
    ext.httpProtocol = patch.httpProtocol === 'agui' ? 'agui' : 'openai_chat';
  }
  let environment: Record<string, string> | undefined;
  if (patch.cliEnv !== undefined) {
    const n = normalizeCliEnvRecord(patch.cliEnv);
    ext.environment = n;
    ext.cliEnv = n;
    environment = n;
  }
  updateCustomOutput(modeId, { requestUrl, extensions: ext, ...(environment !== undefined ? { environment } : {}) });
  return getAllModes();
}

/** RESO / 自定义 agent_chat 目标的环境变量 */
export function updateAgentModeFields(
  modeId: string,
  patch: { cliEnv?: Record<string, string> }
) {
  const row = listAllOutputs().find((x) => String((x as { id: string }).id) === String(modeId)) as
    | Record<string, unknown>
    | undefined;
  if (!row || row.deliveryType !== 'agent_chat') return getAllModes();
  const prevExt =
    row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
      ? { ...(row.extensions as object) }
      : {};
  const ext = { ...prevExt } as Record<string, unknown>;
  let envPatch: Record<string, string> | undefined;
  if (patch.cliEnv !== undefined) {
    const n = normalizeCliEnvRecord(patch.cliEnv);
    ext.environment = n;
    ext.cliEnv = n;
    envPatch = n;
  }
  if (row.builtin) {
    saveBuiltinOutputOverride(modeId, {
      extensions: ext,
      ...(envPatch !== undefined ? { environment: envPatch } : {}),
    });
  } else {
    updateCustomOutput(modeId, {
      extensions: ext,
      ...(envPatch !== undefined ? { environment: envPatch } : {}),
    });
  }
  return getAllModes();
}

export function updateCliModeFields(
  modeId: string,
  patch: { cliTemplate?: string; cliWorkspace?: string; angleSlots?: unknown; cliEnv?: Record<string, string> }
) {
  const row = listAllOutputs().find((x) => String((x as { id: string }).id) === String(modeId)) as
    | Record<string, unknown>
    | undefined;
  if (row?.deliveryType === 'cursor_cli' || row?.deliveryType === 'qoder_cli') {
    const prevExt =
      row.extensions && typeof row.extensions === 'object' && !Array.isArray(row.extensions)
        ? { ...(row.extensions as object) }
        : {};
    const ext = { ...prevExt } as Record<string, unknown>;
    if (patch.cliWorkspace !== undefined) ext.cliWorkspace = String(patch.cliWorkspace);
    if (patch.cliTemplate !== undefined) ext.commandTemplate = String(patch.cliTemplate);
    if (patch.angleSlots !== undefined) ext.angleSlots = patch.angleSlots;
    let envPatch: Record<string, string> | undefined;
    if (patch.cliEnv !== undefined) {
      const n = normalizeCliEnvRecord(patch.cliEnv);
      ext.environment = n;
      ext.cliEnv = n;
      envPatch = n;
    }
    if (row.builtin) {
      saveBuiltinOutputOverride(modeId, {
        extensions: ext,
        ...(envPatch !== undefined ? { environment: envPatch } : {}),
      });
    } else {
      updateCustomOutput(modeId, {
        extensions: ext,
        ...(envPatch !== undefined ? { environment: envPatch } : {}),
      });
    }
    return getAllModes();
  }

  const customOut = getCustomOutputs().find((x) => (x as { id: string }).id === modeId) as
    | Record<string, unknown>
    | undefined;
  if (customOut && customOut.deliveryType === 'xiaoai') {
    const ext = {
      ...((customOut.extensions && typeof customOut.extensions === 'object'
        ? customOut.extensions
        : {}) as object),
    } as Record<string, unknown>;
    if (patch.cliTemplate !== undefined) ext.commandTemplate = patch.cliTemplate;
    if (patch.cliWorkspace !== undefined) ext.cliWorkspace = patch.cliWorkspace;
    if (patch.angleSlots !== undefined) ext.angleSlots = patch.angleSlots;
    let envPatchX: Record<string, string> | undefined;
    if (patch.cliEnv !== undefined) {
      const n = normalizeCliEnvRecord(patch.cliEnv);
      ext.environment = n;
      ext.cliEnv = n;
      envPatchX = n;
    }
    updateCustomOutput(modeId, {
      extensions: ext,
      ...(envPatchX !== undefined ? { environment: envPatchX } : {}),
    });
    return getAllModes();
  }
  if (customOut && customOut.deliveryType === 'command') {
    const ext = {
      ...((customOut.extensions && typeof customOut.extensions === 'object'
        ? customOut.extensions
        : {}) as object),
    } as Record<string, unknown>;
    if (patch.cliTemplate !== undefined) ext.cliTemplate = patch.cliTemplate;
    if (patch.cliWorkspace !== undefined) ext.cliWorkspace = patch.cliWorkspace;
    let envPatchC: Record<string, string> | undefined;
    if (patch.cliEnv !== undefined) {
      const n = normalizeCliEnvRecord(patch.cliEnv);
      ext.environment = n;
      ext.cliEnv = n;
      envPatchC = n;
    }
    updateCustomOutput(modeId, {
      extensions: ext,
      ...(envPatchC !== undefined ? { environment: envPatchC } : {}),
    });
    return getAllModes();
  }

  const custom = readCustomModesRaw().map((m) =>
    m.id === modeId && m.kind === 'cli' ? { ...m, ...patch } : m
  );
  writeCustomModes(custom);
  return getAllModes();
}

export function removeCustomMode(id: string) {
  if (getCustomOutputs().some((x) => (x as { id: string }).id === id)) {
    removeCustomOutput(id);
  } else {
    const next = readCustomModesRaw().filter((m) => m.id !== id);
    writeCustomModes(next);
    useOutputRevisionStore.getState().bumpOutputs();
    try {
      window.dispatchEvent(new CustomEvent('reso-outputs-changed'));
    } catch {
      /* ignore */
    }
  }
  return getAllModes();
}

export function updateLegacyCustomMode(
  id: string,
  updates: Record<string, unknown>
) {
  const list = readCustomModesRaw().map((m) => {
    if (m.id !== id) return m;
    if (m.kind === 'agent') {
      return {
        ...m,
        name: updates.name != null ? String(updates.name).trim() || m.name : m.name,
        systemPrompt:
          updates.systemPrompt != null ? String(updates.systemPrompt) : m.systemPrompt,
      };
    }
    if (m.kind === 'cli') {
      return {
        ...m,
        name: updates.name != null ? String(updates.name).trim() || m.name : m.name,
        cliTemplate:
          updates.cliTemplate != null ? String(updates.cliTemplate) : m.cliTemplate,
        cliWorkspace:
          updates.cliWorkspace != null ? String(updates.cliWorkspace) : m.cliWorkspace,
      };
    }
    return m;
  });
  writeCustomModes(list);
  useOutputRevisionStore.getState().bumpOutputs();
  try {
    window.dispatchEvent(new CustomEvent('reso-outputs-changed'));
  } catch {
    /* ignore */
  }
}

export function loadActiveModeId(): string {
  try {
    const all = getAllModes();
    let stored = localStorage.getItem(STORAGE_ACTIVE);
    if (stored === 'builtin-cli') {
      stored = BUILTIN_OUTPUT_ID.ASR;
      localStorage.setItem(STORAGE_ACTIVE, stored);
    }
    if (stored && all.some((m) => String(m.id) === stored)) return stored;
    return String(all[0]?.id || BUILTIN_OUTPUT_ID.ASR);
  } catch {
    return BUILTIN_OUTPUT_ID.ASR;
  }
}

export function saveActiveModeId(id: string) {
  localStorage.setItem(STORAGE_ACTIVE, id);
}
