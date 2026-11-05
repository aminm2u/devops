import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Clock3, ListTodo, Timer } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import { ChartFrame, ChartTooltip, useChartAxis } from '@/components/charts/ChartFrame';
import { ChartEmpty } from '@/components/charts/chart-primitives';
import { useChartTheme } from '@/components/charts/chart-theme';
import type { PersonalSummary } from '@/api/dashboard';
import { formatHours } from './lib';

/**
 * The default tier — what the signed-in person did and owes, regardless of
 * role. Everything here is derived from the viewer's own records, so the block
 * is identical in shape for an engineer and for the super admin.
 */
export function PersonalSection({ personal }: { personal: PersonalSummary }) {
  const theme = useChartTheme();
  const axis = useChartAxis();
  const hasHours = personal.hours.daily.some((day) => day.hours > 0);
  const peak = Math.max(...personal.hours.daily.map((day) => day.hours), 1);

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Your week"
        description="Logged effort and the work sitting on you."
        href="/my-work/timesheet"
        linkLabel="Open timesheet"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hours today"
          value={formatHours(personal.hours.today)}
          caption={`${formatHours(personal.hours.thisWeek)} this week`}
          icon={Clock3}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label="Month to date"
          value={formatHours(personal.hours.thisMonth)}
          caption={
            personal.timesheet.drafts > 0
              ? `${personal.timesheet.drafts} draft${personal.timesheet.drafts === 1 ? '' : 's'} to submit`
              : 'All entries submitted'
          }
          icon={Timer}
          iconClassName={
            personal.timesheet.drafts > 0 ? 'text-amber-500' : 'text-muted-foreground'
          }
        />
        <StatCard
          label="Open tasks"
          value={personal.tasks.open}
          caption={
            personal.tasks.overdue > 0
              ? `${personal.tasks.overdue} overdue`
              : `${personal.tasks.dueThisWeek} due this week`
          }
          icon={ListTodo}
          iconClassName={
            personal.tasks.overdue > 0 ? 'text-destructive' : 'text-muted-foreground'
          }
          valueClassName={personal.tasks.overdue > 0 ? 'text-destructive' : undefined}
        />
        <StatCard
          label="Support tickets"
          value={personal.tickets.assignedOpen + personal.tickets.reportedOpen}
          caption={`${personal.tickets.assignedOpen} assigned · ${personal.tickets.reportedOpen} reported`}
          icon={ClipboardList}
          iconClassName="text-muted-foreground"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hours logged, last 14 days</CardTitle>
            <p className="text-xs text-muted-foreground">
              Daily total across every project. Peak day {formatHours(peak)}.
            </p>
          </CardHeader>
          <CardContent>
            {!hasHours ? (
              <ChartEmpty height={200} message="No hours logged in the last two weeks." />
            ) : (
              <ChartFrame height={200}>
                <AreaChart
                  data={personal.hours.daily}
                  margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                >
                  <defs>
                    <linearGradient id="hours-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.series[0]} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={theme.series[0]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={axis.grid} />
                  <XAxis
                    dataKey="label"
                    tick={axis.tick}
                    axisLine={{ stroke: axis.axis }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={axis.tick}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    allowDecimals={false}
                    unit="h"
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: axis.axis }} />
                  <Area
                    type="monotone"
                    dataKey="hours"
                    name="Hours"
                    stroke={theme.series[0]}
                    strokeWidth={2}
                    fill="url(#hours-fill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: theme.tooltipBg }}
                  />
                </AreaChart>
              </ChartFrame>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your next deadlines</CardTitle>
            <p className="text-xs text-muted-foreground">
              Open tasks with a due date, soonest first.
            </p>
          </CardHeader>
          <CardContent>
            {personal.tasks.next.length === 0 ? (
              <ChartEmpty height={200} message="Nothing dated is assigned to you." />
            ) : (
              <ul className="divide-y divide-border/60">
                {personal.tasks.next.map((task) => (
                  <li key={task.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: task.isOverdue
                          ? theme.status.critical
                          : theme.series[0],
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={task.title}>
                        {task.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {task.projectName ?? 'No project'}
                        {task.subtaskTotal > 0
                          ? ` · ${task.subtaskDone}/${task.subtaskTotal} subtasks`
                          : ''}
                      </p>
                    </div>
                    <span
                      className={
                        task.isOverdue
                          ? 'shrink-0 text-xs font-medium text-destructive'
                          : 'shrink-0 text-xs text-muted-foreground'
                      }
                    >
                      {task.dueDate ? formatDue(task.dueDate) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function SectionHeading({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {description && <p className="text-sm text-foreground/80">{description}</p>}
      </div>
      {href && (
        <Link
          to={href}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          {linkLabel ?? 'View all'}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function formatDue(value: string): string {
  const date = new Date(value);
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d late`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
