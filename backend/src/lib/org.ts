import prisma from "../config/database.js";
import { AppError } from "./errors.js";
import { MODEL_USER } from "../rbac/effective.js";

/**
 * The reporting graph.
 *
 * `users.direct_manager_id` is the only edge in the org chart: every person has
 * at most one manager, so it is a forest of trees. Both the user directory and
 * the org chart write that edge, and both must refuse a move that would close a
 * loop — otherwise every ancestor walk (approvals, chain-to-CEO, chart render)
 * stops terminating.
 */

/** Throws when making `managerId` the manager of `userId` would create a cycle. */
export async function assertNoManagerCycle(
  userId: number,
  managerId: number | null
): Promise<void> {
  if (managerId === null) return;
  if (managerId === userId) {
    throw new AppError(422, "A user cannot report to themselves");
  }

  const all = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, directManagerId: true },
  });
  const parent = new Map<number, number | null>();
  for (const user of all) parent.set(user.id, user.directManagerId);

  let cursor: number | null = managerId;
  const seen = new Set<number>();
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === userId) {
      throw new AppError(422, "That reporting line would create a cycle");
    }
    seen.add(cursor);
    cursor = parent.get(cursor) ?? null;
  }
}

/**
 * Everyone above `userId`, nearest first.
 *
 * Walks the same edge as `assertNoManagerCycle` and stops on a repeat, so a
 * cycle that somehow predates the guard still renders instead of hanging.
 */
export async function managerChain(
  userId: number
): Promise<{ id: number; publicId: string | null; name: string; email: string }[]> {
  const chain: { id: number; publicId: string | null; name: string; email: string }[] = [];
  const seen = new Set<number>([userId]);

  let cursor = (
    await prisma.user.findUnique({
      where: { id: userId },
      select: { directManagerId: true },
    })
  )?.directManagerId;

  while (cursor != null && !seen.has(cursor)) {
    seen.add(cursor);
    const manager = await prisma.user.findUnique({
      where: { id: cursor },
      select: { id: true, publicId: true, name: true, email: true, directManagerId: true },
    });
    if (!manager) break;
    chain.push({
      id: manager.id,
      publicId: manager.publicId,
      name: manager.name,
      email: manager.email,
    });
    cursor = manager.directManagerId;
  }

  return chain;
}

/**
 * Department nesting has the same hazard, so it gets the same treatment.
 * A department's parent chain must not reach the department itself.
 */
export async function assertNoDepartmentCycle(
  departmentId: number,
  parentId: number | null
): Promise<void> {
  if (parentId === null) return;
  if (parentId === departmentId) {
    throw new AppError(422, "A department cannot be its own parent");
  }

  const all = await prisma.department.findMany({
    select: { id: true, parentId: true },
  });
  const parent = new Map<number, number | null>();
  for (const dept of all) parent.set(dept.id, dept.parentId);

  let cursor: number | null = parentId;
  const seen = new Set<number>();
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === departmentId) {
      throw new AppError(422, "That parent would create a cycle");
    }
    seen.add(cursor);
    cursor = parent.get(cursor) ?? null;
  }
}

export interface OrgNode {
  id: number;
  name: string;
  email: string;
  employeeId: string | null;
  isActive: boolean;
  departmentId: number | null;
  departmentName: string | null;
  departmentCode: string | null;
  positionName: string | null;
  /** Raw edge — set even when the manager is inactive and thus absent from `nodes`. */
  directManagerId: number | null;
  roles: string[];
  reportIds: number[];
}

export interface OrgDepartment {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  managerId: number | null;
  managerName: string | null;
}

export interface OrgTree {
  nodes: OrgNode[];
  departments: OrgDepartment[];
  /** People with no manager and no department — the chart's "unplaced" tray. */
  rootIds: number[];
}

/**
 * The whole org as one flat, renderable payload.
 *
 * Flat rather than nested: the chart needs to re-parent, collapse and pan
 * individual nodes without rebuilding a deep tree, and a flat map lets the
 * client do that in constant time. `reportIds` is the only structure it needs.
 *
 * The platform owner is left out: that account is a system administrator
 * rather than an employee in the reporting structure, and it already cannot
 * report to anyone (`PUT /org/users/:id/manager` refuses). Left in, it would
 * sit alone as a second, unrelated peak at the top of the canvas. Anyone whose
 * `directManagerId` points at it is re-rooted by the `byId.has` check below,
 * so no edge is left dangling.
 */
export async function loadOrgTree(): Promise<OrgTree> {
  const [allUsers, departments, roleRows] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        employeeId: true,
        isActive: true,
        departmentId: true,
        directManagerId: true,
        department: { select: { name: true, code: true } },
        position: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
        managerId: true,
        manager: { select: { name: true } },
      },
    }),
    // `model_has_roles` is polymorphic, so there is no `User.modelHasRoles`
    // relation to include — it is fetched once for the page instead.
    prisma.modelHasRole.findMany({
      where: { modelType: MODEL_USER },
      select: { modelId: true, role: { select: { name: true } } },
    }),
  ]);

  // Derived from the rows already fetched rather than from `superAdminUserIds`,
  // which would cost a second round trip for the same answer.
  const hidden = new Set(
    roleRows.filter((row) => row.role.name === "super-admin").map((row) => row.modelId)
  );
  const users = allUsers.filter((user) => !hidden.has(user.id));

  const rolesByUser = new Map<number, string[]>();
  for (const row of roleRows) {
    const bucket = rolesByUser.get(row.modelId) ?? [];
    bucket.push(row.role.name);
    rolesByUser.set(row.modelId, bucket);
  }

  const nodes: OrgNode[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    isActive: user.isActive,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
    departmentCode: user.department?.code ?? null,
    positionName: user.position?.name ?? null,
    directManagerId: user.directManagerId,
    roles: rolesByUser.get(user.id) ?? [],
    reportIds: [],
  }));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const managerOf = new Map<number, number | null>(
    users.map((user) => [user.id, user.directManagerId])
  );

  for (const node of nodes) {
    const managerId = managerOf.get(node.id) ?? null;
    // Only link to managers that are themselves in the tree; an inactive
    // manager would otherwise produce a dangling edge the chart cannot draw.
    if (managerId != null && byId.has(managerId)) {
      byId.get(managerId)!.reportIds.push(node.id);
    }
  }

  const rootIds = nodes
    .filter((node) => {
      const managerId = managerOf.get(node.id) ?? null;
      return managerId == null || !byId.has(managerId);
    })
    .map((node) => node.id);

  return {
    nodes,
    departments: departments.map((dept) => ({
      id: dept.id,
      code: dept.code,
      name: dept.name,
      parentId: dept.parentId,
      managerId: dept.managerId,
      managerName: dept.manager?.name ?? null,
    })),
    rootIds,
  };
}
