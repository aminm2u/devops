import prisma from "../config/database.js";

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

    return { requisitionStatus: "rejected", isComplete: true };
  }

  // Check if all required approvals are done
  const allApprovals = await prisma.requisitionApproval.findMany({
    where: { requisitionId },
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

    return { requisitionStatus: "approved", isComplete: true };
  }

  return { requisitionStatus: "under_review", isComplete: false };
}
