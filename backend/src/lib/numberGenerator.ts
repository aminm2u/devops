import prisma from "../config/database.js";

/** The reference type that issues employee numbers. */
export const EMPLOYEE_REF_TYPE = "employee";

/**
 * Defaults for types the app cannot run without but that a database may predate.
 * Only these are created on demand — a missing procurement config stays a hard
 * error, because guessing a prefix for a purchase order would be worse than
 * failing loudly.
 */
const SELF_SEEDING_CONFIGS: Record<
  string,
  { prefix: string; separator: string; yearFormat: string; digitPadding: number }
> = {
  // Matches the shape of the numbers already in the directory (EMP-001,
  // EMP-007): no year segment, three digits. A new hire should not appear in a
  // visibly different series from the staff hired before them.
  employee: { prefix: "EMP", separator: "-", yearFormat: "NONE", digitPadding: 3 },
};

/**
 * Create the default config for a self-seeding type if the row is missing.
 * Idempotent, so it is safe to call on every read of the numbering settings.
 */
export async function ensureReferenceConfig(refType: string): Promise<void> {
  const defaults = SELF_SEEDING_CONFIGS[refType];
  if (!defaults) return;

  await prisma.referenceNumberConfig.upsert({
    where: { refType },
    update: {},
    create: { refType, ...defaults, currentCounter: 1 },
  });
}

/**
 * Generate an atomic reference number using the reference_number_configs table.
 * Uses a Prisma transaction with atomic increment to prevent race conditions.
 *
 * Format: {prefix}{separator}{year}{separator}{counter padded to digitPadding}
 * Example: RFQ-2026-0001, PO-2026-00001
 */
export async function generateReferenceNumber(refType: string): Promise<string> {
  const config = await prisma.referenceNumberConfig.findUnique({
    where: { refType },
  });

  if (!config) {
    if (!SELF_SEEDING_CONFIGS[refType]) {
      throw new Error(`No reference number config found for type: ${refType}`);
    }
    await ensureReferenceConfig(refType);
    return generateReferenceNumber(refType);
  }

  // Use a transaction to atomically increment the counter
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.referenceNumberConfig.findUnique({
      where: { refType },
    });

    if (!current) {
      throw new Error(`Reference config not found during transaction: ${refType}`);
    }

    const counter = current.currentCounter;
    const newCounter = counter + 1;

    await tx.referenceNumberConfig.update({
      where: { refType },
      data: { currentCounter: newCounter },
    });

    return { ...current, currentCounter: counter };
  });

  return formatReferenceNumber(updated);
}

/**
 * Preview what the next reference number would look like without incrementing.
 */
export async function previewNextReferenceNumber(refType: string): Promise<string> {
  const config = await prisma.referenceNumberConfig.findUnique({
    where: { refType },
  });

  if (!config) {
    if (!SELF_SEEDING_CONFIGS[refType]) {
      throw new Error(`No reference number config found for type: ${refType}`);
    }
    await ensureReferenceConfig(refType);
    return previewNextReferenceNumber(refType);
  }

  return formatReferenceNumber(config);
}

export function formatReferenceNumber(config: {
  prefix: string;
  separator: string;
  yearFormat: string;
  digitPadding: number;
  currentCounter: number;
}): string {
  const year = new Date().getFullYear();
  const counterStr = String(config.currentCounter).padStart(config.digitPadding, "0");

  // `NONE` omits the year segment *and* its separator. Employee numbers are
  // the case for it: a staff number is for life, so dating it by hiring year
  // both changes the format annually and makes the counter restart, which
  // reads as a different series to anyone looking at a list.
  if (config.yearFormat === "NONE") {
    return `${config.prefix}${config.separator}${counterStr}`;
  }

  const yearStr =
    config.yearFormat === "YY" ? String(year).slice(-2) : String(year);

  return `${config.prefix}${config.separator}${yearStr}${config.separator}${counterStr}`;
}
