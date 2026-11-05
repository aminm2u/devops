import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { navGroupsFromRoutes, type NavRoute } from '@/app/routes.config';
import mwpLogoWhite from '@/assets/mwp_logo_white.png';
import mwpLogoBlack from '@/assets/mwp_logo_black.png';

interface SidebarProps {
  isCollapsed: boolean;
}

/**
 * Navigation.
 *
 * The list is not written here — it is derived from `app/routes.config.tsx`,
 * which is also what the router guards. That is the point: a nav item cannot
 * exist for a page the guard would bounce, and a new page cannot be added
 * without deciding, in one place, who may see it.
 *
 * Visibility is then filtered against the caller's *resolved* access, the same
 * payload `useAuth().can` reads, so this is consistent with the server rather
 * than a second guess at it.
 *
 * Large groups (DevOps Operations carries nine destinations) fold away. A
 * folded group re-opens itself whenever the current page is inside it, so
 * collapsing can never hide where you are.
 */

/**
 * A nav item is active only when its href is the longest matching prefix of
 * the current path — so "/devops/helpdesk/reports" activates "Helpdesk
 * Reports" without also activating "Helpdesk Queue".
 */
function isNavActive(pathname: string, href: string, allHrefs: string[]): boolean {
  const isPrefix = (candidate: string) =>
    candidate === '/'
      ? pathname === '/'
      : pathname === candidate || pathname.startsWith(candidate + '/');
  if (!isPrefix(href)) return false;
  return !allHrefs.some(
    (other) => other !== href && other.length > href.length && isPrefix(other)
  );
}

const NAV_GROUPS = navGroupsFromRoutes();

/** Groups above this size fold by default. */
const FOLD_THRESHOLD = 5;

export function Sidebar({ isCollapsed }: SidebarProps) {
  const location = useLocation();
  const { can, isSuperAdmin, user } = useAuth();
  const { effectiveTheme } = useTheme();
  const logo = effectiveTheme === 'dark' ? mwpLogoWhite : mwpLogoBlack;

  const hrefOf = (route: NavRoute) => `/${route.path}`;
  const allHrefs = NAV_GROUPS.flatMap((group) => group.items.map(hrefOf));

  const isVisible = (route: NavRoute): boolean => {
    const { meta } = route;
    if (meta.superAdminOnly) return isSuperAdmin;
    if (meta.permission) return can(meta.permission);
    if (meta.anyOf?.length) return meta.anyOf.some((perm) => can(perm));
    return true;
  };

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter(isVisible) })).filter(
        (group) => group.items.length > 0
      ),
    // `can` is a stable Zustand action, so it never changes identity — the
    // real dependency is the resolved access payload. Keying the memo on
    // `user?.access` is what makes a mid-session grant (or a revoke) re-filter
    // the nav without a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.access, isSuperAdmin, can]
  );

  // `open` records the groups the user explicitly opened or closed. Anything
  // absent uses the default, so a role change does not leave stale state.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  /** The group containing the current page is always open. */
  const activeGroup = visibleGroups.find((group) =>
    group.items.some((route) =>
      isNavActive(location.pathname, hrefOf(route), allHrefs)
    )
  )?.key;

  // Re-opened on navigation rather than in render, so the user can still close
  // it while staying on the page.
  useEffect(() => {
    if (activeGroup) setOpen((prev) => ({ ...prev, [activeGroup]: true }));
  }, [activeGroup]);

  const isOpen = (key: string, size: number) =>
    open[key] ?? size <= FOLD_THRESHOLD;

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-secondary transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo — same height as navbar */}
      <div className="mt-2 flex h-14 shrink-0 items-center justify-center border-b border-border/40">
        {!isCollapsed ? (
          <img src={logo} alt="MyWorkPortal2.0" className="h-12 w-auto object-contain px-12" />
        ) : (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-primary p-4 text-[11px] font-bold text-primary-foreground">
            MWP
          </div>
        )}
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-2 py-3">
        {visibleGroups.map((group, gi) => {
          const folded = group.items.length > FOLD_THRESHOLD;
          const expanded = isOpen(group.key, group.items.length);
          const hasActive = group.items.some((route) =>
            isNavActive(location.pathname, hrefOf(route), allHrefs)
          );

          return (
            <div key={group.key} className={cn(gi > 0 && 'mt-4')}>
              {!isCollapsed &&
                (folded ? (
                  <button
                    type="button"
                    onClick={() => setOpen((prev) => ({ ...prev, [group.key]: !expanded }))}
                    className="mb-1 flex w-full items-center justify-between rounded px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                    aria-expanded={expanded}
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={cn('h-3 w-3 transition-transform', !expanded && '-rotate-90')}
                    />
                  </button>
                ) : (
                  <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    {group.label}
                  </div>
                ))}
              {isCollapsed && gi > 0 && <div className="mx-3 my-2 border-t border-border/40" />}

              {expanded && (
                <div className="space-y-0.5">
                  {group.items.map((route) => {
                    const href = hrefOf(route);
                    const isActive = isNavActive(location.pathname, href, allHrefs);
                    const { nav } = route.meta;
                    const Icon = nav.icon;
                    return (
                      <Link
                        key={route.path}
                        to={href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          isCollapsed && 'justify-center px-2'
                        )}
                        title={isCollapsed ? nav.label : undefined}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        {!isCollapsed && <span>{nav.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* A folded group with the current page inside it still shows
                  where you are — the folder button alone would lose that. */}
              {!expanded && !isCollapsed && hasActive && (
                <div className="mx-3 h-0.5 rounded-full bg-primary/40" />
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
