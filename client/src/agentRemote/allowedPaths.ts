/** 仅允许 Agent / 服务端推送触达的导航路径（防开放重定向与任意跳转） */
export const AGENT_UI_ALLOWED_NAV_PATHS: readonly string[] = [
  '/',
  '/quick-inputs',
  '/sessions',
  '/outputs',
  '/settings',
  '/model-providers',
  '/drawing',
];

export function isAgentUiAllowedPath(path: string): boolean {
  const p = typeof path === 'string' ? path.trim() : '';
  if (!p.startsWith('/')) return false;
  if (p.includes('//') || p.includes('\\')) return false;
  return (AGENT_UI_ALLOWED_NAV_PATHS as readonly string[]).includes(p);
}
