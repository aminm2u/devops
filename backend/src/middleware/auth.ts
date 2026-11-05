import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { authConfig } from "../config/auth.js";
import prisma from "../config/database.js";
import { UnauthorizedError } from "../lib/errors.js";
import { RequestWithUser } from "../types/index.js";
import { MODEL_USER, resolveAccess } from "../rbac/effective.js";

export async function authenticate(
  req: RequestWithUser,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;

    // Extract from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // Extract from cookie
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    // Extract from query parameter (for file downloads)
    if (!token && req.query?.token) {
      token = req.query.token as string;
    }

    if (!token) {
      throw new UnauthorizedError("No token provided");
    }

    // Verify JWT
    const decoded = jwt.verify(token, authConfig.jwtSecret) as {
      userId: number;
    };

    // Load the user and their effective access in parallel. `resolveAccess`
    // is the only place the multi-role union / deny / max-scope rules live.
    const [user, access] = await Promise.all([
      prisma.user.findUnique({ where: { id: decoded.userId } }),
      resolveAccess(decoded.userId),
    ]);

    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("User account is deactivated");
    }

    // Legacy shape: several route handlers still filter by role name and read
    // `roles[].permissions`. Derived from the same resolver so it can never
    // disagree with `req.access`.
    const modelRoles = await prisma.modelHasRole.findMany({
      where: { modelId: user.id, modelType: MODEL_USER },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    const roles = modelRoles.map((mhr) => ({
      name: mhr.role.name,
      permissions: mhr.role.permissions.map((rhp) => ({
        name: rhp.permission.name,
      })),
    }));

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles,
    };
    req.access = access;

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else if (error instanceof jwt.TokenExpiredError) {
      // Must be tested before JsonWebTokenError — TokenExpiredError extends it.
      next(new UnauthorizedError("Token expired"));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError("Invalid token"));
    } else {
      next(new UnauthorizedError("Authentication failed"));
    }
  }
}
