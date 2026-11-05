import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartFrame, ChartTooltip, useChartAxis } from '@/components/charts/ChartFrame';
import { ChartEmpty } from '@/components/charts/chart-primitives';
import { useChartTheme } from '@/components/charts/chart-theme';
import type { ApprovalsSummary } from '@/api/dashboard';
import { moduleLabel, severityColor } from './lib';
import { SectionHeading } from './PersonalSection';

/**
 * The approver tier. Only rendered when the viewer holds
 * `approval.request.view.own` — the API decides that, the UI just draws it.
 */
export function ApprovalsSection({ approvals }: { approvals: ApprovalsSummary }) {
  const theme = useChartTheme();
  const axis = useChartAxis();

  const modules = [...approvals.byModule]
    .sort((a, b) => b.count - a.count)
    .map((row) => ({ ...row, label: moduleLabel(row.module) }));

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Waiting on you"
        description="Requests where you are the current approver."
        href="/approvals"
        linkLabel="Open approvals"
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Queue depth</CardTitle>
                <p className="text-xs text-muted-foreground">By module</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums leading-none">{approvals.pending}</p>
                <p className="text-xs text-muted-foreground">pending</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {modules.length === 0 ? (
              <ChartEmpty height={140} message="Nothing is waiting on you right now." />
            ) : (
              <>
                <ChartFrame height={Math.max(120, modules.length * 32 + 16)}>
                  <BarChart
                    data={modules}
                    layout="vertical"
                    margin={{ top: 4, right: 28, bottom: 0, left: 4 }}
                    barCategoryGap={8}
                  >
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={axis.tick}
                      axisLine={{ stroke: axis.axis }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={96}
                      tick={axis.tick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                    <Bar dataKey="count" name="Pending" radius={[0, 4, 4, 0]} maxBarSize={16}>
                      {modules.map((row) => (
                        <Cell key={row.module} fill={theme.series[1]} />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="right"
                        style={{ fill: theme.tick, fontSize: 11 }}
                      />
                    </Bar>
                  </BarChart>
                </ChartFrame>
                <p className="text-xs text-muted-foreground">
                  {approvals.oldestDays > 0
                    ? `Oldest request has been waiting ${approvals.oldestDays} day${approvals.oldestDays === 1 ? '' : 's'}.`
                    : 'Nothing has aged past today.'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Oldest first</CardTitle>
            <p className="text-xs text-muted-foreground">
              Clearing from the top keeps the queue from ageing out.
            </p>
          </CardHeader>
          <CardContent>
            {approvals.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">Your queue is clear</p>
                <p className="text-xs text-muted-foreground">Nothing needs a decision from you.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {approvals.items.map((item) => {
                  const severity =
                    item.ageDays >= 3 ? 'critical' : item.ageDays >= 1 ? 'high' : 'medium';
                  return (
                    <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: severityColor(theme, severity) }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={item.title}>
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {moduleLabel(item.module)}
                          {item.requesterName ? ` · ${item.requesterName}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {item.ageDays === 0 ? 'today' : `${item.ageDays}d`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/approvals"
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Review all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
