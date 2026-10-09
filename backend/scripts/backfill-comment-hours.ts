/**
 * One-time (idempotent) backfill: copy legacy TaskComment.workingHours rows
 * into the shared TimeEntry work log so hour totals read from one source.
 *
 * Each comment with workingHours becomes a TimeEntry with:
 *   status: 'approved' (historical work — not routed through approval)
 *   categoryValue: 'project'
 *   workDate: calendar date of the comment's createdAt
 *   description: the comment content
 *
 * Matching (taskId + userId + description + hours + workDate) prevents
 * duplicate rows when the script is re-run.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function main() {
  const comments = await prisma.taskComment.findMany({
    where: { workingHours: { not: null } },
    include: { task: { select: { projectId: true } } },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let skipped = 0;

  for (const comment of comments) {
    const hours = Number(comment.workingHours);
    if (!hours || hours <= 0) {
      skipped++;
      continue;
    }

    const workDate = toDateOnly(comment.createdAt);
    const description = comment.content.trim();

    const existing = await prisma.timeEntry.findFirst({
      where: {
        taskId: comment.taskId,
        userId: comment.userId,
        description,
        hours,
        workDate,
        deletedAt: null,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.timeEntry.create({
      data: {
        userId: comment.userId,
        workDate,
        hours,
        description,
        taskId: comment.taskId,
        subtaskId: null,
        projectId: comment.task.projectId,
        categoryValue: "project",
        status: "approved",
        decidedAt: comment.createdAt,
      },
    });
    created++;
  }

  console.log(`Backfill complete. created: ${created}, skipped: ${skipped}, scanned: ${comments.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
