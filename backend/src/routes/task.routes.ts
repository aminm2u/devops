import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";
import multer from "multer";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ValidationError, AppError } from "../lib/errors.js";
import prisma from "../config/database.js";
import { getIO } from "../lib/socket.js";
import { logTaskActivity } from "../lib/task-activity.js";
import { recomputeScopeProgress } from "./scope.routes.js";

const router = Router();

// ── Task attachments ─────────────────────────────────────────────────────────
// Stored on disk under uploads/tasks/ — same pattern as the helpdesk's
// uploads/helpdesk/. The docker volume mounts /app/uploads, so files survive
// rebuilds. DB rows keep the original name for display and the disk path for
// the download route.
const taskUploadsDir = path.resolve(process.cwd(), "uploads", "tasks");
if (!fs.existsSync(taskUploadsDir)) {
  fs.mkdirSync(taskUploadsDir, { recursive: true });
}

const taskAttachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, taskUploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const taskAttachments = multer({
  storage: taskAttachmentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});

/** Upload constraints shared with the client's composer UI. */
const TASK_MAX_FILES = 5;
const TASK_MAX_FILE_MB = 10;

/**
 * Accepts a numeric id (legacy links, socket payloads) or a `publicId` uuid
 * (detail URLs) for a task, and returns the internal row id — null when
 * nothing matches. Every `/:taskParam`-style handler resolves through this so
 * a uuid URL can load and act on a task. Mirrors `resolveTicketParam` in
 * helpdesk.routes.ts.
 */
async function resolveTaskParam(param: string): Promise<number | null> {
  if (/^\d+$/.test(param)) return parseInt(param, 10);
  const task = await prisma.projectTask.findFirst({
    where: { publicId: param },
    select: { id: true },
  });
  return task?.id ?? null;
}

// Validation Schemas
const createTaskSchema = z.object({
  projectId: z.number().int().positive(),
  columnId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  assignees: z.array(z.number().int().positive()).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  // The scope item this task delivers — drives the scope progress rollup
  scopeItemId: z.number().int().positive().nullable().optional(),
});

const updateTaskSchema = createTaskSchema.partial().extend({
  position: z.number().int().min(0).optional(),
});

const reorderTasksSchema = z.object({
  tasks: z.array(z.object({
    id: z.number().int().positive(),
    columnId: z.number().int().positive(),
    position: z.number().int().min(0),
  }))
});

// Scope → board generation: one Kanban task per selected leaf scope item,
// pre-linked so progress rolls back to the WBS tree.
const generateFromScopeSchema = z.object({
  projectId: z.number().int().positive(),
  scopeItemIds: z.array(z.number().int().positive()).min(1).max(200),
  columnId: z.number().int().positive(),
});

/**
 * Guards the scopeItemId handed over by create/update: it must exist on this
 * project and not be soft-deleted. Returns null for null/undefined.
 * @throws ValidationError when set but invalid — a dangling link would put a
 *   task under a tree it does not belong to.
 */
async function assertScopeItem(projectId: number, scopeItemId?: number | null) {
  if (scopeItemId === undefined || scopeItemId === null) return null;
  const item = await prisma.scopeItem.findFirst({
    where: { id: scopeItemId, projectId, deletedAt: null },
    select: { id: true, wbsNumber: true, title: true },
  });
  if (!item) {
    throw new ValidationError({
      scopeItemId: ["Scope item does not exist on this project"],
    });
  }
  return item;
}

/** TaskActivity entry for a scope link/unlink, with the WBS label for the timeline. */
async function logScopeActivity(
  taskId: number,
  userId: number,
  action: "scope_linked" | "scope_unlinked",
  scope: { wbsNumber: string; title: string } | null
) {
  await logTaskActivity({
    taskId,
    userId,
    action,
    details: scope
      ? { scopeItemId: scope.wbsNumber, wbsNumber: scope.wbsNumber, scopeTitle: scope.title }
      : {},
  });
}

const createColumnSchema = z.object({
  projectId: z.number().int().positive(),
  name: z.string().min(1).max(255),
});

// Subtasks are checklist-style children of a task (2-level limit: no
// sub-subtasks). Several people can work one subtask — `assignees` is the
// array of user IDs; the legacy single `assigneeId` is still accepted and
// folded in so older clients keep working.
const createSubtaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  assigneeId: z.number().int().positive().optional().nullable(),
  assignees: z.array(z.number().int().positive()).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
  position: z.number().int().min(0).optional(),
});

const updateSubtaskSchema = createSubtaskSchema.partial();

// POST /api/tasks/columns
router.post(
  "/columns",
  authenticate,
  validate(createColumnSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { projectId, name } = req.body;

      const lastCol = await prisma.taskColumn.findFirst({
        where: { projectId },
        orderBy: { position: 'desc' }
      });
      const newPos = lastCol ? lastCol.position + 1 : 0;

      const column = await prisma.taskColumn.create({
        data: { projectId, name, position: newPos }
      });

      res.status(201).json({ success: true, data: column });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/tasks
router.post(
  "/",
  authenticate,
  validate(createTaskSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const data = req.body;

      const lastTask = await prisma.projectTask.findFirst({
        where: { columnId: data.columnId },
        orderBy: { position: 'desc' }
      });
      const newPos = lastTask ? lastTask.position + 1 : 0;

      const column = await prisma.taskColumn.findUnique({
        where: { id: data.columnId },
      });

      // Validate the scope link against THIS project — a task pointing at
      // another project's WBS row would poison the progress rollup.
      const scopeItem = await assertScopeItem(data.projectId, data.scopeItemId);

      const task = await prisma.projectTask.create({
        data: {
          projectId: data.projectId,
          columnId: data.columnId,
          title: data.title,
          description: data.description,
          assignees: data.assignees || [],
          priority: data.priority || "medium",
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          scopeItemId: scopeItem ? scopeItem.id : null,
          position: newPos
        }
      });

      // Log activity: task created
      await logTaskActivity({
        taskId: task.id,
        userId: req.user!.id,
        action: "created",
        details: {
          title: task.title,
          column: column?.name || "Unknown",
          assignees: data.assignees || [],
        },
      });

      if (scopeItem) {
        await logScopeActivity(task.id, req.user!.id, "scope_linked", scopeItem);
      }

      // Log assignment activities
      if (data.assignees && data.assignees.length > 0) {
        for (const assigneeId of data.assignees) {
          const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
          await logTaskActivity({
            taskId: task.id,
            userId: req.user!.id,
            action: "assigned",
            details: { assigneeId, assigneeName: assignee?.name || "Unknown" },
          });
        }
      }

      try { getIO().emit('task-created', { task }); } catch (e) {}

      // New task on a scope item shifts that item's progress rollup.
      if (data.scopeItemId) {
        await recomputeScopeProgress(prisma, data.projectId);
      }

      res.status(201).json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/tasks/reorder
router.put(
  "/reorder",
  authenticate,
  validate(reorderTasksSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { tasks } = req.body;

      // Detect column changes and log moves
      for (const t of tasks) {
        const existing = await prisma.projectTask.findUnique({
          where: { id: t.id },
          include: { column: true },
        });
        if (existing && existing.columnId !== t.columnId) {
          const newCol = await prisma.taskColumn.findUnique({ where: { id: t.columnId } });
          await logTaskActivity({
            taskId: t.id,
            userId: req.user!.id,
            action: "moved",
            details: {
              from: existing.column.name,
              to: newCol?.name || "Unknown",
            },
          });
        }
      }

      await prisma.$transaction(
        tasks.map((t: any) => prisma.projectTask.update({
          where: { id: t.id },
          data: { columnId: t.columnId, position: t.position }
        }))
      );

      // A column move can flip a task's done state — refresh rollups for the
      // projects whose tasks moved.
      const touchedProjects = new Set<number>();
      for (const t of tasks) {
        const existing = await prisma.projectTask.findUnique({
          where: { id: t.id },
          select: { projectId: true },
        });
        if (existing) touchedProjects.add(existing.projectId);
      }
      for (const touchedProjectId of touchedProjects) {
        await recomputeScopeProgress(prisma, touchedProjectId);
      }

      try { getIO().emit('tasks-reordered', { tasks }); } catch (e) {}

      res.status(200).json({ success: true, message: "Tasks reordered" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/tasks/generate-from-scope — one Kanban task per selected leaf
// scope item, pre-linked via scopeItemId. Declared before /:id so "generate"
// is never captured as an id.
router.post(
  "/generate-from-scope",
  authenticate,
  requirePermission("task.create"),
  validate(generateFromScopeSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { projectId, scopeItemIds, columnId } = req.body;

      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true },
      });
      if (!project) throw new NotFoundError("Project not found");

      const column = await prisma.taskColumn.findFirst({
        where: { id: columnId, projectId },
      });
      if (!column) throw new ValidationError({ columnId: ["Column does not belong to this project"] });

      const items = await prisma.scopeItem.findMany({
        where: { id: { in: scopeItemIds }, projectId, deletedAt: null },
        select: { id: true, parentId: true, wbsNumber: true, title: true, description: true, assigneeUserId: true, endDate: true },
      });

      // Leaf test against the WHOLE tree: an item is a parent whenever any
      // live item points at it as their parent — even when none of its
      // children are in this selection.
      const childRows = await prisma.scopeItem.findMany({
        where: { projectId, deletedAt: null, parentId: { in: scopeItemIds } },
        select: { parentId: true },
      });
      const parentIds = new Set(childRows.map((row) => row.parentId as number));

      // Idempotency: any existing link (even one created manually) blocks a
      // duplicate. Unlinked tasks don't count — scope soft-delete SetNulls the
      // link, so regeneration after unlink works.
      const linked = await prisma.projectTask.findMany({
        where: { projectId, scopeItemId: { in: scopeItemIds } },
        select: { scopeItemId: true },
      });
      const alreadyLinked = new Set(linked.map((t) => t.scopeItemId));

      const toCreate = items.filter(
        (item) => !parentIds.has(item.id) && !alreadyLinked.has(item.id)
      );
      const skipped: { scopeItemId: number; reason: string }[] = [];
      for (const id of scopeItemIds) {
        if (!items.some((i) => i.id === id)) skipped.push({ scopeItemId: id, reason: "not_found" });
        else if (parentIds.has(id)) skipped.push({ scopeItemId: id, reason: "has_children" });
        else if (alreadyLinked.has(id)) skipped.push({ scopeItemId: id, reason: "already_has_task" });
      }

      // Contiguous block after the column's current max — one query, not one
      // per task, so a 50-item generation stays one round trip.
      const lastTask = await prisma.projectTask.findFirst({
        where: { columnId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      let position = lastTask ? lastTask.position + 1 : 0;

      const created = await prisma.$transaction(
        toCreate.map((item) => {
          const data = {
            projectId,
            columnId,
            title: `${item.wbsNumber} ${item.title}`,
            description: item.description,
            assignees: item.assigneeUserId ? [item.assigneeUserId] : [],
            priority: "medium",
            dueDate: item.endDate,
            scopeItemId: item.id,
            position: position++,
          };
          return prisma.projectTask.create({ data });
        })
      );

      // One event, not N — the board refetches from the payload anyway.
      if (created.length > 0) {
        try { getIO().emit("tasks-generated", { projectId, count: created.length }); } catch (e) {}
        await recomputeScopeProgress(prisma, projectId);
      }

      res.status(201).json({
        success: true,
        data: { created, skipped },
        message: `${created.length} task(s) created`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/tasks/:id
router.put(
  "/:id",
  authenticate,
  validate(updateTaskSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = req.body;

      const taskId = await resolveTaskParam(id);
      if (taskId === null) throw new NotFoundError("Task not found");

      const existing = await prisma.projectTask.findUnique({
        where: { id: taskId },
      });
      if (!existing) throw new NotFoundError("Task not found");

      // A new scope link must land on this project's tree; `null` unlinks and
      // is always allowed.
      let scopeItem: { id: number; wbsNumber: string; title: string } | null = null;
      if (data.scopeItemId !== undefined && data.scopeItemId !== null) {
        scopeItem = await assertScopeItem(existing.projectId, data.scopeItemId);
      }

      const { scopeItemId: _incomingScopeItemId, ...updateData } = data;
      const task = await prisma.projectTask.update({
        where: { id: taskId! },
        data: {
          ...updateData,
          ...(data.scopeItemId !== undefined && { scopeItemId: scopeItem ? scopeItem.id : null }),
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        }
      });

      // Log scope link changes — the activity timeline is how people trace why
      // a task counts toward a work package.
      if (data.scopeItemId !== undefined && existing.scopeItemId !== task.scopeItemId) {
        await logScopeActivity(
          task.id,
          req.user!.id,
          task.scopeItemId ? "scope_linked" : "scope_unlinked",
          scopeItem
        );
      }

      // Log assignee changes
      if (data.assignees) {
        const oldAssignees = (existing.assignees as number[]) || [];
        const newAssignees = data.assignees as number[];

        const added = newAssignees.filter((a: number) => !oldAssignees.includes(a));
        const removed = oldAssignees.filter((a: number) => !newAssignees.includes(a));

        for (const assigneeId of added) {
          const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
          await logTaskActivity({
            taskId: taskId!,
            userId: req.user!.id,
            action: "assigned",
            details: { assigneeId, assigneeName: user?.name || "Unknown" },
          });
        }
        for (const assigneeId of removed) {
          const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
          await logTaskActivity({
            taskId: taskId!,
            userId: req.user!.id,
            action: "unassigned",
            details: { assigneeId, assigneeName: user?.name || "Unknown" },
          });
        }
      }

      // Log other updates
      const changedFields: string[] = [];
      if (data.title && data.title !== existing.title) changedFields.push("title");
      if (data.description !== undefined && data.description !== existing.description) changedFields.push("description");
      if (data.priority && data.priority !== existing.priority) changedFields.push("priority");
      if (data.dueDate !== undefined) changedFields.push("dueDate");

      if (changedFields.length > 0 && !data.assignees) {
        await logTaskActivity({
          taskId: taskId!,
          userId: req.user!.id,
          action: "updated",
          details: { fields: changedFields },
        });
      }

      try { getIO().emit('task-updated', { task }); } catch (e) {}

      // Link or column changes shift the scope progress rollup.
      if (
        (data.scopeItemId !== undefined && existing.scopeItemId !== data.scopeItemId) ||
        (data.columnId !== undefined && existing.columnId !== data.columnId)
      ) {
        await recomputeScopeProgress(prisma, task.projectId);
      }

      res.status(200).json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/tasks/:id — task detail with comments and activities
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const taskId = await resolveTaskParam(id);
      if (taskId === null) throw new NotFoundError("Task not found");
      const task = await prisma.projectTask.findUnique({
        where: { id: taskId },
        include: {
          comments: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              // Files ride in the bubble, chat-style.
              attachments: {
                where: { isActive: true },
                include: { uploader: { select: { id: true, name: true } } },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          activities: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          subtasks: {
            include: {
              assignee: { select: { id: true, name: true, email: true } },
            },
            orderBy: { position: "asc" },
          },
          timeEntries: {
            where: { deletedAt: null },
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
          },
          column: { select: { id: true, name: true } },
          // The WBS work package this task delivers — shown as a chip and
          // editable from the detail view.
          scopeItem: {
            select: { id: true, wbsNumber: true, title: true, status: true, endDate: true },
          },
        },
      });

      if (!task) throw new NotFoundError("Task not found");

      // Total logged across all entries (the timeline already lists them
      // individually; this scalar feeds the header).
      const loggedAgg = await prisma.timeEntry.aggregate({
        where: { taskId: task.id, deletedAt: null },
        _sum: { hours: true },
      });

      // Resolve assignee names
      const assigneeIds = (task.assignees as number[]) || [];
      const assignees = assigneeIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, name: true, email: true },
          })
        : [];

      res.status(200).json({
        success: true,
        data: {
          ...task,
          loggedHours: Number(loggedAgg._sum.hours ?? 0),
          assigneeDetails: assignees,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/tasks/:id/comments
// POST /api/tasks/:id/comments — a chat message on the task or one of its
// subtasks. Multipart when files ride along, JSON when they do not (the
// `validate` middleware is skipped — multer has parsed the string fields).
router.post(
  "/:id/comments",
  authenticate,
  taskAttachments.array("attachments", TASK_MAX_FILES),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const taskId = await resolveTaskParam(id);
      if (taskId === null) throw new NotFoundError("Task not found");
      // Multer delivers every field as a string; normalise both shapes.
      const content = String(req.body.content ?? "");
      const subtaskInput = req.body.subtaskId !== undefined && req.body.subtaskId !== null && req.body.subtaskId !== ""
        ? parseInt(String(req.body.subtaskId), 10)
        : null;

      if (!content.trim()) {
        return res.status(400).json({ error: "Content is required" });
      }

      // Hours are recorded as TimeEntry work logs (POST /api/timesheet/entries),
      // no longer as comment fields — reject to keep one source of truth.
      if (req.body.workingHours !== undefined && req.body.workingHours !== null) {
        return res.status(400).json({
          error: "workingHours is no longer accepted on comments. Log work via /api/timesheet/entries.",
        });
      }

      const task = await prisma.projectTask.findUnique({
        where: { id: taskId },
      });
      if (!task) throw new NotFoundError("Task not found");

      // The message may target one subtask (the discussion feed groups by it).
      if (subtaskInput !== null) {
        const subtask = await prisma.taskSubtask.findFirst({
          where: { id: subtaskInput, taskId },
        });
        if (!subtask) throw new ValidationError({ subtaskId: ["Subtask does not belong to this task"] });
      }

      const comment = await prisma.taskComment.create({
        data: {
          taskId,
          subtaskId: subtaskInput,
          userId: req.user!.id,
          content: content.trim(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          attachments: { where: { isActive: true } },
        },
      });

      // Files uploaded with the comment land in the attachments table pointing
      // at it, so they render inside the bubble like any chat client.
      const files = (req.files as Express.Multer.File[]) ?? [];
      if (files.length > 0) {
        await prisma.taskAttachment.createMany({
          data: files.map((file) => ({
            taskId,
            commentId: comment.id,
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: file.path,
            uploadedBy: req.user!.id,
          })),
        });
      }
      const withAttachments = await prisma.taskComment.findUnique({
        where: { id: comment.id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          attachments: {
            where: { isActive: true },
            include: { uploader: { select: { id: true, name: true } } },
          },
        },
      });

      // Log comment activity
      await logTaskActivity({
        taskId,
        userId: req.user!.id,
        action: "commented",
        details: {
          preview: content.trim().substring(0, 100),
          ...(subtaskInput ? { subtaskId: subtaskInput } : {}),
          ...(files.length ? { fileCount: files.length } : {}),
        },
      });

      try { getIO().emit('task-comment', { taskId, comment: withAttachments }); } catch (e) {}

      res.status(201).json({ success: true, data: withAttachments });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/tasks/attachments/:id/download — stream one task attachment back.
// Declared before /:id so "attachments" is never captured as a task token.
router.get(
  "/attachments/:id/download",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const attachmentId = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(attachmentId)) throw new AppError(400, "Invalid attachment id");

      const attachment = await prisma.taskAttachment.findFirst({
        where: { id: attachmentId, isActive: true },
      });
      if (!attachment || !fs.existsSync(attachment.path)) {
        throw new NotFoundError("Attachment not found");
      }

      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(attachment.originalName)}"`
      );
      fs.createReadStream(attachment.path).pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/tasks/:id/subtasks
router.post(
  "/:id/subtasks",
  authenticate,
  validate(createSubtaskSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const taskId = await resolveTaskParam(req.params.id);
      if (taskId === null) throw new NotFoundError("Task not found");
      const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundError("Task not found");

      const data = req.body;
      const last = await prisma.taskSubtask.findFirst({
        where: { taskId },
        orderBy: { position: "desc" },
      });

      // Assignees: `assignees` is the array of record; a legacy `assigneeId`
      // is folded in so older clients keep working. The mirror `assigneeId`
      // column keeps its first member — the legacy FK and the timesheet
      // subtask-claim logic still read it.
      const mergedAssignees = Array.from(
        new Set([
          ...(data.assignees ?? []),
          ...(data.assigneeId ? [data.assigneeId] : []),
        ])
      );

      const subtask = await prisma.taskSubtask.create({
        data: {
          taskId,
          title: data.title,
          description: data.description,
          assignees: mergedAssignees,
          assigneeId: mergedAssignees[0] ?? null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          status: data.status || "open",
          position: data.position ?? (last ? last.position + 1 : 0),
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      await logTaskActivity({
        taskId,
        userId: req.user!.id,
        action: "subtask_created",
        details: { subtaskId: subtask.id, title: subtask.title },
      });

      try { getIO().emit('task-updated', { taskId }); } catch (e) {}

      res.status(201).json({ success: true, data: subtask });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/tasks/:id/subtasks/:subtaskId
router.put(
  "/:id/subtasks/:subtaskId",
  authenticate,
  validate(updateSubtaskSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const taskId = await resolveTaskParam(req.params.id);
      if (taskId === null) throw new NotFoundError("Task not found");
      const subtaskId = parseInt(req.params.subtaskId, 10);

      const existing = await prisma.taskSubtask.findUnique({ where: { id: subtaskId } });
      if (!existing || existing.taskId !== taskId) throw new NotFoundError("Subtask not found");

      const data = req.body;
      // Same merge rule as create: `assignees` array is the record, legacy
      // `assigneeId` folds in; the mirror column keeps the first member.
      let nextAssignees: number[] | undefined;
      if (data.assignees !== undefined || data.assigneeId !== undefined) {
        nextAssignees = Array.from(
          new Set([
            ...(data.assignees ?? []),
            ...(data.assigneeId ? [data.assigneeId] : []),
          ])
        );
      }

      const subtask = await prisma.taskSubtask.update({
        where: { id: subtaskId },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(nextAssignees !== undefined && {
            assignees: nextAssignees,
            assigneeId: nextAssignees[0] ?? null,
          }),
          ...(data.dueDate !== undefined && { dueDate: data.dueDate ? new Date(data.dueDate) : null }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.position !== undefined && { position: data.position }),
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      await logTaskActivity({
        taskId,
        userId: req.user!.id,
        action: "subtask_updated",
        details: {
          subtaskId,
          title: subtask.title,
          fields: Object.keys(data),
          status: subtask.status,
        },
      });

      try { getIO().emit('task-updated', { taskId }); } catch (e) {}

      res.status(200).json({ success: true, data: subtask });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/tasks/:id/subtasks/:subtaskId
router.delete(
  "/:id/subtasks/:subtaskId",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const taskId = await resolveTaskParam(req.params.id);
      if (taskId === null) throw new NotFoundError("Task not found");
      const subtaskId = parseInt(req.params.subtaskId, 10);

      const existing = await prisma.taskSubtask.findUnique({ where: { id: subtaskId } });
      if (!existing || existing.taskId !== taskId) throw new NotFoundError("Subtask not found");

      // Cascade removes the subtask's time entries (hours are removed with it)
      await prisma.taskSubtask.delete({ where: { id: subtaskId } });

      await logTaskActivity({
        taskId,
        userId: req.user!.id,
        action: "subtask_deleted",
        details: { subtaskId, title: existing.title },
      });

      try { getIO().emit('task-updated', { taskId }); } catch (e) {}

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/tasks/:id
router.delete(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const taskId = await resolveTaskParam(id);
      if (taskId === null) throw new NotFoundError("Task not found");
      const existing = await prisma.projectTask.findUnique({
        where: { id: taskId },
        select: { projectId: true, scopeItemId: true },
      });
      if (!existing) throw new NotFoundError("Task not found");
      await prisma.projectTask.delete({ where: { id: taskId } });

      if (existing?.scopeItemId) {
        await recomputeScopeProgress(prisma, existing.projectId);
      }

      try { getIO().emit('task-deleted', { id: taskId! }); } catch (e) {}

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
