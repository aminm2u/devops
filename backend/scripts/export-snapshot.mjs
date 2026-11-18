/**
 * Exports the live database to prisma/snapshot/data.json so the seeder can
 * restore it as the default state on a fresh deployment.
 *
 * Everything is captured verbatim — internal ids, publicId uuids, bcrypt
 * hashes, Decimal columns as strings, Json columns as values — so a restore
 * reproduces today's system exactly: logins keep working, /tasks/:uuid links
 * stay valid, and reference counters continue from where the live data left
 * off. Upload files are copied alongside by scripts/export-snapshot.sh.
 *
 * Usage:
 *   npm run snapshot:export        # writes prisma/snapshot/data.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const snapshotDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "prisma", "snapshot");

/**
 * Restore order = dependency order (parents before children). The export
 * writes in this order so the restore can replay it top to bottom; it is
 * also the reverse of the seeder's delete order.
 */
const TABLES = [
  // ── Org master data ──
  "department", "unit", "position", "employmentType", "projectType", "projectRole",
  // ── RBAC ──
  "permission", "role", "roleHasPermission", "modelHasRole", "modelHasPermission",
  // ── People & teams ──
  "user", "notificationPreference", "team", "teamMember",
  // ── Master data ──
  "referenceData", "referenceNumberConfig",
  "helpdeskCategory", "vendor",
  "approvalPolicy", "approvalPolicyTier", "approvalAssignment",
  "timesheetApprovalRule", "timesheetRuleAppliesTo", "timesheetRuleApprover",
  // ── Projects & delivery ──
  "project", "environment", "teamAssignment",
  "internalProject", "budgetItem", "budgetExpenditure",
  "scopeItem", "scopeBaseline",
  "costCategory", "costItem", "resourceAssignment", "costingSheet", "costingApproval",
  "credential", "document",
  "taskColumn", "projectTask", "taskSubtask",
  "taskComment", "taskAttachment", "taskActivity",
  "timeEntry", "calendarEvent", "microsoftAccount",
  // ── DevOps ops records ──
  "infrastructureNode", "service", "application", "domain",
  "sslCertificate", "deployment", "incident", "changeManagement",
  "backupJob", "disasterRecoveryPlan", "securityFinding",
  // ── Procurement ──
  "requisitionForm", "requisitionItem", "requisitionApproval",
  "requestForQuotation", "rfqItem", "quotation", "quotationItem",
  "purchaseOrder", "purchaseOrderItem", "directPurchase",
  "goodsReceipt", "goodsReceiptItem", "payment", "paymentAttachment", "asset",
  // ── Helpdesk ──
  "helpdeskTicket", "helpdeskComment", "helpdeskAttachment", "helpdeskPortalSession",
  // ── Cross-cutting ──
  "approvalRequest", "notification", "activityLog", "setting",
];

async function main() {
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });

  const data = {};
  for (const table of TABLES) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma[table].findMany();
    data[table] = rows;
    console.log(`  ${table.padEnd(28)} ${rows.length}`);
  }

  const out = {
    exportedAt: new Date().toISOString(),
    // Touched when the schema grows; a restore refuses to run against a
    // database whose shape it does not recognise.
    tables: TABLES,
    data,
  };
  const file = path.join(snapshotDir, "data.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 1), "utf8");
  const sizeMb = (fs.statSync(file).size / (1024 * 1024)).toFixed(2);
  console.log(`\nSnapshot written: ${file} (${sizeMb} MB)`);
}

main()
  .catch((e) => {
    console.error("Export failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
