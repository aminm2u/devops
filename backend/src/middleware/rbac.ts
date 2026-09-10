import { Response, NextFunction } from "express";
import { ForbiddenError } from "../lib/errors.js";
import { RequestWithUser } from "../types/index.js";

export function requireRole(...roles: string[]) {
  return (req: RequestWithUser, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ForbiddenError("Authentication required"));
    }

    const userRoles = req.user.roles.map((r) => r.name);
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return next(
        new ForbiddenError(
          `Requires one of the following roles: ${roles.join(", ")}`
        )
      );
    }

    next();
  };
}

export function requirePermission(...permissions: string[]) {
  return (req: RequestWithUser, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ForbiddenError("Authentication required"));
    }

    const userPermissions = req.user.roles.flatMap((r) =>
      r.permissions.map((p) => p.name)
    );
    const hasPermission = permissions.some((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasPermission) {
      return next(
        new ForbiddenError(
          `Requires one of the following permissions: ${permissions.join(", ")}`
        )
      );
    }

    next();
  };
}
