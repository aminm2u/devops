import prisma from "../config/database.js";
import { emitTaskEvent } from "../lib/socket.js";

type ActivityAction =
  | "created"
  | "moved"
  | "commented"
  | "assigned"
  | "unassigned"
  | "updated"
  | "deleted"
  | "work_logged"
  | "subtask_created"
  | "subtask_updated"
  | "subtask_deleted"
  | "scope_linked"
  | "scope_unlinked";

interface LogTaskActivityParams {
  taskId: number;
  userId: number;
  action: ActivityAction;
  details?: Record<string, any>;
  /**
   * The task's project, so the live update can be scoped to the project room
   * instead of broadcast to every connected client. Optional only for legacy
   * call sites; omit it and the activity is persisted without a live push.
   */
  projectId?: number | null;
}

export async function logTaskActivity({
  taskId,
  userId,
  action,
  details,
  projectId,
}: LogTaskActivityParams) {
  try {
    const activity = await prisma.taskActivity.create({
      data: {
        taskId,
        userId,
        action,
        details: details || undefined,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    try {
      emitTaskEvent(projectId, "task-activity", { taskId, activity });
    } catch (e) {}

    return activity;
  } catch (error) {
    console.error("Failed to log task activity:", error);
  }
}
