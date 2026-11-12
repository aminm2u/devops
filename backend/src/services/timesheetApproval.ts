import prisma from "../config/database.js";

export interface ApproverResolution {
  approverId: number | null;
  approvalRuleId: number | null;
  /** 1-based step the entry waits on. Always 1 for single-level flows. */
  approvalStep: number;
  /**
   * Snapshot of the full chain persisted on the entry at submit time, so the
   * flow keeps working even if the rule is edited or deleted afterwards.
   * null for single-approver flows.
   */
  approvalChain: { step: number; userId: number; name: string }[] | null;
}

export interface ChainSnapshotEntry {
  step: number;
  userId: number;
  name: string;
  decidedAt?: string;
  decidedBy?: number;
}

/**
 * Resolve the approval flow for a timesheet entry at submit time.
 *
 * Rules are evaluated in sortOrder (first match wins). A rule matches when its
 * categoryValue / projectId wildcards pass AND the submitter is one of its
 * `appliesTo` users — a rule with no appliesTo rows applies to everyone.
 *
 * The approver flow comes from the rule's ordered `approvers` chain
 * (multi-level). Legacy/single approver types (project_role, direct_manager,
 * app_role) still resolve a single approver. Self-approval is never allowed —
 * the submitter is skipped wherever they appear in the chain.
 *
 * If nothing matches (or only the submitter themselves would approve), we fall
 * back to: Project.ownerId -> submitter's directManagerId -> any super-admin.
 */
export async function resolveTimesheetApprover(params: {
  userId: number;
  categoryValue: string;
  projectId: number | null;
}): Promise<ApproverResolution> {
  const { userId, categoryValue, projectId } = params;

  const rules = await prisma.timesheetApprovalRule.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      appliesTo: true,
      approvers: {
        orderBy: { step: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  for (const rule of rules) {
    if (rule.categoryValue && rule.categoryValue !== categoryValue) continue;
    if (rule.projectId && rule.projectId !== projectId) continue;
    // `appliesTo` scoping: empty list = wildcard (everyone).
    if (rule.appliesTo.length > 0 && !rule.appliesTo.some((a) => a.userId === userId)) {
      continue;
    }

    // Explicit ordered chain (the multi-level user picker).
    if (rule.approvers.length > 0) {
      const chain = dedupeChain(
        rule.approvers
          .slice()
          .sort((a, b) => a.step - b.step)
          .map((a) => ({ step: a.step, userId: a.userId, name: a.user.name }))
      );
      const first = chain.find((c) => c.userId !== userId);
      if (first) {
        return {
          approverId: first.userId,
          approvalRuleId: rule.id,
          approvalStep: first.step,
          approvalChain: chain.filter((c) => c.userId !== userId),
        };
      }
      // Chain existed but only contained the submitter — keep looking.
      continue;
    }

    // Legacy / derived approver types resolve a single approver.
    const candidates = await resolveRuleApprovers(rule, userId, projectId);
    const approverId = candidates.find((id) => id !== userId);
    if (approverId) {
      return { approverId, approvalRuleId: rule.id, approvalStep: 1, approvalChain: null };
    }
  }

  const fallback = await fallbackApprover(userId, projectId);
  return { ...fallback, approvalStep: 1, approvalChain: null };
}

/**
 * Mark a chain step as decided and advance the entry to the next pending
 * approver, returning the data the caller should write onto the entry.
 *
 * Mutating the snapshot (not the live rule) is what makes the flow survive
 * later edits to the rule — a submission already in flight must not change
 * who has to approve it.
 */
export function advanceChain(
  chain: ChainSnapshotEntry[],
  currentStep: number,
  actorId: number
): { approverId: number | null; approvalStep: number; approvalChain: ChainSnapshotEntry[] } {
  const next = chain.map((c) =>
    c.step === currentStep
      ? { ...c, decidedAt: new Date().toISOString(), decidedBy: actorId }
      : c
  );

  const remaining = next
    .filter((c) => !c.decidedAt && c.userId !== actorId)
    .sort((a, b) => a.step - b.step);

  if (remaining.length === 0) {
    return { approverId: null, approvalStep: currentStep, approvalChain: next };
  }

  const nextStep = remaining[0];
  return {
    approverId: nextStep.userId,
    approvalStep: nextStep.step,
    approvalChain: next,
  };
}

function dedupeChain(
  chain: { step: number; userId: number; name: string }[]
): { step: number; userId: number; name: string }[] {
  const seen = new Set<number>();
  const out: { step: number; userId: number; name: string }[] = [];
  for (const entry of chain) {
    if (seen.has(entry.userId)) continue;
    seen.add(entry.userId);
    out.push(entry);
  }
  return out;
}

async function resolveRuleApprovers(
  rule: {
    id: number;
    approverType: string;
    projectRoleId: number | null;
    appRole: string | null;
  },
  userId: number,
  projectId: number | null
): Promise<number[]> {
  switch (rule.approverType) {
    case "project_role": {
      if (!projectId || !rule.projectRoleId) return [];
      const assignments = await prisma.teamAssignment.findMany({
        where: {
          projectId,
          projectRoleId: rule.projectRoleId,
          isActive: true,
          NOT: { userId },
        },
        select: { userId: true },
      });
      return assignments.map((a) => a.userId);
    }
    case "direct_manager": {
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { directManagerId: true },
      });
      return owner?.directManagerId && owner.directManagerId !== userId
        ? [owner.directManagerId]
        : [];
    }
    case "app_role": {
      if (!rule.appRole) return [];
      const holders = await prisma.modelHasRole.findMany({
        where: {
          role: { name: rule.appRole },
          modelType: "App\\Models\\User",
          NOT: { modelId: userId },
        },
        select: { modelId: true },
      });
      return holders.map((h) => h.modelId);
    }
    default:
      return [];
  }
}

async function fallbackApprover(
  userId: number,
  projectId: number | null
): Promise<{ approverId: number | null; approvalRuleId: number | null }> {
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (project && project.ownerId !== userId) {
      return { approverId: project.ownerId, approvalRuleId: null };
    }
  }

  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { directManagerId: true },
  });
  if (owner?.directManagerId && owner.directManagerId !== userId) {
    return { approverId: owner.directManagerId, approvalRuleId: null };
  }

  const superAdmin = await prisma.modelHasRole.findFirst({
    where: {
      role: { name: "super-admin" },
      modelType: "App\\Models\\User",
      NOT: { modelId: userId },
    },
    select: { modelId: true },
    orderBy: { modelId: "asc" },
  });
  return { approverId: superAdmin?.modelId ?? null, approvalRuleId: null };
}
