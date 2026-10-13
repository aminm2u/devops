import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { generateReferenceNumber } from "../lib/numberGenerator.js";

const router = Router();

const createAssetSchema = z.object({
  goodsReceiptItemId: z.number().int().positive().optional().nullable(),
  poItemId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  purchasePrice: z.number().min(0).optional(),
  currentValue: z.number().min(0).optional(),
  purchaseDate: z.string().optional().nullable(),
  warrantyExpiry: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  assignedToId: z.number().int().positive().optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  status: z.string().optional(),
});

const updateAssetSchema = createAssetSchema.partial();

// GET /api/assets - List assets
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { status, category, search, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { isActive: true, deletedAt: null };
      if (status) where.status = status;
      if (category) where.category = category;
      if (search) {
        where.OR = [
          { assetNumber: { contains: search as string, mode: "insensitive" } },
          { name: { contains: search as string, mode: "insensitive" } },
          { serialNumber: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [assets, total] = await Promise.all([
        prisma.asset.findMany({
          where,
          include: {
            assignedTo: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.asset.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: assets,
        meta: { currentPage: pageNum, lastPage: Math.ceil(total / limitNum), perPage: limitNum, total },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/assets/:id - Get single asset
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const asset = await prisma.asset.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      });

      if (!asset) throw new NotFoundError("Asset not found");

      res.status(200).json({ success: true, data: asset });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/assets - Create asset
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createAssetSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const assetNumber = await generateReferenceNumber("asset");

      const asset = await prisma.asset.create({
        data: {
          assetNumber,
          goodsReceiptItemId: req.body.goodsReceiptItemId || null,
          poItemId: req.body.poItemId || null,
          name: req.body.name,
          description: req.body.description || null,
          category: req.body.category || null,
          serialNumber: req.body.serialNumber || null,
          purchasePrice: req.body.purchasePrice || 0,
          currentValue: req.body.currentValue || req.body.purchasePrice || 0,
          purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : null,
          warrantyExpiry: req.body.warrantyExpiry ? new Date(req.body.warrantyExpiry) : null,
          location: req.body.location || null,
          assignedToId: req.body.assignedToId || null,
          projectId: req.body.projectId || null,
          status: req.body.status || "active",
        },
        include: {
          assignedTo: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `Asset ${asset.assetNumber} created`,
        subjectType: "App\\Models\\Asset",
        subjectId: asset.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: asset },
      });

      res.status(201).json({ success: true, data: asset, message: "Asset created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/assets/:id - Update asset
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateAssetSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.asset.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Asset not found");

      const asset = await prisma.asset.update({
        where: { id: existing.id },
        data: {
          ...(req.body.name !== undefined && { name: req.body.name }),
          ...(req.body.description !== undefined && { description: req.body.description }),
          ...(req.body.category !== undefined && { category: req.body.category }),
          ...(req.body.serialNumber !== undefined && { serialNumber: req.body.serialNumber }),
          ...(req.body.purchasePrice !== undefined && { purchasePrice: req.body.purchasePrice }),
          ...(req.body.currentValue !== undefined && { currentValue: req.body.currentValue }),
          ...(req.body.location !== undefined && { location: req.body.location }),
          ...(req.body.assignedToId !== undefined && { assignedToId: req.body.assignedToId }),
          ...(req.body.projectId !== undefined && { projectId: req.body.projectId }),
          ...(req.body.status !== undefined && { status: req.body.status }),
          ...(req.body.warrantyExpiry !== undefined && {
            warrantyExpiry: req.body.warrantyExpiry ? new Date(req.body.warrantyExpiry) : null,
          }),
        },
        include: {
          assignedTo: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      });

      res.status(200).json({ success: true, data: asset, message: "Asset updated" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/assets/:id/transfer - Transfer asset to new location/assignee
router.put(
  "/:id/transfer",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.asset.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "Asset not found" });

      const { location, assignedToId, projectId } = req.body;

      const updated = await prisma.asset.update({
        where: { id },
        data: {
          ...(location !== undefined && { location }),
          ...(assignedToId !== undefined && { assignedToId: assignedToId || null }),
          ...(projectId !== undefined && { projectId: projectId || null }),
          lastTransferredAt: new Date(),
        },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/assets/:id - Decommission asset
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.asset.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Asset not found");

      await prisma.asset.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false, status: "decommissioned" },
      });

      res.status(200).json({ success: true, message: "Asset decommissioned" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
