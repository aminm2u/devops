/**
 * Targeted, idempotent seed for timesheet approval rules.
 *
 * Safe to run on an existing database — creates rules only when missing
 * (matched by name) and never touches users, projects or time entries.
 *
 * Default routing:
 *   project   -> Project Manager of the entry's project
 *   management -> users holding the devops-admin app role
 *   programme -> the entry owner's direct manager
 *   others    -> the entry owner's direct manager
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Ensure the Project Manager project role exists (used by the project rule)
  let projectManagerRole = await prisma.projectRole.findFirst({
    where: { name: "Project Manager" },
  });
  if (!projectManagerRole) {
    projectManagerRole = await prisma.projectRole.create({
      data: { name: "Project Manager" },
    });
  }

  const defaults = [
    {
      name: "Project work → Project Manager",
      categoryValue: "project",
      approverType: "project_role",
      projectRoleId: projectManagerRole.id,
      appRole: null,
      sortOrder: 1,
    },
    {
      name: "Management → Admins",
      categoryValue: "management",
      approverType: "app_role",
      projectRoleId: null,
      appRole: "devops-admin",
      sortOrder: 2,
    },
    {
      name: "Programme → Direct manager",
      categoryValue: "programme",
      approverType: "direct_manager",
      projectRoleId: null,
      appRole: null,
      sortOrder: 3,
    },
    {
      name: "Others → Direct manager",
      categoryValue: "others",
      approverType: "direct_manager",
      projectRoleId: null,
      appRole: null,
      sortOrder: 4,
    },
  ];

  for (const rule of defaults) {
    const existing = await prisma.timesheetApprovalRule.findFirst({
      where: { name: rule.name },
    });
    if (existing) {
      await prisma.timesheetApprovalRule.update({
        where: { id: existing.id },
        data: {
          categoryValue: rule.categoryValue,
          approverType: rule.approverType,
          projectRoleId: rule.projectRoleId,
          appRole: rule.appRole,
          sortOrder: rule.sortOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.timesheetApprovalRule.create({ data: rule });
    }
  }

  const count = await prisma.timesheetApprovalRule.count();
  console.log(`Done. timesheet_approval_rules: ${count} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
