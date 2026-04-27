/**
 * Cursor 工作台：仅当指令模板里出现对应尖括号（如 <模型>）时，才展示并校验该槽；
 * 与目标详情「指令参数」列表一致（由 mergeAngleSlotsWithDefaults 随模板生成）。
 */
import type { AngleSlot, CliContext } from './cliSubstitute';
import {
  mergeAngleSlotsWithDefaults,
  resolveAngleSlotValue,
  uniqueAngleLabelsInOrder,
} from './cliSubstitute';

/** 与默认槽位推断一致：用于保存时把「工作空间」类占位与 extensions.cliWorkspace 对齐 */
function slotLooksLikeWorkspace(s: AngleSlot): boolean {
  return (
    (s.systemField || '') === 'workspace' ||
    /工作空间|工作区|workspace|repo/i.test(String(s.label || '').trim())
  );
}

/**
 * 工作区路径不再单独表单项：若 &lt;工作空间&gt; 等为「自定义」，其值写入 extensions.cliWorkspace；
 * 若为「系统·工作区路径」，则保留目标里已有的 cliWorkspace（工作台侧栏与入参弹窗仍会用到）。
 */
export function deriveCursorCliWorkspace(
  mergedSlots: AngleSlot[],
  previousCliWorkspace: string
): string {
  const wsSlot = mergedSlots.find((s) => slotLooksLikeWorkspace(s));
  if (wsSlot?.source === 'custom') return String(wsSlot.customValue ?? '').trim();
  return String(previousCliWorkspace ?? '').trim();
}
import { CURSOR_CLI_DEFAULT_TEMPLATE, QODER_CLI_DEFAULT_TEMPLATE } from './outputCatalog';

function defaultCliWorkbenchTemplate(mode: Record<string, unknown> | null | undefined): string {
  return mode?.cliVariant === 'qoder' ? QODER_CLI_DEFAULT_TEMPLATE : CURSOR_CLI_DEFAULT_TEMPLATE;
}

export const CURSOR_TRIAD_LABELS = ['模型', '工作空间', '输出路径'] as const;

export type CursorTriadField = 'model' | 'workspace' | 'outputPath';

function triadFieldByLabel(label: unknown): CursorTriadField | null {
  const s = String(label || '').trim();
  if (!s) return null;
  if (/模型|model/i.test(s)) return 'model';
  if (/工作空间|工作区|workspace|repo/i.test(s)) return 'workspace';
  if (/输出路径|output|stdout|stderr|info\.txt|error\.txt/i.test(s)) return 'outputPath';
  return null;
}

export function cursorTriadFieldByLabel(label: unknown): CursorTriadField | null {
  return triadFieldByLabel(label);
}

export function cursorTriadLabelsInTemplate(template: unknown): string[] {
  return uniqueAngleLabelsInOrder(String(template ?? '')).filter((lab) => triadFieldByLabel(lab));
}

export function getMergedCursorSlots(mode: Record<string, unknown> | null | undefined): AngleSlot[] {
  if (!mode || (mode.cliVariant !== 'cursor' && mode.cliVariant !== 'qoder')) return [];
  const tmpl = (mode.cliTemplate as string) || defaultCliWorkbenchTemplate(mode);
  return mergeAngleSlotsWithDefaults(tmpl, (mode.angleSlots as unknown[]) || []);
}

/** 指令模板里是否存在「系统 → 外部 CLI 线程」占位，需要服务端 ensure / create-chat */
export function cursorModeNeedsExternalThread(mode: Record<string, unknown> | null | undefined): boolean {
  if (!mode || mode.cliVariant !== 'cursor') return false;
  const slots = getMergedCursorSlots(mode);
  return slots.some((s) => s.source === 'system' && s.systemField === 'externalThread');
}

export function cursorTriadCustomValues(mode: Record<string, unknown> | null | undefined) {
  const slots = getMergedCursorSlots(mode);
  const tmpl = (mode?.cliTemplate as string) || defaultCliWorkbenchTemplate(mode);
  const labels = cursorTriadLabelsInTemplate(tmpl);
  const out: Record<string, string> = {};
  for (const lab of labels) {
    const s = slots.find((x) => x.label === lab);
    if (s?.source === 'custom') out[lab] = String(s.customValue ?? '');
    else out[lab] = '';
  }
  return out;
}

export function cursorTriadComplete(
  slots: AngleSlot[],
  ctx: CliContext | null | undefined,
  template: unknown
) {
  const { paragraph = '', sessionId = '', workspace = '' } = ctx || {};
  const labels = cursorTriadLabelsInTemplate(template);
  for (const lab of labels) {
    const s = slots.find((x) => x.label === lab);
    if (!s) return false;
    if (s.source === 'custom') {
      if (!String(s.customValue ?? '').trim()) return false;
    } else {
      const f = s.systemField || 'paragraph';
      if (f === 'paragraph' && !String(paragraph).trim()) return false;
      if (f === 'sessionId' && !String(sessionId).trim()) return false;
      if (f === 'workspace' && !String(workspace).trim()) return false;
      if (f === 'cursorStdout' && !String(ctx?.cursorStdoutAbsPath || '').trim()) return false;
      if (f === 'cursorStderr' && !String(ctx?.cursorStderrAbsPath || '').trim()) return false;
      if (f === 'externalThread' && !String(ctx?.externalThreadId || '').trim()) return false;
    }
  }
  return true;
}

/** 复制/发送前可由前端自动补全：会话、输出路径、agent create-chat 线程 */
const CURSOR_PROVISIONING_OPTIONAL_SYSTEM = new Set([
  'cursorStdout',
  'cursorStderr',
  'externalThread',
  'sessionId',
]);

/**
 * 用户侧已就绪即可点「发送」：不强制已有 DB 会话、tail 路径或 Cursor 线程映射
 *（首次发送时会自动建会话、拉路径并调用与官方一致的 `agent create-chat` ensure）。
 */
export function cursorCliReadyIgnoringProvisioningDeps(
  template: unknown,
  slots: unknown,
  ctx: CliContext | null | undefined
) {
  const merged = mergeAngleSlotsWithDefaults(template, slots);
  const { paragraph = '', sessionId = '', workspace = '' } = ctx || {};
  const labels = cursorTriadLabelsInTemplate(template);
  for (const lab of labels) {
    const s = merged.find((x) => x.label === lab);
    if (!s) return false;
    if (s.source === 'custom') {
      if (!String(s.customValue ?? '').trim()) return false;
    } else {
      const f = s.systemField || 'paragraph';
      if (CURSOR_PROVISIONING_OPTIONAL_SYSTEM.has(f)) continue;
      if (f === 'paragraph' && !String(paragraph).trim()) return false;
      if (f === 'workspace' && !String(workspace).trim()) return false;
    }
  }
  for (const s of merged) {
    if (s.source === 'system' && (s.systemField || 'paragraph') === 'paragraph') {
      if (!String(ctx?.paragraph ?? '').trim()) return false;
      continue;
    }
    const f = s.systemField || 'paragraph';
    if (s.source === 'system' && CURSOR_PROVISIONING_OPTIONAL_SYSTEM.has(f)) continue;
    const v = resolveAngleSlotValue(s, ctx || {});
    if (!String(v).trim()) return false;
  }
  return true;
}

export function cursorCliReady(
  template: unknown,
  slots: unknown,
  ctx: CliContext | null | undefined
) {
  const merged = mergeAngleSlotsWithDefaults(template, slots);
  if (!cursorTriadComplete(merged, ctx, template)) return false;
  for (const s of merged) {
    if (s.source === 'system' && (s.systemField || 'paragraph') === 'paragraph') {
      if (!String(ctx?.paragraph ?? '').trim()) return false;
      continue;
    }
    const v = resolveAngleSlotValue(s, ctx || {});
    if (!String(v).trim()) return false;
  }
  return true;
}

const TRIAD_HINT: Record<string, string> = {
  模型: '模型（--model）',
  工作空间: '工作空间',
  输出路径: '输出路径（若模板含该占位）',
};

function triadHintForLabel(label: string): string {
  const byPreset = TRIAD_HINT[label];
  if (byPreset) return byPreset;
  const field = triadFieldByLabel(label);
  if (field === 'model') return `${label}（模型参数）`;
  if (field === 'workspace') return `${label}（工作空间路径）`;
  if (field === 'outputPath') return `${label}（输出路径）`;
  return label;
}

export function cursorTriadFillHint(template: unknown): string {
  const labs = cursorTriadLabelsInTemplate(template);
  if (!labs.length) return '';
  return `请补全：${labs.map((l) => triadHintForLabel(l)).join('、')}`;
}

export function cursorCliFillHint(
  template: unknown,
  slots: unknown,
  ctx: CliContext | null | undefined
) {
  const merged = mergeAngleSlotsWithDefaults(template, slots);
  if (!cursorTriadComplete(merged, ctx, template)) {
    const t = cursorTriadFillHint(template);
    if (t) return t;
  }
  const needsStdout = merged.some((s) => s.source === 'system' && s.systemField === 'cursorStdout');
  const needsStderr = merged.some((s) => s.source === 'system' && s.systemField === 'cursorStderr');
  if (needsStdout && !String(ctx?.cursorStdoutAbsPath || '').trim()) {
    if (!String(ctx?.sessionId || '').trim()) {
      return '发送时将自动创建数据库会话并生成本会话的 CLI 输出路径（与官方 CLI 重定向一致）';
    }
      return '请绑定数据库会话，或把 <输出正常信息地址> 改为自定义路径（需与本机 CLI 写入位置一致）';
  }
  if (needsStderr && !String(ctx?.cursorStderrAbsPath || '').trim()) {
    if (!String(ctx?.sessionId || '').trim()) {
      return '发送时将自动创建数据库会话并生成本会话的 Cursor 输出路径';
    }
    return '请绑定数据库会话，或把 <输出错误信息地址> 改为自定义路径';
  }
  const needsExt = merged.some((s) => s.source === 'system' && s.systemField === 'externalThread');
  if (needsExt && !String(ctx?.externalThreadId || '').trim()) {
    return '正在关联外部 CLI 会话，请稍候；若一直失败请确认本机已安装对应 CLI 并已登录（Cursor：`agent`；Qoder：`qodercli`），或检查目标详情中的指令模板';
  }
  return '请补全指令模板中的占位（含正文段落与路径类字段）';
}
