import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { useChartTheme } from './chart-theme';

/**
 * Shared tooltip chrome.
 *
 * Recharts' default tooltip is a white box with a black border, which reads as
 * a foreign element in this app in dark mode. This one follows the card
 * surface and keeps the value in text ink — the colour is carried by the small
 * swatch beside each row, never by the number itself.
 *
 * The props are typed loosely on purpose: Recharts does not re-export its
 * `TooltipContentProps` from the package root, and the shape it injects is
 * stable across 3.x.
 */
export interface ChartTooltipRow {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipRow[];
  label?: string | number;
  /** Format values as currency instead of a plain number. */
  money?: boolean;
  /** Suffix appended to every numeric value, e.g. "%" or " hrs". */
  unit?: string;
}

export function ChartTooltip({ active, payload, label, money, unit }: ChartTooltipProps) {
  const theme = useChartTheme();
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-md"
      style={{
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        color: theme.tooltipText,
      }}
    >
      {label != null && label !== '' && <p className="mb-1 text-xs font-medium">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={`${entry.dataKey ?? entry.name ?? index}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: entry.color ?? theme.neutral }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatValue(entry.value, money)}
              {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatValue(value: string | number | undefined, money?: boolean): string {
  if (value == null) return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return String(value);
  if (money) {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      maximumFractionDigits: 0,
    }).format(numeric);
  }
  return Number.isInteger(numeric) ? numeric.toLocaleString() : numeric.toFixed(1);
}

/**
 * Wrapper that gives Recharts the explicit pixel height it requires inside a
 * flex/grid parent, and keeps every chart on the same sizing contract.
 */
export function ChartFrame({
  height = 220,
  children,
  className,
}: {
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as any}
      </ResponsiveContainer>
    </div>
  );
}

/** Common axis styling so grids and ticks recede behind the marks. */
export function useChartAxis() {
  const theme = useChartTheme();
  return {
    tick: { fill: theme.tick, fontSize: 11 },
    axisLine: { stroke: theme.axis },
    tickLine: false as const,
    grid: theme.grid,
    axis: theme.axis,
  };
}
