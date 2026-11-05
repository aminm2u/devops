import prisma from "../config/database.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { scopeContext, inTeamScope } from "../rbac/authorize.js";
import { MODEL_USER, type ResolvedAccess } from "../rbac/effective.js";

/**
 * Team scope, in one place.
 *
 * A **role** answers *what may you do*; a **team** answers *to which records*.
 * Keeping them separate means one `devops-engineer` role serves every team,
 * and a move between teams changes a person's reach without touching access.
 *
 * Two operations cover every route that needs it:
 *   - `resolveTeamId`   — which team does this new record belong to?
 *   - `assertRecordInScope` — may this user act on this existing record?
 *
 * Both default to "unassigned": a record with `teamId = null` predates teams
 * and stays visible to everyone holding the capability, so enabling scope
 * never hides existing data.
 */

/** The team a new record should be filed under. */
export async function resolveTeamId(
  access: ResolvedAccess,
  requestedTeamId?: number | null
): Promise<number | null> {
  if (requestedTeamId != null) {
    const team = await prisma.team.findFirst({
      where: { id: requestedTeamId, isActive: true },
      select: { id: true },
    });
    if (!team) throw new NotFoundError("Team not found");

    // Filing a record into a team you do not belong to would put it beyond
    // your own reach the moment it is saved.
    if (!access.isSuperAdmin && !access.teamIds.includes(requestedTeamId)) {
      throw new ForbiddenError("You can only file records under a team you belong to");
    }
    return requestedTeamId;
  }

  // No explicit choice: fall back to the person's only team when that is
  // unambiguous. Two or more teams means we genuinely cannot guess.
  if (access.teamIds.length === 1) return access.teamIds[0];
  return null;
}

/**
 * Throw unless the record is inside the caller's team scope.
 *
 * Called on single-record routes (update, delete, status change) where the
 * listing filter does not apply.
 */
export function assertRecordInScope(
  access: ResolvedAccess,
  teamId: number | null | undefined
): void {
  if (!inTeamScope(scopeContext(access), teamId)) {
    throw new ForbiddenError("This record belongs to another team");
  }
}

/** Every active member of a team, with their leadership role. */
export async function teamMembers(teamId: number) {
  return prisma.teamMember.findMany({
    where: { teamId, isActive: true },
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
    orderBy: [{ teamRole: "asc" }, { joinedAt: "asc" }],
  });
}

/**
 * Who should approve an action on a team-owned record.
 *
 * The same "first non-self candidate wins" shape the timesheet resolver uses,
 * so approvers behave identically across modules:
 *
 *   1. the team's lead
 *   2. the team's assistant lead (the lead is the requester, or there is none)
 *   3. a global holder of the approval capability (`devops-team-lead`)
 *   4. a super administrator
 *
 * Returns `null` when the chain is exhausted — callers decide whether that is
 * an error or simply "no approval required".
 */
export async function resolveTeamApprover(params: {
  teamId: number | null;
  requesterId: number;
  /** Permission a global approver must hold, e.g. `devops.deployment.approve`. */
  approvalPermission: string;
}): Promise<{ approverId: number; via: string } | null> {
  const { teamId, requesterId, approvalPermission } = params;

  const notSelf = (id: number) => id !== requesterId;

  if (teamId != null) {
    const members = await prisma.teamMember.findMany({
      where: { teamId, isActive: true },
      select: { userId: true, teamRole: true },
    });

    const lead = members.find((m) => m.teamRole === "lead" && notSelf(m.userId));
    if (lead) return { approverId: lead.userId, via: "team lead" };

    const assistant = members.find(
      (m) => m.teamRole === "assistant_lead" && notSelf(m.userId)
    );
    if (assistant) return { approverId: assistant.userId, via: "assistant team lead" };
  }

  // Global fallback: anyone holding the approval capability at `all` scope.
  // Resolving through role grants keeps a custom role working without code.
  const holders = await globalApprovers(approvalPermission);
  const global = holders.find(notSelf);
  if (global) return { approverId: global, via: "DevOps lead" };

  const owners = await superAdmins();
  const owner = owners.find(notSelf);
  if (owner) return { approverId: owner, via: "super administrator" };

  return null;
}

/** Users whose roles grant `permission` at `all` scope (super admin excluded). */
async function globalApprovers(permission: string): Promise<number[]> {
  const rows = await prisma.roleHasPermission.findMany({
    where: { permission: { name: permission }, scope: "all" },
    select: { role: { select: { modelHasRoles: { select: { modelId: true } } } } },
  });

  const ids = new Set<number>();
  for (const row of rows) {
    for (const holder of row.role.modelHasRoles) ids.add(holder.modelId);
  }
  return [...ids];
}

/** The platform owner — the last link in every escalation chain. */
async function superAdmins(): Promise<number[]> {
  const rows = await prisma.modelHasRole.findMany({
    where: { role: { name: "super-admin" }, modelType: MODEL_USER },
    select: { modelId: true },
  });
  return rows.map((row) => row.modelId);
}
