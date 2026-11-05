import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Users, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { ChartFrame, ChartTooltip, useChartAxis } from '@/components/charts/ChartFrame';
import { ChartEmpty, LegendSwatch } from '@/components/charts/chart-primitives';
import { useChartTheme } from '@/components/charts/chart-theme';
import type { TeamSummary } from '@/api/dashboard';
import { formatHours, severityColor, titleCase } from './lib';
import { SectionHeading } from './PersonalSection';

/**
 * The team-lead tier. Where the personal block describes *me*, this one
 * describes *the people I lead*: who logged time, who is behind, what is on
 * fire. Hours are only shown when the viewer actually holds
 * `timesheet.entry.read.team` — the API nulls them out otherwise, so the
 * leaderboard is never a privacy leak rendered by accident.
 */
export function TeamSection({ team }: { team: TeamSummary }) {
  const theme = useChartTheme();
  const axis = useChartAxis();

  const teamNames = team.teams.map((entry) => entry.name).join(', ');
  const load = [...team.leaderboard].sort((a, b) => b.hours - a.hours);

  return (
    <section className="space-y-4">
      <SectionHeading
        title={team.teams.length > 1 ? 'Your teams' : 'Your team'}
        description={`${teamNames} · ${team.headcount} member${team.headcount === 1 ? '' : 's'}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Team hours this week"
          value={team.canSeeHours ? formatHours(team.hoursThisWeek) : '—'}
          caption={
            team.canSeeHours
              ? `${formatHours(team.avgHoursPerMember)} per member on average`
              : 'Hour totals are not shared with your access level'
          }
          icon={BarChart3}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label="Present today"
          value={team.activeToday ?? '—'}
          caption={`of ${team.headcount} logged time today`}
          icon={UserCheck}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label="Open team tasks"
          value={team.tasks.open}
          caption={
            team.tasks.overdue > 0 ? `${team.tasks.overdue} overdue` : 'Nothing overdue'
          }
          icon={Users}
          iconClassName={team.tasks.overdue > 0 ? 'text-destructive' : 'text-muted-foreground'}
          valueClassName={team.tasks.overdue > 0 ? 'text-destructive' : undefined}
        />
        <StatCard
          label="Open incidents"
          value={team.incidents.open}
          caption={
            team.incidents.critical > 0
              ? `${team.incidents.critical} critical`
              : `${team.tickets.open} tickets open`
          }
          icon={Users}
          iconClassName={
            team.incidents.critical > 0 ? 'text-destructive' : 'text-muted-foreground'
          }
          valueClassName={team.incidents.critical > 0 ? 'text-destructive' : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {team.canSeeHours && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Team movement, last 7 days</CardTitle>
              <p className="text-xs text-muted-foreground">
                Hours logged by every member, summed per day.
              </p>
            </CardHeader>
            <CardContent>
              {team.daily.every((day) => day.hours === 0) ? (
                <ChartEmpty height={200} message="No team hours logged in the last week." />
              ) : (
                <ChartFrame height={200}>
                  <BarChart data={team.daily} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <XAxis
                      dataKey="label"
                      tick={axis.tick}
                      axisLine={{ stroke: axis.axis }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={axis.tick}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      allowDecimals={false}
                      unit="h"
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                    <Bar
                      dataKey="hours"
                      name="Hours"
                      fill={theme.series[0]}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ChartFrame>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={team.canSeeHours ? '' : 'lg:col-span-2'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Load by member</CardTitle>
            <p className="text-xs text-muted-foreground">
              {team.canSeeHours
                ? 'Hours this week, highest first. A flat marker means no time logged today.'
                : 'Hour totals need the team-hours permission.'}
            </p>
          </CardHeader>
          <CardContent>
            {!team.canSeeHours || load.length === 0 ? (
              <ChartEmpty height={180} message="No hour records for this team yet." />
            ) : (
              <>
                <ChartFrame height={Math.max(140, load.length * 30 + 16)}>
                  <BarChart
                    data={load}
                    layout="vertical"
                    margin={{ top: 4, right: 30, bottom: 0, left: 4 }}
                    barCategoryGap={8}
                  >
                    <XAxis
                      type="number"
                      tick={axis.tick}
                      axisLine={{ stroke: axis.axis }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={96}
                      tick={axis.tick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                    <Bar dataKey="hours" name="Hours" radius={[0, 4, 4, 0]} maxBarSize={14}>
                      {load.map((member) => (
                        <Cell
                          key={member.userId}
                          fill={member.loggedToday ? theme.series[0] : theme.neutral}
                        />
                      ))}
                      <LabelList
                        dataKey="hours"
                        position="right"
                        formatter={(value: any) => formatHours(Number(value))}
                        style={{ fill: theme.tick, fontSize: 11 }}
                      />
                    </Bar>
                  </BarChart>
                </ChartFrame>
                <div className="mt-2 flex flex-wrap gap-4">
                  <LegendSwatch color={theme.series[0]} label="Logged today" />
                  <LegendSwatch color={theme.neutral} label="Nothing today" />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Overdue on the team</CardTitle>
            <p className="text-xs text-muted-foreground">
              Dated tasks past their due date and not in a done column.
            </p>
          </CardHeader>
          <CardContent>
            {team.tasks.items.length === 0 ? (
              <ChartEmpty height={150} message="Nothing overdue on your team." />
            ) : (
              <ul className="divide-y divide-border/60">
                {team.tasks.items.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: theme.status.critical }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {new Date(task.dueDate as string).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {titleCase(task.priority)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Team incidents</CardTitle>
            <p className="text-xs text-muted-foreground">
              Unresolved incidents owned by your teams.
            </p>
          </CardHeader>
          <CardContent>
            {team.incidents.items.length === 0 ? (
              <ChartEmpty height={150} message="No open incidents for your teams." />
            ) : (
              <ul className="divide-y divide-border/60">
                {team.incidents.items.map((incident) => (
                  <li key={incident.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          incident.severity === 'critical'
                            ? severityColor(theme, 'critical')
                            : incident.severity === 'high'
                              ? severityColor(theme, 'high')
                              : severityColor(theme, 'medium'),
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{incident.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {titleCase(incident.severity)} · {titleCase(incident.status)}
                      </p>
                    </div>
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
