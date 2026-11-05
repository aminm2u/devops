import type { PermissionScope, Role, User } from '@/types';

/**
 * Canonical system role names.
 *
 * These exist in a single place because they were previously spelled out as
 * literal arrays in a dozen components (`['super-admin', 'devops-admin']`),
 * which drifted: some pages still checked `devops-admin`, a role the seeder no
 * longer creates, so the check was always false.
 *
 * Only `SUPER_ADMIN` is special — it is the protected, single-holder role.
 * Every other role is data: create, rename or delete it in /admin/access.
 */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super-admin',
  HR_MANAGER: 'hr-manager',
  DEPARTMENT_HEAD: 'department-head',
  PMO: 'project-manager-officer',
  DEVOPS_TEAM_LEAD: 'devops-team-lead',
  DEVOPS_ASSISTANT_TEAM_LEAD: 'devops-assistant-team-lead',
  DEVOPS_ENGINEER: 'devops-engineer',
  FINANCE: 'finance',
  EMPLOYEE: 'employee',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

const SCOPE_RANK: Record<PermissionScope, number> = {
  self: 1,
  team: 2,
  department: 3,
  all: 4,
};

/** Role names held by a user, tolerating both `string[]` and `{name}[]`. */
export function roleNames(user: User | null | undefined): string[] {
  if (!user?.roles) return [];
  return user.roles.map((role: Role | string) =>
    typeof role === 'string' ? role : role.name
  );
}

export function isSuperAdmin(user: User | null | undefined): boolean {
  if (user?.access) return user.access.isSuperAdmin;
  return roleNames(user).includes(SYSTEM_ROLES.SUPER_ADMIN);
}

export function hasRole(user: User | null | undefined, role: string): boolean {
  return roleNames(user).includes(role);
}

export function hasAnyRole(user: User | null | undefined, roles: string[]): boolean {
  const held = roleNames(user);
  return roles.some((role) => held.includes(role));
}

/**
 * Capability check. Reads the resolved access payload from `/auth/me` when
 * present (denies already applied), falling back to the legacy permission
 * array for sessions created before the resolver existed.
 */
export function can(
  user: User | null | undefined,
  permission: string,
  scope: PermissionScope = 'self'
): boolean {
  if (!user) return false;
  if (user.access) {
    if (user.access.isSuperAdmin) return true;
    const entry = user.access.permissions.find((perm) => perm.name === permission);
    if (!entry) return false;
    return SCOPE_RANK[entry.scope] >= SCOPE_RANK[scope];
  }
  if (isSuperAdmin(user)) return true;
  if (!user.permissions) return false;
  return user.permissions.some((perm) =>
    typeof perm === 'string' ? perm === permission : perm.name === permission
  );
}

/** The scope the user holds for a permission, or null when they do not hold it. */
export function scopeOf(
  user: User | null | undefined,
  permission: string
): PermissionScope | null {
  if (!user) return null;
  if (user.access) {
    if (user.access.isSuperAdmin) return 'all';
    return user.access.permissions.find((perm) => perm.name === permission)?.scope ?? null;
  }
  const held = user.permissions?.some((perm) =>
    typeof perm === 'string' ? perm === permission : perm.name === permission
  );
  return held ? 'all' : null;
}

/** Highest role level held — mirrors the server-side escalation guard. */
export function accessLevel(user: User | null | undefined): number {
  if (!user) return 0;
  if (user.access) return user.access.level;
  return 0;
}
