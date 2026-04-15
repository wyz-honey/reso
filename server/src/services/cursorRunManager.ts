import { spawn, type ChildProcess } from 'node:child_process';
import { mergeProcessEnvFillMissing } from '~/utils/cliEnvMerge.ts';
import { serviceLog, serviceWarn } from '~/utils/logger.ts';
import {
  CURSOR_RUN_MAX_COMMAND_CHARS,
  CURSOR_RUN_STOP_SIGKILL_AFTER_MS,
} from '~/constants/cursorWorkbench.ts';
import type { CliWorkbenchKind } from '~/services/cursorPaths.ts';

type RunEntry = { child: ChildProcess };

const runs = new Map<string, RunEntry>();

function runMapKey(sessionId: string, kind: CliWorkbenchKind): string {
  return `${String(sessionId || '').trim()}:${kind}`;
}

function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid == null) {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM');
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  const t = setTimeout(() => {
    try {
      if (process.platform === 'win32') {
        child.kill('SIGKILL');
      } else {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    } catch {
      /* ignore */
    }
  }, CURSOR_RUN_STOP_SIGKILL_AFTER_MS);
  t.unref();
}

function spawnShellCommand(command: string, env: NodeJS.ProcessEnv): ChildProcess {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', command], {
      stdio: 'ignore',
      detached: true,
      env,
      windowsHide: true,
    });
  }
  return spawn('/bin/bash', ['-lc', command], {
    stdio: 'ignore',
    detached: true,
    env,
  });
}

function attachExitCleanup(mapKey: string, child: ChildProcess): void {
  const done = () => {
    const cur = runs.get(mapKey);
    if (cur?.child === child) runs.delete(mapKey);
  };
  child.once('exit', (code, signal) => {
    done();
    serviceLog('cursor-run', 'subprocess exit', {
      mapKey,
      code,
      signal: signal ?? undefined,
    });
  });
  child.once('error', (err) => {
    done();
    serviceWarn('cursor-run', 'subprocess error', {
      mapKey,
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

export function getCursorRunStatus(
  sessionId: string,
  kind: CliWorkbenchKind = 'cursor'
): { running: boolean; pid: number | null } {
  const e = runs.get(runMapKey(sessionId, kind));
  if (!e) return { running: false, pid: null };
  return { running: true, pid: e.child.pid ?? null };
}

export function stopCursorRun(
  sessionId: string,
  kind: CliWorkbenchKind = 'cursor'
): { ok: boolean; message?: string } {
  const e = runs.get(runMapKey(sessionId, kind));
  if (!e) return { ok: false, message: 'not running' };
  killProcessTree(e.child);
  return { ok: true };
}

/**
 * 在服务端用 shell 执行整条 Cursor CLI 命令（含重定向）；与剪贴板内容一致。
 * 同一 session 若已有运行中的任务会先尝试终止再起新进程。
 */
export function startCursorRun(
  sessionId: string,
  command: string,
  envFill?: Record<string, string>,
  kind: CliWorkbenchKind = 'cursor'
): { ok: true; pid: number } | { ok: false; error: string } {
  const cmd = String(command ?? '').trim();
  if (cmd.length === 0) return { ok: false, error: 'empty command' };
  if (cmd.length > CURSOR_RUN_MAX_COMMAND_CHARS) {
    return { ok: false, error: 'command too long' };
  }

  const mapKey = runMapKey(sessionId, kind);
  stopCursorRun(sessionId, kind);

  const env = mergeProcessEnvFillMissing(process.env, envFill || {});

  let child: ChildProcess;
  try {
    child = spawnShellCommand(cmd, env);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `spawn failed: ${msg}` };
  }

  if (child.pid == null) {
    return { ok: false, error: 'spawn returned no pid' };
  }

  runs.set(mapKey, { child });
  attachExitCleanup(mapKey, child);

  serviceLog('cursor-run', 'subprocess started', { sessionId, cliKind: kind, pid: child.pid });
  return { ok: true, pid: child.pid };
}

export function stopAllCursorRuns(): void {
  for (const mapKey of [...runs.keys()]) {
    const idx = mapKey.lastIndexOf(':');
    const sid = idx === -1 ? mapKey : mapKey.slice(0, idx);
    const kind = (idx === -1 ? 'cursor' : mapKey.slice(idx + 1)) as CliWorkbenchKind;
    stopCursorRun(sid, kind === 'qoder' ? 'qoder' : 'cursor');
  }
}
