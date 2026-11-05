import prisma from "../config/database.js";
import { AppError, NotFoundError } from "../lib/errors.js";
import { getIO } from "../lib/socket.js";
import { resolveTeamApprover } from "../lib/teamScope.js";
import { createNotification } from "./notification.service.js";
// Imported for the dispatch step below. `approvalEngine` imports this module
// back, which is safe because both sides only call each other inside function
// bodies and `export async function` declarations are hoisted.
import { processApprovalStep } from "./approvalEngine.js";

/**
 * The unified approval ledger.
 *
 * One row per (subject, approver). Modules keep their own business rules — this
 * service only answers "who must decide this, and what happened when they did".
 * The inbox in Phase 6 reads the same rows, so a decision taken from a module
 * page and one taken from `/approvals` cannot disagree.
 */

export interface OpenRequestInput {
  module: string;
  subjectType: string;
  subjectId: number;
  title: string;
  requesterId: number;
  /** Pre-resolved approver. When omitted, the team chain decides. */
  approverId?: number | null;
  /** Team whose leadership should approve. */
  teamId?: number | null;
  /** Permission a global fallback approver must hold. */
  approvalPermission?: string;
  /** Where the notification should link, e.g. `/deployments`. */
  link?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OpenedRequest {
  id: number;
  approverId: number;
  via: string;
}

/**
 * Record a pending decision and tell the approver about it.
 *
 * Returns `null` when nobody can be resolved — the caller then treats the
 * submission as auto-approved rather than blocking on an approver who will
 * never arrive (for example a one-person team approving its own work).
 */
export async function openRequest(input: OpenRequestInput): Promise<OpenedRequest | null> {
  let approverId = input.approverId ?? null;
  let via = "explicit";

  if (approverId == null) {
    const resolved = await resolveTeamApprover({
      teamId: input.teamId ?? null,
      requesterId: input.requesterId,
      approvalPermission: input.approvalPermission ?? "approval.request.decide",
    });
    if (!resolved) return null;
    approverId = resolved.approverId;
    via = resolved.via;
  }

  // The unique key is (module, subjectType, subjectId, approverId) — a
  // resubmission after a rejection updates the existing row rather than
  // stacking duplicates.
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      module: input.module,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      approverId,
    },
  });

  const request = existing
    ? await prisma.approvalRequest.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          requesterId: input.requesterId,
          status: "pending",
          comment: null,
          decidedAt: null,
          metadata: (input.metadata ?? {}) as any,
        },
      })
    : await prisma.approvalRequest.create({
        data: {
          module: input.module,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          title: input.title,
          requesterId: input.requesterId,
          approverId,
          metadata: (input.metadata ?? {}) as any,
        },
      });

  await createNotification(
    approverId,
    "approval_requested",
    "Approval needed",
    input.title,
    input.link ?? undefined
  );

  return { id: request.id, approverId, via };
}

/**
 * Close a request and hand the decision back to the module that raised it.
 *
 * The ledger is not the record of truth — `time_entries`, `deployments` and
 * requisitions are. Approving from `/approvals` therefore has to change the
 * underlying row, or the inbox would report success while the timesheet still
 * said `submitted`. `applyDecision` owns that mapping; modules that have no
 * handler here are closed in the ledger only, which is the correct behaviour
 * for a subject whose own page is still the place it gets decided.
 *
 * Only the assigned approver may decide, and only while it is still pending —
 * two people opening the same inbox must not both succeed.
 */
export async function decideRequest(params: {
  requestId: number;
  actorId: number;
  action: "approve" | "reject";
  comment?: string | null;
}): Promise<{
  module: string;
  subjectType: string;
  subjectId: number;
  status: string;
  subjectStatus: string;
}> {
  const { requestId, actorId, action, comment } = params;

  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Approval request not found");
  if (request.approverId !== actorId) {
    throw new AppError(403, "This request is waiting on someone else");
  }
  if (request.status !== "pending") {
    throw new AppError(409, `This request was already ${request.status}`);
  }

  const status = action === "approve" ? "approved" : "rejected";

  // The module decides first: if it refuses (status moved on, a step engine
  // says no), the ledger row stays pending and the caller gets the reason.
  const { subjectStatus } = await applyDecision({
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    approverId: actorId,
    action,
    comment: comment ?? null,
  });

  // A requisition with a multi-step chain reports `under_review` here even
  // though this approver said yes. Telling the requester "Approved" at that
  // point would be a lie they might act on.
  const settled = status === "approved" && subjectStatus === "approved";

  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { status, comment: comment ?? null, decidedAt: new Date() },
  });

  const title = settled
    ? "Approved"
    : status === "rejected"
      ? "Rejected"
      : "Approved — next approver";
  const body = settled || status === "rejected"
    ? comment
      ? `${request.title} — ${comment}`
      : request.title
    : `${request.title} — ${comment ? `${comment} · ` : ""}still awaiting the next approver`;

  await createNotification(
    request.requesterId,
    status === "approved" ? "approval_approved" : "approval_rejected",
    title,
    body,
    moduleLink(request.module)
  );

  return {
    module: request.module,
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    status,
    subjectStatus,
  };
}

/** Where a requester should land when told about a decision. */
function moduleLink(module: string): string {
  switch (module) {
    case "timesheet":
      return "/my-work/timesheet";
    case "requisition":
      return "/procurement/requisitions";
    case "purchase-order":
      return "/procurement/purchase-orders";
    case "payment":
      return "/procurement/payments";
    case "deployment":
      return "/devops/deployments";
    default:
      return "/approvals";
  }
}

/**
 * Write an inbox decision onto the module's own record.
 *
 * Deliberately narrow: only subjects whose pending state *is* the decision are
 * handled. A requisition's chain has its own step engine, so it closes its
 * ledger rows through `settleSubject` and, for a single-step approval, falls
 * back to the same update this does.
 *
 * Returns the subject's status *after* the write, because a multi-step chain
 * can accept this approval and still be `under_review` — the caller needs that
 * to word the notification honestly.
 */
async function applyDecision(params: {
  subjectType: string;
  subjectId: number;
  approverId: number;
  action: "approve" | "reject";
  comment: string | null;
}): Promise<{ subjectStatus: string }> {
  const { subjectType, subjectId, approverId, action, comment } = params;
  const approved = action === "approve";

  switch (subjectType) {
    case "TimeEntry": {
      const entry = await prisma.timeEntry.findFirst({
        where: { id: subjectId, deletedAt: null },
        include: {
          user: { select: { id: true, name: true, email: true } },
          approver: { select: { id: true, name: true, email: true } },
          task: { select: { id: true, title: true, projectId: true } },
          subtask: { select: { id: true, title: true, status: true } },
          project: { select: { id: true, name: true } },
        },
      });
      if (!entry) throw new NotFoundError("Time entry not found");
      if (entry.status !== "submitted") {
        throw new AppError(409, `This entry is already ${entry.status}`);
      }
      // Separation of duties holds here too: the approver may not sign off
      // their own work, even via the inbox.
      if (entry.userId === approverId) {
        throw new AppError(403, "You cannot approve your own time entry");
      }

      const updated = await prisma.timeEntry.update({
        where: { id: subjectId },
        data: {
          status: approved ? "approved" : "rejected",
          decidedAt: new Date(),
          ...(approved ? {} : { rejectReason: comment ?? "Rejected" }),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          approver: { select: { id: true, name: true, email: true } },
          task: { select: { id: true, title: true, projectId: true } },
          subtask: { select: { id: true, title: true, status: true } },
          project: { select: { id: true, name: true } },
        },
      });

      // The same event the module's own approve/reject handlers emit, so an
      // open timesheet page updates without a refresh regardless of where the
      // decision was taken.
      try {
        getIO().emit("timesheet-entry-updated", {
          entry: {
            ...updated,
            hours: updated.hours != null ? Number(updated.hours) : 0,
            workDate: updated.workDate.toISOString().substring(0, 10),
          },
        });
      } catch {
        /* socket not initialised (scripts, tests) — the record is already saved */
      }
      return { subjectStatus: approved ? "approved" : "rejected" };
    }

    case "Deployment": {
      const deployment = await prisma.deployment.findUnique({ where: { id: subjectId } });
      if (!deployment) throw new NotFoundError("Deployment not found");
      if (deployment.status !== "pending") {
        throw new AppError(409, `This deployment is already ${deployment.status}`);
      }

      // Approval releases the deployment; rejection leaves it rolled back so
      // the record still explains why the release never shipped.
      await prisma.deployment.update({
        where: { id: subjectId },
        data: {
          status: approved ? "in_progress" : "rolled_back",
          ...(approved ? { deployedAt: new Date() } : {}),
        },
      });
      return { subjectStatus: approved ? "in_progress" : "rolled_back" };
    }

    case "Payment": {
      const payment = await prisma.payment.findFirst({
        where: { id: subjectId, deletedAt: null },
      });
      if (!payment) throw new NotFoundError("Payment not found");
      if (payment.status !== "submitted") {
        throw new AppError(409, `This payment is already ${payment.status}`);
      }

      await prisma.payment.update({
        where: { id: subjectId },
        data: approved
          ? { status: "paid", approvedById: approverId, approvedAt: new Date(), paidAt: new Date() }
          : { status: "rejected", approvedById: approverId, approvedAt: new Date() },
      });
      return { subjectStatus: approved ? "paid" : "rejected" };
    }

    case "PurchaseOrder": {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: subjectId, deletedAt: null },
      });
      if (!po) throw new NotFoundError("Purchase order not found");
      if (po.status !== "submitted") {
        throw new AppError(409, `This purchase order is already ${po.status}`);
      }

      await prisma.purchaseOrder.update({
        where: { id: subjectId },
        data: approved
          ? { status: "approved", approvedById: approverId, approvedAt: new Date() }
          : { status: "rejected" },
      });
      return { subjectStatus: approved ? "approved" : "rejected" };
    }

    case "RequisitionForm": {
      // Procurement owns the chain, so the decision goes through its step
      // engine rather than being written straight onto the form — otherwise a
      // two-step policy would be marked fully approved by its first approver.
      // `processApprovalStep` also settles the ledger itself; the caller's
      // follow-up update is a no-op on an already-decided row.
      const pendingStep = await prisma.requisitionApproval.findFirst({
        where: { requisitionId: subjectId, approverId, status: "pending" },
      });
      if (!pendingStep) {
        throw new AppError(409, "This requisition is not waiting on your decision");
      }

      const outcome = await processApprovalStep(
        subjectId,
        approverId,
        approved ? "approved" : "rejected",
        comment ?? undefined
      );
      return { subjectStatus: outcome.requisitionStatus };
    }

    default:
      // No module-side effect (e.g. an enrollment request that only exists in
      // the ledger). Closing the row is the whole decision.
      return { subjectStatus: "approved" };
  }
}

/** Pending requests for one subject, newest first. */
export async function pendingFor(subjectType: string, subjectId: number) {
  return prisma.approvalRequest.findMany({
    where: { subjectType, subjectId, status: "pending" },
    include: { approver: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** True while a subject is still awaiting a decision. */
export async function isPending(subjectType: string, subjectId: number): Promise<boolean> {
  const count = await prisma.approvalRequest.count({
    where: { subjectType, subjectId, status: "pending" },
  });
  return count > 0;
}

/**
 * Close the ledger rows for a subject from outside the inbox.
 *
 * Modules keep their own decision endpoints (approve/reject/recall on a time
 * entry, the procurement step engine). Without this, a decision taken on the
 * module page left a `pending` row behind, so the same item appeared in
 * `/approvals` and could be "decided" a second time on a record that had
 * already moved on. Called from those handlers with the final status.
 *
 * `cancelled` is for a withdrawal (recall), which is neither an approval nor a
 * rejection and must not read as one in the audit trail.
 */
export async function settleSubject(params: {
  subjectType: string;
  subjectId: number;
  status: "approved" | "rejected" | "cancelled";
  comment?: string | null;
}): Promise<number> {
  const { subjectType, subjectId, status, comment } = params;

  const pending = await prisma.approvalRequest.findMany({
    where: { subjectType, subjectId, status: "pending" },
    select: { id: true },
  });
  if (pending.length === 0) return 0;

  await prisma.approvalRequest.updateMany({
    where: { subjectType, subjectId, status: "pending" },
    data: { status, comment: comment ?? null, decidedAt: new Date() },
  });

  return pending.length;
}
