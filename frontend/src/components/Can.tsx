import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { PermissionScope } from '@/types';

interface CanProps {
  /** Capability required to render the children. */
  permission: string;
  /** Required scope. Defaults to `self`, i.e. "holds it at any scope". */
  scope?: PermissionScope;
  /** Rendered instead when the capability is missing. Defaults to nothing. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Button- and block-level capability gate.
 *
 * Route access is handled in `app/routes.config.tsx` (and enforced again by
 * the API). This is for the *within* a page case: a create button, a delete
 * row action, a settings panel. The API is still the authority — hiding a
 * button only keeps people out of dead ends; it is not a security boundary.
 *
 * The button is **hidden**, not disabled: a greyed-out control tells a user
 * they are missing out on something, which is noise for the majority who were
 * never meant to have it.
 *
 * @example
 * <Can permission="procurement.requisition.create">
 *   <Button>New Requisition</Button>
 * </Can>
 */
export function Can({ permission, scope = 'self', fallback = null, children }: CanProps) {
  const { can } = useAuth();
  return <>{can(permission, scope) ? children : fallback}</>;
}

/** `anyOf` variant — render when the user holds at least one of the listed capabilities. */
export function CanAny({
  permissions,
  scope = 'self',
  fallback = null,
  children,
}: {
  permissions: string[];
  scope?: PermissionScope;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can } = useAuth();
  return <>{permissions.some((permission) => can(permission, scope)) ? children : fallback}</>;
}
