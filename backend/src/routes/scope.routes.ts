import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

/**
 * Scope of work — the WBS tree everything else hangs off: costing lines attach
 * to scope items, the timeline renders from their dates, kanban tasks
 * reference them.
 *
 * WBS numbers ("1", "1.2", "1.2.3") are NEVER accepted from the client. Every
 * create/delete/reorder renumbers the whole project tree server-side in one
 * transaction so the numbers always match the current shape. Max depth is 3.
 */

const MAX_DEPTH = 3;

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .nullable()
  .optional();

const createScopeSchema = z.object({
  parentId: z.number().int().positive().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  startDate: dateSchema,
  endDate: dateSchema,
  // Free-text role codes like ["PM", "APM", "GIS-L"]
  roleCodes: z.array(z.string().min(1).max(30)).max(20).nullable().optional(),
  assigneeUserId: z.number().int().positive().nullable().optional(),
  status: z.enum(["planned", "in_progress", "completed"]).optional(),
  // Insert after this sibling (omitted/null = append last among siblings)
  afterSiblingId: z.number().int().positive().nullable().optional(),
});

const updateScopeSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  startDate: dateSchema,
  endDate: dateSchema,
  roleCodes: z.array(z.string().min(1).max(30)).max(20).nullable().optional(),
  assigneeUserId: z.number().int().positive().nullable().optional(),
  status: z.enum(["planned", "in_progress", "completed"]).optional(),
  // Manual plan budget, editable inline on the costing sheet's tracking table.
  // The stored planCost stays derived: max(manual, linked cost items + children).
  planCost: z.number().min(0).max(999_999_999_999).optional(),
});

const reorderSchema = z.object({
  moves: z
    .array(
      z.object({
        id: z.number().int().positive(),
        parentId: z.number().int().positive().nullable(),
        sortOrder: z.number().int().min(0),
      })
    )
    .min(1)
    .max(500),
});

const scopeSelect = {
  id: true,
  projectId: true,
  parentId: true,
  wbsNumber: true,
  sortOrder: true,
  title: true,
  description: true,
  status: true,
  startDate: true,
  endDate: true,
  roleCodes: true,
  assigneeUserId: true,
  progress: true,
  planCost: true,
  manualPlanCost: true,
  actualCost: true,
  assignee: { select: { id: true, name: true } },
} as const;

async function resolveProject(projectId: number) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new NotFoundError("Project not found");
  return project;
}

async function resolveItem(projectId: number, itemId: number) {
  const item = await prisma.scopeItem.findFirst({
    where: { id: itemId, projectId, deletedAt: null },
  });
  if (!item) throw new NotFoundError("Scope item not found");
  return item;
}

/**
 * Renumbers every non-deleted item of the project: siblings ordered by
 * sortOrder get consecutive numbers under their parent's prefix — "1", "1.1",
 * "1.2", "2", "2.1"... Runs inside the caller's transaction.
 *
 * Two-phase because (project_id, wbs_number) is unique: renaming "1" to "2"
 * while the old "2" still exists would trip the constraint mid-walk. Phase 1
 * moves every row to a per-row-unique temp value; phase 2 assigns finals.
 */
async function renumberTree(tx: any, projectId: number) {
  const items = await tx.scopeItem.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, parentId: true },
  });

  const childrenOf = new Map<number | null, { id: number }[]>();
  for (const item of items) {
    const key = item.parentId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(item);
  }

  // Phase 1: park every row on a value guaranteed unique within the project
  for (const item of items) {
    await tx.scopeItem.update({
      where: { id: item.id },
      data: { wbsNumber: `tmp-${item.id}` },
    });
  }

  // Phase 2: assign the final numbers — no collisions, the old ones are gone
  const walk = async (parentId: number | null, prefix: string) => {
    const siblings = childrenOf.get(parentId) ?? [];
    for (let i = 0; i < siblings.length; i += 1) {
      const wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      await tx.scopeItem.update({ where: { id: siblings[i].id }, data: { wbsNumber: wbs } });
      await walk(siblings[i].id, wbs);
    }
  };
  await walk(null, "");
}

/**
 * Recomputes cost for every item of the project, post-order:
 *   planCost   = max(manualPlanCost, direct cost items + children rollup)
 *   actualCost = approved requisitions raised for the item + direct cost
 *                items' actuals + children rollup
 * Runs in the caller's transaction.
 */
export async function recomputeScopeCosts(tx: any, projectId: number) {
  const items = await tx.scopeItem.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, parentId: true, manualPlanCost: true },
  });

  const totals = new Map<number, {
    parentId: number | null;
    manualPlan: number;
    directPlan: number;
    directActual: number;
    // effective = max(manual, direct + children), computed in the fold
    effPlan: number;
    effActual: number;
  }>();
  for (const item of items) {
    totals.set(item.id, {
      parentId: item.parentId,
      manualPlan: Number(item.manualPlanCost),
      directPlan: 0,
      directActual: 0,
      effPlan: 0,
      effActual: 0,
    });
  }

  const costItems = await tx.costItem.findMany({
    where: { projectId, deletedAt: null, scopeItemId: { not: null } },
    select: { scopeItemId: true, planCost: true, actualCost: true },
  });
  for (const ci of costItems) {
    const target = totals.get(ci.scopeItemId);
    if (target) {
      target.directPlan += Number(ci.planCost);
      target.directActual += Number(ci.actualCost);
    }
  }

  // Procurement raised for this scope item counts as spend once approved —
  // drafts and rejected forms are intent, not money.
  const reqRows = await tx.requisitionForm.groupBy({
    by: ['scopeItemId'],
    where: { projectId, deletedAt: null, scopeItemId: { not: null }, status: "approved" },
    _sum: { totalEstimatedCost: true },
  });
  for (const row of reqRows) {
    const target = totals.get(row.scopeItemId);
    if (target) target.directActual += Number(row._sum.totalEstimatedCost ?? 0);
  }

  const childrenOf = new Map<number, number[]>();
  for (const [id, t] of totals) {
    if (t.parentId) {
      if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, []);
      childrenOf.get(t.parentId)!.push(id);
    }
  }
  // Post-order fold. Each node's effective plan is max(its manual budget, its
  // direct lines + its children's effective plans) — so a child's typed-in
  // budget propagates to every ancestor. Actual is a plain sum.
  const fold = (id: number): { plan: number; actual: number } => {
    const own = totals.get(id)!;
    let plan = Math.max(own.manualPlan, own.directPlan);
    let actual = own.directActual;
    for (const child of childrenOf.get(id) ?? []) {
      const childTotal = fold(child);
      plan += childTotal.plan;
      actual += childTotal.actual;
    }
    own.effPlan = plan;
    own.effActual = actual;
    return { plan, actual };
  };
  for (const [id, t] of totals) {
    if (!t.parentId) fold(id);
  }

  for (const [id, t] of totals) {
    await tx.scopeItem.update({
      where: { id },
      data: { planCost: t.effPlan, actualCost: t.effActual },
    });
  }
}

// GET /api/projects/:projectId/scope — flat list ordered for tree rendering
router.get(
  "/:projectId/scope",
  authenticate,
  requirePermission("project.scope.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      await resolveProject(projectId);

      const items = await prisma.scopeItem.findMany({
        where: { projectId, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: scopeSelect,
      });

      res.status(200).json({ success: true, data: items, message: "Scope retrieved" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/scope — create item (append or after a sibling)
router.post(
  "/:projectId/scope",
  authenticate,
  requirePermission("project.scope.manage"),
  validate(createScopeSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const project = await resolveProject(projectId);
      const {
        parentId = null,
        title,
        description = null,
        startDate = null,
        endDate = null,
        roleCodes = null,
        assigneeUserId = null,
        status = "planned",
        afterSiblingId = null,
      } = req.body;

      const created = await prisma.$transaction(async (tx: any) => {
        let sortOrder: number;

        if (parentId) {
          const parent = await tx.scopeItem.findFirst({
            where: { id: parentId, projectId, deletedAt: null },
          });
          if (!parent) throw new NotFoundError("Parent scope item not found");

          // Depth check: parent's own depth + 1 must stay ≤ MAX_DEPTH.
          let parentDepth = 1;
          let cursor = parent.parentId;
          while (cursor) {
            parentDepth += 1;
            const row = await tx.scopeItem.findFirst({
              where: { id: cursor },
              select: { parentId: true },
            });
            if (!row) break;
            cursor = row.parentId;
          }
          if (parentDepth + 1 > MAX_DEPTH) {
            throw new ValidationError({ parentId: [`Max depth is ${MAX_DEPTH} levels`] });
          }

          const siblings = await tx.scopeItem.findMany({
            where: { projectId, parentId, deletedAt: null },
            select: { id: true },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          });
          const idx = afterSiblingId ? siblings.findIndex((s: any) => s.id === afterSiblingId) : -1;
          sortOrder = idx >= 0 ? idx + 1 : siblings.length;
          // Open a slot for the newcomer
          await tx.scopeItem.updateMany({
            where: { projectId, parentId, deletedAt: null, sortOrder: { gte: sortOrder } },
            data: { sortOrder: { increment: 1 } },
          });
        } else {
          sortOrder = await tx.scopeItem.count({
            where: { projectId, parentId: null, deletedAt: null },
          });
        }

        const item = await tx.scopeItem.create({
          data: {
            projectId,
            parentId,
            sortOrder,
            title,
            description,
            startDate: startDate ? new Date(startDate) : null,
            endDate: endDate ? new Date(endDate) : null,
            roleCodes: roleCodes ?? undefined,
            assigneeUserId,
            status,
            wbsNumber: "0", // renumberTree assigns the real number below
          },
        });

        await renumberTree(tx, projectId);
        return item;
      });

      await logActivity({
        description: `Scope item "${title}" added to project "${project.name}"`,
        subjectType: "App\\Models\\ScopeItem",
        subjectId: created.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: { id: created.id, title, parentId } },
      });

      res.status(201).json({ success: true, data: created, message: "Scope item created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/projects/:projectId/scope/reorder — move/reparent, renumber tree
// (Declared before /:itemId so "reorder" is never captured as an id.)
router.put(
  "/:projectId/scope/reorder",
  authenticate,
  requirePermission("project.scope.manage"),
  validate(reorderSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const project = await resolveProject(projectId);
      const moves: { id: number; parentId: number | null; sortOrder: number }[] = req.body.moves;

      const items = await prisma.scopeItem.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true },
      });
      const validIds = new Set(items.map((i) => i.id));
      for (const move of moves) {
        if (!validIds.has(move.id)) throw new NotFoundError(`Scope item ${move.id} not found`);
      }

      await prisma.$transaction(async (tx: any) => {
        for (const move of moves) {
          await tx.scopeItem.update({
            where: { id: move.id },
            data: { parentId: move.parentId, sortOrder: move.sortOrder },
          });
        }
        await assertDepthWithinLimit(tx, projectId);
        await renumberTree(tx, projectId);
      });

      await logActivity({
        description: `Scope tree reordered on project "${project.name}"`,
        subjectType: "App\\Models\\ScopeItem",
        subjectId: projectId,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { moves } },
      });

      res.status(200).json({ success: true, message: "Scope reordered" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/projects/:projectId/scope/:itemId — update fields (not position)
router.put(
  "/:projectId/scope/:itemId",
  authenticate,
  requirePermission("project.scope.manage"),
  validate(updateScopeSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const itemId = parseInt(req.params.itemId, 10);
      const project = await resolveProject(projectId);
      const item = await resolveItem(projectId, itemId);

      const data: any = {};
      if (req.body.title !== undefined) data.title = req.body.title;
      if (req.body.description !== undefined) data.description = req.body.description;
      if (req.body.startDate !== undefined) {
        data.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
      }
      if (req.body.endDate !== undefined) {
        data.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
      }
      if (req.body.roleCodes !== undefined) data.roleCodes = req.body.roleCodes ?? undefined;
      // "Key present" is the only way to distinguish "clear it" from "not sent"
      if (Object.prototype.hasOwnProperty.call(req.body, "assigneeUserId")) {
        data.assigneeUserId = req.body.assigneeUserId ?? null;
      }
      if (req.body.status !== undefined) data.status = req.body.status;
      if (req.body.planCost !== undefined) data.manualPlanCost = req.body.planCost;

      const updated = await prisma.$transaction(async (tx: any) => {
        const row = await tx.scopeItem.update({ where: { id: item.id }, data });
        await recomputeScopeCosts(tx, projectId);
        return row;
      });

      await logActivity({
        description: `Scope item "${updated.title}" updated on project "${project.name}"`,
        subjectType: "App\\Models\\ScopeItem",
        subjectId: updated.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { id: updated.id, ...req.body } },
      });

      res.status(200).json({ success: true, data: updated, message: "Scope item updated" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Recomputes progress for every item from the tasks that deliver it.
 *
 * Progress is not typed into the form — it is contributed by the kanban tasks
 * linked to each item (ProjectTask.scopeItemId), innermost first, folded up to
 * the outermost. A leaf averages its tasks (simple mean — tasks carry no
 * weights); parents average their children.
 */
export async function recomputeScopeProgress(tx: any, projectId: number) {
  const items = await tx.scopeItem.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, parentId: true },
  });

  const childrenOf = new Map<number, number[]>();
  const hasChildren = new Set<number>(items.filter((i: any) => i.parentId).map((i: any) => i.parentId));
  for (const item of items) {
    if (item.parentId) {
      if (!childrenOf.has(item.parentId)) childrenOf.set(item.parentId, []);
      childrenOf.get(item.parentId)!.push(item.id);
    }
  }

  const taskAgg = await tx.projectTask.groupBy({
    by: ['scopeItemId'],
    where: { projectId, scopeItemId: { not: null } },
    _count: { _all: true },
  });
  const doneAgg = await tx.projectTask.groupBy({
    by: ['scopeItemId'],
    where: {
      projectId,
      scopeItemId: { not: null },
      column: { name: DONE_COLUMN_PATTERN },
    },
    _count: { _all: true },
  });
  const doneByItem = new Map(doneAgg.map((row: any) => [row.scopeItemId, row._count._all]));

  const progressOf = new Map<number, number | null>();
  for (const row of taskAgg) {
    const total = Number(row._count._all);
    const done = Number(doneByItem.get(row.scopeItemId) ?? 0);
    progressOf.set(row.scopeItemId, total > 0 ? Math.round((done / total) * 100) : null);
  }

  // Items with neither tasks nor children have no progress — leave them null.
  const compute = (id: number): number | null => {
    if (progressOf.has(id)) return progressOf.get(id)!;
    const own = taskAgg.find((row: any) => row.scopeItemId === id);
    const kids = childrenOf.get(id) ?? [];
    if (own) {
      const total = Number(own._count._all);
      const done = Number(doneByItem.get(id) ?? 0);
      const value = total > 0 ? Math.round((done / total) * 100) : null;
      progressOf.set(id, value);
      return value;
    }
    if (kids.length > 0) {
      const values = kids.map(compute).filter((v): v is number => v !== null);
      const value =
        values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
      progressOf.set(id, value);
      return value;
    }
    progressOf.set(id, null);
    return null;
  };
  for (const item of items) compute(item.id);

  for (const [id, progress] of progressOf) {
    await tx.scopeItem.update({ where: { id }, data: { progress } });
  }
}

const DONE_COLUMN_PATTERN = /^(done|complete|completed|closed|shipped|released)$/i;

/** Depth check across the whole tree after a batch reparent. */
async function assertDepthWithinLimit(tx: any, projectId: number) {
  const items = await tx.scopeItem.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, parentId: true },
  });
  const parentOf = new Map<number, number | null>(items.map((i: any) => [i.id, i.parentId]));
  for (const item of items) {
    let depth = 1;
    let cursor: number | null = item.parentId;
    while (cursor) {
      depth += 1;
      if (depth > MAX_DEPTH) {
        throw new ValidationError({ parentId: [`Max depth is ${MAX_DEPTH} levels`] });
      }
      cursor = parentOf.get(cursor) ?? null;
    }
  }
}

// DELETE /api/projects/:projectId/scope/:itemId — soft-delete a subtree
router.delete(
  "/:projectId/scope/:itemId",
  authenticate,
  requirePermission("project.scope.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const itemId = parseInt(req.params.itemId, 10);
      const project = await resolveProject(projectId);
      const item = await resolveItem(projectId, itemId);

      // Collect the subtree
      const all = await prisma.scopeItem.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      const childIdsOf = new Map<number, number[]>();
      for (const row of all) {
        if (row.parentId) {
          if (!childIdsOf.has(row.parentId)) childIdsOf.set(row.parentId, []);
          childIdsOf.get(row.parentId)!.push(row.id);
        }
      }
      const subtree: number[] = [item.id];
      const queue = [item.id];
      while (queue.length) {
        const current = queue.shift()!;
        for (const child of childIdsOf.get(current) ?? []) {
          subtree.push(child);
          queue.push(child);
        }
      }

      // Block the delete when cost lines hang off the subtree — SetNull would
      // silently de-scope recorded cost. The client offers explicit unlink.
      const [linkedCosts, linkedResources] = await Promise.all([
        prisma.costItem.count({
          where: { projectId, deletedAt: null, scopeItemId: { in: subtree } },
        }),
        prisma.resourceAssignment.count({
          where: { projectId, deletedAt: null, scopeItemId: { in: subtree } },
        }),
      ]);
      if (linkedCosts > 0 || linkedResources > 0) {
        throw new ValidationError({
          scopeItemId: [
            `${linkedCosts} cost item(s) and ${linkedResources} resource line(s) are linked to this scope or its children — unlink or delete them first`,
          ],
        });
      }

      const now = new Date();
      await prisma.$transaction(async (tx: any) => {
        await tx.scopeItem.updateMany({
          where: { id: { in: subtree }, projectId },
          data: { deletedAt: now },
        });
        // Close the sibling gap and renumber what remains
        await tx.scopeItem.updateMany({
          where: {
            projectId,
            parentId: item.parentId,
            deletedAt: null,
            sortOrder: { gt: item.sortOrder },
          },
          data: { sortOrder: { decrement: 1 } },
        });
        await renumberTree(tx, projectId);
      });

      await logActivity({
        description: `Scope item "${item.title}" deleted from project "${project.name}" (${subtree.length} item(s))`,
        subjectType: "App\\Models\\ScopeItem",
        subjectId: item.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: { id: item.id, subtree } },
      });

      res.status(200).json({ success: true, message: "Scope item deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
