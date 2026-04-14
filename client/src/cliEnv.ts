/** 与后端一致的 POSIX 环境变量名 */
export const CLI_ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function normalizeCliEnvRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k0, v0] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(k0 || '').trim();
    if (!CLI_ENV_NAME_RE.test(k)) continue;
    const v = String(v0 ?? '').trim();
    if (!v) continue;
    out[k] = v;
  }
  return out;
}

/** 多层合并（后者覆盖前者）：兼容 extensions.cliEnv、extensions.environment、行级 environment */
export function mergeTargetEnvLayers(...layers: unknown[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const layer of layers) {
    Object.assign(merged, normalizeCliEnvRecord(layer));
  }
  return merged;
}

/** 仅非空键值，供 ensure 等 API */
export function cliEnvForApi(mode: { cliEnv?: unknown } | null | undefined): Record<string, string> | undefined {
  const n = normalizeCliEnvRecord(mode?.cliEnv);
  return Object.keys(n).length > 0 ? n : undefined;
}

export function cliEnvKeysForPresence(mode: { cliEnv?: unknown } | null | undefined): string[] {
  return Object.keys(normalizeCliEnvRecord(mode?.cliEnv));
}
