import {
  appendCursorAutoResume,
  appendQoderAutoResume,
  buildAngleCliCommand,
  buildCliCommand,
} from '../../cliSubstitute';
import { CURSOR_CLI_DEFAULT_TEMPLATE, QODER_CLI_DEFAULT_TEMPLATE } from '../../outputCatalog';
import { DEFAULT_CLI_TEMPLATE } from '../../workModes';
import {
  cursorCliFillHint,
  cursorCliReady,
  getMergedCursorSlots,
} from '../../cursorTriad';

/** 根据当前模式拼出 CLI 字符串；cursor 未填齐时返回 error */
export function computeWorkbenchCliCommand(
  mode: Record<string, unknown> | null | undefined,
  paragraphText: unknown,
  sessionId: unknown,
  cursorFilePaths: { infoTxtAbs?: string; errorTxtAbs?: string } | null | undefined,
  externalThreadId = '',
  workspaceFallback = '',
  cliOpts?: { skipCursorAutoResume?: boolean; skipQoderAutoResume?: boolean }
) {
  if (!mode || mode.kind !== 'cli') return { error: '非 CLI 模式' };
  const text = String(paragraphText ?? '');
  const sid = sessionId == null || sessionId === '' ? '' : String(sessionId);
  const ws =
    String(mode.cliWorkspace || '').trim() || String(workspaceFallback || '').trim();
  const tmpl =
    mode.cliVariant === 'cursor'
      ? mode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE
      : mode.cliVariant === 'qoder'
        ? mode.cliTemplate || QODER_CLI_DEFAULT_TEMPLATE
        : mode.cliTemplate || DEFAULT_CLI_TEMPLATE;

  if (mode.cliVariant === 'cursor') {
    const mergedSlots = getMergedCursorSlots(mode);
    const ctx = {
      paragraph: text,
      sessionId: sid,
      workspace: ws,
      cursorStdoutAbsPath: cursorFilePaths?.infoTxtAbs || '',
      cursorStderrAbsPath: cursorFilePaths?.errorTxtAbs || '',
      externalThreadId: String(externalThreadId ?? '').trim(),
    };
    if (!cursorCliReady(tmpl, mode.angleSlots || [], ctx)) {
      return { error: cursorCliFillHint(tmpl, mode.angleSlots || [], ctx) };
    }
    const built = buildAngleCliCommand(tmpl, mergedSlots, ctx);
    const cmd =
      cliOpts?.skipCursorAutoResume === true
        ? built
        : appendCursorAutoResume(built, ctx.externalThreadId);
    return { cmd };
  }
  if (mode.cliVariant === 'qoder') {
    const mergedSlots = getMergedCursorSlots(mode);
    const ctx = {
      paragraph: text,
      sessionId: sid,
      workspace: ws,
      cursorStdoutAbsPath: cursorFilePaths?.infoTxtAbs || '',
      cursorStderrAbsPath: cursorFilePaths?.errorTxtAbs || '',
      externalThreadId: String(externalThreadId ?? '').trim(),
    };
    if (!cursorCliReady(tmpl, mode.angleSlots || [], ctx)) {
      return { error: cursorCliFillHint(tmpl, mode.angleSlots || [], ctx) };
    }
    const built = buildAngleCliCommand(tmpl, mergedSlots, ctx);
    const cmd =
      cliOpts?.skipQoderAutoResume === true
        ? built
        : appendQoderAutoResume(built, ctx.externalThreadId);
    return { cmd };
  }
  if (mode.cliVariant === 'xiaoai') {
    const cmd = buildAngleCliCommand(tmpl, mode.angleSlots || [], {
      paragraph: text,
      sessionId: sid,
      workspace: ws,
    });
    return { cmd };
  }
  const cmd = buildCliCommand(tmpl, {
    paragraph: text,
    sessionId: sid,
    workspace: ws,
  });
  return { cmd };
}

/**
 * Cursor：刚 `ensure` 且 `created===true` 时省略下一次命令的自动 `--resume`（首次本机 agent 调用）；
 * 成功拼出命令后清除标记，避免影响后续轮次。
 */
export function consumeCursorOmitResumeAndBuildCommand(
  mode: Record<string, unknown> | null | undefined,
  paragraphText: unknown,
  sessionId: unknown,
  cursorFilePaths: { infoTxtAbs?: string; errorTxtAbs?: string } | null | undefined,
  externalThreadId: string,
  workspaceFallback: string,
  omitResumeNextInvokeRef: { current: boolean }
) {
  if (mode?.cliVariant === 'qoder') {
    const shouldOmit = omitResumeNextInvokeRef.current;
    const computed = computeWorkbenchCliCommand(
      mode,
      paragraphText,
      sessionId,
      cursorFilePaths,
      externalThreadId,
      workspaceFallback,
      shouldOmit ? { skipQoderAutoResume: true } : undefined
    );
    if (!computed.error && shouldOmit) omitResumeNextInvokeRef.current = false;
    return computed;
  }
  const shouldOmit =
    mode?.cliVariant === 'cursor' && omitResumeNextInvokeRef.current;
  const computed = computeWorkbenchCliCommand(
    mode,
    paragraphText,
    sessionId,
    cursorFilePaths,
    externalThreadId,
    workspaceFallback,
    shouldOmit ? { skipCursorAutoResume: true } : undefined
  );
  if (!computed.error && shouldOmit) omitResumeNextInvokeRef.current = false;
  return computed;
}
