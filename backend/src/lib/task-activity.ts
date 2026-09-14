import prisma from "../config/database.js";
import { getIO } from "../lib/socket.js";

type ActivityAction =
  | "created"
  | "moved"
  | "commented"
  | "assigned"
  | "unassigned"
  | "updated"
  | "deleted";

interface LogTaskActivityParams {
  taskId: number;
  userId: number;
  action: ActivityAction;
  details?: Record<string, any>;
}

export async function logTaskActivity({
  taskId,
  userId,
  action,
  details,
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
      getIO().emit("task-activity", { taskId, activity });
    } catch (e) {}

    return activity;
  } catch (error) {
    console.error("Failed to log task activity:", error);
  }
}
