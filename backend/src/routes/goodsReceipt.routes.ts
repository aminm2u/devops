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

const grItemSchema = z.object({
  poItemId: z.number().int().positive(),
  description: z.string().min(1),
  orderedQty: z.number().int().positive(),
  receivedQty: z.number().int().min(0),
  acceptedQty: z.number().int().min(0),
  rejectedQty: z.number().int().min(0).optional(),
  rejectionReason: z.string().optional().nullable(),
});

const createGrSchema = z.object({
  purchaseOrderId: z.number().int().positive(),
  receivedDate: z.string().optional(),
  inspectionNotes: z.string().optional().nullable(),
  inspectedBy: z.string().optional().nullable(),
  items: z.array(grItemSchema).min(1, "At least one item is required"),
});

const updateGrSchema = createGrSchema.partial().extend({
  items: z.array(grItemSchema).optional(),
});

// GET /api/goods-receipts - List goods receipts
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
          { grnNumber: { contains: search as string, mode: "insensitive" } },
          { inspectionNotes: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [receipts, total] = await Promise.all([
        prisma.goodsReceipt.findMany({
          where,
          include: {
            purchaseOrder: { select: { id: true, poNumber: true, vendor: { select: { name: true } } } },
            items: { where: { isActive: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.goodsReceipt.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: receipts,
        meta: { currentPage: pageNum, lastPage: Math.ceil(total / limitNum), perPage: limitNum, total },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/goods-receipts/:id - Get single goods receipt
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const receipt = await prisma.goodsReceipt.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          purchaseOrder: {
            include: {
              vendor: { select: { id: true, name: true } },
              items: { where: { isActive: true } },
            },
          },
          items: { where: { isActive: true }, orderBy: { id: "asc" } },
          assets: { where: { isActive: true } },
        },
      });

      if (!receipt) throw new NotFoundError("Goods receipt not found");

      res.status(200).json({ success: true, data: receipt });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/goods-receipts - Create goods receipt
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createGrSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { items, ...data } = req.body;
      const grnNumber = await generateReferenceNumber("grn");

      const receipt = await prisma.$transaction(async (tx) => {
        // Create GRN
        const gr = await tx.goodsReceipt.create({
          data: {
            grnNumber,
            purchaseOrderId: data.purchaseOrderId,
            receivedDate: data.receivedDate ? new Date(data.receivedDate) : new Date(),
            status: "pending",
            inspectionNotes: data.inspectionNotes || null,
            inspectedBy: data.inspectedBy || null,
            receivedById: req.user!.id,
            items: {
              create: items.map((item: any) => ({
                poItemId: item.poItemId,
                description: item.description,
                orderedQty: item.orderedQty,
                receivedQty: item.receivedQty,
                acceptedQty: item.acceptedQty,
                rejectedQty: item.rejectedQty || 0,
                rejectionReason: item.rejectionReason || null,
              })),
            },
          },
          include: { items: true },
        });

        // Update PO item received quantities
        for (const item of items) {
          await tx.purchaseOrderItem.update({
            where: { id: item.poItemId },
            data: { receivedQty: { increment: item.receivedQty } },
          });
        }

        // Determine overall GRN status
        const allAccepted = items.every((i: any) => i.acceptedQty >= i.orderedQty);
        const anyRejected = items.some((i: any) => (i.rejectedQty || 0) > 0);
        const anyPartial = items.some((i: any) => i.receivedQty < i.orderedQty);

        let grnStatus = "accepted";
        if (anyRejected) grnStatus = "rejected";
        if (anyPartial && !anyRejected) grnStatus = "partial";
        if (!allAccepted && !anyRejected && !anyPartial) grnStatus = "inspected";

        await tx.goodsReceipt.update({
          where: { id: gr.id },
          data: { status: grnStatus },
        });

        // Update PO received status
        const poItems = await tx.purchaseOrderItem.findMany({
          where: { poId: data.purchaseOrderId, isActive: true },
        });
        const poFullyReceived = poItems.every((pi) => pi.receivedQty >= pi.qty);
        const poPartiallyReceived = poItems.some((pi) => pi.receivedQty > 0);

        if (poFullyReceived) {
          await tx.purchaseOrder.update({
            where: { id: data.purchaseOrderId },
            data: { status: "fully_received" },
          });
        } else if (poPartiallyReceived) {
          await tx.purchaseOrder.update({
            where: { id: data.purchaseOrderId },
            data: { status: "partially_received" },
          });
        }

        return gr;
      });

      await logActivity({
        description: `Goods receipt ${receipt.grnNumber} created`,
        subjectType: "App\\Models\\GoodsReceipt",
        subjectId: receipt.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: receipt },
      });

      res.status(201).json({ success: true, data: receipt, message: "Goods receipt created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/goods-receipts/:id/inspect - Inspect and accept/reject
router.put(
  "/:id/inspect",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.goodsReceipt.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "Goods receipt not found" });

      if (existing.status !== "pending") {
        return res.status(400).json({ error: `Cannot inspect with status "${existing.status}"` });
      }

      const { status, inspectionNotes, inspectedBy } = req.body;

      const updated = await prisma.goodsReceipt.update({
        where: { id },
        data: {
          status: status || "inspected",
          inspectionNotes: inspectionNotes || existing.inspectionNotes,
          inspectedBy: inspectedBy || existing.inspectedBy,
          inspectedAt: new Date(),
        },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/goods-receipts/:id - Cancel goods receipt
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.goodsReceipt.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Goods receipt not found");

      await prisma.goodsReceipt.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false, status: "cancelled" },
      });

      res.status(200).json({ success: true, message: "Goods receipt cancelled" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
