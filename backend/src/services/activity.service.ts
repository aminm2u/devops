import prisma from "../config/database.js";

interface LogActivityParams {
  logName?: string;
  description: string;
  subjectType?: string;
  subjectId?: number;
  event?: string;
  causerId?: number;
  causerType?: string;
  properties?: Record<string, any>;
  batchUuid?: string;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        logName: params.logName || "default",
        description: params.description,
        subjectType: params.subjectType || null,
        subjectId: params.subjectId || null,
        event: params.event || null,
        causerId: params.causerId || null,
        causerType: params.causerType || "App\\Models\\User",
        properties: params.properties || null,
        batchUuid: params.batchUuid || null,
      },
    });
  } catch (error) {
    console.error("[ActivityLog] Failed to log activity:", error);
  }
}
