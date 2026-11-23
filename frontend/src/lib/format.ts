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

/**
 * Short money for a dense table column: 1_234_000 → "1.2M", 12_345 → "12.3k".
 *
 * Returns the number only — no "MYR" prefix — because the column header above
 * carries the currency once. Exact figures stay available via `formatMYR` in a
 * `title` attribute. Do not use this where there is no header (use formatMYR).
 */
export function formatMoneyCompact(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}
