import prisma from "../config/database.js";

export interface ApproverResolution {
  approverId: number | null;
  approvalRuleId: number | null;
}

/**
 * Resolve the approver for a timesheet entry at submit time.
 *
 * Rules are evaluated in sortOrder (first match wins). Each rule matches on
 * categoryValue / projectId wildcards, then resolves a single approver via:
 *   - project_role: members of the entry's project holding that project role
 *   - users: explicit user assignments on the rule
 *   - direct_manager: the entry owner's directManagerId
 *   - app_role: users holding an application role (e.g. "devops-admin")
 *
 * Self-approval is never allowed; if the resolved approver is the entry owner
 * (or nothing resolves), we escalate to the fallback chain:
 *   Project.ownerId -> owner's directManagerId -> any super-admin.
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
    include: { users: true },
  });

  for (const rule of rules) {
    if (rule.categoryValue && rule.categoryValue !== categoryValue) continue;
    if (rule.projectId && rule.projectId !== projectId) continue;

    const candidates = await resolveRuleApprovers(rule, userId, projectId);
    const approverId = candidates.find((id) => id !== userId);
    if (approverId) {
      return { approverId, approvalRuleId: rule.id };
    }
  }

  return fallbackApprover(userId, projectId);
}

async function resolveRuleApprovers(
  rule: {
    id: number;
    approverType: string;
    projectRoleId: number | null;
    appRole: string | null;
    users: { userId: number }[];
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
    case "users":
      return rule.users.map((u) => u.userId).filter((id) => id !== userId);
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
): Promise<ApproverResolution> {
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
