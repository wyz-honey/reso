import { useHomeWorkbenchUiStore } from '../stores/homeWorkbenchUiStore';
import { isAgentUiAllowedPath } from './allowedPaths';

export type NavigateContext = {
  navigate: (path: string) => void;
};

type ApplyResult = { ok: true } | { ok: false; reason: string };

function applyOne(raw: unknown, ctx: NavigateContext): ApplyResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'not_an_object' };
  }
  const cmd = raw as { type?: string; path?: unknown; open?: unknown };

  if (cmd.type === 'drawing.open') {
    ctx.navigate('/drawing');
    return { ok: true };
  }
  if (cmd.type === 'drawing.close') {
    ctx.navigate('/');
    return { ok: true };
  }

  if (cmd.type === 'navigate') {
    const path = typeof cmd.path === 'string' ? cmd.path.trim() : '';
    if (!isAgentUiAllowedPath(path)) {
      return { ok: false, reason: 'navigate_path_not_allowed' };
    }
    ctx.navigate(path);
    return { ok: true };
  }

  if (cmd.type === 'workbench.setModeModalOpen') {
    if (typeof cmd.open !== 'boolean') {
      return { ok: false, reason: 'workbench.setModeModalOpen_open_not_boolean' };
    }
    useHomeWorkbenchUiStore.getState().setModeModalOpen(cmd.open);
    return { ok: true };
  }

  return { ok: false, reason: `unknown_type:${String(cmd.type)}` };
}

/**
 * 在浏览器内安全执行一组 UI 指令：仅识别固定 type，导航走白名单路径。
 */
export function applyUiCommands(commands: unknown[], ctx: NavigateContext): {
  applied: number;
  rejected: string[];
} {
  const rejected: string[] = [];
  let applied = 0;
  for (const raw of commands) {
    const r = applyOne(raw, ctx);
    if (r.ok === false) rejected.push(r.reason);
    else applied += 1;
  }
  return { applied, rejected };
}
