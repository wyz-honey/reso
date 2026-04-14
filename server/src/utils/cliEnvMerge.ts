/** 与前端一致的 POSIX 风格环境变量名 */
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const MAX_KEYS = 48;
const MAX_KEY_LEN = 128;
const MAX_VAL_LEN = 16384;

/** 从请求体解析 cliEnv：仅 string 值，过滤非法键名与尺寸 */
export function parseCliEnvPayload(raw: unknown): Record<string, string> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k0, v0] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    const k = String(k0 || '').trim();
    if (k.length === 0 || k.length > MAX_KEY_LEN || !ENV_NAME_RE.test(k)) continue;
    if (typeof v0 !== 'string') continue;
    const v = v0.slice(0, MAX_VAL_LEN);
    if (v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

/**
 * 合并进子进程环境：仅当 process.env 中该键缺失或为空字符串时，使用 fill 中的值。
 */
export function mergeProcessEnvFillMissing(
  processEnv: NodeJS.ProcessEnv,
  fill: Record<string, string>
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...processEnv };
  for (const [k, v] of Object.entries(fill)) {
    if (!ENV_NAME_RE.test(k)) continue;
    const cur = out[k];
    const empty = cur == null || String(cur).trim() === '';
    if (empty && String(v).trim() !== '') {
      out[k] = v;
    }
  }
  return out;
}

export function envPresenceMap(names: string[]): Record<string, boolean> {
  const presence: Record<string, boolean> = {};
  for (const raw of names) {
    const k = String(raw || '').trim();
    if (!ENV_NAME_RE.test(k) || k.length > MAX_KEY_LEN) continue;
    const cur = process.env[k];
    presence[k] = cur != null && String(cur).trim() !== '';
  }
  return presence;
}
