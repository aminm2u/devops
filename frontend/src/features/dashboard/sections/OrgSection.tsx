import { Link } from 'react-router-dom';
import { ArrowUpRight, FolderKanban, Server, ShieldAlert, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/progress-bar';
import { StatCard } from '@/components/stat-card';
import { ChartFrame, ChartTooltip, useChartAxis } from '@/components/charts/ChartFrame';
import { ChartEmpty } from '@/components/charts/chart-primitives';
import { useChartTheme } from '@/components/charts/chart-theme';
import type { OrgSummary } from '@/api/dashboard';
import { compactMoney, formatMoney, severityColor, statusTone, titleCase } from './lib';
import { SectionHeading } from './PersonalSection';

/**
 * The organisation tier — the old dashboard's content, rebuilt so each number
 * has a shape beside it. Rendered only for `dashboard.view.org`.
 */
export function OrgSection({ org }: { org: OrgSummary }) {
  const theme = useChartTheme();
  const axis = useChartAxis();

  const infraTotal = org.infrastructure.total;
  const infraHealthy =
    org.infrastructure.byStatus.find((row) => row.status === 'healthy')?.count ?? 0;

  return (
    <section className="space-y-4">
      <SectionHeading
        title="Organisation"
        description="Portfolio, infrastructure and money across every project."
        href="/projects"
        linkLabel="Open projects"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active projects"
          value={org.projects.total}
          caption={
            org.projects.atRisk > 0
              ? `${org.projects.atRisk} flagged at risk`
              : 'No project flagged at risk'
          }
          icon={FolderKanban}
          iconClassName="text-muted-foreground"
          valueClassName={org.projects.atRisk > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
        />
        <StatCard
          label="Open incidents"
          value={org.incidents.open}
          caption={`${org.incidents.critical} critical`}
          icon={ShieldAlert}
          iconClassName={
            org.incidents.critical > 0 ? 'text-destructive' : 'text-muted-foreground'
          }
          valueClassName={org.incidents.critical > 0 ? 'text-destructive' : undefined}
        />
        <StatCard
          label="Budget utilised"
          value={`${org.budget.utilizationPercent}%`}
          caption={`${compactMoney(org.budget.utilized)} of ${compactMoney(org.budget.allocated)}`}
          icon={Wallet}
          iconClassName="text-muted-foreground"
        />
        <StatCard
          label="Deployments this week"
          value={org.deployments.thisWeek}
          caption={
            org.deployments.successRate == null
              ? 'No deployments recorded'
              : `${org.deployments.successRate}% succeeded · ${org.deployments.failed} failed`
          }
          icon={Server}
          iconClassName={
            org.deployments.failed > 0 ? 'text-destructive' : 'text-muted-foreground'
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Portfolio by status</CardTitle>
            <p className="text-xs text-muted-foreground">
              {org.projects.total} projects. Length is the count; the label names the status.
            </p>
          </CardHeader>
          <CardContent>
            {org.projects.byStatus.length === 0 ? (
              <ChartEmpty height={200} message="No projects recorded." />
            ) : (
              <ChartFrame height={Math.max(150, org.projects.byStatus.length * 32 + 16)}>
                <BarChart
                  data={[...org.projects.byStatus].sort((a, b) => b.count - a.count)}
                  layout="vertical"
                  margin={{ top: 4, right: 32, bottom: 0, left: 4 }}
                  barCategoryGap={8}
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
                    dataKey="status"
                    width={92}
                    tick={axis.tick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: string) => titleCase(value)}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                  <Bar dataKey="count" name="Projects" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {org.projects.byStatus.map((row) => (
                      <Cell key={row.status} fill={statusTone(theme, row.status)} />
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Infrastructure health</CardTitle>
            <p className="text-xs text-muted-foreground">
              {infraTotal} node{infraTotal === 1 ? '' : 's'} · {infraHealthy} healthy
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {infraTotal === 0 ? (
              <ChartEmpty height={150} message="No infrastructure nodes recorded." />
            ) : (
              <>
                {/* A single stacked bar reads as one whole; a donut would make
                    the small "critical" slice invisible at these ratios. */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {org.infrastructure.byStatus.map((row) => (
                    <span
                      key={row.status}
                      style={{
                        width: `${(row.count / infraTotal) * 100}%`,
                        backgroundColor: statusTone(theme, row.status),
                      }}
                      title={`${titleCase(row.status)}: ${row.count}`}
                    />
                  ))}
                </div>
                <ul className="space-y-2">
                  {org.infrastructure.byStatus.map((row) => (
                    <li key={row.status} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2 w-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: statusTone(theme, row.status) }}
                        aria-hidden
                      />
                      <span className="text-muted-foreground">{titleCase(row.status)}</span>
                      <span className="ml-auto font-medium tabular-nums">{row.count}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/devops/infrastructure"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Open infrastructure
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Budget drawdown</CardTitle>
            <p className="text-xs text-muted-foreground">
              {formatMoney(org.budget.remaining)} of {formatMoney(org.budget.allocated)} left
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar value={org.budget.utilizationPercent} size="md" showLabel />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Allocated</dt>
                <dd className="tabular-nums">{formatMoney(org.budget.allocated)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Utilised</dt>
                <dd className="tabular-nums">{formatMoney(org.budget.utilized)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Remaining</dt>
                <dd className="font-medium tabular-nums">{formatMoney(org.budget.remaining)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open incidents by severity</CardTitle>
            <p className="text-xs text-muted-foreground">
              {org.incidents.open} unresolved across the estate
            </p>
          </CardHeader>
          <CardContent>
            {org.incidents.bySeverity.length === 0 ? (
              <ChartEmpty height={150} message="No open incidents." />
            ) : (
              <ul className="space-y-2">
                {org.incidents.bySeverity.map((row) => (
                  <li key={row.key} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{
                        backgroundColor:
                          row.key === 'critical'
                            ? severityColor(theme, 'critical')
                            : row.key === 'high'
                              ? severityColor(theme, 'high')
                              : severityColor(theme, 'medium'),
                      }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{titleCase(row.key)}</span>
                    <span className="ml-auto font-medium tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {org.incidents.oldest.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Oldest: {org.incidents.oldest[0].title} ({org.incidents.oldest[0].ageDays}d)
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Certificates expiring</CardTitle>
            <p className="text-xs text-muted-foreground">Within the next 30 days</p>
          </CardHeader>
          <CardContent>
            {org.ssl.items.length === 0 ? (
              <ChartEmpty height={150} message="Nothing expires in the next 30 days." />
            ) : (
              <ul className="divide-y divide-border/60">
                {org.ssl.items.map((cert) => (
                  <li key={cert.id} className="flex items-center gap-3 py-2 first:pt-0">
                    <ShieldAlert
                      className="h-4 w-4 shrink-0"
                      style={{
                        color:
                          cert.daysLeft <= 7
                            ? severityColor(theme, 'critical')
                            : severityColor(theme, 'high'),
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{cert.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {cert.daysLeft}d
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/devops/ssl"
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Open certificates
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
