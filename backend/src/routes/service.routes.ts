import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole, requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

const createServiceSchema = z.object({
  projectId: z.number().int().positive(),
  environmentId: z.number().int().positive().optional().nullable(),
  infrastructureNodeId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1).max(255),
  type: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  version: z.string().max(100).optional().nullable(),
  port: z.number().int().positive().optional().nullable(),
  healthCheckUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  metadata: z.any().optional().nullable(),
});

const updateServiceSchema = createServiceSchema.partial().omit({ projectId: true });

// GET /api/projects/:projectId/services - List services for a project
router.get(
  "/project/:projectId",
  authenticate,
  requirePermission("view-services"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;
      const { search, type, status, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        projectId: parseInt(projectId, 10),
        deletedAt: null,
      };

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { type: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (type) where.type = type;
      if (status) where.status = status;

      const [services, total] = await Promise.all([
        prisma.service.findMany({
          where,
          include: {
            environment: { select: { id: true, name: true } },
            infrastructureNode: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.service.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: services,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/services - Create service
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createServiceSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { generateSlug } = await import("../lib/slug.js");
      const service = await prisma.service.create({
        data: {
          projectId: req.body.projectId,
          environmentId: req.body.environmentId || null,
          infrastructureNodeId: req.body.infrastructureNodeId || null,
          name: req.body.name,
          slug: generateSlug(req.body.name),
          type: req.body.type || "other",
          status: req.body.status || "unknown",
          version: req.body.version || null,
          port: req.body.port || null,
          healthCheckUrl: req.body.healthCheckUrl || null,
          description: req.body.description || null,
          metadata: req.body.metadata || null,
        },
        include: {
          environment: { select: { id: true, name: true } },
          infrastructureNode: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `Service "${service.name}" created`,
        subjectType: "App\\Models\\Service",
        subjectId: service.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: service },
      });

      res.status(201).json({ success: true, data: service, message: "Service created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/services/:id - Update service
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateServiceSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.service.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Service not found");

      const { generateSlug } = await import("../lib/slug.js");
      const service = await prisma.service.update({
        where: { id: existing.id },
        data: {
          ...(req.body.name && { name: req.body.name, slug: generateSlug(req.body.name) }),
          ...(req.body.environmentId !== undefined && { environmentId: req.body.environmentId }),
          ...(req.body.infrastructureNodeId !== undefined && { infrastructureNodeId: req.body.infrastructureNodeId }),
          ...(req.body.type && { type: req.body.type }),
          ...(req.body.status && { status: req.body.status }),
          ...(req.body.version !== undefined && { version: req.body.version }),
          ...(req.body.port !== undefined && { port: req.body.port }),
          ...(req.body.healthCheckUrl !== undefined && { healthCheckUrl: req.body.healthCheckUrl }),
          ...(req.body.description !== undefined && { description: req.body.description }),
          ...(req.body.metadata !== undefined && { metadata: req.body.metadata }),
        },
        include: {
          environment: { select: { id: true, name: true } },
          infrastructureNode: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `Service "${service.name}" updated`,
        subjectType: "App\\Models\\Service",
        subjectId: service.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: service },
      });

      res.status(200).json({ success: true, data: service, message: "Service updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/services/:id - Soft delete service
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.service.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Service not found");

      await prisma.service.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await logActivity({
        description: `Service "${existing.name}" deleted`,
        subjectType: "App\\Models\\Service",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
