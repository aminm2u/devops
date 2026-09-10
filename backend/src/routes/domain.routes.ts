import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

const createDomainSchema = z.object({
  projectId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(255),
  type: z.enum(["primary", "redirect", "alias", "subdomain"]).optional(),
  registrar: z.string().optional().nullable(),
  expirationDate: z.string().datetime().optional().nullable(),
  autoRenew: z.boolean().optional(),
});

const updateDomainSchema = createDomainSchema.partial();

// GET /api/domains - List all domains
router.get(
  "/",
  authenticate,
  requirePermission("view-domains"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { projectId, status, search, page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { deletedAt: null, isActive: true };

      if (projectId) where.projectId = parseInt(projectId as string, 10);
      if (status) where.status = status;
      if (search) {
        where.name = { contains: search as string, mode: "insensitive" };
      }

      const [domains, total] = await Promise.all([
        prisma.domain.findMany({
          where,
          include: {
            project: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.domain.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: domains,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Domains retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/domains/:id - Get single domain
router.get(
  "/:id",
  authenticate,
  requirePermission("view-domains"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const domain = await prisma.domain.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          project: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!domain) throw new NotFoundError("Domain not found");

      res.status(200).json({
        success: true,
        data: domain,
        message: "Domain retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/domains - Create domain
router.post(
  "/",
  authenticate,
  requirePermission("create-domains"),
  validate(createDomainSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const domain = await prisma.domain.create({
        data: {
          projectId: req.body.projectId,
          name: req.body.name,
          type: req.body.type || "primary",
          registrar: req.body.registrar || null,
          expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null,
          autoRenew: req.body.autoRenew ?? false,
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
        },
      });

      await logActivity({
        description: `Domain "${domain.name}" created`,
        subjectType: "App\\Models\\Domain",
        subjectId: domain.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: domain },
      });

      res.status(201).json({ success: true, data: domain, message: "Domain created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/domains/:id - Update domain
router.put(
  "/:id",
  authenticate,
  requirePermission("update-domains"),
  validate(updateDomainSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.domain.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Domain not found");

      const domain = await prisma.domain.update({
        where: { id: existing.id },
        data: {
          ...(req.body.projectId !== undefined && {
            project: req.body.projectId
              ? { connect: { id: req.body.projectId } }
              : { disconnect: true },
          }),
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.type && { type: req.body.type }),
          ...(req.body.registrar !== undefined && { registrar: req.body.registrar }),
          ...(req.body.expirationDate !== undefined && {
            expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null,
          }),
          ...(req.body.autoRenew !== undefined && { autoRenew: req.body.autoRenew }),
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
        },
      });

      await logActivity({
        description: `Domain "${domain.name}" updated`,
        subjectType: "App\\Models\\Domain",
        subjectId: domain.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: domain },
      });

      res.status(200).json({ success: true, data: domain, message: "Domain updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/domains/:id - Soft delete domain
router.delete(
  "/:id",
  authenticate,
  requirePermission("delete-domains"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.domain.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Domain not found");

      await prisma.domain.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await logActivity({
        description: `Domain "${existing.name}" deleted`,
        subjectType: "App\\Models\\Domain",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "Domain deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
