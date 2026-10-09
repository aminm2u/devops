import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

const createInternalProjectSchema = z.object({
  requisitionId: z.number().int().positive().optional().nullable(),
  purchaseOrderId: z.number().int().positive().optional().nullable(),
  vendorId: z.number().int().positive().optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  scopeOfWork: z.string().optional().nullable(),
  totalValue: z.number().min(0).optional(),
  currency: z.string().optional(),
  startDate: z.string().optional().nullable(),
  expectedEndDate: z.string().optional().nullable(),
  actualEndDate: z.string().optional().nullable(),
});

const updateInternalProjectSchema = createInternalProjectSchema.partial();

// GET /api/internal-projects - List internal projects
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { status, search, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { isActive: true, deletedAt: null };
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [projects, total] = await Promise.all([
        prisma.internalProject.findMany({
          where,
          include: {
            vendor: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.internalProject.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: projects,
        meta: { currentPage: pageNum, lastPage: Math.ceil(total / limitNum), perPage: limitNum, total },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/internal-projects/:id - Get single internal project
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const project = await prisma.internalProject.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          vendor: true,
          project: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          requisition: true,
          purchaseOrder: true,
        },
      });

      if (!project) throw new NotFoundError("Internal project not found");

      res.status(200).json({ success: true, data: project });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/internal-projects - Create internal project
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createInternalProjectSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const project = await prisma.internalProject.create({
        data: {
          requisitionId: req.body.requisitionId || null,
          purchaseOrderId: req.body.purchaseOrderId || null,
          vendorId: req.body.vendorId || null,
          projectId: req.body.projectId || null,
          name: req.body.name,
          description: req.body.description || null,
          scopeOfWork: req.body.scopeOfWork || null,
          totalValue: req.body.totalValue || 0,
          currency: req.body.currency || "MYR",
          startDate: req.body.startDate ? new Date(req.body.startDate) : null,
          expectedEndDate: req.body.expectedEndDate ? new Date(req.body.expectedEndDate) : null,
        },
        include: {
          vendor: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `Internal project "${project.name}" created`,
        subjectType: "App\\Models\\InternalProject",
        subjectId: project.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: project },
      });

      res.status(201).json({ success: true, data: project, message: "Internal project created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/internal-projects/:id - Update internal project
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateInternalProjectSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.internalProject.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Internal project not found");

      const project = await prisma.internalProject.update({
        where: { id: existing.id },
        data: {
          ...(req.body.name !== undefined && { name: req.body.name }),
          ...(req.body.description !== undefined && { description: req.body.description }),
          ...(req.body.scopeOfWork !== undefined && { scopeOfWork: req.body.scopeOfWork }),
          ...(req.body.totalValue !== undefined && { totalValue: req.body.totalValue }),
          ...(req.body.startDate !== undefined && { startDate: req.body.startDate ? new Date(req.body.startDate) : null }),
          ...(req.body.expectedEndDate !== undefined && { expectedEndDate: req.body.expectedEndDate ? new Date(req.body.expectedEndDate) : null }),
          ...(req.body.actualEndDate !== undefined && { actualEndDate: req.body.actualEndDate ? new Date(req.body.actualEndDate) : null }),
          ...(req.body.status !== undefined && { status: req.body.status }),
          ...(req.body.progress !== undefined && { progress: req.body.progress }),
        },
      });

      res.status(200).json({ success: true, data: project, message: "Internal project updated" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/internal-projects/:id/status - Update status
router.put(
  "/:id/status",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.internalProject.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "Internal project not found" });

      const { status, progress } = req.body;

      const updated = await prisma.internalProject.update({
        where: { id },
        data: {
          ...(status !== undefined && { status }),
          ...(progress !== undefined && { progress }),
          ...(status === "completed" && { actualEndDate: new Date() }),
        },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/internal-projects/:id - Delete internal project
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.internalProject.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Internal project not found");

      await prisma.internalProject.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      res.status(200).json({ success: true, message: "Internal project deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
