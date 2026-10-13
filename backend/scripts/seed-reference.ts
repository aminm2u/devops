/**
 * Targeted, idempotent seed for procurement lookup tables only:
 * - reference_data (dropdown groups)
 * - reference_number_configs (document numbering)
 *
 * Safe to run on an existing database — uses upserts only and never
 * touches users, departments, projects or any other seeded data.
 * Mirrors the corresponding sections of prisma/seed.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const referenceDataGroups: Record<string, { value: string; label: string; sortOrder: number }[]> = {
  budget_type: [
    { value: "project", label: "Project", sortOrder: 1 },
    { value: "department", label: "Department", sortOrder: 2 },
    { value: "event", label: "Event", sortOrder: 3 },
    { value: "programme", label: "Programme", sortOrder: 4 },
    { value: "overhead", label: "Overhead", sortOrder: 5 },
    { value: "capital", label: "Capital", sortOrder: 6 },
  ],
  division: [
    { value: "IT", label: "Information Technology", sortOrder: 1 },
    { value: "DMA", label: "Digital Marketing & Analytics", sortOrder: 2 },
    { value: "HR", label: "Human Resources", sortOrder: 3 },
    { value: "BD", label: "Business Development", sortOrder: 4 },
    { value: "DI", label: "Digital Innovation", sortOrder: 5 },
    { value: "ADMIN", label: "Administration", sortOrder: 6 },
    { value: "FIN", label: "Finance", sortOrder: 7 },
    { value: "OPS", label: "Operations", sortOrder: 8 },
  ],
  uom: [
    { value: "Unit", label: "Unit", sortOrder: 1 },
    { value: "Set", label: "Set", sortOrder: 2 },
    { value: "Box", label: "Box", sortOrder: 3 },
    { value: "Piece", label: "Piece", sortOrder: 4 },
    { value: "Lot", label: "Lot", sortOrder: 5 },
    { value: "Month", label: "Month", sortOrder: 6 },
    { value: "Year", label: "Year", sortOrder: 7 },
    { value: "License", label: "License", sortOrder: 8 },
    { value: "Kg", label: "Kilogram", sortOrder: 9 },
    { value: "Meter", label: "Meter", sortOrder: 10 },
    { value: "Pack", label: "Pack", sortOrder: 11 },
  ],
  currency: [
    { value: "MYR", label: "Malaysian Ringgit (MYR)", sortOrder: 1 },
    { value: "USD", label: "US Dollar (USD)", sortOrder: 2 },
    { value: "EUR", label: "Euro (EUR)", sortOrder: 3 },
    { value: "GBP", label: "British Pound (GBP)", sortOrder: 4 },
    { value: "SGD", label: "Singapore Dollar (SGD)", sortOrder: 5 },
    { value: "JPY", label: "Japanese Yen (JPY)", sortOrder: 6 },
  ],
  procurement_type: [
    { value: "material", label: "Material", sortOrder: 1 },
    { value: "service", label: "Service", sortOrder: 2 },
  ],
  urgency_level: [
    { value: "low", label: "Low", sortOrder: 1 },
    { value: "normal", label: "Normal", sortOrder: 2 },
    { value: "high", label: "High", sortOrder: 3 },
    { value: "urgent", label: "Urgent", sortOrder: 4 },
  ],
  status_budget: [
    { value: "request", label: "Request", sortOrder: 1 },
    { value: "approved", label: "Approved", sortOrder: 2 },
    { value: "active", label: "Active", sortOrder: 3 },
    { value: "closed", label: "Closed", sortOrder: 4 },
  ],
  status_requisition: [
    { value: "draft", label: "Draft", sortOrder: 1 },
    { value: "submitted", label: "Submitted", sortOrder: 2 },
    { value: "under_review", label: "Under Review", sortOrder: 3 },
    { value: "approved", label: "Approved", sortOrder: 4 },
    { value: "rejected", label: "Rejected", sortOrder: 5 },
    { value: "in_procurement", label: "In Procurement", sortOrder: 6 },
    { value: "completed", label: "Completed", sortOrder: 7 },
  ],
  status_po: [
    { value: "draft", label: "Draft", sortOrder: 1 },
    { value: "submitted", label: "Submitted", sortOrder: 2 },
    { value: "approved", label: "Approved", sortOrder: 3 },
    { value: "dispatched", label: "Dispatched", sortOrder: 4 },
    { value: "partially_received", label: "Partially Received", sortOrder: 5 },
    { value: "fully_received", label: "Fully Received", sortOrder: 6 },
    { value: "completed", label: "Completed", sortOrder: 7 },
    { value: "cancelled", label: "Cancelled", sortOrder: 8 },
  ],
  status_rfq: [
    { value: "draft", label: "Draft", sortOrder: 1 },
    { value: "sent", label: "Sent", sortOrder: 2 },
    { value: "receiving", label: "Receiving", sortOrder: 3 },
    { value: "evaluating", label: "Evaluating", sortOrder: 4 },
    { value: "awarded", label: "Awarded", sortOrder: 5 },
    { value: "cancelled", label: "Cancelled", sortOrder: 6 },
  ],
  status_payment: [
    { value: "draft", label: "Draft", sortOrder: 1 },
    { value: "submitted", label: "Submitted", sortOrder: 2 },
    { value: "approved", label: "Approved", sortOrder: 3 },
    { value: "paid", label: "Paid", sortOrder: 4 },
    { value: "cancelled", label: "Cancelled", sortOrder: 5 },
  ],
  status_grn: [
    { value: "pending", label: "Pending", sortOrder: 1 },
    { value: "inspected", label: "Inspected", sortOrder: 2 },
    { value: "accepted", label: "Accepted", sortOrder: 3 },
    { value: "rejected", label: "Rejected", sortOrder: 4 },
    { value: "partial", label: "Partial", sortOrder: 5 },
  ],
  asset_category: [
    { value: "furniture", label: "Furniture", sortOrder: 1 },
    { value: "it_equipment", label: "IT Equipment", sortOrder: 2 },
    { value: "vehicle", label: "Vehicle", sortOrder: 3 },
    { value: "machinery", label: "Machinery", sortOrder: 4 },
    { value: "other", label: "Other", sortOrder: 5 },
  ],
  payment_method: [
    { value: "bank_transfer", label: "Bank Transfer", sortOrder: 1 },
    { value: "cheque", label: "Cheque", sortOrder: 2 },
    { value: "cash", label: "Cash", sortOrder: 3 },
    { value: "online", label: "Online Payment", sortOrder: 4 },
  ],
  timesheet_category: [
    { value: "project", label: "Project", sortOrder: 1 },
    { value: "management", label: "Management", sortOrder: 2 },
    { value: "programme", label: "Programme", sortOrder: 3 },
    { value: "others", label: "Others", sortOrder: 4 },
  ],
};

const numberConfigs = [
  { refType: "req", prefix: "REQ", separator: "-", yearFormat: "YYYY" as const, digitPadding: 4 },
  { refType: "rfq", prefix: "RFQ", separator: "-", yearFormat: "YYYY" as const, digitPadding: 4 },
  { refType: "po", prefix: "PO", separator: "-", yearFormat: "YYYY" as const, digitPadding: 5 },
  { refType: "lo", prefix: "LO", separator: "-", yearFormat: "YYYY" as const, digitPadding: 5 },
  { refType: "dp", prefix: "DP", separator: "-", yearFormat: "YYYY" as const, digitPadding: 4 },
  { refType: "grn", prefix: "GRN", separator: "-", yearFormat: "YYYY" as const, digitPadding: 5 },
  { refType: "pay", prefix: "PAY", separator: "-", yearFormat: "YYYY" as const, digitPadding: 5 },
  { refType: "asset", prefix: "ASSET", separator: "-", yearFormat: "YYYY" as const, digitPadding: 5 },
];

async function main() {
  for (const [group, items] of Object.entries(referenceDataGroups)) {
    for (const item of items) {
      await prisma.referenceData.upsert({
        where: { group_value: { group, value: item.value } },
        update: { label: item.label, sortOrder: item.sortOrder },
        create: { group, value: item.value, label: item.label, sortOrder: item.sortOrder },
      });
    }
  }

  for (const config of numberConfigs) {
    await prisma.referenceNumberConfig.upsert({
      where: { refType: config.refType },
      update: {},
      create: { ...config, currentCounter: 1 },
    });
  }

  const refCount = await prisma.referenceData.count();
  const numCount = await prisma.referenceNumberConfig.count();
  console.log(`Done. reference_data: ${refCount} rows, reference_number_configs: ${numCount} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
