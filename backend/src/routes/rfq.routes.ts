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

const rfqItemSchema = z.object({
  description: z.string().min(1),
  specification: z.string().optional().nullable(),
  qty: z.number().int().positive(),
  uom: z.string().optional().nullable(),
});

const createRfqSchema = z.object({
  requisitionId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  type: z.enum(["material", "service"]).optional(),
  closingDate: z.string().datetime().optional().nullable(),
  evaluationCriteria: z.any().optional().nullable(),
  items: z.array(rfqItemSchema).min(1, "At least one item is required"),
});

const updateRfqSchema = createRfqSchema.partial().extend({
  items: z.array(rfqItemSchema).optional(),
});

const quotationItemSchema = z.object({
  description: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().min(0),
  uom: z.string().optional().nullable(),
});

const submitQuotationSchema = z.object({
  vendorId: z.number().int().positive(),
  quotedAmount: z.number().min(0),
  currency: z.string().optional(),
  validityDays: z.number().int().positive().optional().nullable(),
  deliveryDays: z.number().int().positive().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  items: z.array(quotationItemSchema).optional(),
});

// GET /api/rfq - List RFQs
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
          { title: { contains: search as string, mode: "insensitive" } },
          { rfqNumber: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [rfqs, total] = await Promise.all([
        prisma.requestForQuotation.findMany({
          where,
          include: {
            requisition: { select: { id: true, division: true, totalEstimatedCost: true } },
            items: { where: { isActive: true } },
            quotations: { where: { isActive: true, deletedAt: null }, select: { id: true, vendorId: true, quotedAmount: true, status: true, isAwarded: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.requestForQuotation.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: rfqs,
        meta: { currentPage: pageNum, lastPage: Math.ceil(total / limitNum), perPage: limitNum, total },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/rfq/:id - Get single RFQ
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const rfq = await prisma.requestForQuotation.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          requisition: {
            include: {
              items: { where: { deletedAt: null, isActive: true } },
              budgetItem: { select: { id: true, description: true, allocatedBudget: true, utilizedBudget: true } },
            },
          },
          items: { where: { isActive: true }, orderBy: { id: "asc" } },
          quotations: {
            where: { isActive: true, deletedAt: null },
            include: {
              vendor: { select: { id: true, name: true, contactPerson: true, email: true } },
              items: true,
            },
          },
        },
      });

      if (!rfq) throw new NotFoundError("RFQ not found");

      res.status(200).json({ success: true, data: rfq });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/rfq - Create RFQ
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createRfqSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { items, ...data } = req.body;
      const rfqNumber = await generateReferenceNumber("rfq");

      const rfq = await prisma.requestForQuotation.create({
        data: {
          rfqNumber,
          requisitionId: data.requisitionId || null,
          title: data.title,
          description: data.description || null,
          type: data.type || "material",
          closingDate: data.closingDate ? new Date(data.closingDate) : null,
          evaluationCriteria: data.evaluationCriteria || null,
          items: {
            create: items.map((item: any) => ({
              description: item.description,
              specification: item.specification || null,
              qty: item.qty,
              uom: item.uom || null,
            })),
          },
        },
        include: { items: true },
      });

      await logActivity({
        description: `RFQ ${rfq.rfqNumber} created`,
        subjectType: "App\\Models\\RequestForQuotation",
        subjectId: rfq.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: rfq },
      });

      res.status(201).json({ success: true, data: rfq, message: "RFQ created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/rfq/:id - Update RFQ
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateRfqSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.requestForQuotation.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("RFQ not found");

      const { items, ...formData } = req.body;

      const rfq = await prisma.$transaction(async (tx) => {
        const updated = await tx.requestForQuotation.update({
          where: { id: existing.id },
          data: {
            ...(formData.title !== undefined && { title: formData.title }),
            ...(formData.description !== undefined && { description: formData.description }),
            ...(formData.type !== undefined && { type: formData.type }),
            ...(formData.closingDate !== undefined && {
              closingDate: formData.closingDate ? new Date(formData.closingDate) : null,
            }),
            ...(formData.evaluationCriteria !== undefined && { evaluationCriteria: formData.evaluationCriteria }),
          },
        });

        if (items) {
          await tx.rfqItem.updateMany({
            where: { rfqId: existing.id },
            data: { isActive: false },
          });
          if (items.length > 0) {
            await tx.rfqItem.createMany({
              data: items.map((item: any) => ({
                rfqId: existing.id,
                description: item.description,
                specification: item.specification || null,
                qty: item.qty,
                uom: item.uom || null,
              })),
            });
          }
        }

        return tx.requestForQuotation.findUnique({
          where: { id: existing.id },
          include: { items: { where: { isActive: true } } },
        });
      });

      res.status(200).json({ success: true, data: rfq, message: "RFQ updated" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/rfq/:id/send - Mark RFQ as sent
router.put(
  "/:id/send",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.requestForQuotation.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) return res.status(404).json({ error: "RFQ not found" });

      if (existing.status !== "draft") {
        return res.status(400).json({ error: `Cannot send RFQ with status "${existing.status}"` });
      }

      const updated = await prisma.requestForQuotation.update({
        where: { id },
        data: { status: "sent", issueDate: new Date() },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/rfq/:id/quotations - Submit a vendor quotation
router.post(
  "/:id/quotations",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(submitQuotationSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const rfq = await prisma.requestForQuotation.findFirst({
        where: { id: parseInt(id, 10), isActive: true, deletedAt: null },
      });
      if (!rfq) throw new NotFoundError("RFQ not found");

      const { items, ...quotationData } = req.body;

      const quotation = await prisma.quotation.create({
        data: {
          rfqId: rfq.id,
          vendorId: quotationData.vendorId,
          quotedAmount: quotationData.quotedAmount,
          currency: quotationData.currency || "MYR",
          validityDays: quotationData.validityDays || null,
          deliveryDays: quotationData.deliveryDays || null,
          paymentTerms: quotationData.paymentTerms || null,
          remarks: quotationData.remarks || null,
          items: items
            ? {
                create: items.map((item: any) => ({
                  description: item.description,
                  qty: item.qty,
                  unitPrice: item.unitPrice,
                  uom: item.uom || null,
                  totalAmount: item.qty * item.unitPrice,
                })),
              }
            : undefined,
        },
        include: { items: true, vendor: { select: { id: true, name: true } } },
      });

      res.status(201).json({ success: true, data: quotation, message: "Quotation submitted" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/rfq/:rfqId/quotations/:quoteId/award - Award a quotation
router.put(
  "/:rfqId/quotations/:quoteId/award",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: Request, res: Response) => {
    try {
      const { rfqId, quoteId } = req.params;

      const quotation = await prisma.quotation.findFirst({
        where: { id: parseInt(quoteId, 10), rfqId: parseInt(rfqId, 10), isActive: true, deletedAt: null },
      });
      if (!quotation) return res.status(404).json({ error: "Quotation not found" });

      await prisma.$transaction(async (tx) => {
        // Reset all quotations for this RFQ
        await tx.quotation.updateMany({
          where: { rfqId: parseInt(rfqId, 10), isActive: true, deletedAt: null },
          data: { isAwarded: false, status: "submitted" },
        });

        // Award the selected quotation
        await tx.quotation.update({
          where: { id: quotation.id },
          data: { isAwarded: true, status: "awarded" },
        });

        // Update RFQ status
        await tx.requestForQuotation.update({
          where: { id: parseInt(rfqId, 10) },
          data: { status: "awarded" },
        });
      });

      res.json({ success: true, message: "Quotation awarded" });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /api/rfq/:id - Cancel RFQ
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.requestForQuotation.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("RFQ not found");

      await prisma.requestForQuotation.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false, status: "cancelled" },
      });

      res.status(200).json({ success: true, message: "RFQ cancelled" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
