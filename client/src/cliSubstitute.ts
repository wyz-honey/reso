/**
 * CLI 模板占位：尖括号 <标签> 可在输出管理中配置为「系统」或「自定义」；
 * 亦兼容双花括号 {{paragraph}} 等及历史尖括号别名（由 buildCliCommand 收尾替换）。
 */

export function shellQuoteSingle(arg: unknown): string {
  const s = String(arg ?? '');
  if (!s) return "''";
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** 最终命令里是否已含 --resume（避免与模板或自动追加重复） */
export function cliCommandHasResumeFlag(cmd: unknown): boolean {
  return /(?:^|[\s\\])--resume(?:\s|=|$)/.test(String(cmd ?? ''));
}

/**
 * Cursor：在复制/发送的最终命令上自动插入 `--resume '<threadId>'`，放在首个输出重定向行（`>`）之前；
 * 无重定向行则插在末尾。已有 --resume 时不改。
 */
export function appendCursorAutoResume(cmd: unknown, threadId: unknown): string {
  const c = String(cmd ?? '');
  const id = String(threadId ?? '').trim();
  if (!id || cliCommandHasResumeFlag(c)) return c;
  const q = shellQuoteSingle(id);
  const t = c.trimEnd();
  const lines = t.split(/\r?\n/);
  let redirectLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*2\s*>/.test(lines[i])) continue;
    if (/^\s*>/.test(lines[i])) {
      redirectLineIdx = i;
      break;
    }
  }
  if (redirectLineIdx >= 0) {
    const before = lines.slice(0, redirectLineIdx).join('\n');
    const after = lines.slice(redirectLineIdx).join('\n');
    return before ? `${before} --resume ${q} \\\n${after}` : `${t} --resume ${q}`;
  }
  const m = t.match(/^([\s\S]+?)(\s+>[\s\S]+)$/);
  if (m) return `${m[1]} --resume ${q}${m[2]}`;
  return `${t} --resume ${q}`;
}

function safeSessionToken(sessionId: unknown): string {
  const s = String(sessionId || '').trim();
  if (!s) return '';
  if (/^[0-9a-f-]{36}$/i.test(s)) return s;
  return shellQuoteSingle(s);
}

function safeWorkspaceToken(workspace: unknown): string {
  const w = String(workspace || '').trim();
  if (!w) return '';
  return shellQuoteSingle(w);
}

const ANGLE_RE = /<([^<>]+)>/g;

export function parseAngleLabels(template: unknown): string[] {
  const labels: string[] = [];
  const s = String(template ?? '');
  let m: RegExpExecArray | null;
  ANGLE_RE.lastIndex = 0;
  while ((m = ANGLE_RE.exec(s)) !== null) {
    const label = m[1].trim();
    if (label) labels.push(label);
  }
  return labels;
}

export function uniqueAngleLabelsInOrder(template: unknown): string[] {
  const all = parseAngleLabels(template);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of all) {
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out;
}

function escapeRegExp(str: string): string {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function randomSlotKey(): string {
  return `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function labelSuggestsParagraphSlot(label: unknown): boolean {
  return /输入|段落|正文|paragraph|content/i.test(String(label || '').trim());
}

/** 与模式上的「工作区路径」cliWorkspace 对齐，避免默认识别成空的「自定义」槽 */
function labelSuggestsWorkspaceSlot(label: unknown): boolean {
  return /工作空间|工作区|workspace|repo/i.test(String(label || '').trim());
}

export function shouldDefaultCustomSource(label: unknown): boolean {
  return /模型|model/i.test(String(label || '').trim());
}

function labelSuggestsCursorStdout(label: unknown): boolean {
  return /输出正常信息地址|^stdout$|正常信息|info\.txt/i.test(String(label || '').trim());
}

function labelSuggestsCursorStderr(label: unknown): boolean {
  return /输出错误信息地址|^stderr$|错误信息|error\.txt/i.test(String(label || '').trim());
}

function labelSuggestsExternalThread(label: unknown): boolean {
  return /外部CLI线程|外部会话|CLI线程|cli线程|chatid|thread_id|cursor.*thread/i.test(
    String(label || '').trim()
  );
}

export const ANGLE_SYSTEM_FIELDS = [
  'paragraph',
  'sessionId',
  'workspace',
  'cursorStdout',
  'cursorStderr',
  'externalThread',
] as const;

export type AngleSystemField = (typeof ANGLE_SYSTEM_FIELDS)[number];

export interface AngleSlot {
  key: string;
  label: string;
  source: 'system' | 'custom';
  systemField: string;
  customValue: string;
}

export function normalizeAngleSlots(slots: unknown): AngleSlot[] {
  if (!Array.isArray(slots)) return [];
  return slots.map((x: Record<string, unknown>) => {
    let source: 'system' | 'custom' = x?.source === 'custom' ? 'custom' : 'system';
    let systemField =
      typeof x?.systemField === 'string' && x.systemField ? x.systemField : 'paragraph';
    if (!ANGLE_SYSTEM_FIELDS.includes(systemField as AngleSystemField)) {
      systemField = 'paragraph';
    }
    return {
      key: typeof x?.key === 'string' && x.key ? x.key : randomSlotKey(),
      label: String(x?.label ?? '').trim(),
      source,
      systemField,
      customValue: typeof x?.customValue === 'string' ? x.customValue : '',
    };
  });
}

export function mergeAngleSlotsWithDefaults(
  template: unknown,
  existingSlots: unknown
): AngleSlot[] {
  const labels = uniqueAngleLabelsInOrder(template);
  const existing = normalizeAngleSlots(existingSlots);
  const byLabel = new Map(existing.map((s) => [s.label, s]));
  return labels.map((label) => {
    const prev = byLabel.get(label);
    if (prev) return { ...prev, label };
    if (labelSuggestsCursorStdout(label)) {
      return {
        key: randomSlotKey(),
        label,
        source: 'system',
        systemField: 'cursorStdout',
        customValue: '',
      };
    }
    if (labelSuggestsCursorStderr(label)) {
      return {
        key: randomSlotKey(),
        label,
        source: 'system',
        systemField: 'cursorStderr',
        customValue: '',
      };
    }
    if (labelSuggestsExternalThread(label)) {
      return {
        key: randomSlotKey(),
        label,
        source: 'system',
        systemField: 'externalThread',
        customValue: '',
      };
    }
    if (labelSuggestsWorkspaceSlot(label)) {
      return {
        key: randomSlotKey(),
        label,
        source: 'system',
        systemField: 'workspace',
        customValue: '',
      };
    }
    if (shouldDefaultCustomSource(label) || !labelSuggestsParagraphSlot(label)) {
      return {
        key: randomSlotKey(),
        label,
        source: 'custom',
        systemField: 'paragraph',
        customValue: '',
      };
    }
    return {
      key: randomSlotKey(),
      label,
      source: 'system',
      systemField: 'paragraph',
      customValue: '',
    };
  });
}

export function buildAllCustomAngleSlots(template: unknown): AngleSlot[] {
  return uniqueAngleLabelsInOrder(template).map((label) => ({
    key: randomSlotKey(),
    label,
    source: 'custom',
    systemField: 'paragraph',
    customValue: '',
  }));
}

export interface CliContext {
  paragraph?: string;
  sessionId?: string;
  workspace?: string;
  cursorStdoutAbsPath?: string;
  cursorStderrAbsPath?: string;
  /** 当前输出配置的 externalThreadProvider 在 DB 中解析出的线程 ID（如 Cursor agent chatId） */
  externalThreadId?: string;
}

function formatSystemValue(field: string, ctx: CliContext): string {
  const {
    paragraph = '',
    sessionId = '',
    workspace = '',
    cursorStdoutAbsPath = '',
    cursorStderrAbsPath = '',
    externalThreadId = '',
  } = ctx;
  switch (field) {
    case 'sessionId':
      return safeSessionToken(sessionId);
    case 'workspace':
      return safeWorkspaceToken(workspace);
    case 'cursorStdout': {
      const p = String(cursorStdoutAbsPath || '').trim();
      if (!p) return '';
      return shellQuoteSingle(p);
    }
    case 'cursorStderr': {
      const p = String(cursorStderrAbsPath || '').trim();
      if (!p) return '';
      return shellQuoteSingle(p);
    }
    case 'externalThread': {
      const t = String(externalThreadId || '').trim();
      if (!t) return '';
      return shellQuoteSingle(t);
    }
    case 'paragraph':
    default:
      return shellQuoteSingle(paragraph);
  }
}

export function resolveAngleSlotValue(slot: AngleSlot | null | undefined, ctx: CliContext): string {
  if (!slot || slot.source === 'custom') return String(slot?.customValue ?? '');
  return formatSystemValue(slot.systemField || 'paragraph', ctx);
}

export function buildAngleCliCommand(
  template: unknown,
  slots: unknown,
  ctx: CliContext
): string {
  let s = String(template ?? '');
  const merged = mergeAngleSlotsWithDefaults(template, slots);
  const sorted = [...merged].sort((a, b) => b.label.length - a.label.length);
  for (const slot of sorted) {
    if (!slot.label) continue;
    const val = resolveAngleSlotValue(slot, ctx);
    const re = new RegExp(`<${escapeRegExp(slot.label)}>`, 'g');
    s = s.replace(re, () => val);
  }
  return buildCliCommand(s, ctx);
}

export function buildCliCommand(
  template: unknown,
  { paragraph = '', sessionId = '', workspace = '' }: CliContext
): string {
  let s = String(template ?? '');
  const pq = shellQuoteSingle(paragraph);
  const sid = safeSessionToken(sessionId);
  const wq = safeWorkspaceToken(workspace);

  const pairs: [RegExp, string][] = [
    [/<段落作为输入>/gi, pq],
    [/\{\{paragraph\}\}/g, pq],
    [/\{\{content\}\}/g, pq],
    [/<sessionid>/gi, sid],
    [/<sessionId>/g, sid],
    [/\{\{sessionId\}\}/g, sid],
    [/\{\{sessionid\}\}/gi, sid],
    [/<指定路径>/g, wq],
    [/\{\{workspace\}\}/g, wq],
  ];

  for (const [re, val] of pairs) {
    s = s.replace(re, () => val);
  }
  return s;
}
