import { Router, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../lib/errors.js";
import prisma from "../config/database.js";
import { getIO } from "../lib/socket.js";
import { logTaskActivity } from "../lib/task-activity.js";
import {
  resolveTimesheetApprover,
  advanceChain,
  type ChainSnapshotEntry,
} from "../services/timesheetApproval.js";
import { openRequest, settleSubject } from "../services/approvalRequest.service.js";
import { createNotification } from "../services/notification.service.js";
import { can } from "../rbac/effective.js";

const router = Router();

// ---------- helpers ----------

const MODEL_USER = "App\\Models\\User";

/**
 * Capability helpers.
 *
 * These replace the old `isAdmin()`, which hard-coded two role names and so
 * could not express the difference between *reading* everyone's entries,
 * *writing* someone else's entries, and *approving* them. Each capability is
 * now a separate permission from the catalog, granted to whatever role the
 * super admin decides.
 */

/** May read any user's time entries. */
function canReadAll(req: RequestWithUser): boolean {
  return !!req.access && can(req.access, "timesheet.entry.read.all");
}

/** May create, edit or delete entries on behalf of others. */
function canManageOthers(req: RequestWithUser): boolean {
  return !!req.access && can(req.access, "timesheet.entry.manage.other");
}

/**
 * May approve entries they are not the named approver for.
 * Requires the approval capability at `all` scope — a team lead whose grant is
 * `team`-scoped must not be able to sign off on another team's week.
 */
function canApproveAny(req: RequestWithUser): boolean {
  return !!req.access && can(req.access, "timesheet.entry.approve", "all");
}

/**
 * Supervisor access used by the approve/reject endpoints: the named approver
 * always wins; otherwise an org-wide approver may step in.
 */
function isApprover(req: RequestWithUser, entry: { approverId: number | null }): boolean {
  return entry.approverId === req.user!.id || canApproveAny(req);
}

function snapHours(h: number): number {
  return Math.round(h * 4) / 4;
}

/** Parse 'YYYY-MM-DD' as a plain calendar date (UTC midnight, no TZ drift). */
function parseWorkDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().substring(0, 10);
}

function serializeEntry(entry: any) {
  return {
    ...entry,
    hours: entry.hours != null ? Number(entry.hours) : 0,
    workDate: fmtDate(entry.workDate),
    submittedAt: entry.submittedAt?.toISOString?.() ?? entry.submittedAt,
    decidedAt: entry.decidedAt?.toISOString?.() ?? entry.decidedAt,
    startTime: entry.startTime?.toISOString?.() ?? entry.startTime ?? null,
    endTime: entry.endTime?.toISOString?.() ?? entry.endTime ?? null,
  };
}

const entryInclude = {
  user: { select: { id: true, name: true, email: true } },
  approver: { select: { id: true, name: true, email: true } },
  task: { select: { id: true, title: true, projectId: true } },
  subtask: { select: { id: true, title: true, status: true } },
  project: { select: { id: true, name: true } },
} as const;

const ruleInclude = {
  appliesTo: { include: { user: { select: { id: true, name: true, email: true } } } },
  approvers: {
    orderBy: { step: "asc" as const },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  projectRole: true,
};

async function assertCategoryExists(value: string): Promise<void> {
  const cat = await prisma.referenceData.findFirst({
    where: { group: "timesheet_category", value, isActive: true },
  });
  if (!cat) {
    throw new ValidationError({ categoryValue: ["Unknown or inactive timesheet category"] });
  }
}

/**
 * Server-side enrollment check.
 *
 * `GET /enrollable` only shapes the picker — a caller can still POST any task
 * id it likes. Logging time against a project is what feeds that project's
 * contribution numbers, so the write path has to verify membership itself.
 * Elevated users (logging on behalf of somebody else) are checked against the
 * *target* user's membership, not the actor's.
 */
async function assertEnrolled(userId: number, projectId: number, elevated: boolean) {
  const assignment = await prisma.teamAssignment.findFirst({
    where: { userId, projectId, isActive: true, project: { deletedAt: null } },
    select: { id: true },
  });
  if (!assignment && !elevated) {
    throw new ForbiddenError("You are not enrolled on this project");
  }
}

// ---------- validation ----------

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * The two categories that point at real project work. A task link implies one
 * of them (the task knows its project); a bare `projectId` is accepted only
 * alongside one of them. Whatever an admin renames these to, the values here
 * are the seeded reference rows the drawer cascades on.
 */
const PROJECT_CATEGORIES = ["project", "programme"];

/** Category for a task-linked entry — honours an explicit programme choice. */
const taskCategory = (v?: string | null) =>
  v && PROJECT_CATEGORIES.includes(v) ? v : "project";

const createTimeEntrySchema = z.object({
  workDate: dateStr,
  hours: z.number().min(0.25).max(24),
  description: z.string().min(1).max(5000),
  taskId: z.number().int().positive().optional().nullable(),
  subtaskId: z.number().int().positive().optional().nullable(),
  categoryValue: z.string().min(1).max(50).optional(),
  // Bare project link for ad-hoc project/programme entries (no task).
  projectId: z.number().int().positive().optional().nullable(),
  userId: z.number().int().positive().optional(), // admin-only: log on behalf
});

const updateTimeEntrySchema = createTimeEntrySchema.partial();

const rejectSchema = z.object({ reason: z.string().min(1).max(2000) });

const rangeSchema = z.object({ from: dateStr, to: dateStr });

const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  // Comma-joined categories, e.g. "project,management" (null = any).
  categoryValue: z.string().max(200).optional().nullable(),
  // Preferred: list of category values; stored comma-joined in categoryValue.
  categoryValues: z.array(z.string().min(1).max(50)).max(20).optional(),
  projectId: z.number().int().positive().optional().nullable(),
  approverType: z.enum(["project_role", "users", "direct_manager", "app_role"]),
  projectRoleId: z.number().int().positive().optional().nullable(),
  appRole: z.string().max(50).optional().nullable(),
  // Submitters the rule applies to (empty = everyone).
  appliesToUserIds: z.array(z.number().int().positive()).optional(),
  // Ordered approver chain for the `users` type: index+1 is the approval step.
  userIds: z.array(z.number().int().positive()).optional(),
});

const updateRuleSchema = createRuleSchema.partial();

/**
 * A user may be governed by at most one active rule's appliesTo list. A rule
 * with an empty appliesTo is a wildcard and claims *every* user, so it is only
 * legal while no other active rule scopes anyone. Checked app-side — Prisma
 * cannot express "unique within active rules" as a constraint.
 */
/**
 * Two rules only conflict when they could match the *same* entry: their
 * category sets must overlap (either side wildcard = overlap) and their
 * project scope must overlap (null = any project). A "project"-only rule and
 * a "management+others" rule are disjoint — users may sit in both.
 */
function categorySetsOverlap(a: string | null, b: string | null): boolean {
  const parse = (s: string | null) =>
    (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const setA = parse(a);
  const setB = parse(b);
  if (setA.length === 0 || setB.length === 0) return true; // either side = any
  return setA.some((c) => setB.includes(c));
}

function projectScopeOverlaps(a: number | null, b: number | null): boolean {
  return a == null || b == null || a === b;
}

async function assertNoAppliesToConflict(
  appliesToUserIds: number[],
  excludeRuleId?: number,
  scope?: { categoryValue: string | null; projectId: number | null }
): Promise<void> {
  const otherActiveRules = await prisma.timesheetApprovalRule.findMany({
    where: {
      isActive: true,
      ...(excludeRuleId ? { id: { not: excludeRuleId } } : {}),
    },
    include: { appliesTo: { select: { userId: true } } },
  });

  for (const other of otherActiveRules) {
    // Disjoint match scopes can never shadow each other.
    if (
      scope &&
      (!categorySetsOverlap(scope.categoryValue, other.categoryValue) ||
        !projectScopeOverlaps(scope.projectId ?? null, other.projectId))
    ) {
      continue;
    }
    // Two wildcard rules would make the second unreachable.
    if (other.appliesTo.length === 0 && appliesToUserIds.length === 0) {
      throw new ValidationError({
        appliesToUserIds: [`Rule "${other.name}" already applies to everyone`],
      });
    }
    if (other.appliesTo.length === 0) {
      throw new ValidationError({
        appliesToUserIds: [
          `Rule "${other.name}" applies to everyone — it would shadow this rule`,
        ],
      });
    }
    const overlap = other.appliesTo.filter((a) => appliesToUserIds.includes(a.userId));
    if (overlap.length > 0) {
      const conflicting = overlap[0].userId;
      throw new ValidationError({
        appliesToUserIds: [`User #${conflicting} is already covered by rule "${other.name}"`],
      });
    }
  }
}

// ---------- entries ----------

// GET /api/timesheet/entries?from&to&userId?&status?&all?
router.get(
  "/entries",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const status = req.query.status as string | undefined;
      const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
      const all = req.query.all === "true";

      const where: any = { deletedAt: null };
      if (from && to) {
        where.workDate = { gte: parseWorkDate(from), lte: parseWorkDate(to) };
      }
      if (status) where.status = status;

      if (all && canReadAll(req)) {
        if (userId) where.userId = userId;
      } else {
        where.userId = userId && canReadAll(req) ? userId : req.user!.id;
      }

      const entries = await prisma.timeEntry.findMany({
        where,
        include: entryInclude,
        orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
      });

      res.status(200).json({ success: true, data: entries.map(serializeEntry) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/timesheet/entries
router.post(
  "/entries",
  authenticate,
  validate(createTimeEntrySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const hours = snapHours(body.hours);

      // Elevated users may log on behalf of another user; everyone else logs
      // their own time.
      let targetUserId = req.user!.id;
      if (body.userId && body.userId !== req.user!.id) {
        if (!canManageOthers(req)) {
          throw new ForbiddenError("You cannot log time for other users");
        }
        targetUserId = body.userId;
      }

      let taskId: number | null = null;
      let subtaskId: number | null = null;
      let projectId: number | null = null;
      let categoryValue: string;

      if (body.subtaskId) {
        const subtask = await prisma.taskSubtask.findUnique({
          where: { id: body.subtaskId },
          include: { task: { select: { id: true, projectId: true } } },
        });
        if (!subtask) throw new NotFoundError("Subtask not found");
        if (body.taskId && body.taskId !== subtask.taskId) {
          throw new ValidationError({ subtaskId: ["Subtask does not belong to the given task"] });
        }
        // A subtask claimed by a colleague is not yours to bill hours to.
        if (subtask.assigneeId !== null && subtask.assigneeId !== targetUserId) {
          throw new ForbiddenError("That subtask is assigned to someone else");
        }
        if (body.projectId && body.projectId !== subtask.task.projectId) {
          throw new ValidationError({ projectId: ["Project does not match the subtask's project"] });
        }
        taskId = subtask.taskId;
        subtaskId = subtask.id;
        projectId = subtask.task.projectId;
        categoryValue = taskCategory(body.categoryValue); // project or programme
      } else if (body.taskId) {
        const task = await prisma.projectTask.findUnique({
          where: { id: body.taskId },
          select: { id: true, projectId: true },
        });
        if (!task) throw new NotFoundError("Task not found");
        if (body.projectId && body.projectId !== task.projectId) {
          throw new ValidationError({ projectId: ["Project does not match the task's project"] });
        }
        taskId = task.id;
        projectId = task.projectId;
        categoryValue = taskCategory(body.categoryValue); // project or programme
      } else if (body.projectId) {
        // Project/programme work without a specific task: the drawer's second
        // dropdown hands us the project directly.
        const project = await prisma.project.findUnique({
          where: { id: body.projectId },
          select: { id: true, deletedAt: true },
        });
        if (!project || project.deletedAt) throw new NotFoundError("Project not found");
        projectId = project.id;
        if (!body.categoryValue || !PROJECT_CATEGORIES.includes(body.categoryValue)) {
          throw new ValidationError({
            categoryValue: ["Category must be project or programme for a project-linked entry"],
          });
        }
        await assertCategoryExists(body.categoryValue);
        categoryValue = body.categoryValue;
      } else {
        if (!body.categoryValue) {
          throw new ValidationError({ categoryValue: ["Category is required for ad-hoc entries"] });
        }
        if (PROJECT_CATEGORIES.includes(body.categoryValue)) {
          throw new ValidationError({
            categoryValue: ["Choose which project or programme this entry is for"],
          });
        }
        await assertCategoryExists(body.categoryValue);
        categoryValue = body.categoryValue;
      }

      if (projectId) {
        await assertEnrolled(targetUserId, projectId, canManageOthers(req));
      }

      const entry = await prisma.timeEntry.create({
        data: {
          userId: targetUserId,
          workDate: parseWorkDate(body.workDate),
          hours,
          description: body.description.trim(),
          taskId,
          subtaskId,
          projectId,
          categoryValue,
          status: "draft",
        },
        include: entryInclude,
      });

      if (taskId) {
        await logTaskActivity({
          taskId,
          userId: req.user!.id,
          action: "work_logged",
          details: {
            hours,
            description: body.description.trim().substring(0, 100),
            subtaskId,
            entryId: entry.id,
          },
        });
      }

      try { getIO().emit("timesheet-entry-updated", { entry: serializeEntry(entry) }); } catch (e) {}

      res.status(201).json({ success: true, data: serializeEntry(entry) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/timesheet/entries/submit-week  (register before :id routes)
router.post(
  "/entries/submit-week",
  authenticate,
  validate(rangeSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { from, to } = req.body;
      const drafts = await prisma.timeEntry.findMany({
        where: {
          userId: req.user!.id,
          deletedAt: null,
          status: { in: ["draft", "rejected"] },
          workDate: { gte: parseWorkDate(from), lte: parseWorkDate(to) },
        },
      });

      const submitted = [];
      for (const draft of drafts) {
        const updated = await submitEntry(draft, req.user!.id);
        submitted.push(serializeEntry(updated));
      }

      res.status(200).json({ success: true, data: submitted });
    } catch (error) {
      next(error);
    }
  }
);

async function submitEntry(entry: any, actorId: number) {
  const { approverId, approvalRuleId, approvalStep, approvalChain } =
    await resolveTimesheetApprover({
      userId: entry.userId,
      categoryValue: entry.categoryValue,
      projectId: entry.projectId ?? null,
    });

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      decidedAt: null,
      rejectReason: null,
      approverId,
      approvalRuleId,
      approvalStep,
      // DbNull (not `undefined`) so a resubmission that now resolves to a
      // single approver clears the previous submission's chain snapshot.
      approvalChain: approvalChain ? (approvalChain as any) : Prisma.DbNull,
    },
    include: entryInclude,
  });

  if (approverId) {
    // Mirror the assignment into the unified ledger so the entry also appears
    // in `/approvals`. `openRequest` is idempotent per (subject, approver), so
    // a resubmission after rejection updates the existing row rather than
    // stacking a second one.
    await openRequest({
      module: "timesheet",
      subjectType: "TimeEntry",
      subjectId: updated.id,
      title: `${updated.user.name} — ${Number(updated.hours)}h on ${fmtDate(updated.workDate)}`,
      requesterId: updated.userId,
      approverId,
      link: "/my-work/approvals",
      metadata: { workDate: updated.workDate, hours: Number(updated.hours) },
    });

    await createNotification(
      approverId,
      "timesheet",
      "Timesheet awaiting approval",
      `${updated.user.name} logged ${Number(updated.hours)}h on ${fmtDate(updated.workDate)}.`,
      "/my-work/approvals"
    );
  }

  try { getIO().emit("timesheet-entry-updated", { entry: serializeEntry(updated) }); } catch (e) {}
  return updated;
}

// POST /api/timesheet/entries/:id/submit
router.post(
  "/entries/:id/submit",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const entry = await prisma.timeEntry.findUnique({ where: { id } });
      if (!entry || entry.deletedAt) throw new NotFoundError("Time entry not found");
      if (entry.userId !== req.user!.id) throw new ForbiddenError("You can only submit your own entries");
      if (!["draft", "rejected"].includes(entry.status)) {
        throw new ValidationError({ status: ["Only draft or rejected entries can be submitted"] });
      }

      const updated = await submitEntry(entry, req.user!.id);
      res.status(200).json({ success: true, data: serializeEntry(updated) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/timesheet/entries/:id/recall
router.post(
  "/entries/:id/recall",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const entry = await prisma.timeEntry.findUnique({ where: { id } });
      if (!entry || entry.deletedAt) throw new NotFoundError("Time entry not found");
      if (entry.userId !== req.user!.id) throw new ForbiddenError("You can only recall your own entries");
      if (entry.status !== "submitted") {
        throw new ValidationError({ status: ["Only submitted entries can be recalled"] });
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data: {
          status: "draft",
          submittedAt: null,
          approverId: null,
          approvalRuleId: null,
          approvalStep: null,
          approvalChain: Prisma.DbNull,
        },
        include: entryInclude,
      });

      // The approver's queue must lose the item the moment it is recalled.
      await settleSubject({ subjectType: "TimeEntry", subjectId: id, status: "cancelled" });

      try { getIO().emit("timesheet-entry-updated", { entry: serializeEntry(updated) }); } catch (e) {}
      res.status(200).json({ success: true, data: serializeEntry(updated) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/timesheet/entries/:id/approve
router.post(
  "/entries/:id/approve",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const entry = await prisma.timeEntry.findUnique({
        where: { id },
        include: entryInclude,
      });
      if (!entry || entry.deletedAt) throw new NotFoundError("Time entry not found");
      if (entry.status !== "submitted") {
        throw new ValidationError({ status: ["Only submitted entries can be approved"] });
      }
      if (!isApprover(req, entry)) {
        throw new ForbiddenError("You are not the approver for this entry");
      }

      // Multi-level flow: the entry's chain snapshot decides whether this
      // approval finishes the entry or hands it to the next approver.
      const chain = Array.isArray(entry.approvalChain)
        ? (entry.approvalChain as unknown as ChainSnapshotEntry[])
        : null;
      const hasChain = !!chain && chain.length > 0;

      let updated;
      if (hasChain) {
        const advanced = advanceChain(chain!, entry.approvalStep ?? 1, req.user!.id);
        const finished = advanced.approverId === null;

        updated = await prisma.timeEntry.update({
          where: { id },
          data: {
            approverId: advanced.approverId,
            approvalStep: advanced.approvalStep,
            approvalChain: advanced.approvalChain as any,
            // Stay `submitted` until the last step signs off.
            ...(finished && { status: "approved", decidedAt: new Date() }),
          },
          include: entryInclude,
        });

        if (finished) {
          await settleSubject({ subjectType: "TimeEntry", subjectId: id, status: "approved" });
          await createNotification(
            entry.userId,
            "timesheet",
            "Timesheet approved",
            `Your ${Number(entry.hours)}h entry on ${fmtDate(entry.workDate)} was approved.`,
            "/my-work/timesheet"
          );
        } else {
          // Hand the baton to the next approver in the chain.
          const nextApprover = updated.approver!;
          await openRequest({
            module: "timesheet",
            subjectType: "TimeEntry",
            subjectId: updated.id,
            title: `${updated.user.name} — ${Number(updated.hours)}h on ${fmtDate(updated.workDate)}`,
            requesterId: updated.userId,
            approverId: nextApprover.id,
            link: "/my-work/approvals",
            metadata: {
              workDate: updated.workDate,
              hours: Number(updated.hours),
              step: advanced.approvalStep,
            },
          });
          await createNotification(
            nextApprover.id,
            "timesheet",
            "Timesheet awaiting approval",
            `${updated.user.name} logged ${Number(updated.hours)}h on ${fmtDate(updated.workDate)} (step ${advanced.approvalStep}).`,
            "/my-work/approvals"
          );
        }
      } else {
        updated = await prisma.timeEntry.update({
          where: { id },
          data: { status: "approved", decidedAt: new Date() },
          include: entryInclude,
        });

        // Close the inbox row too, or the entry sits in /approvals forever and
        // can be "approved" a second time from there.
        await settleSubject({ subjectType: "TimeEntry", subjectId: id, status: "approved" });

        await createNotification(
          entry.userId,
          "timesheet",
          "Timesheet approved",
          `Your ${Number(entry.hours)}h entry on ${fmtDate(entry.workDate)} was approved.`,
          "/my-work/timesheet"
        );
      }

      try { getIO().emit("timesheet-entry-updated", { entry: serializeEntry(updated) }); } catch (e) {}
      res.status(200).json({ success: true, data: serializeEntry(updated) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/timesheet/entries/:id/reject
router.post(
  "/entries/:id/reject",
  authenticate,
  validate(rejectSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const entry = await prisma.timeEntry.findUnique({
        where: { id },
        include: entryInclude,
      });
      if (!entry || entry.deletedAt) throw new NotFoundError("Time entry not found");
      if (entry.status !== "submitted") {
        throw new ValidationError({ status: ["Only submitted entries can be rejected"] });
      }
      if (!isApprover(req, entry)) {
        throw new ForbiddenError("You are not the approver for this entry");
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data: {
          status: "rejected",
          decidedAt: new Date(),
          rejectReason: req.body.reason.trim(),
        },
        include: entryInclude,
      });

      await settleSubject({
        subjectType: "TimeEntry",
        subjectId: id,
        status: "rejected",
        comment: req.body.reason.trim(),
      });

      await createNotification(
        entry.userId,
        "timesheet",
        "Timesheet rejected",
        `Your ${Number(entry.hours)}h entry on ${fmtDate(entry.workDate)} was rejected: ${req.body.reason.trim()}`,
        "/my-work/timesheet"
      );

      try { getIO().emit("timesheet-entry-updated", { entry: serializeEntry(updated) }); } catch (e) {}
      res.status(200).json({ success: true, data: serializeEntry(updated) });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/timesheet/entries/:id
router.put(
  "/entries/:id",
  authenticate,
  validate(updateTimeEntrySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const entry = await prisma.timeEntry.findUnique({ where: { id } });
      if (!entry || entry.deletedAt) throw new NotFoundError("Time entry not found");

      const elevated = canManageOthers(req);
      if (entry.userId !== req.user!.id && !elevated) {
        throw new ForbiddenError("You can only edit your own entries");
      }
      if (!["draft", "rejected"].includes(entry.status) && !elevated) {
        throw new ValidationError({ status: ["Only draft or rejected entries can be edited"] });
      }
      if (entry.status === "approved") {
        throw new ValidationError({ status: ["Approved entries cannot be edited"] });
      }

      const body = req.body;
      const data: any = {};

      if (body.hours !== undefined) data.hours = snapHours(body.hours);
      if (body.description !== undefined) data.description = body.description.trim();
      if (body.workDate !== undefined) data.workDate = parseWorkDate(body.workDate);

      // Task/subtask/category derivation mirrors create
      if (
        body.subtaskId !== undefined ||
        body.taskId !== undefined ||
        body.projectId !== undefined
      ) {
        if (body.subtaskId) {
          const subtask = await prisma.taskSubtask.findUnique({
            where: { id: body.subtaskId },
            include: { task: { select: { id: true, projectId: true } } },
          });
          if (!subtask) throw new NotFoundError("Subtask not found");
          if (subtask.assigneeId !== null && subtask.assigneeId !== entry.userId) {
            throw new ForbiddenError("That subtask is assigned to someone else");
          }
          data.taskId = subtask.taskId;
          data.subtaskId = subtask.id;
          data.projectId = subtask.task.projectId;
          data.categoryValue = taskCategory(body.categoryValue ?? entry.categoryValue);
        } else if (body.taskId) {
          const task = await prisma.projectTask.findUnique({
            where: { id: body.taskId },
            select: { id: true, projectId: true },
          });
          if (!task) throw new NotFoundError("Task not found");
          data.taskId = task.id;
          data.subtaskId = null;
          data.projectId = task.projectId;
          data.categoryValue = taskCategory(body.categoryValue ?? entry.categoryValue);
        } else if (body.projectId) {
          // Project/programme work without a specific task.
          const project = await prisma.project.findUnique({
            where: { id: body.projectId },
            select: { id: true, deletedAt: true },
          });
          if (!project || project.deletedAt) throw new NotFoundError("Project not found");
          data.taskId = null;
          data.subtaskId = null;
          data.projectId = project.id;
          const category = body.categoryValue ?? entry.categoryValue;
          if (!category || !PROJECT_CATEGORIES.includes(category)) {
            throw new ValidationError({
              categoryValue: ["Category must be project or programme for a project-linked entry"],
            });
          }
          await assertCategoryExists(category);
          data.categoryValue = category;
        } else {
          data.taskId = null;
          data.subtaskId = null;
          data.projectId = null;
          if (!body.categoryValue) {
            throw new ValidationError({ categoryValue: ["Category is required for ad-hoc entries"] });
          }
          if (PROJECT_CATEGORIES.includes(body.categoryValue)) {
            throw new ValidationError({
              categoryValue: ["Choose which project or programme this entry is for"],
            });
          }
          await assertCategoryExists(body.categoryValue);
          data.categoryValue = body.categoryValue;
        }

        // Re-linking an entry to a project is the one edit that can smuggle work
        // into a project the person was never on, so it is checked here too.
        if (data.projectId) {
          await assertEnrolled(entry.userId, data.projectId, elevated);
        }
      } else if (body.categoryValue !== undefined && !entry.taskId && !entry.subtaskId) {
        await assertCategoryExists(body.categoryValue);
        data.categoryValue = body.categoryValue;
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data,
        include: entryInclude,
      });

      try { getIO().emit("timesheet-entry-updated", { entry: serializeEntry(updated) }); } catch (e) {}
      res.status(200).json({ success: true, data: serializeEntry(updated) });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/timesheet/entries/:id
router.delete(
  "/entries/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const entry = await prisma.timeEntry.findUnique({ where: { id } });
      if (!entry || entry.deletedAt) throw new NotFoundError("Time entry not found");

      const elevated = canManageOthers(req);
      if (entry.userId !== req.user!.id && !elevated) {
        throw new ForbiddenError("You can only delete your own entries");
      }
      if (entry.status === "approved" && !elevated) {
        throw new ValidationError({ status: ["Approved entries cannot be deleted"] });
      }

      await prisma.timeEntry.update({ where: { id }, data: { deletedAt: new Date() } });

      try { getIO().emit("timesheet-entry-updated", { entry: { id, deleted: true } }); } catch (e) {}
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// ---------- approvals queue ----------

// GET /api/timesheet/approvals?status=pending|decided&all=true
router.get(
  "/approvals",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const status = (req.query.status as string) || "pending";
      // "all" is an audit view across every approver's queue.
      const all = req.query.all === "true" && canReadAll(req);

      const where: any = { deletedAt: null };
      if (all) {
        where.status = status === "decided" ? { in: ["approved", "rejected"] } : "submitted";
      } else {
        where.approverId = req.user!.id;
        where.status = status === "decided" ? { in: ["approved", "rejected"] } : "submitted";
      }

      const entries = await prisma.timeEntry.findMany({
        where,
        include: entryInclude,
        orderBy: [{ submittedAt: "asc" }, { workDate: "asc" }],
      });

      res.status(200).json({ success: true, data: entries.map(serializeEntry) });
    } catch (error) {
      next(error);
    }
  }
);

// ---------- summary / calendar / my-tasks ----------

// GET /api/timesheet/summary?from&to&userId?
router.get(
  "/summary",
  authenticate,
  validate(rangeSchema, "query"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { from, to } = req.query as any;
      const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : req.user!.id;
      if (userId !== req.user!.id && !canReadAll(req)) {
        throw new ForbiddenError("You can only view your own summary");
      }

      const entries = await prisma.timeEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          workDate: { gte: parseWorkDate(from), lte: parseWorkDate(to) },
        },
      });

      const byDay: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      let total = 0;

      for (const e of entries) {
        const day = fmtDate(e.workDate)!;
        const h = Number(e.hours);
        total += h;
        byDay[day] = (byDay[day] || 0) + h;
        byCategory[e.categoryValue] = (byCategory[e.categoryValue] || 0) + h;
        byStatus[e.status] = (byStatus[e.status] || 0) + h;
      }

      res.status(200).json({
        success: true,
        data: { total, byDay, byCategory, byStatus, count: entries.length },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/timesheet/calendar?from&to
router.get(
  "/calendar",
  authenticate,
  validate(rangeSchema, "query"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { from, to } = req.query as any;
      const userId = req.user!.id;
      const gte = parseWorkDate(from);
      const lte = parseWorkDate(to);
      const today = parseWorkDate(fmtDate(new Date())!);

      // Tasks where the user is an assignee and dueDate is in range
      const tasks = await prisma.projectTask.findMany({
        where: { dueDate: { gte, lte } },
        include: {
          column: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          subtasks: { select: { id: true, title: true, status: true, dueDate: true, assigneeId: true } },
        },
      });

      const myTasks = tasks.filter((t) => {
        const assignees = (t.assignees as number[]) || [];
        return assignees.includes(userId);
      });

      const taskEvents = myTasks.map((t) => {
        const done = (t.column?.name || "").toLowerCase().match(/done|complete|closed/) != null;
        return {
          kind: "task" as const,
          id: t.id,
          title: t.title,
          dueDate: fmtDate(t.dueDate),
          projectId: t.projectId,
          projectName: t.project.name,
          priority: t.priority,
          column: t.column?.name || null,
          isOverdue: t.dueDate != null && t.dueDate < today && !done,
          parentTaskId: null as number | null,
        };
      });

      // Subtasks assigned to the user, in range
      const subEvents: any[] = [];
      for (const t of myTasks) {
        for (const s of t.subtasks) {
          if (s.dueDate && s.dueDate >= gte && s.dueDate <= lte && s.assigneeId === userId) {
            subEvents.push({
              kind: "subtask" as const,
              id: s.id,
              title: `${t.title} › ${s.title}`,
              dueDate: fmtDate(s.dueDate),
              projectId: t.projectId,
              projectName: t.project.name,
              priority: t.priority,
              column: s.status,
              isOverdue: s.dueDate < today && s.status !== "done",
              parentTaskId: t.id,
            });
          }
        }
      }

      // Also pick up subtasks assigned to the user on tasks not themselves assigned to the user
      const otherSubs = await prisma.taskSubtask.findMany({
        where: {
          assigneeId: userId,
          dueDate: { gte, lte },
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              priority: true,
              projectId: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      });
      for (const s of otherSubs) {
        if (subEvents.some((e) => e.id === s.id)) continue;
        subEvents.push({
          kind: "subtask" as const,
          id: s.id,
          title: `${s.task.title} › ${s.title}`,
          dueDate: fmtDate(s.dueDate),
          projectId: s.task.projectId,
          projectName: s.task.project.name,
          priority: s.task.priority,
          column: s.status,
          isOverdue: s.dueDate != null && s.dueDate < today && s.status !== "done",
          parentTaskId: s.task.id,
        });
      }

      const entries = await prisma.timeEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          workDate: { gte, lte },
        },
        include: {
          task: { select: { id: true, title: true } },
          subtask: { select: { id: true, title: true } },
        },
      });

      // Microsoft Teams meetings cached for this user (auto sync setting
      // governs whether new ones are pulled; cached ones always render).
      let meetings: any[] = [];
      const msAccount = await prisma.microsoftAccount.findUnique({
        where: { userId },
      });
      if (msAccount?.calendarSyncEnabled) {
        const calendarEvents = await prisma.calendarEvent.findMany({
          where: {
            userId,
            startAt: { lte: parseWorkDate(to) },
            endAt: { gte: parseWorkDate(from) },
          },
          orderBy: { startAt: "asc" },
        });
        meetings = calendarEvents.map((e) => ({
          kind: "meeting" as const,
          id: e.id,
          msEventId: e.msEventId,
          title: e.subject,
          startAt: e.startAt.toISOString(),
          endAt: e.endAt.toISOString(),
          isOnlineMeeting: e.isOnlineMeeting,
          joinUrl: e.joinUrl,
          organizer: e.organizer,
          attended: e.attended,
          timeEntryId: e.timeEntryId,
        }));
      }

      res.status(200).json({
        success: true,
        data: {
          tasks: [...taskEvents, ...subEvents],
          meetings,
          entries: entries.map((e) => ({
            ...serializeEntry(e),
            kind: "entry" as const,
            startTime: e.startTime?.toISOString() ?? null,
            endTime: e.endTime?.toISOString() ?? null,
            sourceLabel: e.subtask
              ? `${e.task?.title ?? ""} › ${e.subtask.title}`
              : e.task
                ? e.task.title
                : "Ad-hoc",
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/timesheet/enrollable
/**
 * What this person is actually allowed to log time against.
 *
 * The form's three pickers used to be fed from `/my-tasks` (any task you are
 * assigned) plus the whole category list, which silently allowed a task from a
 * project the person had since been removed from. The server is still the
 * authority — `POST /entries` validates the task exists — but the picker
 * should not offer work the person cannot legitimately claim.
 *
 * Rules:
 *   projects → active `TeamAssignment` for this user
 *   tasks    → tasks assigned to them, on a project they are enrolled in
 *   subtasks → subtasks of those tasks, assigned to them or unassigned
 *   events   → their own calendar events
 *   categories → active `timesheet_category` reference rows
 */
router.get(
  "/enrollable",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const [assignments, mine, categories, events] = await Promise.all([
        prisma.teamAssignment.findMany({
          where: { userId, isActive: true, project: { deletedAt: null } },
          include: {
            projectRole: { select: { id: true, name: true } },
            project: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { project: { name: "asc" } },
        }),
        // A task can name someone as assignee on a project they are not on the
        // team for (reassignment leftovers). Filtering by the enrolled project
        // list keeps the two dropdowns consistent with each other.
        prisma.projectTask.findMany({
          where: {
            OR: [
              { assignees: { array_contains: [userId] } },
              { subtasks: { some: { assigneeId: userId } } },
            ],
          },
          include: {
            project: { select: { id: true, name: true } },
            subtasks: {
              where: { status: { not: "done" } },
              orderBy: { position: "asc" },
              select: { id: true, title: true, status: true, assigneeId: true },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 200,
        }),
        prisma.referenceData.findMany({
          where: { group: "timesheet_category", isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { value: true, label: true },
        }),
        prisma.calendarEvent.findMany({
          where: { userId, timeEntryId: null },
          orderBy: { startAt: "asc" },
          take: 50,
          select: { id: true, subject: true, startAt: true, endAt: true, attended: true },
        }),
      ]);

      const projectIds = new Set(assignments.map((a) => a.projectId));

      res.status(200).json({
        success: true,
        data: {
          projects: assignments.map((a) => ({
            id: a.project.id,
            name: a.project.name,
            slug: a.project.slug,
            role: a.projectRole.name,
          })),
          tasks: mine
            .filter((task) => projectIds.has(task.projectId))
            .map((task) => ({
              id: task.id,
              title: task.title,
              projectId: task.projectId,
              projectName: task.project.name,
              subtasks: task.subtasks.map((s) => ({
                id: s.id,
                title: s.title,
                status: s.status,
                // `null` means unassigned — anyone on the project may claim it.
                claimable: s.assigneeId === null || s.assigneeId === userId,
              })),
            })),
          categories,
          events,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/timesheet/my-tasks
router.get(
  "/my-tasks",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      const tasks = await prisma.projectTask.findMany({
        where: {
          OR: [
            { assignees: { array_contains: [userId] } },
            { subtasks: { some: { assigneeId: userId } } },
          ],
        },
        include: {
          project: { select: { id: true, name: true } },
          subtasks: {
            where: { status: { not: "done" } },
            orderBy: { position: "asc" },
            select: { id: true, title: true, status: true, assigneeId: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });

      res.status(200).json({
        success: true,
        data: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          projectName: t.project.name,
          subtasks: t.subtasks,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------- approval rules (admin) ----------

// GET /api/timesheet/approval-rules
router.get(
  "/approval-rules",
  authenticate,
  requirePermission("timesheet.settings.manage"),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const rules = await prisma.timesheetApprovalRule.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          appliesTo: { include: { user: { select: { id: true, name: true, email: true } } } },
          approvers: {
            orderBy: { step: "asc" },
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          projectRole: true,
        },
      });
      res.status(200).json({ success: true, data: rules });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/timesheet/approval-rules
router.post(
  "/approval-rules",
  authenticate,
  requirePermission("timesheet.settings.manage"),
  validate(createRuleSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const userIds = body.approverType === "users" ? body.userIds ?? [] : [];
      if (body.approverType === "users" && userIds.length === 0) {
        throw new ValidationError({ userIds: ["Select at least one approver"] });
      }
      const appliesToUserIds = body.appliesToUserIds ?? [];

      // Categories: prefer the list form; validate every value against
      // timesheet_category, then store comma-joined.
      let ruleCategories: string | null = null;
      if (body.categoryValues !== undefined) {
        for (const c of body.categoryValues) await assertCategoryExists(c);
        ruleCategories = body.categoryValues.length ? body.categoryValues.join(",") : null;
      } else if (body.categoryValue !== undefined) {
        const legacy = (body.categoryValue || "").trim();
        if (legacy) {
          for (const c of legacy.split(",")) await assertCategoryExists(c.trim());
          ruleCategories = legacy;
        }
      }

      await assertNoAppliesToConflict(appliesToUserIds, undefined, {
        categoryValue: ruleCategories,
        projectId: body.projectId || null,
      });

      const rule = await prisma.timesheetApprovalRule.create({
        data: {
          name: body.name,
          isActive: body.isActive ?? true,
          sortOrder: body.sortOrder ?? 0,
          categoryValue: ruleCategories,
          projectId: body.projectId || null,
          approverType: body.approverType,
          projectRoleId: body.approverType === "project_role" ? body.projectRoleId || null : null,
          appRole: body.approverType === "app_role" ? body.appRole || null : null,
          appliesTo: appliesToUserIds.length
            ? { create: appliesToUserIds.map((userId: number) => ({ userId })) }
            : undefined,
          approvers:
            body.approverType === "users"
              ? { create: userIds.map((userId: number, i: number) => ({ userId, step: i + 1 })) }
              : undefined,
        },
        include: ruleInclude,
      });
      res.status(201).json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/timesheet/approval-rules/:id
router.put(
  "/approval-rules/:id",
  authenticate,
  requirePermission("timesheet.settings.manage"),
  validate(updateRuleSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = await prisma.timesheetApprovalRule.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Approval rule not found");

      const body = req.body;
      const nextApproverType = body.approverType ?? existing.approverType;
      const userIds = nextApproverType === "users" ? body.userIds ?? [] : [];
      const approversTouched =
        (body.approverType !== undefined && body.approverType !== "users") ||
        body.userIds !== undefined;
      if (nextApproverType === "users" && approversTouched && userIds.length === 0) {
        throw new ValidationError({ userIds: ["Select at least one approver"] });
      }

      const replaceApprovers =
        nextApproverType === "users" && (body.userIds !== undefined || body.approverType !== undefined);
      if (replaceApprovers) {
        await prisma.timesheetRuleApprover.deleteMany({ where: { ruleId: id } });
      }

      // Categories (same normalize/validate as create).
      let nextCategories: string | null | undefined;
      if (body.categoryValues !== undefined) {
        for (const c of body.categoryValues) await assertCategoryExists(c);
        nextCategories = body.categoryValues.length ? body.categoryValues.join(",") : null;
      } else if (body.categoryValue !== undefined) {
        const legacy = (body.categoryValue || "").trim();
        if (legacy) {
          for (const c of legacy.split(",")) await assertCategoryExists(c.trim());
        }
        nextCategories = legacy || null;
      }

      const nextAppliesTo =
        body.appliesToUserIds !== undefined
          ? body.appliesToUserIds
          : (
              await prisma.timesheetRuleAppliesTo.findMany({
                where: { ruleId: id },
                select: { userId: true },
              })
            ).map((a) => a.userId);
      const willBeActive = body.isActive ?? existing.isActive;
      if (willBeActive) {
        await assertNoAppliesToConflict(nextAppliesTo, id, {
          categoryValue:
            nextCategories !== undefined ? nextCategories : existing.categoryValue,
          projectId: body.projectId !== undefined ? body.projectId || null : existing.projectId,
        });
      }
      if (body.appliesToUserIds !== undefined) {
        await prisma.timesheetRuleAppliesTo.deleteMany({ where: { ruleId: id } });
      }

      const rule = await prisma.timesheetApprovalRule.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
          ...(nextCategories !== undefined && { categoryValue: nextCategories }),
          ...(body.projectId !== undefined && { projectId: body.projectId || null }),
          ...(body.approverType !== undefined && { approverType: body.approverType }),
          ...(body.projectRoleId !== undefined && { projectRoleId: body.projectRoleId || null }),
          ...(body.appRole !== undefined && { appRole: body.appRole || null }),
          ...(body.appliesToUserIds !== undefined
            ? {
                appliesTo: {
                  create: body.appliesToUserIds.map((userId: number) => ({ userId })),
                },
              }
            : {}),
          ...(replaceApprovers
            ? { approvers: { create: userIds.map((userId: number, i: number) => ({ userId, step: i + 1 })) } }
            : {}),
        },
        include: ruleInclude,
      });
      res.status(200).json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/timesheet/approval-rules/:id
router.delete(
  "/approval-rules/:id",
  authenticate,
  requirePermission("timesheet.settings.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      await prisma.timesheetApprovalRule.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
