/**
 * Restores a snapshot (prisma/snapshot/data.json) as the database's content.
 *
 * The seeder calls this when the snapshot exists — on a fresh deployment the
 * live system's data IS the default. Rows go back with their original ids,
 * publicId uuids and bcrypt hashes, so links keep resolving and the seeded
 * accounts keep their passwords. Serial columns are advanced past the restored
 * ids so new inserts never collide with them.
 *
 * The snapshot's JSON loses Date/Decimal/BigInt fidelity (everything arrives a
 * string), so each column is handed back the way Prisma expects it:
 *   DateTime  -> new Date(value)
 *   Decimal   -> left as string (Prisma accepts strings for Decimal inputs)
 *   BigInt    -> BigInt(value)
 * Json columns arrive as plain values and pass through untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Compiled (dist-seed/prisma/snapshot) or source (prisma/snapshot) — whichever
 * ships the snapshot. In the Docker image only the compiled copy exists, but
 * the production stage also COPYs `prisma/` wholesale, so resolving from the
 * working directory covers both layouts.
 */
const snapshotDir = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "snapshot"),
  path.resolve(process.cwd(), "prisma", "snapshot"),
].find((dir) => fs.existsSync(dir));

/** Same order as export-snapshot.mjs — parents before children. */
const TABLES = [
  "department", "unit", "position", "employmentType", "projectType", "projectRole",
  "permission", "role", "roleHasPermission", "modelHasRole", "modelHasPermission",
  "user", "notificationPreference", "team", "teamMember",
  "referenceData", "referenceNumberConfig",
  "helpdeskCategory", "vendor",
  "approvalPolicy", "approvalPolicyTier", "approvalAssignment",
  "timesheetApprovalRule", "timesheetRuleAppliesTo", "timesheetRuleApprover",
  "project", "environment", "teamAssignment",
  "internalProject", "budgetItem", "budgetExpenditure",
  "scopeItem", "scopeBaseline",
  "costCategory", "costItem", "resourceAssignment", "costingSheet", "costingApproval",
  "credential", "document",
  "taskColumn", "projectTask", "taskSubtask",
  "taskComment", "taskAttachment", "taskActivity",
  "timeEntry", "calendarEvent", "microsoftAccount",
  "infrastructureNode", "service", "application", "domain",
  "sslCertificate", "deployment", "incident", "changeManagement",
  "backupJob", "disasterRecoveryPlan", "securityFinding",
  "requisitionForm", "requisitionItem", "requisitionApproval",
  "requestForQuotation", "rfqItem", "quotation", "quotationItem",
  "purchaseOrder", "purchaseOrderItem", "directPurchase",
  "goodsReceipt", "goodsReceiptItem", "payment", "paymentAttachment", "asset",
  "helpdeskTicket", "helpdeskComment", "helpdeskAttachment", "helpdeskPortalSession",
  "approvalRequest", "notification", "activityLog", "setting",
];

/** Reverse of TABLES — safe delete order for a clean re-restore. */
const DELETE_ORDER = [...TABLES].reverse();

const snapshotFile = snapshotDir ? path.join(snapshotDir, "data.json") : "";

/** True when a snapshot file is present and readable. */
export function snapshotExists(): boolean {
  return fs.existsSync(snapshotFile);
}

/** Wipes every table, children first. Same order the main seeder uses. */
export async function clearAll() {
  const client = prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>;
  for (const table of DELETE_ORDER) {
    // eslint-disable-next-line no-await-in-loop
    await client[table].deleteMany();
  }
}

/**
 * Restores the snapshot inside one transaction. Throws if the file names a
 * table the current Prisma client does not know — that means the schema moved
 * on and the snapshot needs re-exporting.
 */
export async function restoreSnapshot() {
  const raw = fs.readFileSync(snapshotFile, "utf8");
  const snapshot = JSON.parse(raw);
  const known = new Set(TABLES);
  for (const table of Object.keys(snapshot.data)) {
    if (!known.has(table)) {
      throw new Error(
        `Snapshot table "${table}" is not in the restore list — re-export the snapshot (npm run snapshot:export).`
      );
    }
  }

  await prisma.$transaction(async (tx: any) => {
    for (const table of TABLES) {
      const rows = snapshot.data[table] ?? [];
      if (rows.length === 0) continue;

      // Circular links: departments.managerId and departments.parentId point
      // at users/rows that do not exist until later passes. The FKs are
      // NOT NULL-free (nullable), so restore them null here and patch them
      // back in after the referenced tables land.
      const deferred = table === "department"
        ? rows.map((row: any) => ({ ...row, managerId: null }))
        : table === "user"
          ? rows.map((row: any) => ({ ...row, directManagerId: null }))
          : rows;

      // Prisma's Postgres connector maps DateTime to ISO strings badly at the
      // type level but accepts them at runtime only when actual Date objects —
      // rehydrate every value that looks like a timestamp.
      const hydrated = deferred.map((row: any) => {
        const out: any = {};
        for (const [key, value] of Object.entries(row)) {
          if (typeof value === "string" && ISO_DATETIME.test(value)) {
            out[key] = new Date(value);
          } else {
            out[key] = value;
          }
        }
        return out;
      });
      await tx[table].createMany({ data: hydrated });
    }

    // Second pass — restore the deferred circular links now that both sides
    // of each cycle exist.
    for (const row of snapshot.data.department ?? []) {
      if (row.managerId == null && row.parentId == null) continue;
      await tx.department.update({
        where: { id: row.id },
        data: { managerId: row.managerId ?? null, parentId: row.parentId ?? null },
      });
    }
    for (const row of snapshot.data.user ?? []) {
      if (row.directManagerId == null) continue;
      await tx.user.update({
        where: { id: row.id },
        data: { directManagerId: row.directManagerId },
      });
    }

    // Push every serial sequence past the restored ids. `setval` with the
    // current max (not max+1) makes the NEXT value max+1, which is what a
    // fresh insert needs. Table names are @@map values from the schema, kept
    // here explicitly because the mapping is static and the restore must not
    // guess it at runtime.
    const TABLE_NAMES: Record<string, string> = {
      department: "departments", unit: "units", position: "positions",
      employmentType: "employment_types", projectType: "project_types",
      projectRole: "project_roles", permission: "permissions", role: "roles",
      roleHasPermission: "role_has_permissions", modelHasRole: "model_has_roles",
      modelHasPermission: "model_has_permissions", user: "users",
      notificationPreference: "notification_preferences", team: "teams",
      teamMember: "team_members", referenceData: "reference_data",
      referenceNumberConfig: "reference_number_configs",
      helpdeskCategory: "helpdesk_categories", vendor: "vendors",
      approvalPolicy: "approval_policies", approvalPolicyTier: "approval_policy_tiers",
      approvalAssignment: "approval_assignments",
      timesheetApprovalRule: "timesheet_approval_rules",
      timesheetRuleAppliesTo: "timesheet_rule_applies_to",
      timesheetRuleApprover: "timesheet_rule_approvers", project: "projects",
      environment: "environments", teamAssignment: "team_assignments",
      internalProject: "internal_projects", budgetItem: "budget_items",
      budgetExpenditure: "budget_expenditures", scopeItem: "scope_items",
      scopeBaseline: "scope_baselines", costCategory: "cost_categories",
      costItem: "cost_items", resourceAssignment: "resource_assignments",
      costingSheet: "costing_sheets", costingApproval: "costing_approvals",
      credential: "credentials", document: "documents", taskColumn: "task_columns",
      projectTask: "project_tasks", taskSubtask: "task_subtasks",
      taskAttachment: "task_attachments", taskComment: "task_comments",
      taskActivity: "task_activities", timeEntry: "time_entries",
      calendarEvent: "calendar_events", microsoftAccount: "microsoft_accounts",
      infrastructureNode: "infrastructure_nodes", service: "services",
      application: "applications", domain: "domains",
      sslCertificate: "ssl_certificates", deployment: "deployments",
      incident: "incidents", changeManagement: "change_managements",
      backupJob: "backup_jobs", disasterRecoveryPlan: "disaster_recovery_plans",
      securityFinding: "security_findings", requisitionForm: "requisition_forms",
      requisitionItem: "requisition_items", requisitionApproval: "requisition_approvals",
      requestForQuotation: "request_for_quotations", rfqItem: "rfq_items",
      quotation: "quotations", quotationItem: "quotation_items",
      purchaseOrder: "purchase_orders", purchaseOrderItem: "purchase_order_items",
      directPurchase: "direct_purchases", goodsReceipt: "goods_receipts",
      goodsReceiptItem: "goods_receipt_items", payment: "payments",
      paymentAttachment: "payment_attachments", asset: "assets",
      helpdeskTicket: "helpdesk_tickets", helpdeskComment: "helpdesk_comments",
      helpdeskAttachment: "helpdesk_attachments",
      helpdeskPortalSession: "helpdesk_portal_sessions",
      approvalRequest: "approval_requests", notification: "notifications",
      activityLog: "activity_log", setting: "settings",
    };
    for (const table of TABLES) {
      const rows = snapshot.data[table] ?? [];
      if (rows.length === 0) continue;
      if (rows[0].id === undefined) continue;
      const tableName = TABLE_NAMES[table];
      if (!tableName) continue;
      const maxId = Math.max(...rows.map((r: any) => r.id ?? 0));
      // eslint-disable-next-line no-await-in-loop
      await tx.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), $1, true)`,
        maxId
      );
    }
  });

  const counts = TABLES.map((t) => `${t}:${(snapshot.data[t] ?? []).length}`).join(" ");
  console.log(`Snapshot restored (${snapshot.exportedAt})`);
  console.log(`  ${counts}`);
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
