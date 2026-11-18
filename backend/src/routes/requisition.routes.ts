import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { createApprovalChain, processApprovalStep } from "../services/approvalEngine.js";
import { recomputeScopeCosts } from "./scope.routes.js";
import { generateReferenceNumber } from "../lib/numberGenerator.js";

const router = Router();

const requisitionItemSchema = z.object({
  id: z.number().int().optional(),
  description: z.string().min(1, "Description is required"),
  specification: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  qty: z.number().int().positive("Quantity must be positive"),
  unitPrice: z.number().min(0).optional().default(0),
  uom: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

const attachmentSchema = z.object({
  url: z.string().min(1),
  name: z.string().min(1),
  size: z.number().optional(),
  mimeType: z.string().optional(),
});

const createRequisitionSchema = z.object({
  // Departmental RFs get their division derived from the raiser's department
  // when omitted; project/programme RFs leave it null.
  division: z.string().min(1).optional().nullable(),
  processOwner: z.string().optional().nullable(),
  budgetItemId: z.number().int().positive().optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  // Programme requisitions draw from an internal project
  internalProjectId: z.number().int().positive().optional().nullable(),
  // The scope item this procurement raises for — feeds its actual cost
  scopeItemId: z.number().int().positive().optional().nullable(),
  // Quotations and supporting documents, already uploaded via /api/upload
  attachments: z.array(attachmentSchema).max(20).optional(),
  totalEstimatedCost: z.number().min(0).optional(),
  requiredDate: z.string().datetime().optional().nullable(),
  purpose: z.string().optional().nullable(),
  status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
  // New fields
  isUnbudgeted: z.boolean().optional(),
  procurementType: z.enum(["material", "service"]).optional(),
  urgencyLevel: z.enum(["low", "normal", "high", "urgent"]).optional(),
  purchaseType: z.enum(["project", "non_project"]).optional(),
  requestedByName: z.string().optional().nullable(),
  requestedByDate: z.string().datetime().optional().nullable(),
  approvedByName: z.string().optional().nullable(),
  approvedByDate: z.string().datetime().optional().nullable(),
  items: z.array(requisitionItemSchema).min(1, "At least one item is required"),
});

/**
 * Derives the raiser's division from their HR record:
 * user.departmentId → Department.code, which is exactly what the
 * `division` reference group's values hold (the join reference.routes.ts
 * uses). Returns null when the user has no department or the code has no
 * matching division entry — the caller decides whether that's an error.
 */
async function deriveDivision(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { department: { select: { code: true } } },
  });
  if (!user?.department?.code) return null;
  const divisionEntry = await prisma.referenceData.findFirst({
    where: { group: 'division', value: user.department.code, isActive: true },
    select: { value: true },
  });
  return divisionEntry?.value ?? null;
}

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
            budgetItem: { select: { id: true, description: true, division: true, allocatedBudget: true, utilizedBudget: true, currency: true, budgetType: true } },
            project: { select: { id: true, name: true } },
            internalProject: { select: { id: true, name: true } },
            approvals: {
              include: {
                approver: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    position: { select: { name: true } },
                  },
                },
              },
              orderBy: { order: "asc" },
            },
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
          budgetItem: { select: { id: true, description: true, division: true, allocatedBudget: true, utilizedBudget: true, currency: true, budgetType: true } },
          approvals: {
            include: { approver: { select: { id: true, name: true, email: true } } },
            orderBy: { order: "asc" },
          },
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

// POST /api/requisitions - Create requisition form with items (any authenticated user)
router.post(
  "/",
  authenticate,
  validate(createRequisitionSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { items, ...formData } = req.body;
      const isProjectRaised = formData.projectId != null;
      const isProgrammeRaised = formData.internalProjectId != null;

      // Division applies only to departmental RFs. Project/programme spend
      // stays null (the FKs say where the money belongs); departmental RFs
      // take the raiser's derived division — an explicit body value wins for
      // API callers, the UI no longer sends one.
      let division: string | null = formData.division ?? null;
      if (!isProjectRaised && !isProgrammeRaised && !division) {
        division = await deriveDivision(req.user!.id);
        if (!division) {
          return res.status(400).json({
            success: false,
            error:
              'Your account has no department assigned, so the requisition cannot be charged. Ask HR to set your department (its code must exist in Reference Data → Division) or pick a budget item explicitly.',
          });
        }
      }

      const form = await prisma.requisitionForm.create({
        data: {
          // Printed reference from the `req` numbering config (REQ-2026-0001)
          referenceNumber: await generateReferenceNumber('req'),
          division,
          budgetItemId: formData.budgetItemId || null,
          projectId: formData.projectId || null,
          internalProjectId: formData.internalProjectId || null,
          scopeItemId: formData.scopeItemId || null,
          totalEstimatedCost: formData.totalEstimatedCost || 0,
          requiredDate: formData.requiredDate ? new Date(formData.requiredDate) : null,
          purpose: formData.purpose || null,
          status: formData.status || "draft",
          createdByUserId: req.user!.id,
          isUnbudgeted: formData.isUnbudgeted || false,
          procurementType: formData.procurementType || "material",
          urgencyLevel: formData.urgencyLevel || "normal",
          purchaseType: formData.purchaseType || (isProjectRaised || isProgrammeRaised ? 'project' : 'non_project'),
          requestedByName: formData.requestedByName || null,
          requestedByDate: formData.requestedByDate ? new Date(formData.requestedByDate) : null,
          approvedByName: formData.approvedByName || null,
          approvedByDate: formData.approvedByDate ? new Date(formData.approvedByDate) : null,
          // Quotations and supporting documents live in metadata
          metadata: formData.attachments?.length
            ? { attachments: formData.attachments }
            : undefined,
          items: {
            create: items.map((item: any) => ({
              description: item.description,
              specification: item.specification || null,
              category: item.category || null,
              qty: item.qty,
              unitPrice: item.unitPrice || 0,
              uom: item.uom || null,
              remark: item.remark || null,
            })),
          },
        },
        include: {
          items: true,
          budgetItem: { select: { id: true, description: true } },
          project: { select: { id: true, name: true } },
          internalProject: { select: { id: true, name: true } },
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

      if (form.projectId) await recomputeScopeCosts(prisma, form.projectId);

      const mode = form.projectId ? 'project' : form.internalProjectId ? 'programme' : 'departmental';
      res.status(201).json({ success: true, data: { ...form, mode }, message: "Requisition form created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/requisitions/:id - Update requisition form with items
router.put(
  "/:id",
  authenticate,
  validate(updateRequisitionSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.requisitionForm.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Requisition form not found");

      // Only draft requisitions can be edited
      if (existing.status !== "draft") {
        return res.status(400).json({
          error: `Cannot edit a requisition with status "${existing.status}". Only draft requisitions can be edited.`,
        });
      }

      const { items, ...formData } = req.body;

      // Project-mode edits: the scope link moves, and attachments merge into
      // metadata (replacing the previous list — the dialog sends the full set).
      const nextMetadata: any = { ...(existing.metadata as any) };
      if (formData.attachments !== undefined) {
        if (formData.attachments?.length) nextMetadata.attachments = formData.attachments;
        else delete nextMetadata.attachments;
      }

      const form = await prisma.$transaction(async (tx) => {
        const updatedForm = await tx.requisitionForm.update({
          where: { id: existing.id },
          data: {
            ...(formData.division !== undefined && { division: formData.division }),
            // processOwner is legacy — no longer written; the column survives
            // for old rows.
            ...(formData.budgetItemId !== undefined && {
              budgetItem: formData.budgetItemId ? { connect: { id: formData.budgetItemId } } : { disconnect: true },
            }),
            // Relation syntax for every FK: with budgetItem above, Prisma
            // selects its strict (relation-only) input type, where scalar
            // foreign keys like projectId are rejected as unknown arguments.
            ...(formData.projectId !== undefined && {
              project: formData.projectId ? { connect: { id: formData.projectId } } : { disconnect: true },
            }),
            ...(formData.internalProjectId !== undefined && {
              internalProject: formData.internalProjectId
                ? { connect: { id: formData.internalProjectId } }
                : { disconnect: true },
            }),
            ...(formData.scopeItemId !== undefined && {
              scopeItem: formData.scopeItemId ? { connect: { id: formData.scopeItemId } } : { disconnect: true },
            }),
            ...(formData.attachments !== undefined && {
              metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : Prisma.JsonNull,
            }),
            ...(formData.totalEstimatedCost !== undefined && { totalEstimatedCost: formData.totalEstimatedCost }),
            ...(formData.requiredDate !== undefined && {
              requiredDate: formData.requiredDate ? new Date(formData.requiredDate) : null,
            }),
            ...(formData.purpose !== undefined && { purpose: formData.purpose }),
            ...(formData.status !== undefined && { status: formData.status }),
            ...(formData.isUnbudgeted !== undefined && { isUnbudgeted: formData.isUnbudgeted }),
            ...(formData.procurementType !== undefined && { procurementType: formData.procurementType }),
            ...(formData.urgencyLevel !== undefined && { urgencyLevel: formData.urgencyLevel }),
            ...(formData.purchaseType !== undefined && { purchaseType: formData.purchaseType }),
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

        if (items) {
          await tx.requisitionItem.updateMany({
            where: { requisitionFormId: existing.id, deletedAt: null },
            data: { deletedAt: new Date(), isActive: false },
          });

          if (items.length > 0) {
            await tx.requisitionItem.createMany({
              data: items.map((item: any) => ({
                requisitionFormId: existing.id,
                description: item.description,
                specification: item.specification || null,
                category: item.category || null,
                qty: item.qty,
                unitPrice: item.unitPrice || 0,
                uom: item.uom || null,
                remark: item.remark || null,
              })),
            });
          }
        }

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
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.requisitionForm.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Requisition form not found");

      // Only draft requisitions can be deleted
      if (existing.status !== "draft") {
        return res.status(400).json({
          error: `Cannot delete a requisition with status "${existing.status}". Only draft requisitions can be deleted.`,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.requisitionItem.updateMany({
          where: { requisitionFormId: existing.id, deletedAt: null },
          data: { deletedAt: new Date(), isActive: false },
        });

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

// ==================== Submit for Approval ====================

router.put(
  "/:id/submit",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      const existing = await prisma.requisitionForm.findFirst({
        where: { id, isActive: true, deletedAt: null },
        include: { budgetItem: true },
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

      // Update status to submitted
      await prisma.requisitionForm.update({
        where: { id },
        data: {
          status: "submitted",
          requestedByName: user.name || user.email || "User",
          requestedByDate: new Date(),
        },
      });

      // Try to create approval chain based on policy. Project/programme RFs
      // pass null division so they match budgetType-only or global policies —
      // the old 'PROJECT' literal matched nothing.
      const budgetType = existing.budgetItem?.budgetType || null;
      const divisionForPolicy = existing.projectId || existing.internalProjectId ? null : existing.division;
      const hasChain = await createApprovalChain(
        id,
        budgetType,
        divisionForPolicy,
        Number(existing.totalEstimatedCost)
      );

      // If no approval chain was created (no policy or no approvers), auto-approve
      if (!hasChain) {
        await prisma.requisitionForm.update({
          where: { id },
          data: {
            status: "approved",
            approvedByName: "Auto-approved (no policy)",
            approvedByDate: new Date(),
          },
        });

        // Update budget utilization if linked
        if (existing.budgetItemId) {
          await prisma.budgetItem.update({
            where: { id: existing.budgetItemId },
            data: {
              utilizedBudget: { increment: existing.totalEstimatedCost },
            },
          });
        }
      } else {
        // Set to under_review since we have an approval chain
        await prisma.requisitionForm.update({
          where: { id },
          data: { status: "under_review" },
        });
      }

      const updated = await prisma.requisitionForm.findUnique({
        where: { id },
        include: {
          items: { where: { isActive: true, deletedAt: null } },
          budgetItem: {
            select: {
              id: true, description: true, division: true,
              allocatedBudget: true, utilizedBudget: true, currency: true,
            },
          },
          approvals: {
            include: { approver: { select: { id: true, name: true, email: true } } },
            orderBy: { order: "asc" },
          },
        },
      });

      // Auto-approval (or any status flip) changes scope actuals — refresh.
      if (existing.projectId) await recomputeScopeCosts(prisma, existing.projectId);

      res.json(updated);
    } catch (error) {
      console.error("Error submitting requisition:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Approve / Reject (single-step for backward compat) ====================

const approveRejectSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
});

router.put(
  "/:id/approve",
  authenticate,
  requirePermission("procurement.requisition.approve"),
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

      if (existing.status !== "submitted" && existing.status !== "under_review") {
        return res.status(400).json({
          error: `Cannot ${body.action} a form with status "${existing.status}".`,
        });
      }

      const user = (req as any).user;
      const userName = user.name || user.email || "Admin";

      // Check if there's an approval chain
      const pendingApprovals = await prisma.requisitionApproval.findMany({
        where: { requisitionId: id, status: "pending" },
      });

      if (pendingApprovals.length > 0) {
        // Use the approval engine for chain-based approval
        const result = await processApprovalStep(
          id,
          user.id,
          body.action,
          body.reason
        );

        if (existing.projectId) await recomputeScopeCosts(prisma, existing.projectId);

        return res.json({
          success: true,
          status: result.requisitionStatus,
          isComplete: result.isComplete,
        });
      }

      // Legacy single-step approval
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
              id: true, description: true, division: true,
              allocatedBudget: true, utilizedBudget: true, currency: true,
            },
          },
        },
      });

      if (body.action === "approved" && existing.budgetItemId) {
        await prisma.budgetItem.update({
          where: { id: existing.budgetItemId },
          data: { utilizedBudget: { increment: existing.totalEstimatedCost } },
        });
      }

      if (body.action === "rejected" && existing.status === "approved" && existing.budgetItemId) {
        await prisma.budgetItem.update({
          where: { id: existing.budgetItemId },
          data: { utilizedBudget: { decrement: existing.totalEstimatedCost } },
        });
      }

      if (existing.projectId) await recomputeScopeCosts(prisma, existing.projectId);

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

// ==================== Individual Approval Step ====================

const approvalStepSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  comments: z.string().optional(),
});

router.put(
  "/:id/approve-step",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const body = approvalStepSchema.parse(req.body);
      const user = (req as any).user;

      const result = await processApprovalStep(id, user.id, body.action, body.comments);

      const linked = await prisma.requisitionForm.findUnique({
        where: { id },
        select: { projectId: true },
      });
      if (linked?.projectId) await recomputeScopeCosts(prisma, linked.projectId);

      res.json({
        success: true,
        status: result.requisitionStatus,
        isComplete: result.isComplete,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      console.error("Error in approval step:", error);
      res.status(500).json({ error: (error as Error).message || "Internal server error" });
    }
  }
);

// ==================== Approval Status ====================

router.get(
  "/:id/approval-status",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      const approvals = await prisma.requisitionApproval.findMany({
        where: { requisitionId: id },
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: { order: "asc" },
      });

      res.json({ success: true, data: approvals });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
