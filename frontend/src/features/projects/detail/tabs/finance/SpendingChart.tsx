import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartFrame, ChartTooltip, useChartAxis } from '@/components/charts/ChartFrame';
import { ChartEmpty } from '@/components/charts/chart-primitives';
import { useChartTheme } from '@/components/charts/chart-theme';
import apiClient from '@/api/client';

/**
 * Project spending — cumulative money against the timeline.
 *
 * Three series, one question each: where the plan says the money should be
 * (projected from the scope items' plan costs spread across their dates, plus
 * the resources budget across the project window), where approved requisitions
 * have committed it, and where purchase orders have actually placed it. The
 * gap between the projection and the purchase line is spend not yet procured;
 * requisition-but-not-purchased is committed and waiting for its order.
 */

interface MonthPoint {
  key: string;
  label: string;
  projected: number;
  requisitioned: number;
  purchased: number;
}

function monthStarts(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    out.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function compactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

/**
 * Pure derivation of the monthly cumulative series from the project payload.
 * Projection: each root scope item's plan cost spread evenly across its own
 * dated months; undated items and the resources budget spread across the
 * window. Requisitioned = approved requests by their created month; purchased
 * = non-cancelled POs by their created month.
 */
export function buildSpendingSeries(
  project: any,
  scopeItems: { planCost: string | number; startDate: string | null; endDate: string | null; parentId: number | null }[],
  resourcesBudget: number
): { points: MonthPoint[]; totals: { projected: number; requisitioned: number; purchased: number } } {
  const requisitions = (project.requisitionForms ?? []).filter(
    (req: any) => req.status === 'approved' || req.status === 'submitted' || req.status === 'under_review'
  );
  const orders = (project.purchaseOrders ?? []).filter((po: any) => po.status !== 'cancelled');

  // Window: project start → expected end, widened to cover any actual spend.
  let start: Date | null = project.startDate ? new Date(project.startDate) : null;
  let end: Date | null = project.expectedEndDate ? new Date(project.expectedEndDate) : null;
  const candidates: Date[] = [new Date()];
  for (const req of requisitions) candidates.push(new Date(req.createdAt));
  for (const po of orders) candidates.push(new Date(po.createdAt));
  for (const date of candidates) {
    if (Number.isNaN(date.getTime())) continue;
    if (!start || date < start) start = date;
    if (!end || date > end) end = date;
  }
  if (!start || !end || end <= start) {
    return { points: [], totals: { projected: 0, requisitioned: 0, purchased: 0 } };
  }
  const windowStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const windowEnd = new Date(end.getFullYear(), end.getMonth(), 1);

  const months = monthStarts(windowStart, windowEnd);
  const totalMonths = Math.max(1, months.length);
  const perMonth = new Map<string, { projected: number; requisitioned: number; purchased: number }>();
  for (const m of months) perMonth.set(monthKey(m), { projected: 0, requisitioned: 0, purchased: 0 });

  // Projection from dated root scope items; undated cost pools at the window.
  const roots = scopeItems.filter((item) => !item.parentId);
  let undatedTotal = resourcesBudget;
  for (const item of roots) {
    const plan = Number(item.planCost ?? 0);
    if (plan <= 0) continue;
    const s = item.startDate ? new Date(item.startDate) : null;
    const e = item.endDate ? new Date(item.endDate) : null;
    const valid = s && e && !Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e > s;
    if (!valid) {
      undatedTotal += plan;
      continue;
    }
    const span = monthStarts(
      new Date(s!.getFullYear(), s!.getMonth(), 1),
      new Date(e!.getFullYear(), e!.getMonth(), 1)
    );
    for (const m of span) {
      const bucket = perMonth.get(monthKey(m));
      if (bucket) bucket.projected += plan / span.length;
    }
  }
  const flatPerMonth = undatedTotal / totalMonths;
  for (const m of months) perMonth.get(monthKey(m))!.projected += flatPerMonth;

  // Actuals into their month buckets.
  for (const req of requisitions) {
    const bucket = perMonth.get(monthKey(new Date(req.createdAt)));
    if (bucket) bucket.requisitioned += Number(req.totalEstimatedCost ?? 0);
  }
  for (const po of orders) {
    const bucket = perMonth.get(monthKey(new Date(po.createdAt)));
    if (bucket) bucket.purchased += Number(po.grandTotal ?? 0);
  }

  // Cumulate.
  let cumProjected = 0;
  let cumRequisitioned = 0;
  let cumPurchased = 0;
  const points = months.map((m) => {
    const bucket = perMonth.get(monthKey(m))!;
    cumProjected += bucket.projected;
    cumRequisitioned += bucket.requisitioned;
    cumPurchased += bucket.purchased;
    return {
      key: monthKey(m),
      label: `${MONTH_SHORT[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`,
      projected: Math.round(cumProjected),
      requisitioned: Math.round(cumRequisitioned),
      purchased: Math.round(cumPurchased),
    };
  });

  return {
    points,
    totals: {
      projected: Math.round(cumProjected),
      requisitioned: Math.round(cumRequisitioned),
      purchased: Math.round(cumPurchased),
    },
  };
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex min-w-28 flex-col rounded-md border dark:border-gray-800 px-3 py-2">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {color && <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />}
        {label}
      </span>
      <span className="mt-0.5 text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function SpendingChart({
  project,
  scopeItems,
}: {
  project: any;
  scopeItems: any[];
}) {
  const theme = useChartTheme();
  const axis = useChartAxis();
  const projectId = project?.id as number | undefined;

  // The resources block lives on the costing sheet — its budget is part of the
  // projection. The sheet's own totals are server-computed; we only need the one number.
  const { data: costingData } = useQuery({
    queryKey: ['project-costing', projectId],
    queryFn: () => apiClient.get(`/projects/${projectId}/costing-sheet`),
    enabled: projectId != null,
  });
  const resourcesBudget = Number(costingData?.data?.data?.sheet?.resourcesBudget ?? 0);

  const { points, totals } = useMemo(
    () => buildSpendingSeries(project, scopeItems, resourcesBudget),
    [project, scopeItems, resourcesBudget]
  );
  const money = (value: number) => `MYR ${value.toLocaleString()}`;
  const notProcured = Math.max(0, totals.projected - totals.purchased);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Spending Projection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <StatTile label="Projected (plan)" value={money(totals.projected)} color={theme.series[0]} />
          <StatTile label="Requisitioned" value={money(totals.requisitioned)} color={theme.series[1]} />
          <StatTile label="Purchased (PO)" value={money(totals.purchased)} color={theme.series[2]} />
          <StatTile label="Not yet procured" value={money(notProcured)} />
        </div>

        {points.length === 0 ? (
          <ChartEmpty
            height={220}
            message="Add project dates and scope items with plan costs to see the spending projection."
          />
        ) : (
          <>
            {/* Legend — three series, so identity is never color-alone */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[0] }} />
                Projected (plan)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[1] }} />
                Requisitioned
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[2] }} />
                Purchased (PO)
              </span>
            </div>
            <ChartFrame height={260}>
              <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={axis.grid} strokeWidth={1} vertical={false} />
                <XAxis dataKey="label" tick={axis.tick} axisLine={{ stroke: axis.axis }} tickLine={false} />
                <YAxis
                  tick={axis.tick}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(value: number) => compactMoney(value)}
                />
                <ChartTooltip money />
                {/* Plan: the line carries the value; the wash shows its shape */}
                <Area
                  type="monotone"
                  dataKey="projected"
                  name="Projected"
                  stroke={theme.series[0]}
                  strokeWidth={2}
                  fill={theme.series[0]}
                  fillOpacity={0.1}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="requisitioned"
                  name="Requisitioned"
                  stroke={theme.series[1]}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="purchased"
                  name="Purchased"
                  stroke={theme.series[2]}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartFrame>
            <p className="text-[11px] text-muted-foreground">
              Cumulative by month. Projection spreads each scope item's plan cost across its own
              dates (resources budget spread across the window); requisitioned counts approved
              requests; purchased counts non-cancelled POs. The gap between the blue area and the
              green line is spend not yet procured.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
