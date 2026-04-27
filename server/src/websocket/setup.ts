import type { Server } from 'http';
import fs from 'fs';
import WebSocket, { WebSocketServer } from 'ws';
import { connectDashScope, resolveAsrModel } from '~/services/asrBridge.ts';
import { connectQwenAsrRealtime, isQwenAsrRealtimeModel } from '~/services/qwenAsrRealtimeBridge.ts';
import { resolveDashscopeApiKey } from '~/services/dashscopeChat.ts';
import {
  ensureCliWorkbenchSessionOutputDir,
  readCursorSessionFilesSync,
  type CliWorkbenchKind,
} from '~/services/cursorPaths.ts';
import {
  CURSOR_TAIL_WS_DEBOUNCE_MS,
  CURSOR_TAIL_WS_POLL_INTERVAL_MS,
} from '~/constants/cursorWorkbench.ts';
import { isValidUuid } from '~/utils/validation.ts';

function upgradePathname(url: string | undefined): string {
  if (typeof url !== 'string') return '';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function closeWss(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function getUiControlSecret(): string {
  return String(process.env.RESO_UI_CONTROL_SECRET ?? '').trim();
}

/**
 * Paraformer `result-generated` 是否句末。须避免 `Boolean("false")===true` 把中间结果整段当定稿。
 * 若未带 `sentence_end`，则以 `end_time` 非空作为已定稿的辅助判断（与百炼文档一致）。
 */
function dashScopeSentenceIsFinal(sentence: {
  sentence_end?: unknown;
  end_time?: unknown;
} | null | undefined): boolean {
  if (!sentence || typeof sentence !== 'object') return false;
  const se = sentence.sentence_end;
  if (se === true || se === 1) return true;
  if (se === false || se === 0) return false;
  if (typeof se === 'string') {
    const t = se.trim().toLowerCase();
    if (t === 'true' || t === '1') return true;
    if (t === 'false' || t === '0' || t === '') return false;
  }
  const et = sentence.end_time;
  if (et != null && et !== '') return true;
  return false;
}

export function attachWebSockets(httpServer: Server): {
  shutdownSockets: () => Promise<void>;
  broadcastUiControlCommands: (commands: unknown[]) => number;
} {
  const wss = new WebSocketServer({ noServer: true });
  const wssCursor = new WebSocketServer({ noServer: true });
  const wssUiControl = new WebSocketServer({ noServer: true });
  const uiControlClients = new Set<WebSocket>();

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = upgradePathname(req.url);
    if (pathname === '/ws/asr') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }
    if (pathname === '/ws/cursor-tail') {
      wssCursor.handleUpgrade(req, socket, head, (ws) => {
        wssCursor.emit('connection', ws, req);
      });
      return;
    }
    if (pathname === '/ws/ui-control') {
      wssUiControl.handleUpgrade(req, socket, head, (ws) => {
        wssUiControl.emit('connection', ws, req);
      });
      return;
    }
    socket.destroy();
  });

  function broadcastUiControlCommands(commands: unknown[]): number {
    const payload = JSON.stringify({ type: 'ui_commands', commands });
    let n = 0;
    for (const clientWs of uiControlClients) {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(payload);
          n += 1;
        } catch {
          /* ignore */
        }
      }
    }
    return n;
  }

  wssUiControl.on('connection', (clientWs) => {
    let authed = false;
    const secret = getUiControlSecret();
    const authTimer = setTimeout(() => {
      if (!authed) {
        try {
          clientWs.close();
        } catch {
          /* ignore */
        }
      }
    }, 12_000);

    const safeSend = (obj: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(obj));
      }
    };

    const cleanup = () => {
      clearTimeout(authTimer);
      uiControlClients.delete(clientWs);
    };

    clientWs.on('message', (data, isBinary) => {
      if (isBinary || authed) return;
      let cmd: { type?: string; token?: string };
      try {
        cmd = JSON.parse(data.toString()) as typeof cmd;
      } catch {
        return;
      }
      if (cmd.type !== 'subscribe') {
        safeSend({ type: 'error', message: 'expected subscribe' });
        return;
      }
      if (secret) {
        if (typeof cmd.token !== 'string' || cmd.token !== secret) {
          safeSend({ type: 'error', message: 'unauthorized' });
          try {
            clientWs.close();
          } catch {
            /* ignore */
          }
          return;
        }
      }
      authed = true;
      clearTimeout(authTimer);
      uiControlClients.add(clientWs);
      safeSend({ type: 'subscribed' });
    });

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });

  wss.on('connection', (clientWs) => {
    let upstreamAsr: ReturnType<typeof connectDashScope> | ReturnType<typeof connectQwenAsrRealtime> | null =
      null;

    const safeSend = (obj: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(obj));
      }
    };

    const teardownUpstream = () => {
      if (upstreamAsr) {
        upstreamAsr.close();
        upstreamAsr = null;
      }
    };

    clientWs.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!upstreamAsr) return;
        upstreamAsr.sendAudio(Buffer.from(data as Buffer));
        return;
      }

      let cmd: {
        type?: string;
        dashscopeApiKey?: string;
        asrModel?: string;
        asrDisfluencyRemoval?: boolean;
        asrLanguageHints?: string[];
        asrMaxSentenceSilenceMs?: number;
      };
      try {
        cmd = JSON.parse(data.toString()) as typeof cmd;
      } catch {
        return;
      }

      if (cmd.type === 'start') {
        teardownUpstream();
        const apiKey = resolveDashscopeApiKey(cmd.dashscopeApiKey);
        if (!apiKey) {
          safeSend({
            type: 'error',
            message:
              '缺少百炼 API Key：请在「模型供应商」或设置中填写，或配置服务端环境变量 DASHSCOPE_API_KEY',
          });
          return;
        }
        const asrModelRaw = typeof cmd.asrModel === 'string' ? cmd.asrModel : '';
        const resolvedModel = resolveAsrModel(asrModelRaw);
        const hints = Array.isArray(cmd.asrLanguageHints)
          ? cmd.asrLanguageHints.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          : undefined;
        const maxMs =
          typeof cmd.asrMaxSentenceSilenceMs === 'number' && !Number.isNaN(cmd.asrMaxSentenceSilenceMs)
            ? cmd.asrMaxSentenceSilenceMs
            : undefined;

        if (isQwenAsrRealtimeModel(resolvedModel)) {
          upstreamAsr = connectQwenAsrRealtime(
            apiKey,
            resolvedModel,
            (ev) => {
              if (ev.type === 'ready') safeSend({ type: 'ready' });
              else if (ev.type === 'transcript') {
                safeSend({
                  type: 'transcript',
                  text: ev.text,
                  sentenceEnd: ev.sentenceEnd,
                });
              } else if (ev.type === 'done') {
                safeSend({ type: 'done' });
                teardownUpstream();
              } else if (ev.type === 'error') {
                safeSend({ type: 'error', message: ev.message });
                teardownUpstream();
              }
            },
            () => {
              upstreamAsr = null;
            },
            {
              language: hints?.[0],
              ...(maxMs != null ? { silenceDurationMs: maxMs } : {}),
            }
          );
        } else {
          upstreamAsr = connectDashScope(
            apiKey,
            resolvedModel,
            (msg) => {
              const header = msg.header as { event?: string; error_message?: string; message?: string } | undefined;
              const event = header?.event;
              if (event === 'result-generated') {
                const payload = msg.payload as {
                  output?: { sentence?: { heartbeat?: boolean; text?: unknown; sentence_end?: boolean } };
                };
                const sentence = payload?.output?.sentence;
                if (sentence?.heartbeat) return;
                const text = sentence?.text;
                if (text != null) {
                  safeSend({
                    type: 'transcript',
                    text,
                    sentenceEnd: dashScopeSentenceIsFinal(sentence),
                  });
                }
              } else if (event === 'task-started') {
                safeSend({ type: 'ready' });
              } else if (event === 'task-finished') {
                safeSend({ type: 'done' });
                teardownUpstream();
              } else if (event === 'task-failed') {
                safeSend({
                  type: 'error',
                  message: header?.error_message || header?.message || 'task-failed',
                });
                teardownUpstream();
              }
            },
            () => {
              upstreamAsr = null;
            },
            {
              disfluencyRemovalEnabled: cmd.asrDisfluencyRemoval !== false,
              ...(hints && hints.length ? { languageHints: hints } : {}),
              ...(maxMs != null ? { maxSentenceSilenceMs: maxMs } : {}),
            }
          );
        }
        return;
      }

      if (cmd.type === 'stop') {
        if (upstreamAsr) upstreamAsr.finish();
        else safeSend({ type: 'done' });
      }
    });

    clientWs.on('close', () => teardownUpstream());
    clientWs.on('error', () => teardownUpstream());
  });

  wssCursor.on('connection', (clientWs) => {
    let dirWatcher: fs.FSWatcher | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    /** 上次已推送内容签名，避免重复帧；stop 时清空以便重新 subscribe 会再推一帧 */
    let lastSentSig = '';

    const stopWatch = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (dirWatcher) {
        try {
          dirWatcher.close();
        } catch {
          /* ignore */
        }
        dirWatcher = null;
      }
      lastSentSig = '';
    };

    const safeSend = (obj: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(obj));
    };

    clientWs.on('message', (data, isBinary) => {
      if (isBinary) return;
      let cmd: { type?: string; sessionId?: string; cliKind?: string };
      try {
        cmd = JSON.parse(data.toString()) as typeof cmd;
      } catch {
        return;
      }
      if (cmd.type !== 'subscribe') return;
      const sid = typeof cmd.sessionId === 'string' ? cmd.sessionId.trim() : '';
      const cliKind: CliWorkbenchKind =
        String(cmd.cliKind ?? '').trim().toLowerCase() === 'qoder' ? 'qoder' : 'cursor';
      if (!isValidUuid(sid)) {
        safeSend({ type: 'error', message: 'invalid sessionId' });
        return;
      }
      stopWatch();
      let dirAbs: string;
      try {
        dirAbs = ensureCliWorkbenchSessionOutputDir(sid, cliKind);
      } catch (e) {
        safeSend({ type: 'error', message: e instanceof Error ? e.message : 'mkdir failed' });
        return;
      }

      const pushIfChanged = () => {
        const { info, error } = readCursorSessionFilesSync(dirAbs);
        const sig = `${info.length}\0${error.length}\0${info}\0${error}`;
        if (sig === lastSentSig) return;
        lastSentSig = sig;
        safeSend({ type: 'files', info, error });
      };

      const schedulePush = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          pushIfChanged();
        }, CURSOR_TAIL_WS_DEBOUNCE_MS);
      };

      pushIfChanged();

      try {
        dirWatcher = fs.watch(dirAbs, { persistent: false }, () => {
          schedulePush();
        });
      } catch (e) {
        safeSend({ type: 'error', message: e instanceof Error ? e.message : 'watch failed' });
      }

      /**
       * 目录 fs.watch 在部分环境对「仅追加写入同一文件」不触发或触发不稳定；CLI 重定向 stdout
       * 时常为块缓冲；轮询间隔见 CURSOR_TAIL_WS_POLL_INTERVAL_MS。
       */
      pollTimer = setInterval(pushIfChanged, CURSOR_TAIL_WS_POLL_INTERVAL_MS);
    });

    clientWs.on('close', stopWatch);
    clientWs.on('error', stopWatch);
  });

  return {
    shutdownSockets: () =>
      Promise.all([closeWss(wss), closeWss(wssCursor), closeWss(wssUiControl)]).then(() => {}),
    broadcastUiControlCommands,
  };
}
