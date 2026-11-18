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

      // Logged hours roll up from the time entries of each item's linked
      // tasks (whatever their approval state — a draft entry is still work
      // someone did). Parents fold up their subtree below.
      const [hourRows, taskCounts, doneCounts] = await Promise.all([
        prisma.projectTask.findMany({
          where: { projectId, scopeItemId: { not: null } },
          select: {
            id: true,
            scopeItemId: true,
            column: { select: { name: true } },
            timeEntries: { where: { deletedAt: null }, select: { hours: true } },
          },
        }),
        prisma.projectTask.groupBy({
          by: ["scopeItemId"],
          where: { projectId, scopeItemId: { not: null } },
          _count: { _all: true },
        }),
        prisma.projectTask.groupBy({
          by: ["scopeItemId"],
          where: { projectId, scopeItemId: { not: null }, column: { name: DONE_COLUMN_PATTERN as any } },
          _count: { _all: true },
        }),
      ]);

      const hoursByItem = new Map<number, number>();
      for (const task of hourRows) {
        if (!task.scopeItemId) continue;
        const sum = task.timeEntries.reduce((acc, e) => acc + Number(e.hours), 0);
        hoursByItem.set(task.scopeItemId, (hoursByItem.get(task.scopeItemId) ?? 0) + sum);
      }
      const countByItem = new Map(taskCounts.map((r: any) => [r.scopeItemId, Number(r._count?._all ?? 0)]));
      const doneByItem = new Map(doneCounts.map((r: any) => [r.scopeItemId, Number(r._count?._all ?? 0)]));

      // Subtree rollup for parents (post-order over the fetched rows).
      const childrenOf = new Map<number, number[]>();
      for (const item of items) {
        if (item.parentId) {
          if (!childrenOf.has(item.parentId)) childrenOf.set(item.parentId, []);
          childrenOf.get(item.parentId)!.push(item.id);
        }
      }
      const roll = (id: number): { hours: number; tasks: number; done: number } => {
        const own = {
          hours: hoursByItem.get(id) ?? 0,
          tasks: countByItem.get(id) ?? 0,
          done: doneByItem.get(id) ?? 0,
        };
        for (const child of childrenOf.get(id) ?? []) {
          const sub = roll(child);
          own.hours += sub.hours;
          own.tasks += sub.tasks;
          own.done += sub.done;
        }
        return own;
      };
      const rollupById = new Map(items.map((item) => [item.id, roll(item.id)]));

      const withRollups = items.map((item) => ({
        ...item,
        loggedHours: rollupById.get(item.id)!.hours,
        taskCount: rollupById.get(item.id)!.tasks,
        doneTaskCount: rollupById.get(item.id)!.done,
      }));

      res.status(200).json({ success: true, data: withRollups, message: "Scope retrieved" });
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
 * Recomputes progress AND status for every item from the tasks that deliver
 * it.
 *
 * Progress is not typed into the form — it is contributed by the kanban tasks
 * linked to each item (ProjectTask.scopeItemId), innermost first, folded up to
 * the outermost. A leaf averages its tasks (simple mean — tasks carry no
 * weights); parents average their children.
 *
 * Status follows the same spine, only when tasks exist:
 *   leaf, ≥1 linked task  → all done ⇒ completed; some done ⇒ in_progress;
 *                           none done ⇒ in_progress if it was, else planned.
 *   leaf, no tasks        → status untouched (manual edits are the only truth
 *                            for task-less items — they are never overwritten)
 *   parent                → derived from children when any descendant has tasks
 */
export async function recomputeScopeProgress(tx: any, projectId: number) {
  const items = await tx.scopeItem.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, parentId: true, status: true },
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
  const doneByItem = new Map<number, number>(
    doneAgg.map((row: any) => [row.scopeItemId as number, Number(row._count._all)])
  );
  const taskCountByItem = new Map<number, number>(
    taskAgg.map((row: any) => [row.scopeItemId as number, Number(row._count._all)])
  );

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

  // ── Status derivation ────────────────────────────────────────────────────
  // A linked item's status is owned by its tasks: work started ⇒ in_progress,
  // every task done ⇒ completed. A task-less item keeps whatever a human set —
  // recompute never touches what it has nothing to say about.
  const statusById = new Map<number, string>();
  for (const item of items) {
    const leafTaskCount = taskCountByItem.get(item.id) ?? 0;
    if (leafTaskCount > 0) {
      const done = Number(doneByItem.get(item.id) ?? 0);
      if (done >= leafTaskCount) statusById.set(item.id, "completed");
      else if (done > 0) statusById.set(item.id, "in_progress");
      // Nothing done yet: keep a manually-started item moving, otherwise it
      // is still planned — a stale manual "completed" gets reopened here,
      // which is the point of deriving once tasks exist.
      else if (item.status === "in_progress") statusById.set(item.id, "in_progress");
      else statusById.set(item.id, "planned");
    }
    // task-less leaf: no entry — untouched below.
  }

  // Parents fold up from children (post-order), but only when something in
  // their subtree actually has tasks — otherwise the manual status stands.
  // A node with its own linked tasks keeps the status those tasks derived
  // (same precedence as the progress fold above).
  const deriveParent = (id: number): string | null => {
    if (statusById.has(id)) return statusById.get(id)!;
    const kids = childrenOf.get(id) ?? [];
    const childStatuses = kids
      .map((child) => deriveParent(child) ?? statusById.get(child) ?? null)
      .filter((s): s is string => s !== null);
    if (childStatuses.length === 0) return null;
    const allDone = childStatuses.every((s) => s === "completed");
    const anyActive = childStatuses.some((s) => s === "in_progress" || s === "completed");
    const derived = allDone ? "completed" : anyActive ? "in_progress" : "planned";
    statusById.set(id, derived);
    return derived;
  };
  for (const item of items) {
    if (!item.parentId) deriveParent(item.id);
  }

  for (const [id, status] of statusById) {
    const current = items.find((i: any) => i.id === id)?.status;
    if (status !== current) {
      await tx.scopeItem.update({ where: { id }, data: { status } });
    }
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
        // SetNull just unlinked the subtree's tasks — refresh the surviving
        // ancestors' progress and derived status.
        await recomputeScopeProgress(tx, projectId);
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

// ── Scope baselines ─────────────────────────────────────────────────────────
//
// Immutable snapshots of the tree for EOT / VO / change-request history.
// Append-only: create and read exist, update and delete do not.

const createBaselineSchema = z.object({
  name: z.string().min(1).max(255),
  reason: z.string().max(2000).nullable().optional(),
});

/** Fields captured per item in a baseline snapshot (keyed by wbsNumber). */
const SNAPSHOT_FIELDS = {
  wbsNumber: true,
  title: true,
  description: true,
  status: true,
  startDate: true,
  endDate: true,
  roleCodes: true,
  progress: true,
  planCost: true,
  manualPlanCost: true,
} as const;

// GET /api/projects/:projectId/scope/baselines — history, newest first
router.get(
  "/:projectId/scope/baselines",
  authenticate,
  requirePermission("project.scope.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      await resolveProject(projectId);

      const baselines = await prisma.scopeBaseline.findMany({
        where: { projectId },
        orderBy: { revision: "desc" },
        select: {
          id: true,
          revision: true,
          name: true,
          reason: true,
          status: true,
          totalPlanCost: true,
          createdById: true,
          createdByName: true,
          createdAt: true,
          // `items` excluded — it is the heavy column; detail fetch pulls it.
        },
      });

      res.status(200).json({ success: true, data: baselines, message: "Baselines retrieved" });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:projectId/scope/baselines/:baselineId — full snapshot
router.get(
  "/:projectId/scope/baselines/:baselineId",
  authenticate,
  requirePermission("project.scope.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const baselineId = parseInt(req.params.baselineId, 10);
      await resolveProject(projectId);

      const baseline = await prisma.scopeBaseline.findFirst({
        where: { id: baselineId, projectId },
      });
      if (!baseline) throw new NotFoundError("Baseline not found");

      res.status(200).json({ success: true, data: baseline, message: "Baseline retrieved" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/scope/baselines — freeze the current tree
router.post(
  "/:projectId/scope/baselines",
  authenticate,
  requirePermission("project.scope.manage"),
  validate(createBaselineSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const project = await resolveProject(projectId);
      const { name, reason = null } = req.body;

      const baseline = await prisma.$transaction(async (tx: any) => {
        const items = await tx.scopeItem.findMany({
          where: { projectId, deletedAt: null },
          select: SNAPSHOT_FIELDS,
        });

        // Root-level sum: parents already contain their children's cost.
        const totalPlanCost = items
          .filter((item: any) => !item.wbsNumber.includes("."))
          .reduce((sum: number, item: any) => sum + Number(item.planCost), 0);

        const last = await tx.scopeBaseline.findFirst({
          where: { projectId },
          orderBy: { revision: "desc" },
          select: { revision: true },
        });
        const revision = (last?.revision ?? -1) + 1;

        await tx.scopeBaseline.updateMany({
          where: { projectId, status: "active" },
          data: { status: "superseded" },
        });

        return tx.scopeBaseline.create({
          data: {
            projectId,
            revision,
            name,
            reason,
            totalPlanCost,
            items,
            createdById: req.user!.id,
            createdByName: req.user!.name,
          },
        });
      });

      await logActivity({
        description: `Scope baseline Rev ${baseline.revision} "${name}" created on project "${project.name}"`,
        subjectType: "App\\Models\\ScopeBaseline",
        subjectId: baseline.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: { revision: baseline.revision, name, reason } },
      });

      res.status(201).json({ success: true, data: baseline, message: "Baseline created" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
