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

const requisitionItemSchema = z.object({
  id: z.number().int().optional(),
  description: z.string().min(1, "Description is required"),
  qty: z.number().int().positive("Quantity must be positive"),
  unitPrice: z.number().min(0).optional().default(0),
  uom: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

const createRequisitionSchema = z.object({
  division: z.string().min(1, "Division is required"),
  processOwner: z.string().optional().nullable(),
  budgetItemId: z.number().int().positive().optional().nullable(),
  totalEstimatedCost: z.number().min(0).optional(),
  requiredDate: z.string().datetime().optional().nullable(),
  purpose: z.string().optional().nullable(),
  status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
  requestedByName: z.string().optional().nullable(),
  requestedByDate: z.string().datetime().optional().nullable(),
  approvedByName: z.string().optional().nullable(),
  approvedByDate: z.string().datetime().optional().nullable(),
  items: z.array(requisitionItemSchema).min(1, "At least one item is required"),
});

const updateRequisitionSchema = createRequisitionSchema.partial().extend({
  items: z.array(requisitionItemSchema).optional(),
});

// GET /api/requisitions - List all requisition forms
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { status, search, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { deletedAt: null, isActive: true };

      if (status) where.status = status;
      if (search) {
        where.OR = [
          { division: { contains: search as string, mode: "insensitive" } },
          { processOwner: { contains: search as string, mode: "insensitive" } },
          { purpose: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const [forms, total] = await Promise.all([
        prisma.requisitionForm.findMany({
          where,
          include: {
            items: { where: { deletedAt: null, isActive: true } },
            budgetItem: { select: { id: true, description: true, division: true, allocatedBudget: true, utilizedBudget: true, currency: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.requisitionForm.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: forms,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Requisition forms retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/requisitions/:id - Get single requisition form with items
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const form = await prisma.requisitionForm.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          items: { where: { deletedAt: null, isActive: true }, orderBy: { id: "asc" } },
          budgetItem: { select: { id: true, description: true, division: true, allocatedBudget: true, utilizedBudget: true, currency: true } },
        },
      });

      if (!form) throw new NotFoundError("Requisition form not found");

      res.status(200).json({
        success: true,
        data: form,
        message: "Requisition form retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/requisitions - Create requisition form with items
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createRequisitionSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { items, ...formData } = req.body;

      const form = await prisma.requisitionForm.create({
        data: {
          division: formData.division,
          processOwner: formData.processOwner || null,
          budgetItemId: formData.budgetItemId || null,
          totalEstimatedCost: formData.totalEstimatedCost || 0,
          requiredDate: formData.requiredDate ? new Date(formData.requiredDate) : null,
          purpose: formData.purpose || null,
          status: formData.status || "draft",
          requestedByName: formData.requestedByName || null,
          requestedByDate: formData.requestedByDate ? new Date(formData.requestedByDate) : null,
          approvedByName: formData.approvedByName || null,
          approvedByDate: formData.approvedByDate ? new Date(formData.approvedByDate) : null,
          items: {
            create: items.map((item: any) => ({
              description: item.description,
              qty: item.qty,
              uom: item.uom || null,
              remark: item.remark || null,
            })),
          },
        },
        include: {
          items: true,
          budgetItem: { select: { id: true, description: true } },
        },
      });

      await logActivity({
        description: `Requisition form #${form.id} created`,
        subjectType: "App\\Models\\RequisitionForm",
        subjectId: form.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: form },
      });

      res.status(201).json({ success: true, data: form, message: "Requisition form created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/requisitions/:id - Update requisition form with items
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateRequisitionSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.requisitionForm.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Requisition form not found");

      const { items, ...formData } = req.body;

      // Update form and replace items in a transaction
      const form = await prisma.$transaction(async (tx) => {
        // Update the form
        const updatedForm = await tx.requisitionForm.update({
          where: { id: existing.id },
          data: {
            ...(formData.division !== undefined && { division: formData.division }),
            ...(formData.processOwner !== undefined && { processOwner: formData.processOwner }),
            ...(formData.budgetItemId !== undefined && {
              budgetItem: formData.budgetItemId ? { connect: { id: formData.budgetItemId } } : { disconnect: true },
            }),
            ...(formData.totalEstimatedCost !== undefined && { totalEstimatedCost: formData.totalEstimatedCost }),
            ...(formData.requiredDate !== undefined && {
              requiredDate: formData.requiredDate ? new Date(formData.requiredDate) : null,
            }),
            ...(formData.purpose !== undefined && { purpose: formData.purpose }),
            ...(formData.status !== undefined && { status: formData.status }),
            ...(formData.requestedByName !== undefined && { requestedByName: formData.requestedByName }),
            ...(formData.requestedByDate !== undefined && {
              requestedByDate: formData.requestedByDate ? new Date(formData.requestedByDate) : null,
            }),
            ...(formData.approvedByName !== undefined && { approvedByName: formData.approvedByName }),
            ...(formData.approvedByDate !== undefined && {
              approvedByDate: formData.approvedByDate ? new Date(formData.approvedByDate) : null,
            }),
          },
        });

        // Replace items if provided
        if (items) {
          // Soft delete existing items
          await tx.requisitionItem.updateMany({
            where: { requisitionFormId: existing.id, deletedAt: null },
            data: { deletedAt: new Date(), isActive: false },
          });

          // Create new items
          if (items.length > 0) {
            await tx.requisitionItem.createMany({
              data: items.map((item: any) => ({
                requisitionFormId: existing.id,
                description: item.description,
                qty: item.qty,
                uom: item.uom || null,
                remark: item.remark || null,
              })),
            });
          }
        }

        // Return the updated form with items
        return tx.requisitionForm.findUnique({
          where: { id: existing.id },
          include: { items: { where: { deletedAt: null, isActive: true } } },
        });
      });

      await logActivity({
        description: `Requisition form #${form!.id} updated`,
        subjectType: "App\\Models\\RequisitionForm",
        subjectId: form!.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: form },
      });

      res.status(200).json({ success: true, data: form, message: "Requisition form updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/requisitions/:id - Soft delete requisition form
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.requisitionForm.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Requisition form not found");

      await prisma.$transaction(async (tx) => {
        // Soft delete items
        await tx.requisitionItem.updateMany({
          where: { requisitionFormId: existing.id, deletedAt: null },
          data: { deletedAt: new Date(), isActive: false },
        });

        // Soft delete form
        await tx.requisitionForm.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), isActive: false },
        });
      });

      await logActivity({
        description: `Requisition form #${existing.id} deleted`,
        subjectType: "App\\Models\\RequisitionForm",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "Requisition form deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== Approve / Reject ====================

const approveRejectSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
});

router.put(
  "/:id/approve",
  authenticate,
  requireRole(["super-admin", "devops-admin"]),
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const body = approveRejectSchema.parse(req.body);

      const existing = await prisma.requisitionForm.findFirst({
        where: { id, isActive: true, deletedAt: null },
        include: { budgetItem: true },
      });

      if (!existing) {
        return res.status(404).json({ error: "Requisition form not found" });
      }

      if (existing.status !== "submitted") {
        return res.status(400).json({
          error: `Cannot ${body.action} a form with status "${existing.status}". Only "submitted" forms can be processed.`,
        });
      }

      const user = (req as any).user;
      const userName = user.name || user.email || "Admin";

      // Update requisition status
      const updated = await prisma.requisitionForm.update({
        where: { id },
        data: {
          status: body.action,
          approvedByName: userName,
          approvedByDate: new Date(),
          metadata: body.reason
            ? { ...(existing.metadata as any), rejectionReason: body.reason }
            : existing.metadata,
        },
        include: {
          items: { where: { isActive: true, deletedAt: null } },
          budgetItem: {
            select: {
              id: true,
              description: true,
              division: true,
              allocatedBudget: true,
              utilizedBudget: true,
              currency: true,
            },
          },
        },
      });

      // If approved and has budget item, update utilized budget
      if (body.action === "approved" && existing.budgetItemId) {
        await prisma.budgetItem.update({
          where: { id: existing.budgetItemId },
          data: {
            utilizedBudget: {
              increment: existing.totalEstimatedCost,
            },
          },
        });
      }

      // If rejected and was previously approved (revoke), decrease utilized budget
      if (body.action === "rejected" && existing.status === "approved" && existing.budgetItemId) {
        await prisma.budgetItem.update({
          where: { id: existing.budgetItemId },
          data: {
            utilizedBudget: {
              decrement: existing.totalEstimatedCost,
            },
          },
        });
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error processing requisition:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Submit for Approval ====================

router.put(
  "/:id/submit",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      const existing = await prisma.requisitionForm.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Requisition form not found" });
      }

      if (existing.status !== "draft") {
        return res.status(400).json({
          error: `Cannot submit a form with status "${existing.status}". Only "draft" forms can be submitted.`,
        });
      }

      const user = (req as any).user;

      const updated = await prisma.requisitionForm.update({
        where: { id },
        data: {
          status: "submitted",
          requestedByName: user.name || user.email || "User",
          requestedByDate: new Date(),
        },
        include: {
          items: { where: { isActive: true, deletedAt: null } },
          budgetItem: {
            select: {
              id: true,
              description: true,
              division: true,
              allocatedBudget: true,
              utilizedBudget: true,
              currency: true,
            },
          },
        },
      });

      res.json(updated);
    } catch (error) {
      console.error("Error submitting requisition:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
