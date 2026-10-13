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

const poItemSchema = z.object({
  description: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().min(0),
  uom: z.string().optional().nullable(),
});

const createPoSchema = z.object({
  type: z.enum(["po", "lo"]).optional(),
  requisitionId: z.number().int().positive().optional().nullable(),
  quotationId: z.number().int().positive().optional().nullable(),
  vendorId: z.number().int().positive(),
  projectId: z.number().int().positive().optional().nullable(),
  budgetItemId: z.number().int().positive().optional().nullable(),
  totalAmount: z.number().min(0),
  taxAmount: z.number().min(0).optional(),
  grandTotal: z.number().min(0),
  currency: z.string().optional(),
  deliveryAddress: z.string().optional().nullable(),
  expectedDeliveryDate: z.string().datetime().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(poItemSchema).min(1, "At least one item is required"),
});

const updatePoSchema = createPoSchema.partial().extend({
  items: z.array(poItemSchema).optional(),
});

// GET /api/purchase-orders - List POs
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { status, search, type, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { isActive: true, deletedAt: null };
      if (status) where.status = status;
      if (type) where.type = type;
      if (search) {
        where.OR = [
          { poNumber: { contains: search as string, mode: "insensitive" } },
          { notes: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [pos, total] = await Promise.all([
        prisma.purchaseOrder.findMany({
          where,
          include: {
            vendor: { select: { id: true, name: true } },
            items: { where: { isActive: true } },
            requisition: { select: { id: true, division: true } },
            project: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.purchaseOrder.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: pos,
        meta: { currentPage: pageNum, lastPage: Math.ceil(total / limitNum), perPage: limitNum, total },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchase-orders/:id - Get single PO
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          vendor: true,
          items: { orderBy: { id: "asc" } },
          requisition: { include: { items: { where: { deletedAt: null, isActive: true } } } },
          quotation: { include: { vendor: { select: { name: true } } } },
          project: { select: { id: true, name: true } },
          goodsReceipts: { where: { isActive: true }, orderBy: { createdAt: "desc" } },
          payments: { where: { isActive: true, deletedAt: null }, orderBy: { createdAt: "desc" } },
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      });

      if (!po) throw new NotFoundError("Purchase order not found");

      res.status(200).json({ success: true, data: po });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/purchase-orders - Create PO
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createPoSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { items, ...data } = req.body;
      const poNumber = await generateReferenceNumber(data.type === "lo" ? "lo" : "po");

      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber,
          type: data.type || "po",
          requisitionId: data.requisitionId || null,
          quotationId: data.quotationId || null,
          vendorId: data.vendorId,
          projectId: data.projectId || null,
          budgetItemId: data.budgetItemId || null,
          totalAmount: data.totalAmount,
          taxAmount: data.taxAmount || 0,
          grandTotal: data.grandTotal,
          currency: data.currency || "MYR",
          deliveryAddress: data.deliveryAddress || null,
          expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : null,
          paymentTerms: data.paymentTerms || null,
          notes: data.notes || null,
          requestedById: req.user!.id,
          items: {
            create: items.map((item: any) => ({
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitPrice,
              uom: item.uom || null,
              totalAmount: item.qty * item.unitPrice,
            })),
          },
        },
        include: { items: true, vendor: { select: { id: true, name: true } } },
      });

      await logActivity({
        description: `Purchase order ${po.poNumber} created`,
        subjectType: "App\\Models\\PurchaseOrder",
        subjectId: po.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: po },
      });

      res.status(201).json({ success: true, data: po, message: "Purchase order created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/purchase-orders/:id - Update PO (draft only)
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updatePoSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.purchaseOrder.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Purchase order not found");

      if (existing.status !== "draft") {
        return res.status(400).json({ error: `Cannot edit PO with status "${existing.status}". Only draft POs can be edited.` });
      }

      const { items, ...formData } = req.body;

      const po = await prisma.$transaction(async (tx) => {
        const updated = await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: {
            ...(formData.vendorId !== undefined && { vendorId: formData.vendorId }),
            ...(formData.projectId !== undefined && { projectId: formData.projectId }),
            ...(formData.budgetItemId !== undefined && { budgetItemId: formData.budgetItemId }),
            ...(formData.totalAmount !== undefined && { totalAmount: formData.totalAmount }),
            ...(formData.taxAmount !== undefined && { taxAmount: formData.taxAmount }),
            ...(formData.grandTotal !== undefined && { grandTotal: formData.grandTotal }),
            ...(formData.deliveryAddress !== undefined && { deliveryAddress: formData.deliveryAddress }),
            ...(formData.expectedDeliveryDate !== undefined && {
              expectedDeliveryDate: formData.expectedDeliveryDate ? new Date(formData.expectedDeliveryDate) : null,
            }),
            ...(formData.paymentTerms !== undefined && { paymentTerms: formData.paymentTerms }),
            ...(formData.notes !== undefined && { notes: formData.notes }),
          },
        });

        if (items) {
          await tx.purchaseOrderItem.deleteMany({ where: { poId: existing.id } });
          if (items.length > 0) {
            await tx.purchaseOrderItem.createMany({
              data: items.map((item: any) => ({
                poId: existing.id,
                description: item.description,
                qty: item.qty,
                unitPrice: item.unitPrice,
                uom: item.uom || null,
                totalAmount: item.qty * item.unitPrice,
              })),
            });
          }
        }

        return tx.purchaseOrder.findUnique({
          where: { id: existing.id },
          include: { items: true, vendor: { select: { id: true, name: true } } },
        });
      });

      res.status(200).json({ success: true, data: po, message: "PO updated" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/purchase-orders/:id/submit - Submit for approval
router.put(
  "/:id/submit",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.purchaseOrder.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "PO not found" });

      if (existing.status !== "draft") {
        return res.status(400).json({ error: `Cannot submit PO with status "${existing.status}"` });
      }

      const updated = await prisma.purchaseOrder.update({
        where: { id },
        data: { status: "submitted" },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PUT /api/purchase-orders/:id/approve - Approve PO
router.put(
  "/:id/approve",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = (req as any).user;

      const existing = await prisma.purchaseOrder.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "PO not found" });

      if (existing.status !== "submitted") {
        return res.status(400).json({ error: `Cannot approve PO with status "${existing.status}"` });
      }

      const updated = await prisma.purchaseOrder.update({
        where: { id },
        data: {
          status: "approved",
          approvedById: user.id,
          approvedAt: new Date(),
        },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/purchase-orders/:id - Cancel PO
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.purchaseOrder.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Purchase order not found");

      if (!["draft", "submitted"].includes(existing.status)) {
        return res.status(400).json({ error: `Cannot cancel PO with status "${existing.status}"` });
      }

      await prisma.purchaseOrder.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false, status: "cancelled" },
      });

      res.status(200).json({ success: true, message: "Purchase order cancelled" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
