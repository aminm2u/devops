import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Gauge,
  MessageSquare,
  Star,
  Ticket,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/stat-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChartFrame, ChartTooltip, useChartAxis } from '@/components/charts/ChartFrame';
import { ChartEmpty, LegendSwatch } from '@/components/charts/chart-primitives';
import { useChartTheme } from '@/components/charts/chart-theme';
import type { MonthlyReport } from '@/api/helpdesk';
import { formatStatus } from '@/lib/utils';

/**
 * Helpdesk monthly report.
 *
 * Every panel is a chart of the same ticket set, so the page reads as one
 * story: volume and flow first, then where the work came from, then who
 * carried it, then the live backlog. Two questions drive the layout — "is this
 * month better than last?" and "what should we fix?" — and both are answered
 * with a shape and a number, never with a colour alone.
 */
export function HelpdeskReportView({
  report,
  periods,
  month,
  year,
  onPeriodChange,
  isLoading,
}: {
  report: MonthlyReport | undefined;
  periods: { month: number; year: number; label: string }[];
  month: number;
  year: number;
  onPeriodChange: (month: number, year: number) => void;
  isLoading: boolean;
}) {
  const theme = useChartTheme();
  const axis = useChartAxis();

  const summary = report?.summary;

  const daily = useMemo(() => report?.daily ?? [], [report]);
  const peak = useMemo(
    () => daily.reduce((max, point) => Math.max(max, point.created, point.resolved), 0),
    [daily]
  );

  // Split each ageing bucket into "still inside SLA" and "already late" so the
  // breach is visible as a share of the bucket, not a separate number to add up.
  const agingSeries = useMemo(
    () =>
      (report?.backlog.aging ?? []).map((bucket) => ({
        key: bucket.key,
        count: bucket.count,
        breached: bucket.breached,
        within: Math.max(0, bucket.count - bucket.breached),
      })),
    [report]
  );

  const periodValue = `${year}-${month}`;
  const periodOptions = useMemo(() => {
    if (periods.length > 0) return periods;
    // No tickets at all yet — still offer the current month so the page is usable.
    return [{ month, year, label: `${monthName(month)} ${year}` }];
  }, [periods, month, year]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Helpdesk report"
        description="Volume, throughput and service level for the selected month."
      >
        <div className="flex items-center gap-2">
          <Select
            value={periodValue}
            onValueChange={(value) => {
              const [nextYear, nextMonth] = value.split('-').map(Number);
              onPeriodChange(nextMonth, nextYear);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((period) => (
                <SelectItem key={`${period.year}-${period.month}`} value={`${period.year}-${period.month}`}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link to="/helpdesk/manage">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Queue
            </Link>
          </Button>
        </div>
      </PageHeader>

      {isLoading || !report || !summary ? (
        <ReportSkeleton />
      ) : (
        <>
          {/* ── Headline ──────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Created"
              value={summary.totalCreated}
              caption={deltaCaption(summary.totalCreated, report.comparison.created.previous, 'vs last month')}
              icon={Ticket}
              iconClassName="text-muted-foreground"
            />
            <StatCard
              label="Resolved"
              value={summary.totalResolved}
              caption={`${resolutionRate(summary)}% of this month's intake`}
              icon={CheckCircle2}
              iconClassName="text-muted-foreground"
            />
            <StatCard
              label="SLA compliance"
              value={summary.slaComplianceRate == null ? '—' : `${summary.slaComplianceRate}%`}
              caption={
                summary.slaBreached > 0
                  ? `${summary.slaBreached} breach${summary.slaBreached === 1 ? '' : 'es'}`
                  : 'No breaches'
              }
              icon={Gauge}
              iconClassName={
                summary.slaBreached > 0 ? 'text-amber-500' : 'text-muted-foreground'
              }
              valueClassName={
                summary.slaComplianceRate != null && summary.slaComplianceRate < 80
                  ? 'text-destructive'
                  : undefined
              }
            />
            <StatCard
              label="Avg resolution"
              value={formatDuration(summary.avgResolutionMinutes)}
              caption={
                summary.avgFirstResponseMinutes == null
                  ? 'First response not recorded'
                  : `First reply in ${formatDuration(summary.avgFirstResponseMinutes)}`
              }
              icon={Clock}
              iconClassName="text-muted-foreground"
            />
          </div>

          {report.summary.totalCreated === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex items-center gap-3 py-6">
                <AlertTriangle className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">No tickets in this period</p>
                  <p className="text-xs text-muted-foreground">
                    Pick another month above, or file a ticket from the support page to start the
                    history.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Flow ──────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Intake and resolution</CardTitle>
              <p className="text-xs text-muted-foreground">
                Tickets opened and closed each day of {monthName(report.period.month)}. Where the
                opened line runs above the resolved one, the queue grew that day.
              </p>
            </CardHeader>
            <CardContent>
              {summary.totalCreated === 0 && summary.totalResolved === 0 ? (
                <ChartEmpty height={240} message="Nothing was opened or closed in this month." />
              ) : (
                <>
                  <ChartFrame height={240}>
                    <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="created-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={theme.series[0]} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={theme.series[0]} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="resolved-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={theme.series[2]} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={theme.series[2]} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke={axis.grid} />
                      <XAxis
                        dataKey="label"
                        tick={axis.tick}
                        axisLine={{ stroke: axis.axis }}
                        tickLine={false}
                        interval={Math.max(0, Math.floor(daily.length / 10) - 1)}
                      />
                      <YAxis
                        tick={axis.tick}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                        allowDecimals={false}
                        domain={[0, Math.max(peak, 4)]}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: axis.axis }} />
                      <Area
                        type="linear"
                        dataKey="created"
                        name="Opened"
                        stroke={theme.series[0]}
                        strokeWidth={2}
                        fill="url(#created-fill)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: theme.tooltipBg }}
                      />
                      <Area
                        type="linear"
                        dataKey="resolved"
                        name="Resolved"
                        stroke={theme.series[2]}
                        strokeWidth={2}
                        fill="url(#resolved-fill)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: theme.tooltipBg }}
                      />
                    </AreaChart>
                  </ChartFrame>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <LegendSwatch color={theme.series[0]} label="Opened" />
                    <LegendSwatch color={theme.series[2]} label="Resolved" />
                    <LegendSwatch
                      color={theme.neutral}
                      label="Net queue change"
                      value={`${summary.totalCreated - summary.totalResolved > 0 ? '+' : ''}${
                        summary.totalCreated - summary.totalResolved
                      }`}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── Priority service levels + category mix ────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Service level by priority</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Bars are ticket counts. The percentage beside each row is SLA compliance for
                  that priority — the number the promise is judged on.
                </p>
              </CardHeader>
              <CardContent>
                {report.byPriority.length === 0 ? (
                  <ChartEmpty height={200} message="No tickets to score this month." />
                ) : (
                  <ul className="space-y-3">
                    {report.byPriority.map((row) => (
                      <li key={row.priority} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium">{formatStatus(row.priority)}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.count} ticket{row.count === 1 ? '' : 's'} ·{' '}
                            {row.avgResolutionMinutes == null
                              ? 'none resolved'
                              : `avg ${formatDuration(row.avgResolutionMinutes)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(row.count / Math.max(...report.byPriority.map((p) => p.count), 1)) * 100}%`,
                                backgroundColor:
                                  row.priority === 'urgent'
                                    ? theme.series[7]
                                    : row.priority === 'high'
                                      ? theme.series[1]
                                      : row.priority === 'medium'
                                        ? theme.series[3]
                                        : theme.series[0],
                              }}
                            />
                          </div>
                          <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                            {row.slaComplianceRate == null ? '—' : `${row.slaComplianceRate}%`}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Where the work lands</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Tickets per category, largest first. Counts are labelled directly.
                </p>
              </CardHeader>
              <CardContent>
                {report.byCategory.length === 0 ? (
                  <ChartEmpty height={200} message="No categorised tickets this month." />
                ) : (
                  <ChartFrame height={Math.max(160, report.byCategory.slice(0, 8).length * 30 + 16)}>
                    <BarChart
                      data={report.byCategory.slice(0, 8)}
                      layout="vertical"
                      margin={{ top: 4, right: 30, bottom: 0, left: 4 }}
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
                        width={110}
                        tick={axis.tick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                      <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]} maxBarSize={16}>
                        {report.byCategory.slice(0, 8).map((row, index) => (
                          <Cell key={row.key} fill={theme.series[index % theme.series.length]} />
                        ))}
                        <LabelList
                          dataKey="count"
                          position="right"
                          style={{ fill: theme.tick, fontSize: 11 }}
                        />
                      </Bar>
                    </BarChart>
                  </ChartFrame>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Assignee load + satisfaction ──────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Load by assignee</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Still-open tickets against resolved ones, per person.
                </p>
              </CardHeader>
              <CardContent>
                {report.byAssignee.length === 0 ? (
                  <ChartEmpty height={200} message="Nothing assigned this month." />
                ) : (
                  <>
                    <ChartFrame height={Math.max(150, report.byAssignee.slice(0, 8).length * 32 + 16)}>
                      <BarChart
                        data={report.byAssignee.slice(0, 8)}
                        layout="vertical"
                        margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
                        barCategoryGap={10}
                      >
                        <CartesianGrid horizontal={false} stroke={axis.grid} />
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
                          width={110}
                          tick={axis.tick}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                        <Bar dataKey="resolved" name="Resolved" stackId="a" fill={theme.series[2]} maxBarSize={16} />
                        <Bar
                          dataKey="open"
                          name="Still open"
                          stackId="a"
                          fill={theme.series[0]}
                          maxBarSize={16}
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ChartFrame>
                    <div className="mt-2 flex flex-wrap gap-4">
                      <LegendSwatch color={theme.series[2]} label="Resolved" />
                      <LegendSwatch color={theme.series[0]} label="Still open" />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Satisfaction</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {summary.totalRated > 0
                    ? `Average ${summary.avgSatisfaction} from ${summary.totalRated} rating${summary.totalRated === 1 ? '' : 's'}`
                    : 'No ratings collected yet'}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-bold tabular-nums">
                    {summary.avgSatisfaction ?? '—'}
                  </span>
                  <div className="flex items-center gap-0.5" aria-hidden>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <Star
                        key={score}
                        className={
                          score <= Math.round(summary.avgSatisfaction ?? 0)
                            ? 'h-4 w-4 fill-amber-400 text-amber-400'
                            : 'h-4 w-4 text-muted-foreground/40'
                        }
                      />
                    ))}
                  </div>
                </div>
                {report.satisfactionDistribution.every((row) => row.count === 0) ? (
                  <ChartEmpty height={120} message="No satisfaction ratings this month." />
                ) : (
                  <>
                    <ChartFrame height={140}>
                      <BarChart
                        data={report.satisfactionDistribution}
                        margin={{ top: 18, right: 4, bottom: 0, left: 4 }}
                        barCategoryGap={10}
                      >
                        <XAxis
                          dataKey="score"
                          tick={axis.tick}
                          axisLine={{ stroke: axis.axis }}
                          tickLine={false}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                        <Bar dataKey="count" name="Ratings" fill={theme.series[3]} radius={[4, 4, 0, 0]} maxBarSize={28}>
                          <LabelList
                            dataKey="count"
                            position="top"
                            style={{ fill: theme.tick, fontSize: 11 }}
                          />
                        </Bar>
                      </BarChart>
                    </ChartFrame>
                    <div className="mt-1 flex justify-between px-1 text-[10px] text-muted-foreground">
                      <span>1 · worst</span>
                      <span>5 · best</span>
                    </div>
                  </>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Scores run 1 (worst) to 5 (best). Bars are counts of ratings.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Live backlog ──────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Open backlog right now</CardTitle>
                <p className="text-xs text-muted-foreground">Not limited to the selected month.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-bold tabular-nums">{report.backlog.open}</span>
                  <Badge variant="outline">open tickets</Badge>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Past SLA deadline</dt>
                    <dd
                      className={
                        report.backlog.breached > 0 ? 'font-medium text-destructive' : 'font-medium'
                      }
                    >
                      {report.backlog.breached}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Due within 24 hours</dt>
                    <dd className="font-medium">{report.backlog.dueWithin24h}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Backlog age</CardTitle>
                <p className="text-xs text-muted-foreground">
                  How long the currently-open tickets have been waiting. The red segment is the part
                  already past its SLA deadline.
                </p>
              </CardHeader>
              <CardContent>
                {report.backlog.open === 0 ? (
                  <ChartEmpty height={140} message="No open tickets — the queue is clear." />
                ) : (
                  <>
                    <ChartFrame height={180}>
                      <BarChart
                        data={agingSeries}
                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                        barCategoryGap={20}
                      >
                        <CartesianGrid vertical={false} stroke={axis.grid} />
                        <XAxis
                          dataKey="key"
                          tick={axis.tick}
                          axisLine={{ stroke: axis.axis }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={axis.tick}
                          axisLine={false}
                          tickLine={false}
                          width={32}
                          allowDecimals={false}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                        <Bar
                          dataKey="within"
                          name="Within SLA"
                          stackId="age"
                          fill={theme.series[0]}
                          maxBarSize={40}
                        />
                        <Bar
                          dataKey="breached"
                          name="Past SLA"
                          stackId="age"
                          fill={theme.status.critical}
                          maxBarSize={40}
                          radius={[4, 4, 0, 0]}
                        >
                          <LabelList
                            dataKey="count"
                            position="top"
                            style={{ fill: theme.tick, fontSize: 11 }}
                          />
                        </Bar>
                      </BarChart>
                    </ChartFrame>
                    <div className="mt-2 flex flex-wrap gap-4">
                      <LegendSwatch color={theme.series[0]} label="Within SLA" />
                      <LegendSwatch color={theme.status.critical} label="Past SLA" />
                    </div>
                  </>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {report.backlog.breached} of {report.backlog.open} open tickets are past their SLA
                  deadline.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Ticket table ──────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tickets in this period</CardTitle>
              <p className="text-xs text-muted-foreground">
                {report.tickets.length} ticket{report.tickets.length === 1 ? '' : 's'}, newest
                first. The table is the accessible view of every chart above.
              </p>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead className="text-right">Resolved in</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.tickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="max-w-[240px] truncate font-medium">
                          <Link
                            to={`/helpdesk/${ticket.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {ticket.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatStatus(ticket.status)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatStatus(ticket.priority)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{ticket.category ?? '—'}</TableCell>
                        <TableCell className="text-sm">{ticket.assignee ?? 'Unassigned'}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          <span className={ticket.slaBreached ? 'text-destructive' : undefined}>
                            {formatDuration(ticket.resolutionMinutes)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(ticket.createdAt).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {report.tickets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No tickets in this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
            <p>
              First response is measured to the first non-internal comment. SLA compliance counts
              only tickets that reached a resolution. Period:{' '}
              {monthName(report.period.month)} {report.period.year}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthName(month: number): string {
  return MONTH_NAMES[Math.min(11, Math.max(0, month - 1))];
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
}

function resolutionRate(summary: { totalCreated: number; totalResolved: number }): number {
  if (summary.totalCreated === 0) return 0;
  return Math.round((summary.totalResolved / summary.totalCreated) * 100);
}

function deltaCaption(current: number, previous: number, suffix: string): string {
  if (previous === 0) return current === 0 ? `No change ${suffix}` : `New ${suffix}`;
  const delta = current - previous;
  if (delta === 0) return `Flat ${suffix}`;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta} (${Math.round((delta / previous) * 100)}%) ${suffix}`;
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((key) => (
          <Card key={key}>
            <CardContent className="space-y-3 pt-6">
              <div className="h-3 w-24 skeleton rounded" />
              <div className="h-7 w-16 skeleton rounded" />
              <div className="h-3 w-32 skeleton rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="h-56 skeleton rounded-lg" />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="h-48 skeleton rounded-lg" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="h-48 skeleton rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
