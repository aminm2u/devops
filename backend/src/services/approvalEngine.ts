import prisma from "../config/database.js";
import { openRequest, settleSubject } from "./approvalRequest.service.js";

/**
 * Procurement's step engine.
 *
 * `RequisitionApproval` remains the source of truth for the chain — order,
 * comments and the per-step audit belong to procurement. But every step is now
 * *also* mirrored into the unified ledger, so a requisition shows up in
 * `/approvals` alongside timesheets and deployments instead of only on the
 * requisition page. `settleSubject` keeps the two in step when a decision is
 * taken from either side.
 */

interface PolicyMatch {
  policyId: number;
  requiredApprovals: number;
  approverIds: number[];
}

/**
 * Find the matching approval policy for a given budget type, division, and amount.
 * Matching priority:
 * 1. Exact match: budgetType + division
 * 2. BudgetType only (division is null in policy)
 * 3. Division only (budgetType is null in policy)
 * 4. Global default (both null)
 */
async function findMatchingPolicy(
  budgetType: string | null,
  division: string
): Promise<any> {
  // Try exact match first
  let policy = await prisma.approvalPolicy.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      budgetType: budgetType,
      division: division,
    },
    include: { tiers: { orderBy: { minAmount: "asc" } }, assignments: true },
  });

  if (policy) return policy;

  // Try budgetType only
  if (budgetType) {
    policy = await prisma.approvalPolicy.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        budgetType: budgetType,
        division: null,
      },
      include: { tiers: { orderBy: { minAmount: "asc" } }, assignments: true },
    });
    if (policy) return policy;
  }

  // Try division only
  policy = await prisma.approvalPolicy.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      budgetType: null,
      division: division,
    },
    include: { tiers: { orderBy: { minAmount: "asc" } }, assignments: true },
  });

  if (policy) return policy;

  // Fall back to global default
  policy = await prisma.approvalPolicy.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      budgetType: null,
      division: null,
    },
    include: { tiers: { orderBy: { minAmount: "asc" } }, assignments: true },
  });

  return policy;
}

/**
 * Evaluate which approval policy applies and return the required approvers.
 */
export async function evaluateApproval(
  budgetType: string | null,
  division: string,
  totalAmount: number
): Promise<PolicyMatch | null> {
  const policy = await findMatchingPolicy(budgetType, division);

  if (!policy) {
    // No policy found — default to single approval
    return null;
  }

  // Find the matching tier
  const tier = policy.tiers.find(
    (t: any) =>
      totalAmount >= Number(t.minAmount) && totalAmount <= Number(t.maxAmount)
  );

  if (!tier) {
    // Amount exceeds all tiers — use the highest tier's required approvals
    const highestTier = policy.tiers[policy.tiers.length - 1];
    if (highestTier && totalAmount > Number(highestTier.maxAmount)) {
      const approvers = policy.assignments
        .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
        .slice(0, highestTier.requiredApprovals)
        .map((a: any) => a.userId);

      return {
        policyId: policy.id,
        requiredApprovals: highestTier.requiredApprovals,
        approverIds: approvers,
      };
    }
    return null;
  }

  const approvers = policy.assignments
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    .slice(0, tier.requiredApprovals)
    .map((a: any) => a.userId);

  return {
    policyId: policy.id,
    requiredApprovals: tier.requiredApprovals,
    approverIds: approvers,
  };
}

/**
 * Create the approval chain records for a requisition.
 */
export async function createApprovalChain(
  requisitionId: number,
  budgetType: string | null,
  division: string,
  totalAmount: number
): Promise<boolean> {
  const match = await evaluateApproval(budgetType, division, totalAmount);

  if (!match || match.approverIds.length === 0) {
    // No policy or no approvers — auto-approve
    return false;
  }

  // Create approval records
  await prisma.requisitionApproval.createMany({
    data: match.approverIds.map((userId, index) => ({
      requisitionId,
      approverId: userId,
      status: "pending",
      order: index + 1,
    })),
  });

  // Mirror the first step into the unified ledger so it shows up in
  // `/approvals`. Later steps are opened as the chain advances — a row here for
  // an approver who is not yet actionable would put work in their queue that
  // they cannot legally decide.
  const form = await prisma.requisitionForm.findUnique({
    where: { id: requisitionId },
    select: { totalEstimatedCost: true, createdByUserId: true },
  });
  const first = match.approverIds[0];
  // `createdByUserId` is nullable on legacy rows; without a requester there is
  // nobody to notify, so the ledger row is skipped rather than faked.
  if (first && form?.createdByUserId) {
    await openRequest({
      module: "requisition",
      subjectType: "RequisitionForm",
      subjectId: requisitionId,
      title: `Requisition #${requisitionId} — ${Number(
        form.totalEstimatedCost ?? totalAmount
      ).toFixed(2)}`,
      requesterId: form.createdByUserId,
      approverId: first,
      link: "/procurement/requisitions/manage",
      metadata: { order: 1, policyId: match.policyId },
    });
  }

  return true;
}

/**
 * Process an individual approval step.
 */
export async function processApprovalStep(
  requisitionId: number,
  approverId: number,
  action: "approved" | "rejected",
  comments?: string
): Promise<{ requisitionStatus: string; isComplete: boolean }> {
  const approval = await prisma.requisitionApproval.findFirst({
    where: { requisitionId, approverId, status: "pending" },
  });

  if (!approval) {
    throw new Error("No pending approval found for this approver");
  }

  // Update this approval record
  await prisma.requisitionApproval.update({
    where: { id: approval.id },
    data: {
      status: action,
      comments: comments || null,
      respondedAt: new Date(),
    },
  });

  if (action === "rejected") {
    // Cancel all remaining pending approvals
    await prisma.requisitionApproval.updateMany({
      where: { requisitionId, status: "pending" },
      data: { status: "cancelled" },
    });

    // Update requisition status
    await prisma.requisitionForm.update({
      where: { id: requisitionId },
      data: {
        status: "rejected",
        metadata: comments
          ? { rejectionReason: comments }
          : undefined,
      },
    });

    // A rejection ends the chain, so every open ledger row for this requisition
    // closes — including steps that had not been reached yet.
    await settleSubject({
      subjectType: "RequisitionForm",
      subjectId: requisitionId,
      status: "rejected",
      comment: comments ?? null,
    });

    return { requisitionStatus: "rejected", isComplete: true };
  }

  // Check if all required approvals are done
  const allApprovals = await prisma.requisitionApproval.findMany({
    where: { requisitionId },
    orderBy: { order: "asc" },
  });

  const allApproved = allApprovals.every((a) => a.status === "approved");

  if (allApproved) {
    // Get the requisition to check budget impact
    const requisition = await prisma.requisitionForm.findUnique({
      where: { id: requisitionId },
    });

    await prisma.requisitionForm.update({
      where: { id: requisitionId },
      data: {
        status: "approved",
        approvedByName: "Approved by chain",
        approvedByDate: new Date(),
      },
    });

    // Update budget utilized if linked
    if (requisition?.budgetItemId) {
      await prisma.budgetItem.update({
        where: { id: requisition.budgetItemId },
        data: {
          utilizedBudget: { increment: requisition.totalEstimatedCost },
        },
      });
    }

    await settleSubject({
      subjectType: "RequisitionForm",
      subjectId: requisitionId,
      status: "approved",
    });

    return { requisitionStatus: "approved", isComplete: true };
  }

  // This approver has decided but the chain continues: close *their* row and
  // open the next one, so the item moves through the inbox instead of staying
  // with someone who is already done.
  await prisma.approvalRequest.updateMany({
    where: {
      subjectType: "RequisitionForm",
      subjectId: requisitionId,
      approverId,
      status: "pending",
    },
    data: { status: "approved", comment: comments ?? null, decidedAt: new Date() },
  });

  const next = allApprovals.find((a) => a.status === "pending");
  if (next) {
    const requisition = await prisma.requisitionForm.findUnique({
      where: { id: requisitionId },
      select: { createdByUserId: true, totalEstimatedCost: true },
    });
    if (requisition?.createdByUserId) {
      await openRequest({
        module: "requisition",
        subjectType: "RequisitionForm",
        subjectId: requisitionId,
        title: `Requisition #${requisitionId} — ${Number(
          requisition.totalEstimatedCost ?? 0
        ).toFixed(2)}`,
        requesterId: requisition.createdByUserId,
        approverId: next.approverId,
        link: "/procurement/requisitions/manage",
        metadata: { order: next.order },
      });
    }
  }

  return { requisitionStatus: "under_review", isComplete: false };
}
