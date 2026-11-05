/**
 * Adds the named test accounts without re-seeding the database.
 *
 * `seed.ts` starts by deleting every row, which is fine on a fresh install and
 * destructive on a database that already holds demo data. This script applies
 * the same changes additively and is safe to run more than once:
 *
 *   npx tsx prisma/add-test-users.ts
 *
 * Every step is an upsert or a guarded create, so a second run is a no-op. The
 * accounts it creates:
 *
 *   azfar@map2u.com.my    IT manager              (department head of IT)
 *   zakaria@map2u.com.my  PMO manager             (department head of PMO)
 *   amin@map2u.com.my     DevOps team lead
 *   aiman@map2u.com.my    DevOps engineer
 *   wafiy@map2u.com.my    Project manager
 *
 * All five sign in with `ChangeMe!2026`, the same credential the super admin
 * uses, so there is one password to remember while testing.
 *
 * Keep this file and the matching block in `seed.ts` in step: a fresh install
 * must produce the same people, teams and reporting lines.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_PRESET_BY_NAME, resolvePresetPermissions } from "../src/rbac/catalog.js";
import { MODEL_USER } from "../src/rbac/effective.js";

const prisma = new PrismaClient();

const PASSWORD = "ChangeMe!2026";
const DEPARTMENT_HEAD_ROLE = "department-head";

interface TestUser {
  name: string;
  email: string;
  employeeId: string;
  departmentCode: string;
  positionName: string;
  positionGrade: number;
  joinDate: string;
  roleName: string;
  /** Email of the direct manager. Resolved after every user exists. */
  managerEmail?: string;
}

const TEST_USERS: TestUser[] = [
  {
    name: "Azfar",
    email: "azfar@map2u.com.my",
    employeeId: "EMP-101",
    departmentCode: "IT",
    positionName: "Department Manager",
    positionGrade: 6,
    joinDate: "2019-02-04",
    roleName: DEPARTMENT_HEAD_ROLE,
  },
  {
    name: "Zakaria",
    email: "zakaria@map2u.com.my",
    employeeId: "EMP-102",
    departmentCode: "PMO",
    positionName: "Department Manager",
    positionGrade: 6,
    joinDate: "2020-07-13",
    roleName: DEPARTMENT_HEAD_ROLE,
    managerEmail: "azfar@map2u.com.my",
  },
  {
    name: "Amin",
    email: "amin@map2u.com.my",
    employeeId: "EMP-103",
    departmentCode: "IT",
    positionName: "Team Lead",
    positionGrade: 5,
    joinDate: "2021-09-06",
    roleName: "devops-team-lead",
    managerEmail: "azfar@map2u.com.my",
  },
  {
    name: "Aiman",
    email: "aiman@map2u.com.my",
    employeeId: "EMP-104",
    departmentCode: "IT",
    positionName: "DevOps Engineer",
    positionGrade: 4,
    joinDate: "2023-01-16",
    roleName: "devops-engineer",
    managerEmail: "amin@map2u.com.my",
  },
  {
    name: "Wafiy",
    email: "wafiy@map2u.com.my",
    employeeId: "EMP-105",
    departmentCode: "PMO",
    positionName: "Project Manager",
    positionGrade: 5,
    joinDate: "2022-03-21",
    roleName: "project-manager-officer",
    managerEmail: "zakaria@map2u.com.my",
  },
];

async function ensureRole(roleName: string) {
  const existing = await prisma.role.findFirst({ where: { name: roleName } });
  if (existing) return existing;

  const preset = ROLE_PRESET_BY_NAME[roleName];
  if (!preset) throw new Error(`Unknown role preset: ${roleName}`);

  const role = await prisma.role.create({
    data: {
      name: preset.name,
      guardName: "web",
      description: preset.description,
      isSystem: preset.isSystem ?? false,
      isAssignable: preset.isAssignable ?? true,
      level: preset.level,
      color: preset.color,
    },
  });

  const permissions = await prisma.permission.findMany({
    where: { name: { in: resolvePresetPermissions(preset).map((grant) => grant.name) } },
    select: { id: true, name: true },
  });
  const idByName = new Map(permissions.map((permission) => [permission.name, permission.id]));

  const rows = resolvePresetPermissions(preset)
    .map((grant) => {
      const permissionId = idByName.get(grant.name);
      return permissionId ? { roleId: role.id, permissionId, scope: grant.scope } : null;
    })
    .filter((row): row is { roleId: number; permissionId: number; scope: string } => row !== null);

  if (rows.length) await prisma.roleHasPermission.createMany({ data: rows, skipDuplicates: true });
  console.log(`  + role ${role.name.padEnd(20)} ${rows.length} permissions`);
  return role;
}

async function ensureDepartment(code: string, name: string, parentCode?: string) {
  const existing = await prisma.department.findUnique({ where: { code } });
  if (existing) return existing;
  const parent = parentCode
    ? await prisma.department.findUnique({ where: { code: parentCode } })
    : null;
  const department = await prisma.department.create({
    data: { code, name, parentId: parent?.id ?? null },
  });
  console.log(`  + department ${code} — ${name}`);
  return department;
}

async function ensurePosition(name: string, gradeLevel: number) {
  const existing = await prisma.position.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.position.create({ data: { name, gradeLevel } });
}

async function main() {
  console.log("Adding test accounts...");

  // ── Role ────────────────────────────────────────────────────────────────
  // A department head sits between a team lead and the HR manager: it sees and
  // approves for its own department but cannot restructure the org.
  const headRole = await ensureRole(DEPARTMENT_HEAD_ROLE);
  console.log(`  role ${headRole.name} level ${headRole.level}`);
  // ── Department + master data ────────────────────────────────────────────
  const deptIT = await prisma.department.findUnique({ where: { code: "IT" } });
  if (!deptIT) throw new Error("Department IT is missing — run the full seed first");
  const deptPMO = await ensureDepartment("PMO", "Project Management Office", "IT");

  // The org chart refuses a department that the division dropdown knows
  // nothing about, so the master data entry has to exist alongside it.
  await prisma.referenceData.upsert({
    where: { group_value: { group: "division", value: "PMO" } },
    create: {
      group: "division",
      value: "PMO",
      label: "Project Management Office",
      sortOrder: 9,
    },
    update: { label: "Project Management Office", isActive: true },
  });

  // ── Users ───────────────────────────────────────────────────────────────
  const password = await bcrypt.hash(PASSWORD, 12);
  const permanent =
    (await prisma.employmentType.findFirst({ where: { name: "Permanent" } })) ??
    (await prisma.employmentType.create({ data: { name: "Permanent" } }));

  const departmentByCode = new Map([
    ["IT", deptIT],
    ["PMO", deptPMO],
  ]);

  const userIdByEmail = new Map<string, number>();

  for (const spec of TEST_USERS) {
    const department = departmentByCode.get(spec.departmentCode);
    if (!department) throw new Error(`Unknown department code ${spec.departmentCode}`);
    const position = await ensurePosition(spec.positionName, spec.positionGrade);

    const user = await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        name: spec.name,
        email: spec.email,
        password,
        isActive: true,
        emailVerifiedAt: new Date(),
        employeeId: spec.employeeId,
        departmentId: department.id,
        positionId: position.id,
        employmentTypeId: permanent.id,
        joinDate: new Date(spec.joinDate),
      },
      // Re-running must not silently reset a password someone changed, so only
      // the structural fields are refreshed on an existing row.
      update: {
        name: spec.name,
        isActive: true,
        departmentId: department.id,
        positionId: position.id,
      },
    });
    userIdByEmail.set(spec.email, user.id);

    const role = await ensureRole(spec.roleName);
    await prisma.modelHasRole.upsert({
      where: {
        roleId_modelType_modelId: { roleId: role.id, modelType: MODEL_USER, modelId: user.id },
      },
      create: { roleId: role.id, modelType: MODEL_USER, modelId: user.id },
      update: {},
    });

    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, email: true, inApp: true, sound: true },
      update: {},
    });

    console.log(`  + user ${spec.email.padEnd(24)} ${spec.roleName}`);
  }

  // ── Reporting lines ─────────────────────────────────────────────────────
  // Done in a second pass because a manager may appear later in the list.
  for (const spec of TEST_USERS) {
    if (!spec.managerEmail) continue;
    const userId = userIdByEmail.get(spec.email);
    const managerId = userIdByEmail.get(spec.managerEmail);
    if (!userId || !managerId) continue;
    await prisma.user.update({ where: { id: userId }, data: { directManagerId: managerId } });
  }

  // ── Department heads ────────────────────────────────────────────────────
  // IT is re-pointed from the super admin to the human who now runs it. The
  // super admin stays super admin; they simply stop also being the IT manager.
  await prisma.department.update({
    where: { id: deptIT.id },
    data: { managerId: userIdByEmail.get("azfar@map2u.com.my")! },
  });
  await prisma.department.update({
    where: { id: deptPMO.id },
    data: { managerId: userIdByEmail.get("zakaria@map2u.com.my")! },
  });

  // ── Teams ───────────────────────────────────────────────────────────────
  const opsTeam = await prisma.team.findUnique({ where: { slug: "devops-operations" } });
  if (!opsTeam) throw new Error("Team devops-operations is missing — run the full seed first");

  const pmoTeam =
    (await prisma.team.findUnique({ where: { slug: "project-management" } })) ??
    (await prisma.team.create({
      data: {
        name: "Project Management",
        slug: "project-management",
        type: "project",
        description: "Delivery planning and project governance",
        departmentId: deptPMO.id,
      },
    }));

  const aminId = userIdByEmail.get("amin@map2u.com.my")!;
  const aimanId = userIdByEmail.get("aiman@map2u.com.my")!;
  const wafiyId = userIdByEmail.get("wafiy@map2u.com.my")!;
  const zakariaId = userIdByEmail.get("zakaria@map2u.com.my")!;

  // One lead per team. Promoting Amin demotes whoever held it, matching what
  // PUT /teams/:id/members does — otherwise the chart would show two leads.
  await prisma.$transaction(async (tx) => {
    await tx.teamMember.updateMany({
      where: { teamId: opsTeam.id, teamRole: "lead", NOT: { userId: aminId } },
      data: { teamRole: "assistant_lead" },
    });
    for (const [teamId, userId, teamRole] of [
      [opsTeam.id, aminId, "lead"],
      [opsTeam.id, aimanId, "member"],
      [pmoTeam.id, wafiyId, "lead"],
      [pmoTeam.id, zakariaId, "member"],
    ] as [number, number, string][]) {
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId, userId } },
        create: { teamId, userId, teamRole },
        update: { teamRole, isActive: true },
      });
    }
  });
  console.log("  + team memberships (DevOps Operations, Project Management)");

  // ── Project membership ──────────────────────────────────────────────────
  // A project manager with no project opens an empty list, and a DevOps
  // engineer outside every project cannot be assigned work.
  const projects = await prisma.project.findMany({
    select: { id: true, slug: true },
    orderBy: { id: "asc" },
  });
  if (projects.length === 0) {
    console.log("  ! no projects found — skipping project membership");
  } else {
    const roleId = async (name: string) =>
      (await prisma.projectRole.findFirst({ where: { name } })).id;
    const managerRoleId = await roleId("Project Manager").catch(() => 0);
    const leadRoleId = await roleId("Team Lead").catch(() => 0);
    const developerRoleId = await roleId("Developer").catch(() => 0);

    const assignments: { projectId: number; userId: number; projectRoleId: number }[] = [];
    for (const project of projects) {
      if (managerRoleId) assignments.push({ projectId: project.id, userId: wafiyId, projectRoleId: managerRoleId });
    }
    if (developerRoleId && projects[1]) {
      assignments.push({ projectId: projects[1].id, userId: aimanId, projectRoleId: developerRoleId });
    }
    if (leadRoleId && projects[2]) {
      assignments.push({ projectId: projects[2].id, userId: aminId, projectRoleId: leadRoleId });
    }

    for (const assignment of assignments) {
      await prisma.teamAssignment.upsert({
        where: { projectId_userId: { projectId: assignment.projectId, userId: assignment.userId } },
        create: assignment,
        update: { projectRoleId: assignment.projectRoleId, isActive: true },
      });
    }
    console.log(`  + ${assignments.length} project assignments`);
  }

  console.log("Done. Every test account uses ChangeMe!2026.");
}

main()
  .catch((error) => {
    console.error("Failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
