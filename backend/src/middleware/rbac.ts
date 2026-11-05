import { Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { RequestWithUser } from "../types/index.js";
import { PermissionScope, can, normaliseScope } from "../rbac/effective.js";

/**
 * Legacy guard layer.
 *
 * These two helpers predate the permission catalog. They are kept so the ~25
 * route files that use them keep working during migration, but they now read
 * the resolved `req.access` (same source of truth as `authorize()`), so a
 * direct deny override or a multi-role union behaves identically whichever
 * guard a route happens to use.
 *
 * New code should call `authorize({ permission, scope })` from rbac/authorize.ts.
 */

/** Normalise role arguments so both call styles work. */
function flattenArgs(values: (string | string[])[]): string[] {
  return values.flatMap((value) => (Array.isArray(value) ? value : [value]));
}

export function requireRole(...roles: (string | string[])[]) {
  const allowed = flattenArgs(roles);

  return (req: RequestWithUser, _res: Response, next: NextFunction): void => {
    if (!req.user || !req.access) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const userRoles = req.access.roles.map((r) => r.name);
    if (allowed.some((role) => userRoles.includes(role))) return next();

    return next(
      new ForbiddenError(`Requires one of the following roles: ${allowed.join(", ")}`)
    );
  };
}

/**
 * @param scope Minimum scope the grant must reach. Previously this guard
 *   ignored scope entirely; an optional trailing `{ scope }` object is
 *   accepted so a route can ask for a wider grant when it needs one.
 */
export function requirePermission(...args: (string | string[] | { scope?: PermissionScope })[]) {
  let options: { scope?: PermissionScope } | undefined;
  const tail = args[args.length - 1];
  if (tail && typeof tail === "object" && !Array.isArray(tail)) {
    options = args.pop() as { scope?: PermissionScope };
  }
  const required = flattenArgs(args as (string | string[])[]);
  const scope = normaliseScope(options?.scope ?? "self");

  return (req: RequestWithUser, _res: Response, next: NextFunction): void => {
    if (!req.user || !req.access) {
      return next(new UnauthorizedError("Authentication required"));
    }

    if (required.some((perm) => can(req.access!, perm, scope))) return next();

    return next(
      new ForbiddenError(
        `Requires one of the following permissions: ${required.join(", ")}`
      )
    );
  };
}
