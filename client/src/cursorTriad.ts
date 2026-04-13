/**
 * Cursor 工作台：仅当指令模板里出现对应尖括号（如 <模型>）时，才展示并校验该槽；
 * 与目标详情「指令参数」列表一致（由 mergeAngleSlotsWithDefaults 随模板生成）。
 */
import type { AngleSlot, CliContext } from './cliSubstitute.js';
import {
  mergeAngleSlotsWithDefaults,
  resolveAngleSlotValue,
  uniqueAngleLabelsInOrder,
} from './cliSubstitute.js';
import { CURSOR_CLI_DEFAULT_TEMPLATE } from './outputCatalog.js';

export const CURSOR_TRIAD_LABELS = ['模型', '工作空间', '输出路径'] as const;

export function cursorTriadLabelsInTemplate(template: unknown): string[] {
  const inTmpl = new Set(uniqueAngleLabelsInOrder(String(template ?? '')));
  return CURSOR_TRIAD_LABELS.filter((lab) => inTmpl.has(lab));
}

export function getMergedCursorSlots(mode: Record<string, unknown> | null | undefined): AngleSlot[] {
  if (!mode || mode.cliVariant !== 'cursor') return [];
  const tmpl = (mode.cliTemplate as string) || CURSOR_CLI_DEFAULT_TEMPLATE;
  return mergeAngleSlotsWithDefaults(tmpl, (mode.angleSlots as unknown[]) || []);
}

export function cursorTriadCustomValues(mode: Record<string, unknown> | null | undefined) {
  const slots = getMergedCursorSlots(mode);
  const tmpl = (mode?.cliTemplate as string) || CURSOR_CLI_DEFAULT_TEMPLATE;
  const labels = cursorTriadLabelsInTemplate(tmpl);
  const out: Record<string, string> = { 模型: '', 工作空间: '', 输出路径: '' };
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
    }
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
  输出路径: '输出路径（--resume）',
};

export function cursorTriadFillHint(template: unknown): string {
  const labs = cursorTriadLabelsInTemplate(template);
  if (!labs.length) return '';
  return `请补全：${labs.map((l) => TRIAD_HINT[l] || l).join('、')}`;
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
    return '请绑定数据库会话，或把 <输出正常信息地址> 改为自定义路径（需与本机 agent 写入位置一致）';
  }
  if (needsStderr && !String(ctx?.cursorStderrAbsPath || '').trim()) {
    return '请绑定数据库会话，或把 <输出错误信息地址> 改为自定义路径';
  }
  return '请补全指令模板中的占位（含正文段落与路径类字段）';
}
