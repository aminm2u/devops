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

const createPaymentSchema = z.object({
  purchaseOrderId: z.number().int().positive().optional().nullable(),
  directPurchaseId: z.number().int().positive().optional().nullable(),
  amount: z.number().min(0.01),
  taxAmount: z.number().min(0).optional(),
  totalPaid: z.number().min(0).optional(),
  currency: z.string().optional(),
  paymentMethod: z.string().optional().nullable(),
  paymentDate: z.string().optional(),
  referenceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  invoiceUrl: z.string().optional().nullable(),
});

const updatePaymentSchema = createPaymentSchema.partial();

// GET /api/payments - List payments
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
          { notes: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: {
            purchaseOrder: { select: { id: true, poNumber: true } },
            directPurchase: { select: { id: true, referenceNumber: true } },
            paidBy: { select: { id: true, name: true } },
            attachments: { where: { isActive: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.payment.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: payments,
        meta: { currentPage: pageNum, lastPage: Math.ceil(total / limitNum), perPage: limitNum, total },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/payments/:id - Get single payment
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const payment = await prisma.payment.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          purchaseOrder: {
            include: {
              vendor: { select: { id: true, name: true } },
              items: { where: { isActive: true } },
            },
          },
          directPurchase: true,
          paidBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          attachments: { where: { isActive: true }, orderBy: { createdAt: "desc" } },
        },
      });

      if (!payment) throw new NotFoundError("Payment not found");

      res.status(200).json({ success: true, data: payment });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/payments - Create payment
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createPaymentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const referenceNumber = await generateReferenceNumber("pay");

      const payment = await prisma.payment.create({
        data: {
          referenceNumber,
          purchaseOrderId: req.body.purchaseOrderId || null,
          directPurchaseId: req.body.directPurchaseId || null,
          amount: req.body.amount,
          taxAmount: req.body.taxAmount || 0,
          totalPaid: req.body.totalPaid || req.body.amount,
          currency: req.body.currency || "MYR",
          paymentMethod: req.body.paymentMethod || null,
          paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : new Date(),
          notes: req.body.notes || null,
          invoiceUrl: req.body.invoiceUrl || null,
          paidById: req.user!.id,
        },
        include: {
          purchaseOrder: { select: { id: true, poNumber: true } },
          directPurchase: { select: { id: true, referenceNumber: true } },
          paidBy: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `Payment ${payment.referenceNumber} created`,
        subjectType: "App\\Models\\Payment",
        subjectId: payment.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: payment },
      });

      res.status(201).json({ success: true, data: payment, message: "Payment created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/payments/:id - Update payment (draft only)
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updatePaymentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.payment.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Payment not found");

      if (existing.status !== "draft") {
        return res.status(400).json({ error: `Cannot edit payment with status "${existing.status}"` });
      }

      const payment = await prisma.payment.update({
        where: { id: existing.id },
        data: {
          ...(req.body.amount !== undefined && { amount: req.body.amount }),
          ...(req.body.taxAmount !== undefined && { taxAmount: req.body.taxAmount }),
          ...(req.body.totalPaid !== undefined && { totalPaid: req.body.totalPaid }),
          ...(req.body.paymentMethod !== undefined && { paymentMethod: req.body.paymentMethod }),
          ...(req.body.paymentDate !== undefined && { paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : null }),
          ...(req.body.notes !== undefined && { notes: req.body.notes }),
          ...(req.body.invoiceUrl !== undefined && { invoiceUrl: req.body.invoiceUrl }),
        },
      });

      res.status(200).json({ success: true, data: payment, message: "Payment updated" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/payments/:id/submit - Submit for approval
router.put(
  "/:id/submit",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.payment.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "Payment not found" });

      if (existing.status !== "draft") {
        return res.status(400).json({ error: `Cannot submit with status "${existing.status}"` });
      }

      const updated = await prisma.payment.update({
        where: { id },
        data: { status: "submitted" },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PUT /api/payments/:id/approve - Approve and mark as paid
router.put(
  "/:id/approve",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = (req as any).user;

      const existing = await prisma.payment.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "Payment not found" });

      if (existing.status !== "submitted") {
        return res.status(400).json({ error: `Cannot approve with status "${existing.status}"` });
      }

      const updated = await prisma.payment.update({
        where: { id },
        data: {
          status: "paid",
          approvedById: user.id,
          approvedAt: new Date(),
          paidAt: new Date(),
        },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/payments/:id - Cancel payment
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.payment.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Payment not found");

      if (existing.status === "paid") {
        return res.status(400).json({ error: "Cannot cancel a paid payment" });
      }

      await prisma.payment.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false, status: "cancelled" },
      });

      res.status(200).json({ success: true, message: "Payment cancelled" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
