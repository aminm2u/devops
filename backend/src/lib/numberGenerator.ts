import prisma from "../config/database.js";

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
    throw new Error(`No reference number config found for type: ${refType}`);
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

  // Build the reference number
  const year = new Date().getFullYear();
  const yearStr =
    updated.yearFormat === "YY"
      ? String(year).slice(-2)
      : String(year);

  const counterStr = String(updated.currentCounter).padStart(
    updated.digitPadding,
    "0"
  );

  return `${updated.prefix}${updated.separator}${yearStr}${updated.separator}${counterStr}`;
}

/**
 * Preview what the next reference number would look like without incrementing.
 */
export async function previewNextReferenceNumber(refType: string): Promise<string> {
  const config = await prisma.referenceNumberConfig.findUnique({
    where: { refType },
  });

  if (!config) {
    throw new Error(`No reference number config found for type: ${refType}`);
  }

  const year = new Date().getFullYear();
  const yearStr =
    config.yearFormat === "YY"
      ? String(year).slice(-2)
      : String(year);

  const counterStr = String(config.currentCounter).padStart(
    config.digitPadding,
    "0"
  );

  return `${config.prefix}${config.separator}${yearStr}${config.separator}${counterStr}`;
}
