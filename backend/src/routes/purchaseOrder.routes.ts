import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, AppError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { generateReferenceNumber } from "../lib/numberGenerator.js";
import { openRequest, settleSubject } from "../services/approvalRequest.service.js";

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

// ── RF → PO lifecycle ───────────────────────────────────────────────────────
//
// A sourced PO advances its requisition: first PO moves an approved RF to
// `in_procurement`; when every PO of the RF is terminal (completed or
// cancelled) the RF itself completes. Status-driven only — no per-item
// coverage tracking in v1.

const PO_TERMINAL_STATUSES = ["completed", "cancelled"];
const RF_PO_ELIGIBLE_STATUSES = ["approved", "in_procurement"];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Server-side totals from line items — the client's numbers are informational. */
function recomputeTotals(
  items: { qty: number; unitPrice: number }[],
  taxAmount: number | undefined
): { totalAmount: number; grandTotal: number } {
  const totalAmount = round2(items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
  return { totalAmount, grandTotal: round2(totalAmount + (taxAmount ?? 0)) };
}

/**
 * RF completion rollup: an eligible RF with at least one active PO and zero
 * non-terminal POs left is completed. Called after any PO status change that
 * could be the last one (complete, cancel).
 */
async function syncRequisitionProcurementStatus(requisitionId: number | null) {
  if (!requisitionId) return;
  const rf = await prisma.requisitionForm.findFirst({
    where: { id: requisitionId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!rf || !RF_PO_ELIGIBLE_STATUSES.includes(rf.status)) return;

  const [remaining, total] = await Promise.all([
    prisma.purchaseOrder.count({
      where: {
        requisitionId,
        deletedAt: null,
        isActive: true,
        status: { notIn: PO_TERMINAL_STATUSES },
      },
    }),
    prisma.purchaseOrder.count({
      where: { requisitionId, deletedAt: null, isActive: true },
    }),
  ]);

  if (remaining === 0 && total > 0) {
    await prisma.requisitionForm.update({
      where: { id: requisitionId },
      data: { status: "completed" },
    });
  }
}

/**
 * Validates a requisition being sourced into a PO: it must exist and be in an
 * approved or in-procurement state. Returns the RF for inheritance.
 */
async function assertSourcableRequisition(requisitionId: number) {
  const rf = await prisma.requisitionForm.findFirst({
    where: { id: requisitionId, deletedAt: null },
    select: {
      id: true,
      status: true,
      projectId: true,
      budgetItemId: true,
      budgetItem: { select: { currency: true } },
    },
  });
  if (!rf) throw new NotFoundError("Requisition not found");
  if (!RF_PO_ELIGIBLE_STATUSES.includes(rf.status)) {
    throw new AppError(
      400,
      `Only approved requisitions can be sourced into a PO — RF #${requisitionId} is "${rf.status}"`
    );
  }
  return rf;
}

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

// POST /api/purchase-orders - Create PO (blank or sourced from an approved RF)
router.post(
  "/",
  authenticate,
  requirePermission("procurement.po.manage"),
  validate(createPoSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { items, ...data } = req.body;
      const poNumber = await generateReferenceNumber(data.type === "lo" ? "lo" : "po");

      // Sourcing: the RF must exist and be approvable into procurement. Project
      // and budget inherit from the RF unless the body overrides them.
      let sourcedRf: Awaited<ReturnType<typeof assertSourcableRequisition>> | null = null;
      if (data.requisitionId) {
        sourcedRf = await assertSourcableRequisition(data.requisitionId);
        if (
          sourcedRf.budgetItem?.currency &&
          data.currency &&
          sourcedRf.budgetItem.currency !== data.currency
        ) {
          return res.status(400).json({
            error: `Currency mismatch — the requisition's budget is ${sourcedRf.budgetItem.currency}`,
          });
        }
      }

      const totals = recomputeTotals(items, data.taxAmount);

      const po = await prisma.$transaction(async (tx) => {
        const created = await tx.purchaseOrder.create({
          data: {
            poNumber,
            type: data.type || "po",
            requisitionId: data.requisitionId || null,
            quotationId: data.quotationId || null,
            vendorId: data.vendorId,
            projectId: data.projectId ?? sourcedRf?.projectId ?? null,
            budgetItemId: data.budgetItemId ?? sourcedRf?.budgetItemId ?? null,
            totalAmount: totals.totalAmount,
            taxAmount: data.taxAmount || 0,
            grandTotal: totals.grandTotal,
            currency: data.currency || sourcedRf?.budgetItem?.currency || "MYR",
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

        // First PO from an approved RF moves it into procurement. Idempotent:
        // already-in_procurement RFs (multi-PO splits) stay as they are.
        if (sourcedRf && sourcedRf.status === "approved") {
          await tx.requisitionForm.update({
            where: { id: sourcedRf.id },
            data: { status: "in_procurement" },
          });
        }

        return created;
      });

      await logActivity({
        description: `Purchase order ${po.poNumber} created`,
        subjectType: "App\\Models\\PurchaseOrder",
        subjectId: po.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: po },
      });
      if (sourcedRf && sourcedRf.status === "approved") {
        await logActivity({
          description: `Requisition #${sourcedRf.id} moved to in_procurement by PO ${po.poNumber}`,
          subjectType: "App\\Models\\RequisitionForm",
          subjectId: sourcedRf.id,
          event: "updated",
          causerId: req.user!.id,
          properties: { attributes: { status: "in_procurement", poId: po.id } },
        });
      }

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
  requirePermission("procurement.po.manage"),
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

      // Same sourcing validation as create when the RF link changes on a draft.
      if (
        formData.requisitionId !== undefined &&
        formData.requisitionId !== null &&
        formData.requisitionId !== existing.requisitionId
      ) {
        await assertSourcableRequisition(formData.requisitionId);
      }

      // Recompute totals whenever the lines or tax change — never trust the body.
      const recomputed =
        items || formData.taxAmount !== undefined
          ? recomputeTotals(
              items ?? (await prisma.purchaseOrderItem.findMany({ where: { poId: existing.id, isActive: true } })),
              formData.taxAmount ?? existing.taxAmount
            )
          : null;

      const po = await prisma.$transaction(async (tx) => {
        const updated = await tx.purchaseOrder.update({
          where: { id: existing.id },
          data: {
            ...(formData.requisitionId !== undefined && { requisitionId: formData.requisitionId }),
            ...(formData.vendorId !== undefined && { vendorId: formData.vendorId }),
            ...(formData.projectId !== undefined && { projectId: formData.projectId }),
            ...(formData.budgetItemId !== undefined && { budgetItemId: formData.budgetItemId }),
            ...(recomputed && { totalAmount: recomputed.totalAmount }),
            ...(formData.taxAmount !== undefined && { taxAmount: formData.taxAmount }),
            ...(recomputed && { grandTotal: recomputed.grandTotal }),
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

      // Purchase orders have no team, so the approver comes from the global
      // capability chain. When nobody resolves, the PO stays submitted and the
      // procurement page still shows it — the ledger is an extra surface, not
      // the only one, so a missing approver must not block the submission.
      if (existing.requestedById) {
        await openRequest({
          module: "purchase-order",
          subjectType: "PurchaseOrder",
          subjectId: id,
          title: `PO ${existing.poNumber} — ${existing.currency} ${Number(
            existing.grandTotal
          ).toFixed(2)}`,
          requesterId: existing.requestedById,
          approvalPermission: "procurement.po.approve",
          link: "/procurement/purchase-orders",
          metadata: { vendorId: existing.vendorId, projectId: existing.projectId },
        });
      }

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
  // Approving used to require `.manage`, the same grant as creating — so the
  // person who raised the PO could also sign it off. The catalog has had a
  // separate `procurement.po.approve` capability all along.
  requirePermission("procurement.po.approve"),
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

      await settleSubject({ subjectType: "PurchaseOrder", subjectId: id, status: "approved" });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PUT /api/purchase-orders/:id/complete - Mark the PO completed
router.put(
  "/:id/complete",
  authenticate,
  requirePermission("procurement.po.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await prisma.purchaseOrder.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Purchase order not found");

      if (!["approved", "fully_received", "partially_received"].includes(existing.status)) {
        return res.status(400).json({
          error: `Cannot complete PO with status "${existing.status}"`,
        });
      }

      const updated = await prisma.purchaseOrder.update({
        where: { id },
        data: { status: "completed" },
      });

      await logActivity({
        description: `Purchase order ${existing.poNumber} completed`,
        subjectType: "App\\Models\\PurchaseOrder",
        subjectId: id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { status: "completed" } },
      });

      // This may be the PO that closes out its requisition.
      await syncRequisitionProcurementStatus(existing.requisitionId);

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/purchase-orders/:id - Cancel PO
router.delete(
  "/:id",
  authenticate,
  requirePermission("procurement.po.manage"),
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

      // Cancelling may complete the requisition (all POs terminal).
      await syncRequisitionProcurementStatus(existing.requisitionId);

      res.status(200).json({ success: true, message: "Purchase order cancelled" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
