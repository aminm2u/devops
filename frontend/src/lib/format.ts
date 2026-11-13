/**
 * Money formatting. Prisma Decimals arrive as strings over JSON, so every
 * money value from the API goes through Number() exactly once — here.
 */
export function formatMYR(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `MYR ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Numeric view for computations — the server's totals stay the source of truth. */
export function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}
