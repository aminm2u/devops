import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import prisma from "../config/database.js";
import { getIO } from "../lib/socket.js";
import { logTaskActivity } from "../lib/task-activity.js";

const router = Router();

// Validation Schemas
const createTaskSchema = z.object({
  projectId: z.number().int().positive(),
  columnId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  assignees: z.array(z.number().int().positive()).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().optional().nullable(),
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

const createColumnSchema = z.object({
  projectId: z.number().int().positive(),
  name: z.string().min(1).max(255),
});

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

      const task = await prisma.projectTask.create({
        data: {
          projectId: data.projectId,
          columnId: data.columnId,
          title: data.title,
          description: data.description,
          assignees: data.assignees || [],
          priority: data.priority || "medium",
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
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

      try { getIO().emit('tasks-reordered', { tasks }); } catch (e) {}

      res.status(200).json({ success: true, message: "Tasks reordered" });
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

      const existing = await prisma.projectTask.findUnique({
        where: { id: parseInt(id) },
      });
      if (!existing) throw new NotFoundError("Task not found");

      const task = await prisma.projectTask.update({
        where: { id: parseInt(id) },
        data: {
          ...data,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        }
      });

      // Log assignee changes
      if (data.assignees) {
        const oldAssignees = (existing.assignees as number[]) || [];
        const newAssignees = data.assignees as number[];

        const added = newAssignees.filter((a: number) => !oldAssignees.includes(a));
        const removed = oldAssignees.filter((a: number) => !newAssignees.includes(a));

        for (const assigneeId of added) {
          const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
          await logTaskActivity({
            taskId: parseInt(id),
            userId: req.user!.id,
            action: "assigned",
            details: { assigneeId, assigneeName: user?.name || "Unknown" },
          });
        }
        for (const assigneeId of removed) {
          const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
          await logTaskActivity({
            taskId: parseInt(id),
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
          taskId: parseInt(id),
          userId: req.user!.id,
          action: "updated",
          details: { fields: changedFields },
        });
      }

      try { getIO().emit('task-updated', { task }); } catch (e) {}

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
      const task = await prisma.projectTask.findUnique({
        where: { id: parseInt(id) },
        include: {
          comments: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          activities: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          column: { select: { id: true, name: true } },
        },
      });

      if (!task) throw new NotFoundError("Task not found");

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
        data: { ...task, assigneeDetails: assignees },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/tasks/:id/comments
router.post(
  "/:id/comments",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { content, workingHours } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Content is required" });
      }

      const task = await prisma.projectTask.findUnique({
        where: { id: parseInt(id) },
      });
      if (!task) throw new NotFoundError("Task not found");

      const comment = await prisma.taskComment.create({
        data: {
          taskId: parseInt(id),
          userId: req.user!.id,
          content: content.trim(),
          workingHours: workingHours ? parseFloat(workingHours) : null,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      // Log comment activity
      await logTaskActivity({
        taskId: parseInt(id),
        userId: req.user!.id,
        action: "commented",
        details: { preview: content.trim().substring(0, 100) },
      });

      try { getIO().emit('task-comment', { taskId: parseInt(id), comment }); } catch (e) {}

      res.status(201).json({ success: true, data: comment });
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
      await prisma.projectTask.delete({ where: { id: parseInt(id) } });

      try { getIO().emit('task-deleted', { id: parseInt(id) }); } catch (e) {}

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
