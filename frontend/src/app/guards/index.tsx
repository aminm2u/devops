import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { SYSTEM_ROLES } from '@/lib/roles';
import type { PermissionScope } from '@/types';

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/**
 * Base guard — must be authenticated.
 * Preserves the attempted URL so login can bounce back to it.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  return <>{children}</>;
}

/**
 * Capability guard.
 *
 *   <PermissionRoute permission="admin.role.manage">…</PermissionRoute>
 *   <PermissionRoute anyOf={['project.record.manage', 'project.record.create']}>
 *
 * This is a UX gate only — the API enforces the same permission on every route.
 * Sending the user to `/forbidden` rather than `/dashboard` makes a stale
 * permission visible instead of looking like a broken link.
 */
export function PermissionRoute({
  children,
  permission,
  anyOf,
  scope = 'self',
}: {
  children: React.ReactNode;
  permission?: string;
  anyOf?: string[];
  scope?: PermissionScope;
}) {
  const { isAuthenticated, isLoading, user, can } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  if (!user) return <FullScreenLoader />;

  const allowed = permission
    ? can(permission, scope)
    : anyOf?.some((perm) => can(perm, scope)) ?? false;

  if (!allowed) {
    return <Navigate to="/forbidden" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/** Login/register — already-authenticated visitors go straight to the app. */
export function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullScreenLoader />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return <>{children}</>;
}

/** The one place that decides "is this the platform owner". */
export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  const isOwner =
    isSuperAdmin || user?.roles?.some((role) => {
      const name = typeof role === 'string' ? role : role.name;
      return name === SYSTEM_ROLES.SUPER_ADMIN;
    });

  if (!isOwner) {
    return <Navigate to="/forbidden" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
