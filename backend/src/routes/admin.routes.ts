import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, AppError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { sendWelcomeEmail } from "../services/notification.service.js";

const router = Router();

// GET /api/admin/users/list - List all users (for owner selection, any authenticated user)
router.get(
  "/users/list",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      });
      res.status(200).json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  }
);

const createUserSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["super-admin", "devops-admin", "devops-engineer", "viewer"]).optional(),
  employeeId: z.string().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  positionId: z.number().int().positive().optional().nullable(),
  employmentTypeId: z.number().int().positive().optional().nullable(),
  joinDate: z.string().datetime().optional().nullable(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["super-admin", "devops-admin", "devops-engineer", "viewer"]).optional(),
  is_active: z.boolean().optional(),
  employeeId: z.string().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  positionId: z.number().int().positive().optional().nullable(),
  employmentTypeId: z.number().int().positive().optional().nullable(),
  joinDate: z.string().datetime().optional().nullable(),
});

// GET /api/admin/users - List all users
router.get(
  "/users",
  authenticate,
  requireRole("super-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { search, page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [rawUsers, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            emailVerifiedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.user.count({ where }),
      ]);

      // Fetch roles for each user via model_has_roles
      const users = await Promise.all(
        rawUsers.map(async (user) => {
          const modelRoles = await prisma.modelHasRole.findMany({
            where: { modelId: user.id, modelType: "App\\Models\\User" },
            include: { role: { select: { id: true, name: true } } },
          });
          return {
            ...user,
            roles: modelRoles.map((mhr) => mhr.role),
          };
        })
      );

      res.status(200).json({
        success: true,
        data: users,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Users retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/users - Create user
router.post(
  "/users",
  authenticate,
  requireRole("super-admin"),
  validate(createUserSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { name, email, password, role, employeeId, departmentId, positionId, employmentTypeId, joinDate } = req.body;

      // Check if email exists
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new AppError(400, "A user with this email already exists");
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          employeeId,
          departmentId,
          positionId,
          employmentTypeId,
          joinDate: joinDate ? new Date(joinDate) : null,
        },
      });

      // Assign role
      const roleName = role || "viewer";
      const roleRecord = await prisma.role.findUnique({ where: { name: roleName } });
      if (roleRecord) {
        await prisma.modelHasRole.create({
          data: {
            roleId: roleRecord.id,
            modelType: "App\\Models\\User",
            modelId: user.id,
          },
        });
      }

      await logActivity({
        description: `User "${user.name}" created`,
        subjectType: "App\\Models\\User",
        subjectId: user.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: { name: user.name, email: user.email } },
      });

      // Send welcome email
      sendWelcomeEmail({ id: user.id, name: user.name, email: user.email }).catch((err) =>
        console.error("[Email] Welcome email failed:", err)
      );

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: roleName,
        },
        message: "User created successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/users/:id/roles - Assign role
router.post(
  "/users/:id/roles",
  authenticate,
  requireRole("super-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role) {
        throw new AppError(400, "Role is required");
      }

      const user = await prisma.user.findUnique({
        where: { id: parseInt(id, 10) },
      });
      if (!user) throw new NotFoundError("User not found");

      const roleRecord = await prisma.role.findUnique({ where: { name: role } });
      if (!roleRecord) throw new AppError(400, "Invalid role");

      // Remove existing roles
      await prisma.modelHasRole.deleteMany({
        where: {
          modelType: "App\\Models\\User",
          modelId: user.id,
        },
      });

      // Assign new role
      await prisma.modelHasRole.create({
        data: {
          roleId: roleRecord.id,
          modelType: "App\\Models\\User",
          modelId: user.id,
        },
      });

      await logActivity({
        description: `Role "${role}" assigned to user "${user.name}"`,
        subjectType: "App\\Models\\User",
        subjectId: user.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { role },
      });

      res.status(200).json({
        success: true,
        data: { userId: user.id, role },
        message: "Role updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/admin/users/:id - Update user
router.put(
  "/users/:id",
  authenticate,
  requireRole("super-admin"),
  validate(updateUserSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, email, password, role, is_active } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: parseInt(id, 10) },
      });
      if (!user) throw new NotFoundError("User not found");

      // Check if email is taken by another user
      if (email && email !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          throw new AppError(400, "A user with this email already exists");
        }
      }

      // Build update data
      const updateData: any = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (is_active !== undefined) updateData.isActive = is_active;
      if (password) updateData.password = await bcrypt.hash(password, 12);

      // New Employee fields
      if (req.body.employeeId !== undefined) updateData.employeeId = req.body.employeeId;
      if (req.body.departmentId !== undefined) updateData.departmentId = req.body.departmentId;
      if (req.body.positionId !== undefined) updateData.positionId = req.body.positionId;
      if (req.body.employmentTypeId !== undefined) updateData.employmentTypeId = req.body.employmentTypeId;
      if (req.body.joinDate !== undefined) updateData.joinDate = req.body.joinDate ? new Date(req.body.joinDate) : null;

      updateData.updatedAt = new Date();

      const updatedUser = await prisma.user.update({
        where: { id: parseInt(id, 10) },
        data: updateData,
      });

      // Update role if provided
      if (role) {
        const roleRecord = await prisma.role.findUnique({ where: { name: role } });
        if (roleRecord) {
          // Remove existing roles
          await prisma.modelHasRole.deleteMany({
            where: { modelType: "App\\Models\\User", modelId: user.id },
          });
          // Assign new role
          await prisma.modelHasRole.create({
            data: {
              roleId: roleRecord.id,
              modelType: "App\\Models\\User",
              modelId: user.id,
            },
          });
        }
      }

      await logActivity({
        description: `User "${updatedUser.name}" updated`,
        subjectType: "App\\Models\\User",
        subjectId: user.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { name: updatedUser.name, email: updatedUser.email } },
      });

      res.status(200).json({
        success: true,
        data: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: role || "viewer",
        },
        message: "User updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/admin/users/:id - Delete user
router.delete(
  "/users/:id",
  authenticate,
  requireRole("super-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = parseInt(id, 10);

      // Prevent deleting yourself
      if (userId === req.user!.id) {
        throw new AppError(400, "You cannot delete your own account");
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new NotFoundError("User not found");

      // Remove user roles
      await prisma.modelHasRole.deleteMany({
        where: { modelType: "App\\Models\\User", modelId: userId },
      });

      // Delete user
      await prisma.user.delete({
        where: { id: userId },
      });

      await logActivity({
        description: `User "${user.name}" deleted`,
        subjectType: "App\\Models\\User",
        subjectId: userId,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: { name: user.name, email: user.email } },
      });

      res.status(200).json({
        success: true,
        data: { id: userId },
        message: "User deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
