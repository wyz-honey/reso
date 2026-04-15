import { useCallback, type MouseEvent } from 'react';
import { NavLink, useLocation, type NavLinkProps, type To } from 'react-router-dom';
import { useWorkbenchNavigationGuardStore } from '../stores/workbenchNavigationGuardStore';

function pathOnly(to: To): string {
  if (typeof to === 'string') {
    const s = to;
    const cut = s.search(/[?#]/);
    const base = cut === -1 ? s : s.slice(0, cut);
    return base === '' ? '/' : base;
  }
  const p = to.pathname || '/';
  return p.startsWith('/') ? p : `/${p}`;
}

type Props = Pick<NavLinkProps, 'to' | 'end' | 'className' | 'children'>;

/**
 * When the workbench registers a listening guard, intercepts sidebar navigations
 * away from `/` so the user can confirm before leaving active recognition.
 */
export default function WorkbenchGuardedNavLink({ to, end, className, children }: Props) {
  const location = useLocation();

  const onClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      const next = pathOnly(to);
      const from = location.pathname;
      if (from === '/' && next !== '/' && useWorkbenchNavigationGuardStore.getState().shouldBlock()) {
        e.preventDefault();
        useWorkbenchNavigationGuardStore.getState().requestNavigate(next);
      }
    },
    [location.pathname, to]
  );

  return (
    <NavLink to={to} end={end} className={className} onClick={onClick}>
      {children}
    </NavLink>
  );
}
