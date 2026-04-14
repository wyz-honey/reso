import { Router } from 'express';
import { envPresenceMap } from '~/utils/cliEnvMerge.ts';

const DEFAULT_CURSOR_THREAD_PROVIDER = 'cursor_agent';

/**
 * 浏览器工作台用：未配置 CLI 工作区时，可用此处作为默认（Node 启动时的 cwd）。
 * - RESO_DEFAULT_WORKSPACE=/abs/path 覆盖 cwd
 * - RESO_EXTERNAL_THREAD_PROVIDER 覆盖外部 CLI 线程在库表中的 provider 键（默认 cursor_agent）
 */
export function createMetaRouter(): Router {
  const r = Router();
  r.get('/api/meta', (_req, res) => {
    const override = process.env.RESO_DEFAULT_WORKSPACE?.trim();
    const cwd = override || process.cwd();
    const externalThreadProvider =
      process.env.RESO_EXTERNAL_THREAD_PROVIDER?.trim() || DEFAULT_CURSOR_THREAD_PROVIDER;
    res.json({ cwd, externalThreadProvider });
  });

  /** 检测 Reso 服务端进程环境中是否已设置给定变量名（不返回任何值，仅是否非空） */
  r.post('/api/meta/cli-env-presence', (req, res) => {
    const raw = req.body?.names;
    const names = Array.isArray(raw)
      ? raw.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const unique = [...new Set(names)].slice(0, 64);
    res.json({ presence: envPresenceMap(unique) });
  });

  return r;
}
