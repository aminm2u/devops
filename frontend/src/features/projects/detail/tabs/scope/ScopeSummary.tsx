import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ProgressBar } from '@/components/progress-bar';
import { formatMYR } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ScopeSummary as ScopeSummaryData } from './derive';

/**
 * The scope rollup, as a compact strip rather than a KPI wall.
 *
 * `StatCard` would put six padded 2xl numbers above the tree and push the WBS
 * below the fold — and the Overview tab already leads with "Scope progress"
 * and "Costing plan vs actual". This is context for the tree underneath it, so
 * it reads at a smaller scale.
 *
 * `gap-px bg-border` with `bg-card` cells draws hairline dividers that reflow
 * to two columns on a phone without `divide-x` edge cases.
 */
export function ScopeSummary({ summary }: { summary: ScopeSummaryData }) {
  const progress = summary.progressPercent;

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-px bg-border p-0 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Plan budget" value={formatMYR(summary.planCost)} />
        <Metric label="Actual spend" value={formatMYR(summary.actualCost)} />
        <Metric
          label={summary.overBudget ? 'Over budget' : 'Remaining'}
          value={formatMYR(Math.abs(summary.variance))}
          // Green only when there is money left; over-budget is always red and
          // says so in its own label, so the colour is never the only signal.
          tone={
            summary.overBudget
              ? 'text-destructive'
              : 'text-emerald-600 dark:text-emerald-400'
          }
        />
        <Metric
          label="Progress"
          value={progress != null ? `${progress}%` : '—'}
          hint={
            progress == null ? 'No linked tasks yet' : `${summary.completedLeaves}/${summary.leaves} work packages done`
          }
        >
          {/* tone="auto" would paint this red at 100% — `auto` is the budget
              utilization convention, not completion. */}
          <ProgressBar value={progress ?? 0} tone="primary" className="mt-1.5" />
        </Metric>
        <Metric
          label="Work packages"
          value={String(summary.leaves)}
          hint={`${summary.items} items in total`}
        />
        <Metric
          label="Hours logged"
          value={
            Number.isInteger(summary.loggedHours)
              ? String(summary.loggedHours)
              : summary.loggedHours.toFixed(2).replace(/0$/, '')
          }
          hint="Across linked tasks"
        />
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-base font-semibold tabular-nums', tone)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
