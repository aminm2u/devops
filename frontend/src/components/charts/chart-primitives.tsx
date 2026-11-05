import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Small "is this chart empty?" helper. Charts that render a bare axis against
 * no data look broken; every chart in this app shows an explicit empty state
 * instead.
 */
export function hasData(values: unknown[] | undefined | null): boolean {
  return !!values && values.length > 0;
}

/**
 * Legend swatch — a 8px rounded square, plus the label in text ink. Identity is
 * never carried by colour alone, so this is always rendered next to a name.
 */
export function LegendSwatch({
  color,
  label,
  value,
  className,
}: {
  color: string;
  label: string;
  value?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span
        className="h-2 w-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-muted-foreground">{label}</span>
      {value != null && <span className="font-medium tabular-nums text-foreground">{value}</span>}
    </span>
  );
}

/**
 * Empty plot area with a one-line explanation — the same height as the chart it
 * replaces so the layout does not jump when data arrives.
 */
export function ChartEmpty({ height = 180, message }: { height?: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  );
}
