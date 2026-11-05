import { Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { RequestWithUser } from "../types/index.js";
import {
  PermissionScope,
  ResolvedAccess,
  can,
  normaliseScope,
} from "./effective.js";

export interface AuthorizeOptions {
  /** Capability required. One of `permission` or `anyOf` is mandatory. */
  permission?: string;
  /** OR semantics across several permissions. */
  anyOf?: string[];
  /** Minimum scope the grant must reach. Defaults to "self". */
  scope?: PermissionScope;
  /** Accept any role in this list — for the few system-only routes. */
  roles?: string[];
}

/**
 * Capability guard.
 *
 *   authorize({ permission: "hr.user.manage" })
 *   authorize({ permission: "timesheet.entry.read", scope: "team" })
 *   authorize({ anyOf: ["project.record.manage", "project.record.create"] })
 *   authorize({ roles: ["super-admin"] })
 *
 * Requires `authenticate()` to have populated `req.access` (see
 * middleware/auth.ts). A missing `req.access` is a wiring bug, not a user
 * error, but it is surfaced as 401 rather than 500 so a misordered middleware
 * cannot accidentally open a route.
 */
export function authorize(options: AuthorizeOptions) {
  const requiredScope = normaliseScope(options.scope ?? "self");
  const { permission, anyOf, roles } = options;

  if (!permission && !anyOf && !roles) {
    throw new Error("authorize() requires one of: permission, anyOf, roles");
  }

  return (req: RequestWithUser, _res: Response, next: NextFunction): void => {
    const access = req.access;
    if (!req.user || !access) {
      return next(new UnauthorizedError("Authentication required"));
    }

    if (roles && roles.length) {
      const held = access.roles.map((r) => r.name);
      if (roles.some((role) => held.includes(role))) return next();
    }

    if (permission && can(access, permission, requiredScope)) return next();

    if (anyOf && anyOf.some((perm) => can(access, perm, requiredScope))) return next();

    const asked = permission ?? (anyOf ? anyOf.join(" | ") : roles!.join(" | "));
    return next(
      new ForbiddenError(
        requiredScope === "self"
          ? `Requires permission: ${asked}`
          : `Requires permission: ${asked} (scope: ${requiredScope})`
      )
    );
  };
}

/** Super-admin-only shortcut for the handful of platform-owner routes. */
export const superAdminOnly = authorize({ roles: ["super-admin"] });

/**
 * Attach the resolved access object to the request so route handlers can make
 * record-level decisions (e.g. "is this entry's owner in my team?").
 */
export function withAccess(
  req: RequestWithUser,
  res: Response,
  next: NextFunction
): void {
  if (!req.access) return next(new UnauthorizedError("Authentication required"));
  next();
}

// ── Record scoping helpers ───────────────────────────────────────────────────

export interface ScopeContext {
  /** The user's own id — matches `ownerId`, `userId`, `requesterId`, … */
  userId: number;
  teamIds: number[];
  departmentIds: number[];
  isSuperAdmin: boolean;
}

export function scopeContext(access: ResolvedAccess): ScopeContext {
  return {
    userId: access.userId,
    teamIds: access.teamIds,
    departmentIds: access.departmentIds,
    isSuperAdmin: access.isSuperAdmin,
  };
}

/**
 * Does the record fall inside the user's team scope?
 *
 * Unassigned records (`teamId === null`) are visible to everyone holding the
 * capability: legacy rows predate teams, and hiding them would look like data
 * loss rather than a scope rule.
 */
export function inTeamScope(ctx: ScopeContext, teamId: number | null | undefined): boolean {
  if (ctx.isSuperAdmin) return true;
  if (teamId === null || teamId === undefined) return true;
  return ctx.teamIds.includes(teamId);
}

/**
 * Build a Prisma `where` fragment for team-scoped records.
 *
 *   where: { ...scopeFilter(access, "devops.deployment.view"), ...filters }
 *
 * The guard `authorize({ permission })` has already proved the capability, so
 * this function only answers "which rows". Returns `{}` for `all` scope;
 * otherwise the team filter plus the legacy rows that have no team yet.
 *
 * `department` scope is resolved from the team's owning department, not from
 * the record — `teams.department_id` is the only place that link exists.
 */
export function scopeFilter(
  access: ResolvedAccess,
  permission: string
): Record<string, unknown> {
  if (access.isSuperAdmin) return {};
  const entry = access.permissions[permission];
  // No entry here means the caller's own guard is the authority for this
  // request (e.g. a route that authenticates but scopes by another rule).
  if (!entry || entry.denied) return {};

  switch (entry.scope) {
    case "all":
      return {};
    case "department":
      // Nothing to widen to when the user has no department — fall back to
      // their own teams rather than silently exposing every department.
      return access.departmentIds.length
        ? { OR: [{ teamId: null }, { team: { departmentId: { in: access.departmentIds } } }] }
        : scopeForTeams(access.teamIds);
    case "team":
      return scopeForTeams(access.teamIds);
    case "self":
    default:
      // `self` on a team-owned record means "rows I personally own", which the
      // caller must express with its own owner column; there is no generic
      // fallback. Unassigned rows stay visible so a fresh install is not blank.
      return { teamId: null };
  }
}

/** `teamId IN (mine) OR teamId IS NULL` — legacy rows have no team yet. */
function scopeForTeams(teamIds: number[]): Record<string, unknown> {
  return teamIds.length
    ? { OR: [{ teamId: null }, { teamId: { in: teamIds } }] }
    : { teamId: null };
}

/**
 * Merge a scope fragment into a `where` clause that may already use `OR`
 * (search) — Prisma treats a second `OR` key as an overwrite, so they have to
 * be combined under `AND`.
 */
export function withScope(
  where: Record<string, unknown>,
  scope: Record<string, unknown>
): Record<string, unknown> {
  if (Object.keys(scope).length === 0) return where;
  if (Object.keys(where).length === 0) return scope;

  const merged: Record<string, unknown> = { ...where, ...scope };
  const scopeOr = scope.OR as unknown[] | undefined;
  const whereOr = where.OR as unknown[] | undefined;
  if (scopeOr && whereOr) {
    delete merged.OR;
    merged.AND = [{ OR: whereOr }, { OR: scopeOr }];
  }
  return merged;
}
