import type { Server } from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import { connectDashScope } from '~/services/asrBridge.ts';
import { resolveDashscopeApiKey } from '~/services/dashscopeChat.ts';
import { getCursorOutputRootResolved, readCursorSessionFilesSync } from '~/services/cursorPaths.ts';
import { isValidUuid } from '~/utils/validation.ts';

function upgradePathname(url: string | undefined): string {
  if (typeof url !== 'string') return '';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function attachWebSockets(httpServer: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  const wssCursor = new WebSocketServer({ noServer: true });

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
    socket.destroy();
  });

  wss.on('connection', (clientWs) => {
    let upstreamAsr: ReturnType<typeof connectDashScope> | null = null;

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

      let cmd: { type?: string; dashscopeApiKey?: string; asrModel?: string };
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
        const asrModel = typeof cmd.asrModel === 'string' ? cmd.asrModel : '';
        upstreamAsr = connectDashScope(
          apiKey,
          asrModel,
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
                  sentenceEnd: Boolean(sentence?.sentence_end),
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
          }
        );
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
    let watcher: fs.FSWatcher | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const stopWatch = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (watcher) {
        try {
          watcher.close();
        } catch {
          /* ignore */
        }
        watcher = null;
      }
    };

    const safeSend = (obj: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify(obj));
    };

    clientWs.on('message', (data, isBinary) => {
      if (isBinary) return;
      let cmd: { type?: string; sessionId?: string };
      try {
        cmd = JSON.parse(data.toString()) as typeof cmd;
      } catch {
        return;
      }
      if (cmd.type !== 'subscribe') return;
      const sid = typeof cmd.sessionId === 'string' ? cmd.sessionId.trim() : '';
      if (!isValidUuid(sid)) {
        safeSend({ type: 'error', message: 'invalid sessionId' });
        return;
      }
      stopWatch();
      const dirAbs = path.join(getCursorOutputRootResolved(), sid);
      try {
        fs.mkdirSync(dirAbs, { recursive: true });
      } catch (e) {
        safeSend({ type: 'error', message: e instanceof Error ? e.message : 'mkdir failed' });
        return;
      }

      const pushFiles = () => {
        debounceTimer = null;
        const { info, error } = readCursorSessionFilesSync(dirAbs);
        safeSend({ type: 'files', info, error });
      };

      pushFiles();

      try {
        watcher = fs.watch(dirAbs, { persistent: false }, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(pushFiles, 120);
        });
      } catch (e) {
        safeSend({ type: 'error', message: e instanceof Error ? e.message : 'watch failed' });
      }
    });

    clientWs.on('close', stopWatch);
    clientWs.on('error', stopWatch);
  });
}
