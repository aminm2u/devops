import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { recomputeScopeCosts } from "./scope.routes.js";

const router = Router();

/**
 * Costing sheet — one per project, lazily created on first read. Cost lines
 * may attach to scope items (the spine: their planCost/actualCost roll up
 * server-side) and optionally to budget items (planned procurement under the
 * project's budget). Sheet totals and scope rollups are always recomputed
 * server-side inside the mutation transaction — never incremented, never
 * trusted from the client.
 *
 * Sign-off: only the project manager (PMO) can initiate. At submit time they
 * hand-pick two verifiers (tier 1 and tier 2); the final approval step goes to
 * whoever holds the costing-approve permission. A submitter may withdraw the
 * sheet back to draft any time before the first verification lands.
 */

const STEPS = [
  { step: 1, stepKey: "prepared", label: "Prepared by PM" },
  { step: 2, stepKey: "verified_1", label: "Verified (Tier 1)" },
  { step: 3, stepKey: "verified_2", label: "Verified (Tier 2)" },
  { step: 4, stepKey: "approved", label: "Approved" },
] as const;

type StepKey = (typeof STEPS)[number]["stepKey"];

/** Status each step requires the sheet to be in before it may act. */
const REQUIRED_STATUS: Record<StepKey, string> = {
  prepared: "draft",
  verified_1: "submitted",
  verified_2: "verified_1",
  approved: "verified_2",
};

const NEXT_STATUS: Record<StepKey, string> = {
  prepared: "submitted",
  verified_1: "verified_1",
  verified_2: "verified_2",
  approved: "approved",
};

/** Verify steps are gated by the assigned user, not a global permission. */
const STEP_PERMISSION: Record<StepKey, string | null> = {
  prepared: "project.costing.manage",
  verified_1: null,
  verified_2: null,
  approved: "project.costing.approve.ceo",
};

const money = z.number().min(0).max(999_999_999_999);

const categorySchema = z.object({
  name: z.string().min(1).max(255),
});

const itemSchema = z.object({
  categoryId: z.number().int().positive(),
  scopeItemId: z.number().int().positive().nullable().optional(),
  budgetItemId: z.number().int().positive().nullable().optional(),
  description: z.string().min(1).max(1000),
  qty: money.optional(),
  uom: z.string().max(30).nullable().optional(),
  unitCost: money.optional(),
  actualCost: money.optional(),
  remarks: z.string().max(2000).nullable().optional(),
});

const itemUpdateSchema = itemSchema.partial().omit({ categoryId: true });

const resourceSchema = z.object({
  scopeItemId: z.number().int().positive().nullable().optional(),
  teamAssignmentId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(255),
  positionCode: z.string().min(1).max(50),
  costPerDay: money,
  weeksRequired: z.number().min(0).max(999),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  remarks: z.string().max(2000).nullable().optional(),
});

const resourceUpdateSchema = resourceSchema.partial();

const signOffSchema = z.object({
  stepKey: z.enum(["verified_1", "verified_2", "approved"]),
  decision: z.enum(["approve", "reject"]),
  comments: z.string().max(2000).nullable().optional(),
});

const submitSchema = z.object({
  verifier1Id: z.number().int().positive(),
  verifier2Id: z.number().int().positive(),
  comments: z.string().max(2000).nullable().optional(),
});

/** Only the project manager (PMO) may submit or withdraw the sheet. */
async function assertProjectManager(projectId: number, req: RequestWithUser) {
  const user = req.user!;
  if (user.roles?.some((r: any) => r.name === "super-admin")) return;
  const assignment = await prisma.teamAssignment.findFirst({
    where: { projectId, userId: user.id, isActive: true },
    include: { projectRole: { select: { name: true } } },
  });
  const roleName = assignment?.projectRole?.name ?? "";
  const holdsPmo =
    user.roles?.some((r: any) => r.name === "project-manager-officer") ?? false;
  if (!holdsPmo || !/project\s*manager/i.test(roleName)) {
    throw new ForbiddenError("Only the project manager can submit this costing sheet");
  }
}

async function resolveProject(projectId: number) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new NotFoundError("Project not found");
  return project;
}

/** Gets the project's sheet, creating it (with 4 pending steps) on first read. */
async function getOrCreateSheet(projectId: number) {
  const existing = await prisma.costingSheet.findUnique({
    where: { projectId },
    include: { approvals: { orderBy: { step: "asc" } } },
  });
  if (existing) return existing;

  return prisma.costingSheet.create({
    data: {
      projectId,
      approvals: {
        create: STEPS.map((s) => ({ step: s.step, stepKey: s.stepKey })),
      },
    },
    include: { approvals: { orderBy: { step: "asc" } } },
  });
}

/**
 * Recomputes the sheet's denormalized totals. Call within the same
 * transaction as any item/resource mutation.
 */
async function recomputeSheetTotals(tx: any, sheetId: number, projectId: number) {
  const [itemAgg, resourceAgg] = await Promise.all([
    tx.costItem.aggregate({
      where: { projectId, deletedAt: null },
      _sum: { planCost: true, actualCost: true },
    }),
    tx.resourceAssignment.aggregate({
      where: { projectId, deletedAt: null },
      _sum: { budget: true },
    }),
  ]);
  await tx.costingSheet.update({
    where: { id: sheetId },
    data: {
      totalPlanCost: itemAgg._sum.planCost ?? 0,
      totalActualCost: itemAgg._sum.actualCost ?? 0,
      resourcesBudget: resourceAgg._sum.budget ?? 0,
    },
  });
}

/** Approved sheets are frozen; the UI hides edit affordances and the API enforces it. */
function assertNotLocked(sheet: { status: string }) {
  if (sheet.status === "approved") {
    throw new ForbiddenError("Costing sheet is approved — reopen it before editing");
  }
}

const sheetInclude = {
  approvals: { orderBy: { step: "asc" as const } },
};

// GET /api/projects/:projectId/costing-sheet — sheet + categories + items + resources
router.get(
  "/:projectId/costing-sheet",
  authenticate,
  requirePermission("project.costing.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      await resolveProject(projectId);
      const sheet = await getOrCreateSheet(projectId);

      const [categories, items, resources] = await Promise.all([
        prisma.costCategory.findMany({
          where: { projectId, deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        }),
        prisma.costItem.findMany({
          where: { projectId, deletedAt: null },
          orderBy: [{ categoryId: "asc" }, { id: "asc" }],
          include: {
            scopeItem: { select: { id: true, wbsNumber: true, title: true } },
            budgetItem: { select: { id: true, category: true, description: true } },
          },
        }),
        prisma.resourceAssignment.findMany({
          where: { projectId, deletedAt: null },
          orderBy: { id: "asc" },
          include: {
            scopeItem: { select: { id: true, wbsNumber: true, title: true } },
            teamAssignment: {
              select: { id: true, user: { select: { id: true, name: true } }, projectRole: { select: { name: true } } },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: { sheet, categories, items, resources },
        message: "Costing sheet retrieved",
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── Categories ──────────────────────────────────────────────────────────────

router.post(
  "/:projectId/costing-sheet/categories",
  authenticate,
  requirePermission("project.costing.manage"),
  validate(categorySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const project = await resolveProject(projectId);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const count = await prisma.costCategory.count({ where: { projectId, deletedAt: null } });
      const category = await prisma.costCategory.create({
        data: { projectId, name: req.body.name, sortOrder: count },
      });

      await logActivity({
        description: `Cost category "${category.name}" added to project "${project.name}"`,
        subjectType: "App\\Models\\CostCategory",
        subjectId: category.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: category },
      });

      res.status(201).json({ success: true, data: category, message: "Category created" });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:projectId/costing-sheet/categories/:categoryId",
  authenticate,
  requirePermission("project.costing.manage"),
  validate(categorySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const categoryId = parseInt(req.params.categoryId, 10);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const existing = await prisma.costCategory.findFirst({
        where: { id: categoryId, projectId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Cost category not found");

      const category = await prisma.costCategory.update({
        where: { id: categoryId },
        data: { name: req.body.name },
      });

      await logActivity({
        description: `Cost category "${category.name}" renamed on costing sheet`,
        subjectType: "App\\Models\\CostCategory",
        subjectId: category.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: category },
      });

      res.status(200).json({ success: true, data: category, message: "Category updated" });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:projectId/costing-sheet/categories/:categoryId",
  authenticate,
  requirePermission("project.costing.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const categoryId = parseInt(req.params.categoryId, 10);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const existing = await prisma.costCategory.findFirst({
        where: { id: categoryId, projectId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Cost category not found");

      // Soft-delete the category and its items so past approvals keep their numbers
      const now = new Date();
      await prisma.$transaction(async (tx: any) => {
        await tx.costItem.updateMany({
          where: { categoryId, deletedAt: null },
          data: { deletedAt: now },
        });
        await tx.costCategory.update({ where: { id: categoryId }, data: { deletedAt: now } });
        await recomputeScopeCosts(tx, projectId);
        await recomputeSheetTotals(tx, sheet.id, projectId);
      });

      await logActivity({
        description: `Cost category "${existing.name}" deleted from costing sheet`,
        subjectType: "App\\Models\\CostCategory",
        subjectId: categoryId,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "Category deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Items ───────────────────────────────────────────────────────────────────

/** Validates the FKs an item payload points at, in the caller's transaction. */
async function assertItemRefs(tx: any, projectId: number, body: any) {
  if (body.categoryId !== undefined && body.categoryId !== null) {
    const category = await tx.costCategory.findFirst({
      where: { id: body.categoryId, projectId, deletedAt: null },
    });
    if (!category) throw new NotFoundError("Cost category not found");
  }
  if (body.scopeItemId !== undefined && body.scopeItemId !== null) {
    const scopeItem = await tx.scopeItem.findFirst({
      where: { id: body.scopeItemId, projectId, deletedAt: null },
    });
    if (!scopeItem) throw new NotFoundError("Scope item not found");
  }
  if (body.budgetItemId !== undefined && body.budgetItemId !== null) {
    const budgetItem = await tx.budgetItem.findFirst({
      where: { id: body.budgetItemId, deletedAt: null },
    });
    if (!budgetItem) throw new NotFoundError("Budget item not found");
  }
}

router.post(
  "/:projectId/costing-sheet/items",
  authenticate,
  requirePermission("project.costing.manage"),
  validate(itemSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const project = await resolveProject(projectId);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const qty = new Prisma.Decimal(req.body.qty ?? 1);
      const unitCost = new Prisma.Decimal(req.body.unitCost ?? 0);
      const item = await prisma.$transaction(async (tx: any) => {
        await assertItemRefs(tx, projectId, req.body);
        const created = await tx.costItem.create({
          data: {
            projectId,
            categoryId: req.body.categoryId,
            scopeItemId: req.body.scopeItemId ?? null,
            budgetItemId: req.body.budgetItemId ?? null,
            description: req.body.description,
            qty,
            uom: req.body.uom ?? null,
            unitCost,
            planCost: qty.mul(unitCost),
            actualCost: new Prisma.Decimal(req.body.actualCost ?? 0),
            remarks: req.body.remarks ?? null,
          },
          include: {
            scopeItem: { select: { id: true, wbsNumber: true, title: true } },
            budgetItem: { select: { id: true, category: true, description: true } },
          },
        });
        await recomputeScopeCosts(tx, projectId);
        await recomputeSheetTotals(tx, sheet.id, projectId);
        return created;
      });

      await logActivity({
        description: `Cost item "${item.description}" added to project "${project.name}"`,
        subjectType: "App\\Models\\CostItem",
        subjectId: item.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: { id: item.id, description: item.description } },
      });

      res.status(201).json({ success: true, data: item, message: "Cost item created" });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:projectId/costing-sheet/items/:itemId",
  authenticate,
  requirePermission("project.costing.manage"),
  validate(itemUpdateSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const itemId = parseInt(req.params.itemId, 10);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const existing = await prisma.costItem.findFirst({
        where: { id: itemId, projectId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Cost item not found");

      const item = await prisma.$transaction(async (tx: any) => {
        await assertItemRefs(tx, projectId, req.body);
        const data: any = {};
        if (req.body.scopeItemId !== undefined) data.scopeItemId = req.body.scopeItemId ?? null;
        if (req.body.budgetItemId !== undefined) data.budgetItemId = req.body.budgetItemId ?? null;
        if (req.body.description !== undefined) data.description = req.body.description;
        if (req.body.uom !== undefined) data.uom = req.body.uom ?? null;
        if (req.body.actualCost !== undefined) data.actualCost = new Prisma.Decimal(req.body.actualCost);
        if (req.body.remarks !== undefined) data.remarks = req.body.remarks ?? null;
        if (req.body.qty !== undefined) data.qty = new Prisma.Decimal(req.body.qty);
        if (req.body.unitCost !== undefined) data.unitCost = new Prisma.Decimal(req.body.unitCost);
        if (req.body.qty !== undefined || req.body.unitCost !== undefined) {
          const qty = req.body.qty !== undefined ? new Prisma.Decimal(req.body.qty) : existing.qty;
          const unitCost =
            req.body.unitCost !== undefined ? new Prisma.Decimal(req.body.unitCost) : existing.unitCost;
          data.planCost = qty.mul(unitCost);
        }

        const updated = await tx.costItem.update({
          where: { id: itemId },
          data,
          include: {
            scopeItem: { select: { id: true, wbsNumber: true, title: true } },
            budgetItem: { select: { id: true, category: true, description: true } },
          },
        });
        await recomputeScopeCosts(tx, projectId);
        await recomputeSheetTotals(tx, sheet.id, projectId);
        return updated;
      });

      await logActivity({
        description: `Cost item "${item.description}" updated`,
        subjectType: "App\\Models\\CostItem",
        subjectId: item.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { id: item.id, ...req.body } },
      });

      res.status(200).json({ success: true, data: item, message: "Cost item updated" });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:projectId/costing-sheet/items/:itemId",
  authenticate,
  requirePermission("project.costing.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const itemId = parseInt(req.params.itemId, 10);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const existing = await prisma.costItem.findFirst({
        where: { id: itemId, projectId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Cost item not found");

      await prisma.$transaction(async (tx: any) => {
        await tx.costItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
        await recomputeScopeCosts(tx, projectId);
        await recomputeSheetTotals(tx, sheet.id, projectId);
      });

      await logActivity({
        description: `Cost item "${existing.description}" deleted from costing sheet`,
        subjectType: "App\\Models\\CostItem",
        subjectId: itemId,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "Cost item deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Resources ───────────────────────────────────────────────────────────────

router.post(
  "/:projectId/costing-sheet/resources",
  authenticate,
  requirePermission("project.costing.manage"),
  validate(resourceSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const resource = await prisma.$transaction(async (tx: any) => {
        if (req.body.scopeItemId) {
          const scopeItem = await tx.scopeItem.findFirst({
            where: { id: req.body.scopeItemId, projectId, deletedAt: null },
          });
          if (!scopeItem) throw new NotFoundError("Scope item not found");
        }
        if (req.body.teamAssignmentId) {
          const assignment = await tx.teamAssignment.findFirst({
            where: { id: req.body.teamAssignmentId, projectId },
          });
          if (!assignment) throw new NotFoundError("Team assignment not found");
        }

        const budget = new Prisma.Decimal(req.body.costPerDay)
          .mul(new Prisma.Decimal(req.body.weeksRequired))
          .mul(req.body.daysPerWeek ?? 5);

        const created = await tx.resourceAssignment.create({
          data: {
            projectId,
            scopeItemId: req.body.scopeItemId ?? null,
            teamAssignmentId: req.body.teamAssignmentId ?? null,
            name: req.body.name,
            positionCode: req.body.positionCode,
            costPerDay: new Prisma.Decimal(req.body.costPerDay),
            weeksRequired: new Prisma.Decimal(req.body.weeksRequired),
            daysPerWeek: req.body.daysPerWeek ?? 5,
            budget,
            remarks: req.body.remarks ?? null,
          },
        });
        await recomputeSheetTotals(tx, sheet.id, projectId);
        return created;
      });

      await logActivity({
        description: `Resource "${resource.name}" (${resource.positionCode}) added to costing sheet`,
        subjectType: "App\\Models\\ResourceAssignment",
        subjectId: resource.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: { id: resource.id, name: resource.name } },
      });

      res.status(201).json({ success: true, data: resource, message: "Resource added" });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:projectId/costing-sheet/resources/:resourceId",
  authenticate,
  requirePermission("project.costing.manage"),
  validate(resourceUpdateSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const resourceId = parseInt(req.params.resourceId, 10);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const existing = await prisma.resourceAssignment.findFirst({
        where: { id: resourceId, projectId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Resource not found");

      const resource = await prisma.$transaction(async (tx: any) => {
        const data: any = {};
        if (req.body.scopeItemId !== undefined) data.scopeItemId = req.body.scopeItemId ?? null;
        if (req.body.teamAssignmentId !== undefined) {
          data.teamAssignmentId = req.body.teamAssignmentId ?? null;
        }
        if (req.body.name !== undefined) data.name = req.body.name;
        if (req.body.positionCode !== undefined) data.positionCode = req.body.positionCode;
        if (req.body.costPerDay !== undefined) data.costPerDay = new Prisma.Decimal(req.body.costPerDay);
        if (req.body.weeksRequired !== undefined) {
          data.weeksRequired = new Prisma.Decimal(req.body.weeksRequired);
        }
        if (req.body.daysPerWeek !== undefined) data.daysPerWeek = req.body.daysPerWeek;
        if (req.body.remarks !== undefined) data.remarks = req.body.remarks ?? null;
        if (
          req.body.costPerDay !== undefined ||
          req.body.weeksRequired !== undefined ||
          req.body.daysPerWeek !== undefined
        ) {
          const costPerDay = req.body.costPerDay !== undefined ? new Prisma.Decimal(req.body.costPerDay) : existing.costPerDay;
          const weeksRequired =
            req.body.weeksRequired !== undefined ? new Prisma.Decimal(req.body.weeksRequired) : existing.weeksRequired;
          const daysPerWeek = req.body.daysPerWeek !== undefined ? req.body.daysPerWeek : existing.daysPerWeek;
          data.budget = costPerDay.mul(weeksRequired).mul(daysPerWeek);
        }

        const updated = await tx.resourceAssignment.update({ where: { id: resourceId }, data });
        await recomputeSheetTotals(tx, sheet.id, projectId);
        return updated;
      });

      await logActivity({
        description: `Resource "${resource.name}" updated on costing sheet`,
        subjectType: "App\\Models\\ResourceAssignment",
        subjectId: resource.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { id: resource.id, ...req.body } },
      });

      res.status(200).json({ success: true, data: resource, message: "Resource updated" });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:projectId/costing-sheet/resources/:resourceId",
  authenticate,
  requirePermission("project.costing.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const resourceId = parseInt(req.params.resourceId, 10);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);

      const existing = await prisma.resourceAssignment.findFirst({
        where: { id: resourceId, projectId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Resource not found");

      await prisma.$transaction(async (tx: any) => {
        await tx.resourceAssignment.update({
          where: { id: resourceId },
          data: { deletedAt: new Date(), isActive: false },
        });
        await recomputeSheetTotals(tx, sheet.id, projectId);
      });

      await logActivity({
        description: `Resource "${existing.name}" removed from costing sheet`,
        subjectType: "App\\Models\\ResourceAssignment",
        subjectId: resourceId,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "Resource removed" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Sign-off workflow ───────────────────────────────────────────────────────

// POST /api/projects/:projectId/costing-sheet/submit — PM initiates, picking two verifiers
router.post(
  "/:projectId/costing-sheet/submit",
  authenticate,
  requirePermission("project.costing.manage"),
  validate(submitSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId as string, 10);
      const project = await resolveProject(projectId);
      await assertProjectManager(projectId, req);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);
      if (sheet.status !== "draft" && sheet.status !== "rejected") {
        throw new ValidationError({
          status: ["Sheet has already been submitted — it is awaiting verification"],
        });
      }

      const { verifier1Id, verifier2Id, comments = null } = req.body;
      if (verifier1Id === verifier2Id) {
        throw new ValidationError({ verifier2Id: ["The two verifiers must be different people"] });
      }
      const verifiers = await prisma.user.findMany({
        where: { id: { in: [verifier1Id, verifier2Id] }, isActive: true },
        select: { id: true, name: true },
      });
      if (verifiers.length !== 2) {
        throw new ValidationError({ verifier1Id: ["Both verifiers must be active users"] });
      }
      const byId = new Map(verifiers.map((v) => [v.id, v]));
      const verifier1 = byId.get(verifier1Id)!;
      const verifier2 = byId.get(verifier2Id)!;

      const updated = await prisma.$transaction(async (tx: any) => {
        await tx.costingApproval.update({
          where: { id: sheet.approvals.find((a: any) => a.step === 1)!.id },
          data: {
            status: "approved",
            actorUserId: req.user!.id,
            actorName: req.user!.name,
            actedAt: new Date(),
            comments,
          },
        });
        await tx.costingApproval.update({
          where: { id: sheet.approvals.find((a: any) => a.step === 2)!.id },
          data: { assignedUserId: verifier1.id, assignedName: verifier1.name },
        });
        await tx.costingApproval.update({
          where: { id: sheet.approvals.find((a: any) => a.step === 3)!.id },
          data: { assignedUserId: verifier2.id, assignedName: verifier2.name },
        });
        // A resubmit after rejection clears any stale decisions downstream.
        await tx.costingApproval.updateMany({
          where: { sheetId: sheet.id, step: { gte: 2 }, status: { in: ["rejected", "approved"] } },
          data: { status: "pending", actorUserId: null, actorName: null, actedAt: null },
        });
        return tx.costingSheet.update({
          where: { id: sheet.id },
          data: { status: "submitted" },
          include: sheetInclude,
        });
      });

      await logActivity({
        description: `Costing sheet submitted for approval on project "${project.name}" (verifiers: ${verifier1.name}, ${verifier2.name})`,
        subjectType: "App\\Models\\CostingSheet",
        subjectId: sheet.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { status: "submitted", verifier1Id, verifier2Id } },
      });

      res.status(200).json({ success: true, data: updated, message: "Costing sheet submitted" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/costing-sheet/withdraw — PM pulls it back to draft,
// only while no verification has landed yet.
router.post(
  "/:projectId/costing-sheet/withdraw",
  authenticate,
  requirePermission("project.costing.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId as string, 10);
      const project = await resolveProject(projectId);
      await assertProjectManager(projectId, req);
      const sheet = await getOrCreateSheet(projectId);
      assertNotLocked(sheet);
      if (sheet.status !== "submitted") {
        throw new ValidationError({
          status: ["Only a submitted sheet awaiting verification can be withdrawn"],
        });
      }
      const verified = sheet.approvals.some(
        (a: any) => a.step >= 2 && (a.status === "approved" || a.status === "rejected")
      );
      if (verified) {
        throw new ValidationError({
          status: ["Verification has already started — the sheet can no longer be withdrawn"],
        });
      }

      const updated = await prisma.$transaction(async (tx: any) => {
        await tx.costingApproval.update({
          where: { id: sheet.approvals.find((a: any) => a.step === 1)!.id },
          data: { status: "pending", actorUserId: null, actorName: null, actedAt: null },
        });
        await tx.costingApproval.updateMany({
          where: { sheetId: sheet.id, step: { gte: 2 } },
          data: {
            status: "pending",
            assignedUserId: null,
            assignedName: null,
            actorUserId: null,
            actorName: null,
            actedAt: null,
            comments: null,
          },
        });
        return tx.costingSheet.update({
          where: { id: sheet.id },
          data: { status: "draft" },
          include: sheetInclude,
        });
      });

      await logActivity({
        description: `Costing sheet withdrawn back to draft on project "${project.name}"`,
        subjectType: "App\\Models\\CostingSheet",
        subjectId: sheet.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { status: "draft" } },
      });

      res.status(200).json({ success: true, data: updated, message: "Costing sheet withdrawn" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/costing-sheet/sign-off — verify/approve/reject.
// Verify steps are locked to the assigned verifier; approval to the permission holder.
router.post(
  "/:projectId/costing-sheet/sign-off",
  authenticate,
  validate(signOffSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId as string, 10);
      const project = await resolveProject(projectId);
      const { stepKey, decision, comments = null } = req.body as {
        stepKey: StepKey;
        decision: "approve" | "reject";
        comments?: string | null;
      };
      const sheet = await getOrCreateSheet(projectId);

      const stepDef = STEPS.find((s) => s.stepKey === stepKey)!;
      if (sheet.status !== REQUIRED_STATUS[stepKey]) {
        throw new ValidationError({
          status: [
            `Cannot ${decision} "${stepKey}" while the sheet is "${sheet.status}" (expected "${REQUIRED_STATUS[stepKey]}")`,
          ],
        });
      }

      const approval = sheet.approvals.find((a) => a.step === stepDef.step)!;
      const earlier = sheet.approvals.filter((a) => a.step < stepDef.step);
      if (earlier.some((a) => a.status !== "approved")) {
        throw new ValidationError({ status: ["Earlier sign-off steps are still pending"] });
      }

      // Who may act: verify steps are locked to the person the PM assigned;
      // the final approval to whoever holds the costing-approve permission.
      const requiredPermission = STEP_PERMISSION[stepKey];
      if (requiredPermission) {
        const access = req.access;
        const holds =
          access?.isSuperAdmin ||
          access?.permissions?.[requiredPermission] != null ||
          req.user!.roles?.some((r: any) => r.name === "super-admin");
        if (!holds) {
          throw new ForbiddenError("You do not hold the approval permission");
        }
      } else if (approval.assignedUserId !== req.user!.id) {
        throw new ForbiddenError("This step is assigned to another verifier");
      }

      // Nobody signs two steps of the same sheet — separation of duties.
      if (
        decision === "approve" &&
        earlier.some((a) => a.actorUserId === req.user!.id)
      ) {
        throw new ForbiddenError("You already signed an earlier step of this sheet");
      }

      const updated = await prisma.$transaction(async (tx: any) => {
        await tx.costingApproval.update({
          where: { id: approval.id },
          data: {
            status: decision === "approve" ? "approved" : "rejected",
            actorUserId: req.user!.id,
            actorName: req.user!.name,
            actedAt: new Date(),
            comments,
          },
        });
        const nextStatus =
          decision === "approve" ? NEXT_STATUS[stepKey] : "rejected";
        return tx.costingSheet.update({
          where: { id: sheet.id },
          data: { status: nextStatus },
          include: sheetInclude,
        });
      });

      await logActivity({
        description: `Costing sheet ${decision === "approve" ? stepKey : "rejected at " + stepKey} on project "${project.name}"`,
        subjectType: "App\\Models\\CostingSheet",
        subjectId: sheet.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { stepKey, decision } },
      });

      res.status(200).json({ success: true, data: updated, message: `Sign-off recorded` });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/costing-sheet/reopen — CEO-gated, post-approval
router.post(
  "/:projectId/costing-sheet/reopen",
  authenticate,
  requirePermission("project.costing.approve.ceo"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const project = await resolveProject(projectId);
      const sheet = await getOrCreateSheet(projectId);
      if (sheet.status !== "approved") {
        throw new ValidationError({ status: ["Only an approved sheet can be reopened"] });
      }

      const updated = await prisma.$transaction(async (tx: any) => {
        await tx.costingApproval.updateMany({
          where: { sheetId: sheet.id, step: { gt: 1 } },
          data: {
            status: "pending",
            assignedUserId: null,
            assignedName: null,
            actorUserId: null,
            actorName: null,
            actedAt: null,
            comments: null,
          },
        });
        return tx.costingSheet.update({
          where: { id: sheet.id },
          data: { status: "draft" },
          include: sheetInclude,
        });
      });

      await logActivity({
        description: `Costing sheet reopened for editing on project "${project.name}"`,
        subjectType: "App\\Models\\CostingSheet",
        subjectId: sheet.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { status: "draft" } },
      });

      res.status(200).json({ success: true, data: updated, message: "Costing sheet reopened" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
