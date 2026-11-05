/**
 * One-time (idempotent) backfill for the unified approval ledger.
 *
 * Phase 6 moved every module onto `approval_requests`, but each module only
 * started writing there at submit time. Anything already waiting for a
 * decision before that deploy has no ledger row, so it is invisible in
 * `/approvals` — the approver would have to remember to visit the module page.
 *
 * Writes pending rows for:
 *   - `time_entries` with status `submitted` and a named approver
 *   - the *earliest* pending `requisition_approvals` step per requisition
 *     (later steps are not actionable yet and must not sit in someone's queue)
 *
 * Deliberately does not call `openRequest`: that helper notifies the approver,
 * and replaying a months-old backlog as fresh notifications is noise. The
 * record is what is being repaired, not the inbox alert.
 *
 * A row is only created when no ledger row exists for
 * (subjectType, subjectId, approverId) — a decided row is left alone rather
 * than being reopened here.
 *
 * Run with:  npx tsx scripts/backfill-approval-requests.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fmtDate(value: Date): string {
  return value.toISOString().substring(0, 10);
}

async function exists(subjectType: string, subjectId: number, approverId: number) {
  const found = await prisma.approvalRequest.findFirst({
    where: { subjectType, subjectId, approverId },
    select: { id: true },
  });
  return found !== null;
}

async function backfillTimeEntries() {
  const entries = await prisma.timeEntry.findMany({
    where: { status: "submitted", approverId: { not: null } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { workDate: "asc" },
  });

  let created = 0;
  let existing = 0;

  for (const entry of entries) {
    const approverId = entry.approverId!;
    // Nobody can approve their own work, so a self-assigned approver is a data
    // error; leaving it out of the ledger keeps the invariant the decide path
    // enforces.
    if (approverId === entry.userId) continue;
    if (await exists("TimeEntry", entry.id, approverId)) {
      existing++;
      continue;
    }

    await prisma.approvalRequest.create({
      data: {
        module: "timesheet",
        subjectType: "TimeEntry",
        subjectId: entry.id,
        title: `${entry.user.name} — ${Number(entry.hours)}h on ${fmtDate(entry.workDate)}`,
        requesterId: entry.userId,
        approverId,
        metadata: { workDate: fmtDate(entry.workDate), hours: Number(entry.hours) },
      },
    });
    created++;
  }

  console.log(`[timesheet] created ${created}, already present ${existing}, scanned ${entries.length}`);
}

async function backfillRequisitions() {
  const forms = await prisma.requisitionForm.findMany({
    where: { status: { in: ["submitted", "under_review"] }, deletedAt: null },
    select: {
      id: true,
      totalEstimatedCost: true,
      createdByUserId: true,
      approvals: { where: { status: "pending" }, orderBy: { order: "asc" } },
    },
  });

  let created = 0;
  let existing = 0;
  let unresolved = 0;

  for (const form of forms) {
    const step = form.approvals[0]; // only the actionable step
    if (!step) continue;
    if (!form.createdByUserId) {
      // No requester means no one to notify and nothing to attribute the
      // decision to; the requisition itself still works from its own page.
      unresolved++;
      continue;
    }
    if (await exists("RequisitionForm", form.id, step.approverId)) {
      existing++;
      continue;
    }

    await prisma.approvalRequest.create({
      data: {
        module: "requisition",
        subjectType: "RequisitionForm",
        subjectId: form.id,
        title: `Requisition #${form.id} — ${Number(form.totalEstimatedCost).toFixed(2)}`,
        requesterId: form.createdByUserId,
        approverId: step.approverId,
        metadata: { order: step.order },
      },
    });
    created++;
  }

  console.log(
    `[requisition] created ${created}, already present ${existing}, ` +
      `no requester ${unresolved}, scanned ${forms.length}`
  );
}

async function main() {
  await backfillTimeEntries();
  await backfillRequisitions();
  const pending = await prisma.approvalRequest.count({ where: { status: "pending" } });
  console.log(`[ledger] ${pending} pending request(s) now in the inbox`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
