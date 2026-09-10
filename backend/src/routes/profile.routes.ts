import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, UnauthorizedError, AppError } from "../lib/errors.js";
import prisma from "../config/database.js";

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
});

const updatePasswordSchema = z.object({
  current_password: z.string().min(1),
  password: z.string().min(8).max(255),
  password_confirmation: z.string().min(1),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

async function getUserWithRoles(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) return null;

  const modelRoles = await prisma.modelHasRole.findMany({
    where: { modelId: userId, modelType: "App\\Models\\User" },
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

  const roles = modelRoles.map((mhr) => ({
    id: mhr.role.id,
    name: mhr.role.name,
    description: mhr.role.description,
  }));

  const permissions = [
    ...new Set(
      modelRoles.flatMap((mhr) =>
        mhr.role.permissions.map((rhp) => rhp.permission.name)
      )
    ),
  ];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles,
    permissions,
  };
}

// GET /api/profile - Get current user profile
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const profile = await getUserWithRoles(req.user!.id);

      if (!profile) {
        throw new NotFoundError("User not found");
      }

      res.status(200).json({
        success: true,
        data: profile,
        message: "Profile retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/profile - Update profile
router.put(
  "/",
  authenticate,
  validate(updateProfileSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { name, email } = req.body;

      // Check if email is being changed and if it's already taken
      if (email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email,
            id: { not: userId },
          },
        });

        if (existingUser) {
          throw new AppError(400, "Email already in use");
        }
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (email) {
        updateData.email = email;
        updateData.emailVerifiedAt = null;
      }

      await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      const profile = await getUserWithRoles(userId);

      res.status(200).json({
        success: true,
        data: profile,
        message: "Profile updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/profile/password - Update password
router.put(
  "/password",
  authenticate,
  validate(updatePasswordSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { current_password, password, password_confirmation } = req.body;

      if (password !== password_confirmation) {
        throw new AppError(400, "Passwords do not match");
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError("User not found");
      }

      const isPasswordValid = await bcrypt.compare(current_password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedError("Current password is incorrect");
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      res.status(200).json({
        success: true,
        data: null,
        message: "Password updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/profile - Delete account
router.delete(
  "/",
  authenticate,
  validate(deleteAccountSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { password } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError("User not found");
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedError("Incorrect password");
      }

      await prisma.user.delete({
        where: { id: userId },
      });

      res.clearCookie("token");

      res.status(200).json({
        success: true,
        data: null,
        message: "Account deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
