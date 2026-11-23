import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Info, Timer, Trophy, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { StatCard } from '@/components/stat-card';
import { projectsApi } from '@/api/projects';
import { downloadCsv, csvFilename } from '@/lib/csv';
import { toLocalDateStr, todayLocal } from '@/lib/utils';
import toast from '@/lib/toast';

/**
 * Team contribution to one project.
 *
 * Reads `GET /projects/:id/contribution`, which rolls the project's
 * `TimeEntry` rows three ways over a date range: per member (the table and
 * the ranked bar), per period (the stacked column), and per category (the
 * meters). The same records the Timesheet module shows — there is no second
 * hours store, so the totals here always agree with it.
 *
 * Layout follows the questions in order:
 *   1. Filter row — the range scopes everything below it, so it sits above.
 *   2. Four headline numbers.
 *   3. When was the work done (trend), who did it (ranked bars), what was it
 *      (category meters), then the exact rows in a table.
 *
 * The table is not a fallback: it is the WCAG-clean twin of the two charts,
 * which is why the charts can stay label-sparse.
 */

// ── helpers ─────────────────────────────────────────────────────────────────

function hours(value: number): string {
  if (!Number.isFinite(value)) return '0h';
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, '')}h`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

const RANGE_PRESETS = [
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'ytd', label: 'Year to date' },
] as const;

type RangePreset = (typeof RANGE_PRESETS)[number]['key'];

function presetRange(preset: RangePreset): { from: string; to: string } {
  const today = new Date();
  if (preset === 'ytd') {
    return { from: toLocalDateStr(new Date(today.getFullYear(), 0, 1)), to: todayLocal() };
  }
  return { from: toLocalDateStr(addDays(today, preset === '30d' ? -29 : -89)), to: todayLocal() };
}

// ── panel ───────────────────────────────────────────────────────────────────

export function ContributionPanel({ project }: { project: any }) {
  const theme = useChartTheme();
  const axis = useChartAxis();
  // The stack separator is drawn in the card's own colour, so it reads as a
  // gap rather than a border. Held in one variable so both segments agree.
  const cardSurface = theme.dark ? '#111827' : '#ffffff';

  const initial = presetRange('90d');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState<RangePreset | null>('90d');

  const rangeValid = !!from && !!to && from <= to;

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ['project-contribution', project.id, from, to],
    queryFn: () => projectsApi.getContribution(project.id, from, to),
    enabled: rangeValid,
    // Hold the previous range's render while the new one lands — a skeleton
    // flash on every date change reads as data loss.
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const contribution = data?.data;

  const applyPreset = (next: RangePreset) => {
    const range = presetRange(next);
    setPreset(next);
    setFrom(range.from);
    setTo(range.to);
  };

  const setFromManual = (value: string) => {
    setPreset(null);
    setFrom(value);
  };

  const setToManual = (value: string) => {
    setPreset(null);
    setTo(value);
  };

  // ── derived series ───────────────────────────────────────────────────────
  // The stacked column shows approved against the rest (submitted + draft).
  // Rejected hours never reach `totalHours`, so they cannot be double-counted.
  const trend = useMemo(
    () =>
      (contribution?.buckets ?? []).map((bucket) => ({
        label: bucket.label,
        approved: Math.round(bucket.approvedHours * 100) / 100,
        pending: Math.round((bucket.totalHours - bucket.approvedHours) * 100) / 100,
        total: Math.round(bucket.totalHours * 100) / 100,
      })),
    [contribution]
  );

  const ranked = useMemo(
    () => (contribution?.members ?? []).filter((member) => member.totalHours > 0),
    [contribution]
  );

  const categories = useMemo(
    () => (contribution?.byCategory ?? []).filter((entry) => entry.hours > 0),
    [contribution]
  );
  const categoryTotal = categories.reduce((sum, entry) => sum + entry.hours, 0);

  const totals = contribution?.totals;
  const granularity =
    contribution?.granularity === 'day'
      ? 'day'
      : contribution?.granularity === 'week'
        ? 'week'
        : 'month';
  const averagePerContributor =
    totals && totals.contributors > 0 ? totals.hours / totals.contributors : 0;

  // ── export ───────────────────────────────────────────────────────────────
  const exportMembers = () => {
    if (!contribution) return;
    const rows: (string | number)[][] = [
      ['Project', contribution.projectName],
      ['Period', `${contribution.from} to ${contribution.to}`],
      ['Granularity', granularity],
      [
        'Totals',
        `${hours(contribution.totals.hours)} logged`,
        `${hours(contribution.totals.approvedHours)} approved`,
        `${contribution.totals.contributors} ${
          contribution.totals.contributors === 1 ? 'contributor' : 'contributors'
        }`,
      ],
      [],
      [
        'Member',
        'Email',
        'Role',
        'Status',
        'Hours logged',
        'Hours approved',
        'Share of project',
        'Active days',
        `Days worked (${contribution.hoursPerWorkingDay || 8}h)`,
        'Tasks touched',
        'Draft h',
        'Submitted h',
        'Approved h',
        'Rejected h',
        'Last logged',
      ],
      ...contribution.members.map((member) => [
        member.name,
        member.email,
        member.role,
        member.isActive ? 'Active' : 'Former member',
        member.totalHours,
        member.approvedHours,
        `${member.sharePercent}%`,
        member.daysWorked,
        member.personDays,
        member.tasksTouched,
        member.byStatus.draft,
        member.byStatus.submitted,
        member.byStatus.approved,
        member.byStatus.rejected,
        member.lastLoggedDate ?? '',
      ]),
      [],
      ['Total', '', '', '', contribution.totals.hours, contribution.totals.approvedHours, '100%'],
    ];    downloadCsv(
      csvFilename('team-contribution', contribution.projectName, contribution.from, contribution.to),
      rows
    );
    toast.success('Contribution exported');
  };

  const exportPeriods = () => {
    if (!contribution) return;
    const rows: (string | number)[][] = [
      ['Project', contribution.projectName],
      ['Period', `${contribution.from} to ${contribution.to}`],
      ['Granularity', granularity],
      [],
      ['Period start', 'Period end', 'Hours logged', 'Hours approved', 'Hours pending'],
      ...contribution.buckets.map((bucket) => [
        bucket.start,
        bucket.end,
        Math.round(bucket.totalHours * 100) / 100,
        Math.round(bucket.approvedHours * 100) / 100,
        Math.round((bucket.totalHours - bucket.approvedHours) * 100) / 100,
      ]),
      [],
      ['Total', '', contribution.totals.hours, contribution.totals.approvedHours, ''],
    ];
    downloadCsv(
      csvFilename(
        'team-contribution-periods',
        contribution.projectName,
        contribution.from,
        contribution.to
      ),
      rows
    );
    toast.success('Period breakdown exported');
  };

  const hasRows = (contribution?.members.length ?? 0) > 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Contribution</h2>
          <p className="text-sm text-muted-foreground">
            Hours logged against this project by each member. Read from the same timesheet records
            the Timesheet module writes, so the totals always agree.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={!contribution || !hasRows}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              {from} → {to}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={exportMembers}>
              Member contribution (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportPeriods}>
              Per-{granularity} breakdown (CSV)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* One filter row, above everything it scopes. */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {RANGE_PRESETS.map((option) => (
              <Button
                key={option.key}
                type="button"
                size="sm"
                variant={preset === option.key ? 'default' : 'outline'}
                onClick={() => applyPreset(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48 space-y-1">
              <span className="text-[11px] text-muted-foreground">From</span>
              <DatePicker value={from} onChange={setFromManual} placeholder="Start date" />
            </div>
            <div className="w-48 space-y-1">
              <span className="text-[11px] text-muted-foreground">To</span>
              <DatePicker value={to} onChange={setToManual} placeholder="End date" />
            </div>
          </div>
          {!rangeValid && (
            <p className="w-full text-xs text-destructive">
              The start date must be on or before the end date.
            </p>
          )}
          {isFetching && !isLoading && (
            <span className="ml-auto text-xs text-muted-foreground">Updating…</span>
          )}
        </CardContent>
      </Card>

      {/* ── headline numbers ───────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hours logged"
          value={totals ? hours(totals.hours) : '—'}
          caption={
            totals
              ? `${totals.entries} ${totals.entries === 1 ? 'entry' : 'entries'} in range`
              : 'No data for this range'
          }
          icon={Timer}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label="Approved"
          value={totals ? hours(totals.approvedHours) : '—'}
          caption={
            totals
              ? totals.hours > 0
                ? `${Math.round((totals.approvedHours / totals.hours) * 100)}% of logged time`
                : 'Nothing logged yet'
              : undefined
          }
          icon={Trophy}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label="Contributors"
          value={totals ? totals.contributors : '—'}
          caption={
            contribution
              ? `of ${contribution.members.filter((m) => m.isActive).length} on the team`
              : undefined
          }
          icon={Users}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label="Average per contributor"
          value={totals ? hours(averagePerContributor) : '—'}
          caption={
            totals && totals.byStatus.rejected > 0
              ? `${hours(totals.byStatus.rejected)} rejected, excluded`
              : 'Across members who logged time'
          }
          icon={Timer}
          iconClassName="text-muted-foreground"
        />
      </div>

      {/* ── when the work happened ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Hours per {granularity}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Approved against everything else. Rejected entries are excluded from both.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!contribution || trend.length === 0 || totals?.hours === 0 ? (
            <ChartEmpty
              height={220}
              message={
                contribution
                  ? 'No time logged against this project in the selected range.'
                  : 'Loading contribution…'
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <LegendSwatch color={theme.series[0]} label="Approved" />
                <LegendSwatch color={theme.series[1]} label="Awaiting approval" />
              </div>
              <ChartFrame height={230}>
                <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={axis.grid} strokeWidth={1} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={axis.tick}
                    axisLine={{ stroke: axis.axis }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    tick={axis.tick}
                    axisLine={false}
                    tickLine={false}
                    // Wide enough for a decimal tick ("2.25h") — an axis that
                    // clips its own labels to ".25h" is unreadable.
                    width={48}
                    tickFormatter={(value: number) =>
                      `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, '')}h`
                    }
                  />
                  <Tooltip
                    content={<ChartTooltip unit=" hrs" />}
                    cursor={{ fill: axis.grid, opacity: 0.3 }}
                  />
                  {/* Two real series, so two categorical slots — the de-emphasis
                      neutral is ~1.6:1 on the dark card and vanished there.
                      `stroke` in the surface colour is the 2px separator between
                      the stacked segments; it is spacing, not a border on the mark. */}
                  <Bar
                    dataKey="approved"
                    name="Approved"
                    stackId="hours"
                    fill={theme.series[0]}
                    stroke={cardSurface}
                    strokeWidth={2}
                    maxBarSize={24}
                  />
                  <Bar
                    dataKey="pending"
                    name="Awaiting approval"
                    stackId="hours"
                    fill={theme.series[1]}
                    stroke={cardSurface}
                    strokeWidth={2}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ChartFrame>

              {/* The chart's table twin — every value reachable without hover. */}
              <details className="group rounded-md border border-border/60">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                  Show table
                </summary>
                <div className="border-t border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead className="text-right">Awaiting</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trend.map((row, index) => {
                        const bucket = contribution.buckets[index];
                        return (
                          <TableRow key={bucket.key}>
                            <TableCell className="whitespace-nowrap">
                              {bucket.start === bucket.end
                                ? bucket.label
                                : `${bucket.start} → ${bucket.end}`}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {hours(row.approved)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {hours(row.pending)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {hours(row.total)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── who did the work ───────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contribution by member</CardTitle>
            <p className="text-xs text-muted-foreground">
              Hours logged in range, highest first. Bar length is the hours; the share is against
              the project total.
            </p>
          </CardHeader>
          <CardContent>
            {ranked.length === 0 ? (
              <ChartEmpty height={180} message="Nobody logged time against this project in range." />
            ) : (
              <ChartFrame height={Math.max(140, ranked.length * 34 + 20)}>
                <BarChart
                  data={ranked}
                  layout="vertical"
                  margin={{ top: 4, right: 52, bottom: 4, left: 8 }}
                  barCategoryGap={10}
                >
                  <CartesianGrid horizontal={false} stroke={axis.grid} />
                  <XAxis
                    type="number"
                    tick={axis.tick}
                    axisLine={{ stroke: axis.axis }}
                    tickLine={false}
                    tickFormatter={(value: number) => `${value}h`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={112}
                    tick={axis.tick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip unit=" hrs" />}
                    cursor={{ fill: axis.grid, opacity: 0.3 }}
                  />
                  {/* Nominal categories: one hue for every bar, never a ramp. */}
                  <Bar
                    dataKey="totalHours"
                    name="Hours"
                    fill={theme.series[0]}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={16}
                  />
                </BarChart>
              </ChartFrame>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Where the time went</CardTitle>
            <p className="text-xs text-muted-foreground">By timesheet category.</p>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <ChartEmpty height={180} message="No categorised hours in range." />
            ) : (
              <ul className="space-y-3">
                {categories.map((entry) => {
                  const share = categoryTotal > 0 ? (entry.hours / categoryTotal) * 100 : 0;
                  return (
                    <li key={entry.value}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-medium">{entry.label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {hours(entry.hours)} · {Math.round(share)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${share}%`, backgroundColor: theme.series[0] }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── the exact rows ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Member detail</CardTitle>
          <p className="text-xs text-muted-foreground">
            Everyone on the team, including people who logged nothing in range. Former members
            appear only when they logged time here.
          </p>
        </CardHeader>
        <CardContent>
          {!contribution ? (
            <ChartEmpty height={140} message="Loading contribution…" />
          ) : contribution.members.length === 0 ? (
            <ChartEmpty height={140} message="This project has no team members yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  {/* Two different questions, so two columns: "Days" is how
                      many dates they touched the project; "Days worked" is
                      effort at 8h/day. 2.5h on one date is 1 and 0.3. */}
                  <TableHead className="text-right" title="Distinct dates with time logged">
                    Active days
                  </TableHead>
                  <TableHead
                    className="text-right"
                    title={`Hours ÷ ${contribution.hoursPerWorkingDay || 8}`}
                  >
                    Days worked
                  </TableHead>
                  <TableHead className="text-right">Tasks</TableHead>
                  <TableHead>Last logged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contribution.members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{member.name}</span>
                        {member.isOwner && (
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            Owner
                          </Badge>
                        )}
                        {!member.isActive && (
                          <Badge variant="secondary" className="text-[10px]">
                            Former
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{member.email}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {member.role}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {hours(member.totalHours)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {hours(member.approvedHours)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {member.sharePercent}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {member.daysWorked}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {member.personDays % 1 === 0
                        ? member.personDays
                        : member.personDays.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {member.tasksTouched}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {member.lastLoggedDate ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-px h-3 w-3 shrink-0" />
        <span>
          <strong className="text-foreground">Active days</strong> counts the distinct dates a
          member logged time — 2.5h one afternoon is 1 day.{' '}
          <strong className="text-foreground">Days worked</strong> is effort at{' '}
          {contribution?.hoursPerWorkingDay || 8}h per day, so it stays fractional (2.5h = 0.31).
          Share is the member&apos;s hours divided by all hours logged in range. Rejected entries
          count in the status split but never in hours.
        </span>
      </p>
    </section>
  );
}
