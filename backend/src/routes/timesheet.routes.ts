import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../lib/errors.js";
import prisma from "../config/database.js";
import { getIO } from "../lib/socket.js";
import { logTaskActivity } from "../lib/task-activity.js";
import { resolveTimesheetApprover } from "../services/timesheetApproval.js";
import { createNotification } from "../services/notification.service.js";

const router = Router();

// ---------- helpers ----------

const MODEL_USER = "App\\Models\\User";

function isAdmin(req: RequestWithUser): boolean {
  const roles = (req.user?.roles || []).map((r) => r.name);
  return roles.includes("super-admin") || roles.includes("devops-admin");
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

async function assertCategoryExists(value: string): Promise<void> {
  const cat = await prisma.referenceData.findFirst({
    where: { group: "timesheet_category", value, isActive: true },
  });
  if (!cat) {
    throw new ValidationError({ categoryValue: ["Unknown or inactive timesheet category"] });
  }
}

// ---------- validation ----------

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const createTimeEntrySchema = z.object({
  workDate: dateStr,
  hours: z.number().min(0.25).max(24),
  description: z.string().min(1).max(5000),
  taskId: z.number().int().positive().optional().nullable(),
  subtaskId: z.number().int().positive().optional().nullable(),
  categoryValue: z.string().min(1).max(50).optional(),
  userId: z.number().int().positive().optional(), // admin-only: log on behalf
});

const updateTimeEntrySchema = createTimeEntrySchema.partial();

const rejectSchema = z.object({ reason: z.string().min(1).max(2000) });

const rangeSchema = z.object({ from: dateStr, to: dateStr });

const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  categoryValue: z.string().max(50).optional().nullable(),
  projectId: z.number().int().positive().optional().nullable(),
  approverType: z.enum(["project_role", "users", "direct_manager", "app_role"]),
  projectRoleId: z.number().int().positive().optional().nullable(),
  appRole: z.string().max(50).optional().nullable(),
  userIds: z.array(z.number().int().positive()).optional(),
});

const updateRuleSchema = createRuleSchema.partial();

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

      if (all && isAdmin(req)) {
        if (userId) where.userId = userId;
      } else {
        where.userId = userId && isAdmin(req) ? userId : req.user!.id;
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

      // Admin may log on behalf of another user; everyone else logs their own.
      let targetUserId = req.user!.id;
      if (body.userId && body.userId !== req.user!.id) {
        if (!isAdmin(req)) throw new ForbiddenError("Only admins can log time for other users");
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
        taskId = subtask.taskId;
        subtaskId = subtask.id;
        projectId = subtask.task.projectId;
        categoryValue = "project"; // metadata derived from the task
      } else if (body.taskId) {
        const task = await prisma.projectTask.findUnique({
          where: { id: body.taskId },
          select: { id: true, projectId: true },
        });
        if (!task) throw new NotFoundError("Task not found");
        taskId = task.id;
        projectId = task.projectId;
        categoryValue = "project"; // metadata derived from the task
      } else {
        if (!body.categoryValue) {
          throw new ValidationError({ categoryValue: ["Category is required for ad-hoc entries"] });
        }
        await assertCategoryExists(body.categoryValue);
        categoryValue = body.categoryValue;
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
  const { approverId, approvalRuleId } = await resolveTimesheetApprover({
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
    },
    include: entryInclude,
  });

  if (approverId) {
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
        data: { status: "draft", submittedAt: null, approverId: null, approvalRuleId: null },
        include: entryInclude,
      });

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
      if (entry.approverId !== req.user!.id && !isAdmin(req)) {
        throw new ForbiddenError("You are not the approver for this entry");
      }

      const updated = await prisma.timeEntry.update({
        where: { id },
        data: { status: "approved", decidedAt: new Date() },
        include: entryInclude,
      });

      await createNotification(
        entry.userId,
        "timesheet",
        "Timesheet approved",
        `Your ${Number(entry.hours)}h entry on ${fmtDate(entry.workDate)} was approved.`,
        "/my-work/timesheet"
      );

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
      if (entry.approverId !== req.user!.id && !isAdmin(req)) {
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

      const admin = isAdmin(req);
      if (entry.userId !== req.user!.id && !admin) {
        throw new ForbiddenError("You can only edit your own entries");
      }
      if (!["draft", "rejected"].includes(entry.status) && !admin) {
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
      if (body.subtaskId !== undefined || body.taskId !== undefined) {
        if (body.subtaskId) {
          const subtask = await prisma.taskSubtask.findUnique({
            where: { id: body.subtaskId },
            include: { task: { select: { id: true, projectId: true } } },
          });
          if (!subtask) throw new NotFoundError("Subtask not found");
          data.taskId = subtask.taskId;
          data.subtaskId = subtask.id;
          data.projectId = subtask.task.projectId;
          data.categoryValue = "project";
        } else if (body.taskId) {
          const task = await prisma.projectTask.findUnique({
            where: { id: body.taskId },
            select: { id: true, projectId: true },
          });
          if (!task) throw new NotFoundError("Task not found");
          data.taskId = task.id;
          data.subtaskId = null;
          data.projectId = task.projectId;
          data.categoryValue = "project";
        } else {
          data.taskId = null;
          data.subtaskId = null;
          data.projectId = null;
          if (!body.categoryValue) {
            throw new ValidationError({ categoryValue: ["Category is required for ad-hoc entries"] });
          }
          await assertCategoryExists(body.categoryValue);
          data.categoryValue = body.categoryValue;
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

      const admin = isAdmin(req);
      if (entry.userId !== req.user!.id && !admin) {
        throw new ForbiddenError("You can only delete your own entries");
      }
      if (entry.status === "approved" && !admin) {
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
      const all = req.query.all === "true" && isAdmin(req);

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
      if (userId !== req.user!.id && !isAdmin(req)) {
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
  requireRole("super-admin", "devops-admin"),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const rules = await prisma.timesheetApprovalRule.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          users: { include: { user: { select: { id: true, name: true, email: true } } } },
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
  requireRole("super-admin", "devops-admin"),
  validate(createRuleSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const rule = await prisma.timesheetApprovalRule.create({
        data: {
          name: body.name,
          isActive: body.isActive ?? true,
          sortOrder: body.sortOrder ?? 0,
          categoryValue: body.categoryValue || null,
          projectId: body.projectId || null,
          approverType: body.approverType,
          projectRoleId: body.approverType === "project_role" ? body.projectRoleId || null : null,
          appRole: body.approverType === "app_role" ? body.appRole || null : null,
          users: body.approverType === "users" && body.userIds?.length
            ? { create: body.userIds.map((userId: number) => ({ userId })) }
            : undefined,
        },
        include: {
          users: { include: { user: { select: { id: true, name: true, email: true } } } },
          projectRole: true,
        },
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
  requireRole("super-admin", "devops-admin"),
  validate(updateRuleSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = await prisma.timesheetApprovalRule.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Approval rule not found");

      const body = req.body;
      if (body.userIds && body.approverType === "users") {
        await prisma.timesheetApprovalRuleUser.deleteMany({ where: { ruleId: id } });
      }

      const rule = await prisma.timesheetApprovalRule.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
          ...(body.categoryValue !== undefined && { categoryValue: body.categoryValue || null }),
          ...(body.projectId !== undefined && { projectId: body.projectId || null }),
          ...(body.approverType !== undefined && { approverType: body.approverType }),
          ...(body.projectRoleId !== undefined && { projectRoleId: body.projectRoleId || null }),
          ...(body.appRole !== undefined && { appRole: body.appRole || null }),
          ...(body.userIds && body.approverType === "users"
            ? { users: { create: body.userIds.map((userId: number) => ({ userId })) } }
            : {}),
        },
        include: {
          users: { include: { user: { select: { id: true, name: true, email: true } } } },
          projectRole: true,
        },
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
  requireRole("super-admin", "devops-admin"),
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
