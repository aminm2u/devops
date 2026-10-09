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

const createDirectPurchaseSchema = z.object({
  requisitionId: z.number().int().positive().optional().nullable(),
  vendorId: z.number().int().positive().optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  budgetItemId: z.number().int().positive().optional().nullable(),
  description: z.string().min(1),
  amount: z.number().min(0),
  taxAmount: z.number().min(0).optional(),
  grandTotal: z.number().min(0).optional(),
  currency: z.string().optional(),
  invoiceNumber: z.string().optional().nullable(),
});

const updateDirectPurchaseSchema = createDirectPurchaseSchema.partial();

// GET /api/direct-purchases - List direct purchases
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
          { referenceNumber: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [purchases, total] = await Promise.all([
        prisma.directPurchase.findMany({
          where,
          include: {
            vendor: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            budgetItem: { select: { id: true, description: true } },
            requestedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.directPurchase.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: purchases,
        meta: { currentPage: pageNum, lastPage: Math.ceil(total / limitNum), perPage: limitNum, total },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/direct-purchases/:id - Get single direct purchase
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const purchase = await prisma.directPurchase.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          vendor: true,
          project: { select: { id: true, name: true } },
          budgetItem: { select: { id: true, description: true, allocatedBudget: true, utilizedBudget: true } },
          requisition: true,
          requestedBy: { select: { id: true, name: true } },
          payments: { where: { isActive: true, deletedAt: null }, orderBy: { createdAt: "desc" } },
        },
      });

      if (!purchase) throw new NotFoundError("Direct purchase not found");

      res.status(200).json({ success: true, data: purchase });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/direct-purchases - Create direct purchase
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createDirectPurchaseSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const referenceNumber = await generateReferenceNumber("dp");

      const purchase = await prisma.directPurchase.create({
        data: {
          referenceNumber,
          requisitionId: req.body.requisitionId || null,
          vendorId: req.body.vendorId || null,
          projectId: req.body.projectId || null,
          budgetItemId: req.body.budgetItemId || null,
          description: req.body.description,
          amount: req.body.amount,
          taxAmount: req.body.taxAmount || 0,
          grandTotal: req.body.grandTotal || req.body.amount,
          currency: req.body.currency || "MYR",
          invoiceNumber: req.body.invoiceNumber || null,
          requestedById: req.user!.id,
        },
        include: {
          vendor: { select: { id: true, name: true } },
          requestedBy: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `Direct purchase ${purchase.referenceNumber} created`,
        subjectType: "App\\Models\\DirectPurchase",
        subjectId: purchase.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: purchase },
      });

      res.status(201).json({ success: true, data: purchase, message: "Direct purchase created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/direct-purchases/:id - Update direct purchase (draft only)
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateDirectPurchaseSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.directPurchase.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Direct purchase not found");

      if (existing.status !== "draft") {
        return res.status(400).json({ error: `Cannot edit with status "${existing.status}"` });
      }

      const purchase = await prisma.directPurchase.update({
        where: { id: existing.id },
        data: {
          ...(req.body.vendorId !== undefined && { vendorId: req.body.vendorId }),
          ...(req.body.projectId !== undefined && { projectId: req.body.projectId }),
          ...(req.body.budgetItemId !== undefined && { budgetItemId: req.body.budgetItemId }),
          ...(req.body.description !== undefined && { description: req.body.description }),
          ...(req.body.amount !== undefined && { amount: req.body.amount }),
          ...(req.body.taxAmount !== undefined && { taxAmount: req.body.taxAmount }),
          ...(req.body.grandTotal !== undefined && { grandTotal: req.body.grandTotal }),
          ...(req.body.invoiceNumber !== undefined && { invoiceNumber: req.body.invoiceNumber }),
        },
      });

      res.status(200).json({ success: true, data: purchase, message: "Direct purchase updated" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/direct-purchases/:id/submit - Submit for approval
router.put(
  "/:id/submit",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.directPurchase.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "Direct purchase not found" });

      if (existing.status !== "draft") {
        return res.status(400).json({ error: `Cannot submit with status "${existing.status}"` });
      }

      const updated = await prisma.directPurchase.update({
        where: { id },
        data: { status: "submitted" },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PUT /api/direct-purchases/:id/approve - Approve
router.put(
  "/:id/approve",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.directPurchase.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "Direct purchase not found" });

      if (existing.status !== "submitted") {
        return res.status(400).json({ error: `Cannot approve with status "${existing.status}"` });
      }

      const updated = await prisma.directPurchase.update({
        where: { id },
        data: { status: "approved" },
      });

      // Update budget utilization if linked
      if (existing.budgetItemId) {
        await prisma.budgetItem.update({
          where: { id: existing.budgetItemId },
          data: { utilizedBudget: { increment: existing.grandTotal || existing.amount } },
        });
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/direct-purchases/:id - Cancel
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.directPurchase.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Direct purchase not found");

      await prisma.directPurchase.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false, status: "cancelled" },
      });

      res.status(200).json({ success: true, message: "Direct purchase cancelled" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
