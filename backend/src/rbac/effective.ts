import prisma from "../config/database.js";

/**
 * Effective-access resolver.
 *
 * Multi-role resolution (plan §2.2.1):
 *   effective = (⋃ role grants) ∪ (direct allows) − (direct denies)
 *   scope(p)  = max(scope of every allowing source)      // self < team < department < all
 *
 * Rules, in order of authority:
 *   1. A direct **deny** removes the permission no matter how many roles grant it.
 *   2. Otherwise the permission is held, at the widest scope any source allows.
 *   3. Duplicate grants from several roles are merged into one entry that keeps
 *      every source, so the UI can explain *why* the user has it.
 */

export const MODEL_USER = "App\\Models\\User";

export type PermissionScope = "self" | "team" | "department" | "all";

const SCOPE_RANK: Record<PermissionScope, number> = {
  self: 1,
  team: 2,
  department: 3,
  all: 4,
};

export function normaliseScope(value: unknown): PermissionScope {
  return value === "self" || value === "team" || value === "department" ? value : "all";
}

export function scopeRank(scope: PermissionScope): number {
  return SCOPE_RANK[scope];
}

/** True when `actual` is at least as wide as `required`. */
export function scopeCovers(actual: PermissionScope, required: PermissionScope): boolean {
  return scopeRank(actual) >= scopeRank(required);
}

export interface PermissionSource {
  type: "role" | "direct";
  id: number;
  name: string;
  scope: PermissionScope;
}

export interface ResolvedPermission {
  name: string;
  /** Widest scope among all allowing sources. */
  scope: PermissionScope;
  sources: PermissionSource[];
  /** A direct override removed a grant held through roles. */
  denied: boolean;
  deniedBy?: { type: "direct"; id: number; reason?: string };
  /** Two or more sources disagreed on scope and the widest won. */
  widened: boolean;
}

export interface ResolvedAccess {
  userId: number;
  /** Roles held, with the raw grants each one contributes. */
  roles: {
    id: number;
    name: string;
    level: number;
    color: string | null;
    /** Permission names granted by this role alone (before deny/merge). */
    permissions: string[];
  }[];
  permissions: Record<string, ResolvedPermission>;
  teamIds: number[];
  departmentIds: number[];
  directManagerId: number | null;
  /** Highest role level held. Used to block privilege escalation. */
  level: number;
  isSuperAdmin: boolean;
}

/** Cache key — resolution touches 5 tables, so keep it per-request. */
export const accessCacheKey = (userId: number) => `access:${userId}`;

/**
 * Every department ID in the subtree rooted at `rootId` (inclusive).
 * Used so a `department`-scoped grant covers nested departments too.
 */
function collectDepartmentSubtree(
  all: { id: number; parentId: number | null }[],
  rootId: number | null
): number[] {
  if (rootId === null) return [];
  const childrenOf = new Map<number, number[]>();
  for (const dept of all) {
    if (dept.parentId === null) continue;
    const bucket = childrenOf.get(dept.parentId) ?? [];
    bucket.push(dept.id);
    childrenOf.set(dept.parentId, bucket);
  }
  const out: number[] = [];
  const stack = [rootId];
  const seen = new Set<number>();
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    for (const child of childrenOf.get(current) ?? []) stack.push(child);
  }
  return out;
}

/**
 * Resolve the effective permission set for one user.
 *
 * This is the only place the union/deny/max-scope algorithm is implemented —
 * route guards, `/auth/me` and the Access Control page all read its output.
 */
export async function resolveAccess(userId: number): Promise<ResolvedAccess> {
  const [user, assignments, directGrants, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, departmentId: true, directManagerId: true },
    }),
    prisma.modelHasRole.findMany({
      where: { modelId: userId, modelType: MODEL_USER },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    }),
    prisma.modelHasPermission.findMany({
      where: { modelId: userId, modelType: MODEL_USER },
      include: { permission: true },
    }),
    prisma.teamMember.findMany({
      where: { userId, isActive: true },
      select: { teamId: true },
    }),
  ]);

  if (!user) {
    return {
      userId,
      roles: [],
      permissions: {},
      teamIds: [],
      departmentIds: [],
      directManagerId: null,
      level: 0,
      isSuperAdmin: false,
    };
  }

  const roles = assignments.map((a) => ({
    id: a.role.id,
    name: a.role.name,
    level: a.role.level,
    color: a.role.color,
    permissions: a.role.permissions.map((rhp) => rhp.permission.name),
  }));

  const acc: Record<string, ResolvedPermission> = {};

  /**
   * Create or fetch the accumulator for a permission.
   *
   * The scope starts at the *narrowest* value, not "all" — otherwise a role
   * granting `team` scope would be silently widened to `all` simply because
   * the entry already existed.
   */
  const ensure = (name: string): ResolvedPermission => {
    if (!acc[name]) {
      acc[name] = { name, scope: "self", sources: [], denied: false, widened: false };
    }
    return acc[name];
  };

  /** Fold one allowing source into an entry, keeping the widest scope. */
  const addSource = (entry: ResolvedPermission, source: PermissionSource): void => {
    const first = entry.sources.length === 0;
    entry.sources.push(source);
    if (first) {
      entry.scope = source.scope;
      return;
    }
    if (scopeRank(source.scope) > scopeRank(entry.scope)) {
      entry.scope = source.scope;
      entry.widened = true;
    } else if (scopeRank(source.scope) < scopeRank(entry.scope)) {
      entry.widened = true;
    }
  };

  // ── 1. Union of role grants, widest scope per permission ────────────────
  for (const assignment of assignments) {
    const role = assignment.role;
    for (const rhp of role.permissions) {
      const name = rhp.permission.name;
      const scope = rhp.permission.supportsScope ? normaliseScope(rhp.scope) : "all";
      addSource(ensure(name), { type: "role", id: role.id, name: role.name, scope });
    }
  }

  // ── 2. Direct allows add; direct denies subtract ────────────────────────
  for (const grant of directGrants) {
    const name = grant.permission.name;
    const effect = grant.effect === "deny" ? "deny" : "allow";
    const scope = grant.permission.supportsScope ? normaliseScope(grant.scope) : "all";
    const entry = ensure(name);

    if (effect === "deny") {
      entry.denied = true;
      entry.deniedBy = { type: "direct", id: grant.permissionId };
      continue;
    }

    addSource(entry, { type: "direct", id: grant.permissionId, name: "Direct grant", scope });
  }

  // ── 3. Drop entries that only existed to carry a deny ──────────────────
  // A deny on a permission nobody grants is noise; keep it only if it
  // actually revoked something, so the Effective Access UI stays readable.
  for (const key of Object.keys(acc)) {
    if (acc[key].denied && acc[key].sources.length === 0) delete acc[key];
  }

  const isSuperAdmin = roles.some((role) => role.name === "super-admin");
  const level = roles.reduce((max, role) => Math.max(max, role.level), 0);

  // ── 4. Department scope: own department plus every nested child ────────
  let departmentIds: number[] = [];
  if (user.departmentId !== null) {
    const allDepartments = await prisma.department.findMany({
      select: { id: true, parentId: true },
    });
    departmentIds = collectDepartmentSubtree(allDepartments, user.departmentId);
  }

  return {
    userId,
    roles,
    permissions: acc,
    teamIds: memberships.map((m) => m.teamId),
    departmentIds,
    directManagerId: user.directManagerId,
    level,
    isSuperAdmin,
  };
}

/** Flat list of permission names the user actually holds (denies removed). */
export function permissionNames(access: ResolvedAccess): string[] {
  return Object.values(access.permissions)
    .filter((perm) => !perm.denied)
    .map((perm) => perm.name);
}

/**
 * Single check used by every guard.
 * Super admin bypasses the table entirely, but is still subject to the
 * single-holder invariant enforced at the data layer.
 */
export function can(
  access: ResolvedAccess,
  permission: string,
  required: PermissionScope = "self"
): boolean {
  if (access.isSuperAdmin) return true;
  const entry = access.permissions[permission];
  if (!entry || entry.denied) return false;
  return scopeCovers(entry.scope, required);
}
