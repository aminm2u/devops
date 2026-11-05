import {
  AlertTriangle,
  ArrowRight,
  Bug,
  CalendarClock,
  CheckCircle2,
  Circle,
  GitPullRequestArrow,
  ListTodo,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/progress-bar';
import { StatCard } from '@/components/stat-card';
import { ChartFrame, ChartTooltip, useChartAxis } from '@/components/charts/ChartFrame';
import { ChartEmpty, LegendSwatch } from '@/components/charts/chart-primitives';
import { useChartTheme } from '@/components/charts/chart-theme';
import { formatDate } from '@/lib/utils';
import {
  collectRisks,
  rollupBudget,
  rollupHealth,
  rollupTasks,
  rollupTimeline,
  scheduleSlipDays,
  type RiskItem,
} from './overview/derive';
import { ProjectGantt } from './overview/ProjectGantt';

/**
 * Project overview dashboard.
 *
 * Reads only the payload the detail page already fetched, so every number here
 * agrees with the tabs beside it. Sections render only when they have data —
 * an empty budget chart on a project with no budget is noise, not information.
 */
export function ProjectOverviewDashboard({ project }: { project: any }) {
  const theme = useChartTheme();
  const axis = useChartAxis();

  const tasks = rollupTasks(project.tasks ?? [], project.taskColumns ?? []);
  const budget = rollupBudget(project);
  const timeline = rollupTimeline(project);
  const risks = collectRisks(project);
  const slipDays = scheduleSlipDays(project, tasks.completionPercent);
  const health = rollupHealth(risks, slipDays);

  const daysRemaining =
    project.expectedEndDate != null
      ? Math.ceil(
          (new Date(project.expectedEndDate).getTime() - Date.now()) / 86_400_000
        )
      : null;

  return (
    <div className="space-y-6">
      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tasks complete"
          value={`${tasks.completionPercent}%`}
          caption={`${tasks.done} of ${tasks.total} tasks`}
          icon={CheckCircle2}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label="Open tasks"
          value={tasks.total - tasks.done}
          caption={
            tasks.overdue > 0
              ? `${tasks.overdue} overdue · ${tasks.dueThisWeek} due this week`
              : `${tasks.dueThisWeek} due this week`
          }
          icon={ListTodo}
          iconClassName={tasks.overdue > 0 ? 'text-destructive' : 'text-muted-foreground'}
          valueClassName={tasks.overdue > 0 ? 'text-destructive' : undefined}
        />
        <StatCard
          label="Budget remaining"
          value={formatMoney(budget.remaining)}
          caption={`${budget.utilizationPercent}% of ${formatMoney(budget.allocated)} used`}
          icon={Wallet}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label={daysRemaining == null ? 'Target end' : 'Days to target'}
          value={daysRemaining == null ? '—' : Math.abs(daysRemaining)}
          caption={
            daysRemaining == null
              ? 'No target end date set'
              : daysRemaining < 0
                ? `Past target by ${Math.abs(daysRemaining)} days`
                : `Due ${formatDate(project.expectedEndDate)}`
          }
          icon={CalendarClock}
          iconClassName={daysRemaining != null && daysRemaining < 0 ? 'text-destructive' : 'text-muted-foreground'}
          valueClassName={daysRemaining != null && daysRemaining < 0 ? 'text-destructive' : undefined}
        />
      </div>

      {/* ── Delivery + health ─────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Delivery pipeline</CardTitle>
            <p className="text-xs text-muted-foreground">
              Tasks per board column, in board order. The bar length is the count; the label
              beside it names the column.
            </p>
          </CardHeader>
          <CardContent>
            {tasks.byColumn.length === 0 ? (
              <ChartEmpty height={160} message="No board columns yet." />
            ) : (
              <>
                <ChartFrame height={Math.max(140, tasks.byColumn.length * 34 + 20)}>
                  <BarChart
                    data={tasks.byColumn}
                    layout="vertical"
                    margin={{ top: 4, right: 32, bottom: 4, left: 8 }}
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
                      dataKey="name"
                      width={96}
                      tick={axis.tick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.35 }} />
                    <Bar dataKey="count" name="Tasks" radius={[0, 4, 4, 0]} maxBarSize={16}>
                      {tasks.byColumn.map((column) => (
                        <Cell
                          key={column.id}
                          fill={column.done ? theme.series[2] : theme.series[0]}
                        />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="right"
                        style={{ fill: theme.tick, fontSize: 11 }}
                      />
                    </Bar>
                  </BarChart>
                </ChartFrame>
                <div className="mt-2 flex flex-wrap gap-4">
                  <LegendSwatch color={theme.series[0]} label="In flight" />
                  <LegendSwatch color={theme.series[2]} label="Done column" />
                  <LegendSwatch color={theme.status.critical} label={`Overdue: ${tasks.overdue}`} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Project health</CardTitle>
            <p className="text-xs text-muted-foreground">
              Scored from open risks and schedule slip, not from the status field.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold tabular-nums">{health.score}</p>
                <p className="text-xs text-muted-foreground">{health.label}</p>
              </div>
              <HealthBadge verdict={health.verdict} />
            </div>
            <ProgressBar
              value={health.score}
              tone={
                health.score >= 75
                  ? 'bg-emerald-500'
                  : health.score >= 50
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }
            />
            <div className="space-y-1.5">
              {health.counts.map((entry) => (
                <div key={entry.severity} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 capitalize text-muted-foreground">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: severityColor(theme, entry.severity) }}
                    />
                    {entry.severity}
                  </span>
                  <span className="font-medium tabular-nums">{entry.count}</span>
                </div>
              ))}
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
              {slipDays > 0 ? (
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{slipDays} points behind</strong> the
                  elapsed-time pace for this project.
                </span>
              ) : slipDays < 0 ? (
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{Math.abs(slipDays)} points ahead</strong> of
                  the elapsed-time pace.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Completion is tracking the elapsed timeline.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── To-do list + budget ───────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div>
              <CardTitle className="text-base">Project to-do</CardTitle>
              <p className="text-xs text-muted-foreground">Open tasks with a due date, soonest first.</p>
            </div>
            <Link
              to={`/projects/${project.id}?tab=board`}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              Open board <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {tasks.upcoming.length === 0 ? (
              <ChartEmpty height={150} message="No open task has a due date yet." />
            ) : (
              <ul className="divide-y divide-border/60">
                {tasks.upcoming.map((task) => {
                  const due = new Date(task.dueDate!);
                  const overdue = due.getTime() < Date.now();
                  return (
                    <li key={task.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="mt-0.5">
                        {overdue ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {overdue ? 'Overdue · ' : 'Due '}
                          {formatDate(task.dueDate!)}
                          {task.subtasks && task.subtasks.length > 0 && (
                            <>
                              {' · '}
                              {task.subtasks.filter((sub) => sub.status === 'done').length}/
                              {task.subtasks.length} subtasks
                            </>
                          )}
                        </p>
                      </div>
                      <PriorityChip priority={task.priority} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Budget by category</CardTitle>
            <p className="text-xs text-muted-foreground">
              Allocated against utilised, per budget category.
            </p>
          </CardHeader>
          <CardContent>
            {budget.byCategory.length === 0 ? (
              <ChartEmpty height={170} message="No budget items recorded for this project." />
            ) : (
              <>
                <ChartFrame height={Math.max(160, budget.byCategory.length * 38 + 30)}>
                  <BarChart
                    data={budget.byCategory}
                    layout="vertical"
                    margin={{ top: 4, right: 12, bottom: 4, left: 8 }}
                    barGap={2}
                    barCategoryGap={12}
                  >
                    <CartesianGrid horizontal={false} stroke={axis.grid} />
                    <XAxis
                      type="number"
                      tick={axis.tick}
                      axisLine={{ stroke: axis.axis }}
                      tickLine={false}
                      tickFormatter={(value: number) => compactMoney(value)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={104}
                      tick={axis.tick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<ChartTooltip money />}
                      cursor={{ fill: axis.grid, opacity: 0.35 }}
                    />
                    <Bar dataKey="allocated" name="Allocated" fill={theme.series[0]} radius={[0, 3, 3, 0]} maxBarSize={9} />
                    <Bar dataKey="utilized" name="Utilised" fill={theme.series[1]} radius={[0, 3, 3, 0]} maxBarSize={9} />
                  </BarChart>
                </ChartFrame>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <LegendSwatch color={theme.series[0]} label="Allocated" />
                  <LegendSwatch color={theme.series[1]} label="Utilised" />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {budget.utilizationPercent}% utilised
                  </span>
                </div>
              </>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs">
              <SummaryLine label="Committed on POs" value={formatMoney(budget.committedOnPos)} />
              <SummaryLine label="Paid to date" value={formatMoney(budget.paidToDate)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Gantt ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Schedule</CardTitle>
          <p className="text-xs text-muted-foreground">
            {timeline
              ? `${formatDate(timeline.start)} → ${formatDate(timeline.end)} · ${timeline.totalDays} days`
              : 'Set a start date and a target end date to draw the schedule.'}
          </p>
        </CardHeader>
        <CardContent>
          <ProjectGantt timeline={timeline} />
        </CardContent>
      </Card>

      {/* ── Risks ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Risks &amp; issues</CardTitle>
          <p className="text-xs text-muted-foreground">
            Open change requests at elevated risk, unresolved security findings, live incidents and
            any recorded delay — highest severity first.
          </p>
        </CardHeader>
        <CardContent>
          {risks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 py-10 text-center">
              <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-500" />
              <p className="text-sm font-medium">No open risks recorded</p>
              <p className="text-xs text-muted-foreground">
                Nothing elevated across changes, security, incidents or schedule.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {risks.slice(0, 8).map((risk) => (
                <li key={risk.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <RiskIcon kind={risk.kind} severity={risk.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{risk.title}</p>
                    <p className="text-[11px] capitalize text-muted-foreground">
                      {risk.kind}
                      {risk.detail ? ` · ${risk.detail}` : ''}
                      {risk.status ? ` · ${risk.status.replace(/_/g, ' ')}` : ''}
                    </p>
                  </div>
                  <SeverityChip severity={risk.severity} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── small pieces ───────────────────────────────────────────────────────────

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    maximumFractionDigits: 0,
  }).format(value);
}

function compactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

function HealthBadge({ verdict }: { verdict: 'On Track' | 'At Risk' | 'Critical' }) {
  const className =
    verdict === 'On Track'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : verdict === 'At Risk'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400';
  return <Badge className={className}>{verdict}</Badge>;
}

function PriorityChip({ priority }: { priority: string }) {
  const key = (priority || 'medium').toLowerCase();
  const className =
    key === 'urgent'
      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
      : key === 'high'
        ? 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400'
        : key === 'low'
          ? 'border-border bg-muted text-muted-foreground'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return (
    <Badge className={`shrink-0 ${className}`}>
      {key.charAt(0).toUpperCase() + key.slice(1)}
    </Badge>
  );
}

function SeverityChip({ severity }: { severity: RiskItem['severity'] }) {
  const className =
    severity === 'critical'
      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
      : severity === 'high'
        ? 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400'
        : severity === 'medium'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'border-border bg-muted text-muted-foreground';
  return <Badge className={`shrink-0 capitalize ${className}`}>{severity}</Badge>;
}

function RiskIcon({ kind, severity }: { kind: RiskItem['kind']; severity: RiskItem['severity'] }) {
  const theme = useChartTheme();
  const color =
    severity === 'critical'
      ? theme.status.critical
      : severity === 'high'
        ? theme.status.serious
        : severity === 'medium'
          ? theme.status.warning
          : theme.neutral;

  const Icon =
    kind === 'security'
      ? ShieldAlert
      : kind === 'incident'
        ? Bug
        : kind === 'change'
          ? GitPullRequestArrow
          : AlertTriangle;

  return <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />;
}

function severityColor(
  theme: ReturnType<typeof useChartTheme>,
  severity: RiskItem['severity']
): string {
  if (severity === 'critical') return theme.status.critical;
  if (severity === 'high') return theme.status.serious;
  if (severity === 'medium') return theme.status.warning;
  return theme.neutral;
}
