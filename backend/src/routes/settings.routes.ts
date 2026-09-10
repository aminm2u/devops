import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

const upsertSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.any(),
  group: z.string().max(50).optional(),
});

const upsertManySchema = z.object({
  settings: z.array(
    z.object({
      key: z.string().min(1).max(100),
      value: z.any(),
      group: z.string().max(50).optional(),
    })
  ),
});

// GET /api/settings - List all settings (or by group)
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { group } = req.query;
      const where: any = {};
      if (group) where.group = group;

      const settings = await prisma.setting.findMany({
        where,
        orderBy: { key: "asc" },
      });

      // Convert array to key-value object for easier frontend consumption
      const data: Record<string, any> = {};
      settings.forEach((s) => {
        data[s.key] = s.value;
      });

      res.status(200).json({
        success: true,
        data,
        message: "Settings retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/settings/:key - Get a single setting
router.get(
  "/:key",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const setting = await prisma.setting.findUnique({ where: { key } });

      res.status(200).json({
        success: true,
        data: setting ? setting.value : null,
        message: "Setting retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/settings - Upsert multiple settings at once
router.put(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(upsertManySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { settings } = req.body;

      const upserts = settings.map((s: any) =>
        prisma.setting.upsert({
          where: { key: s.key },
          update: { value: s.value, group: s.group || "general" },
          create: { key: s.key, value: s.value, group: s.group || "general" },
        })
      );

      await prisma.$transaction(upserts);

      await logActivity({
        description: `Settings updated: ${settings.map((s: any) => s.key).join(", ")}`,
        subjectType: "App\\Models\\Setting",
        subjectId: 0,
        event: "updated",
        causerId: req.user!.id,
        properties: { keys: settings.map((s: any) => s.key) },
      });

      res.status(200).json({
        success: true,
        data: null,
        message: "Settings updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/settings/:key - Upsert a single setting
router.put(
  "/:key",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(upsertSettingSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const { value, group } = req.body;

      const setting = await prisma.setting.upsert({
        where: { key },
        update: { value, group: group || "general" },
        create: { key, value, group: group || "general" },
      });

      await logActivity({
        description: `Setting "${key}" updated`,
        subjectType: "App\\Models\\Setting",
        subjectId: setting.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { key, value },
      });

      res.status(200).json({
        success: true,
        data: setting.value,
        message: "Setting updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/settings/:key - Delete a setting
router.delete(
  "/:key",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      await prisma.setting.delete({ where: { key } });

      res.status(200).json({
        success: true,
        data: null,
        message: "Setting deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
