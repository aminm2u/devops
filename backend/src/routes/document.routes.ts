import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole, requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { generateSlug } from "../lib/slug.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

const createDocumentSchema = z.object({
  projectId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  content: z.string().optional().nullable(),
  type: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  version: z.string().max(50).optional(),
  metadata: z.any().optional().nullable(),
  files: z.array(z.object({
    id: z.string(),
    originalName: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    size: z.number(),
    url: z.string(),
  })).optional().nullable(),
});

const updateDocumentSchema = createDocumentSchema.partial().omit({ projectId: true });

// GET /api/documents/project/:projectId - List documents for a project
router.get(
  "/project/:projectId",
  authenticate,
  requirePermission("view-documents"),
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
          { title: { contains: search as string, mode: "insensitive" } },
          { content: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (type) where.type = type;
      if (status) where.status = status;

      const [documents, total] = await Promise.all([
        prisma.document.findMany({
          where,
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.document.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: documents,
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

// POST /api/documents - Create document
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createDocumentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      // Merge files into metadata
      const metadata = req.body.metadata || {};
      if (req.body.files && req.body.files.length > 0) {
        metadata.files = req.body.files;
      }

      const document = await prisma.document.create({
        data: {
          projectId: req.body.projectId,
          title: req.body.title,
          slug: generateSlug(req.body.title),
          content: req.body.content || null,
          type: req.body.type || "other",
          status: req.body.status || "draft",
          authorId: req.user!.id,
          version: req.body.version || "1.0",
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      });

      await logActivity({
        description: `Document "${document.title}" created`,
        subjectType: "App\\Models\\Document",
        subjectId: document.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: document },
      });

      res.status(201).json({ success: true, data: document, message: "Document created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/documents/:id - Update document
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateDocumentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.document.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Document not found");

      const document = await prisma.document.update({
        where: { id: existing.id },
        data: {
          ...(req.body.title && { title: req.body.title, slug: generateSlug(req.body.title) }),
          ...(req.body.content !== undefined && { content: req.body.content }),
          ...(req.body.type && { type: req.body.type }),
          ...(req.body.status && { status: req.body.status }),
          ...(req.body.version && { version: req.body.version }),
          ...(req.body.metadata !== undefined && { metadata: req.body.metadata }),
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      });

      await logActivity({
        description: `Document "${document.title}" updated`,
        subjectType: "App\\Models\\Document",
        subjectId: document.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: document },
      });

      res.status(200).json({ success: true, data: document, message: "Document updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/documents/:id - Soft delete document
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.document.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Document not found");

      await prisma.document.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await logActivity({
        description: `Document "${existing.title}" deleted`,
        subjectType: "App\\Models\\Document",
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
