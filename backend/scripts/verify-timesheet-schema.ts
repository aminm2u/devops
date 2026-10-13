import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const [timeEntries, subtasks, rules, categories] = await Promise.all([
    p.timeEntry.count(),
    p.taskSubtask.count(),
    p.timesheetApprovalRule.count(),
    p.referenceData.count({ where: { group: "timesheet_category" } }),
  ]);

  const ruleNames = await p.timesheetApprovalRule.findMany({
    select: { name: true, approverType: true, categoryValue: true, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const catRows = await p.referenceData.findMany({
    where: { group: "timesheet_category" },
    select: { value: true, label: true, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  console.log(
    JSON.stringify(
      { timeEntries, subtasks, approvalRules: rules, timesheetCategories: categories, ruleNames, catRows },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
