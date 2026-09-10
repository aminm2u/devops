import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { authConfig } from "../config/auth.js";
import prisma from "../config/database.js";
import { UnauthorizedError } from "../lib/errors.js";
import { RequestWithUser } from "../types/index.js";

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

    // Load user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("User account is deactivated");
    }

    // Load roles and permissions separately (polymorphic relation)
    const modelRoles = await prisma.modelHasRole.findMany({
      where: { modelId: user.id, modelType: "App\\Models\\User" },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    // Transform user data to include roles and permissions
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

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError("Invalid token"));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError("Token expired"));
    } else {
      next(new UnauthorizedError("Authentication failed"));
    }
  }
}
