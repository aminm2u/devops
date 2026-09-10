import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission, requireRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

// ── Validation Schemas ──────────────────────────────────────────────────────

const createBudgetItemSchema = z.object({
  projectId: z.number().int().positive().optional().nullable(),
  division: z.string().max(255).optional(),
  category: z.string().min(1).max(255),
  description: z.string().min(1).max(500),
  details: z.string().optional().nullable(),
  requestor: z.string().min(1).max(255),
  allocatedBudget: z.number().positive(),
  poNumber: z.string().optional().nullable(),
  currency: z.string().max(10).optional(),
  status: z.string().max(50).optional(),
  fiscalYear: z.string().max(10).optional().nullable(),
  metadata: z.any().optional().nullable(),
});

const updateBudgetItemSchema = createBudgetItemSchema.partial();

const createExpenditureSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  vendor: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  poNumber: z.string().optional().nullable(),
  expenditureDate: z.string().optional().nullable(),
});

// ── GET /api/budget/summary - Aggregated budget totals ──────────────────────

// ── GET /api/budget/summary - Aggregated budget totals ──────────────────────
// All authenticated users can view

router.get(
  "/summary",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { division, fiscalYear } = req.query;

      const where: any = { isActive: true, deletedAt: null };
      if (division) where.division = division as string;
      if (fiscalYear) where.fiscalYear = fiscalYear as string;

      const items = await prisma.budgetItem.findMany({
        where,
        select: {
          category: true,
          allocatedBudget: true,
          utilizedBudget: true,
        },
      });

      const totalAllocated = items.reduce(
        (sum, item) => sum + Number(item.allocatedBudget),
        0
      );
      const totalUtilized = items.reduce(
        (sum, item) => sum + Number(item.utilizedBudget),
        0
      );
      const totalBalance = totalAllocated - totalUtilized;
      const utilizationPercent =
        totalAllocated > 0
          ? Math.round((totalUtilized / totalAllocated) * 10000) / 100
          : 0;

      // Group by category
      const categoryMap: Record<
        string,
        { allocated: number; utilized: number; balance: number }
      > = {};
      for (const item of items) {
        if (!categoryMap[item.category]) {
          categoryMap[item.category] = { allocated: 0, utilized: 0, balance: 0 };
        }
        categoryMap[item.category].allocated += Number(item.allocatedBudget);
        categoryMap[item.category].utilized += Number(item.utilizedBudget);
      }
      for (const cat of Object.values(categoryMap)) {
        cat.balance = cat.allocated - cat.utilized;
      }

      const categories = Object.entries(categoryMap).map(([name, data]) => ({
        name,
        ...data,
        utilizationPercent:
          data.allocated > 0
            ? Math.round((data.utilized / data.allocated) * 10000) / 100
            : 0,
      }));

      // Division breakdown
      const allItems = await prisma.budgetItem.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          division: true,
          allocatedBudget: true,
          utilizedBudget: true,
        },
      });

      const divisionMap: Record<
        string,
        { allocated: number; utilized: number; balance: number }
      > = {};
      for (const item of allItems) {
        if (!divisionMap[item.division]) {
          divisionMap[item.division] = { allocated: 0, utilized: 0, balance: 0 };
        }
        divisionMap[item.division].allocated += Number(item.allocatedBudget);
        divisionMap[item.division].utilized += Number(item.utilizedBudget);
      }
      for (const div of Object.values(divisionMap)) {
        div.balance = div.allocated - div.utilized;
      }

      const divisions = Object.entries(divisionMap).map(([name, data]) => ({
        name,
        ...data,
      }));

      res.status(200).json({
        success: true,
        data: {
          totalAllocated,
          totalUtilized,
          totalBalance,
          utilizationPercent,
          categories,
          divisions,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── GET /api/budget - List budget items ──────────────────────────────────────
// All authenticated users can view

router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const {
        search,
        category,
        division,
        status,
        fiscalYear,
        page = "1",
        limit = "50",
      } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { isActive: true, deletedAt: null };

      if (search) {
        where.OR = [
          { description: { contains: search as string, mode: "insensitive" } },
          { details: { contains: search as string, mode: "insensitive" } },
          { requestor: { contains: search as string, mode: "insensitive" } },
          { poNumber: { contains: search as string, mode: "insensitive" } },
        ];
      }
      if (category) where.category = category as string;
      if (division) where.division = division as string;
      if (status) where.status = status as string;
      if (fiscalYear) where.fiscalYear = fiscalYear as string;

      const [items, total] = await Promise.all([
        prisma.budgetItem.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.budgetItem.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: items,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── POST /api/budget - Create budget item ────────────────────────────────────
// Only Super-Admin and DevOps Admin can create

router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createBudgetItemSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const item = await prisma.budgetItem.create({
        data: {
          projectId: req.body.projectId || null,
          division: req.body.division || "Information Technology",
          category: req.body.category,
          description: req.body.description,
          details: req.body.details || null,
          requestor: req.body.requestor,
          allocatedBudget: req.body.allocatedBudget,
          poNumber: req.body.poNumber || null,
          currency: req.body.currency || "MYR",
          status: req.body.status || "active",
          fiscalYear: req.body.fiscalYear || null,
          metadata: req.body.metadata || null,
        },
      });

      await logActivity({
        description: `Budget item "${item.description}" created`,
        subjectType: "App\\Models\\BudgetItem",
        subjectId: item.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: item },
      });

      res.status(201).json({ success: true, data: item, message: "Budget item created" });
    } catch (error) {
      next(error);
    }
  }
);

// ── PUT /api/budget/:id - Update budget item ────────────────────────────────
// Only Super-Admin and DevOps Admin can edit

router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateBudgetItemSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.budgetItem.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Budget item not found");

      const item = await prisma.budgetItem.update({
        where: { id: existing.id },
        data: {
          ...(req.body.projectId !== undefined && { projectId: req.body.projectId }),
          ...(req.body.division && { division: req.body.division }),
          ...(req.body.category && { category: req.body.category }),
          ...(req.body.description && { description: req.body.description }),
          ...(req.body.details !== undefined && { details: req.body.details }),
          ...(req.body.requestor && { requestor: req.body.requestor }),
          ...(req.body.allocatedBudget !== undefined && {
            allocatedBudget: req.body.allocatedBudget,
          }),
          ...(req.body.poNumber !== undefined && { poNumber: req.body.poNumber }),
          ...(req.body.currency && { currency: req.body.currency }),
          ...(req.body.status && { status: req.body.status }),
          ...(req.body.fiscalYear !== undefined && { fiscalYear: req.body.fiscalYear }),
          ...(req.body.metadata !== undefined && { metadata: req.body.metadata }),
        },
      });

      await logActivity({
        description: `Budget item "${item.description}" updated`,
        subjectType: "App\\Models\\BudgetItem",
        subjectId: item.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: item },
      });

      res.status(200).json({ success: true, data: item, message: "Budget item updated" });
    } catch (error) {
      next(error);
    }
  }
);

// ── DELETE /api/budget/:id - Soft delete budget item ─────────────────────────
// Only Super-Admin and DevOps Admin can delete

router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.budgetItem.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Budget item not found");

      await prisma.budgetItem.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await logActivity({
        description: `Budget item "${existing.description}" deleted`,
        subjectType: "App\\Models\\BudgetItem",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "Budget item deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// ── POST /api/budget/:id/expenditures - Add expenditure ──────────────────────
// Only Super-Admin and DevOps Admin can add expenditures

router.post(
  "/:id/expenditures",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createExpenditureSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const budgetItem = await prisma.budgetItem.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!budgetItem) throw new NotFoundError("Budget item not found");

      const expenditure = await prisma.budgetExpenditure.create({
        data: {
          budgetItemId: budgetItem.id,
          amount: req.body.amount,
          description: req.body.description,
          vendor: req.body.vendor || null,
          invoiceNumber: req.body.invoiceNumber || null,
          poNumber: req.body.poNumber || null,
          expenditureDate: req.body.expenditureDate
            ? new Date(req.body.expenditureDate)
            : null,
        },
      });

      // Update utilized budget on parent
      const newUtilized = Number(budgetItem.utilizedBudget) + req.body.amount;
      await prisma.budgetItem.update({
        where: { id: budgetItem.id },
        data: { utilizedBudget: newUtilized },
      });

      await logActivity({
        description: `Expenditure of ${req.body.currency || budgetItem.currency} ${req.body.amount} added to "${budgetItem.description}"`,
        subjectType: "App\\Models\\BudgetExpenditure",
        subjectId: expenditure.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: expenditure },
      });

      res
        .status(201)
        .json({ success: true, data: expenditure, message: "Expenditure added" });
    } catch (error) {
      next(error);
    }
  }
);

// ── GET /api/budget/:id/expenditures - List expenditures ─────────────────────
// All authenticated users can view

router.get(
  "/:id/expenditures",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const budgetItem = await prisma.budgetItem.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!budgetItem) throw new NotFoundError("Budget item not found");

      const expenditures = await prisma.budgetExpenditure.findMany({
        where: { budgetItemId: budgetItem.id, isActive: true, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({ success: true, data: expenditures });
    } catch (error) {
      next(error);
    }
  }
);

// ── DELETE /api/budget/:id/expenditures/:expId - Delete expenditure ───────────
// Only Super-Admin and DevOps Admin can delete expenditures

router.delete(
  "/:id/expenditures/:expId",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id, expId } = req.params;
      const budgetItem = await prisma.budgetItem.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!budgetItem) throw new NotFoundError("Budget item not found");

      const expenditure = await prisma.budgetExpenditure.findFirst({
        where: { id: parseInt(expId, 10), budgetItemId: budgetItem.id, deletedAt: null },
      });
      if (!expenditure) throw new NotFoundError("Expenditure not found");

      // Soft delete the expenditure
      await prisma.budgetExpenditure.update({
        where: { id: expenditure.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      // Update utilized budget on parent
      const newUtilized = Math.max(0, Number(budgetItem.utilizedBudget) - Number(expenditure.amount));
      await prisma.budgetItem.update({
        where: { id: budgetItem.id },
        data: { utilizedBudget: newUtilized },
      });

      await logActivity({
        description: `Expenditure "${expenditure.description}" deleted from "${budgetItem.description}"`,
        subjectType: "App\\Models\\BudgetExpenditure",
        subjectId: expenditure.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: expenditure },
      });

      res.status(200).json({ success: true, message: "Expenditure deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
