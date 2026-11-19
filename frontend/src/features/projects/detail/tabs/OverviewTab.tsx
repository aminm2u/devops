import {
  AlertTriangle,
  AppWindow,
  Boxes,
  CalendarRange,
  Container,
  ExternalLink,
  FileText,
  Server,
  Users,
  Wallet,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ProgressBar } from '@/components/progress-bar';
import { formatDate } from '@/lib/utils';
import { ProjectOverviewDashboard } from './ProjectOverviewDashboard';
import { rollupBudget } from './overview/derive';

/**
 * Overview.
 *
 * Top half is the management dashboard (delivery, health, to-do, budget,
 * schedule, risks); bottom half keeps the reference detail the tab always had,
 * laid out as fact grids and stat tiles rather than separator lists. Every
 * number is derived from the project payload the detail page has already
 * loaded — no separate request, so the tab cannot show a stale budget against
 * a fresh list elsewhere on the page.
 */
export function OverviewTab({ project }: { project: any }) {
  const budget = rollupBudget(project);

  const durationDays =
    project.startDate && project.expectedEndDate
      ? Math.max(
          0,
          Math.round(
            (new Date(project.expectedEndDate).getTime() -
              new Date(project.startDate).getTime()) /
              86_400_000
          )
        )
      : null;

  const resources = [
    { label: 'Environments', value: project.environments?.length ?? 0, icon: Container },
    { label: 'Infra nodes', value: project.infrastructureNodes?.length ?? 0, icon: Server },
    { label: 'Services', value: project.services?.length ?? 0, icon: Boxes },
    { label: 'Applications', value: project.applications?.length ?? 0, icon: AppWindow },
    { label: 'Team members', value: project.teamAssignments?.length ?? 0, icon: Users },
  ];

  return (
    <div className="space-y-8">
      <ProjectOverviewDashboard project={project} />

      <div className="space-y-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Project details
        </h3>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Facts ─────────────────────────────────────────────────── */}
          <Card className="lg:col-span-3">
            <CardContent className="pt-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{project.name}</p>
                  {project.code && (
                    <p className="font-mono text-xs text-muted-foreground">{project.code}</p>
                  )}
                </div>
                <StatusBadge domain="internalProject" value={project.status} />
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Fact label="Priority">
                  <StatusBadge domain="helpdeskPriority" value={project.priority} />
                </Fact>
                <Fact label="Health">
                  <span className="text-sm font-medium">
                    {project.healthStatus || 'Not set'}
                  </span>
                </Fact>
                <Fact label="Owner">
                  {project.owner ? (
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                        {initials(project.owner.name)}
                      </span>
                      <span className="truncate text-sm font-medium">{project.owner.name}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </Fact>
              </dl>

              {project.startDate && (
                <div className="mt-5 flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                  <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Timeline
                    </p>
                    <p className="truncate text-sm font-medium tabular-nums">
                      {new Date(project.startDate).toLocaleDateString()} →{' '}
                      {project.expectedEndDate
                        ? new Date(project.expectedEndDate).toLocaleDateString()
                        : 'TBD'}
                    </p>
                  </div>
                  {durationDays != null && (
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {durationDays} days
                    </span>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                <span>Created {formatDate(project.createdAt)}</span>
                <span>Updated {formatDate(project.updatedAt)}</span>
                {project.documentationUrl && (
                  <a
                    href={project.documentationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <FileText className="h-3 w-3" />
                    Documentation
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Financial summary ─────────────────────────────────────── */}
          <Card className="lg:col-span-2">
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  Financial summary
                </p>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {budget.utilizationPercent}% utilised
                </span>
              </div>

              <p className="text-2xl font-bold tabular-nums">{formatMoney(budget.allocated)}</p>
              <p className="mb-4 text-xs text-muted-foreground">allocated budget</p>

              <ProgressBar value={budget.utilizationPercent} tone="auto" />

              <div className="mt-5 grid grid-cols-2 gap-3">
                <MoneyTile label="Utilised" value={budget.utilized} />
                <MoneyTile
                  label="Remaining"
                  value={budget.remaining}
                  valueClassName={budget.remaining < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}
                />
                <MoneyTile label="Committed on POs" value={budget.committedOnPos} muted />
                <MoneyTile label="Paid to date" value={budget.paidToDate} muted />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Delay alert ─────────────────────────────────────────────── */}
        {project.delayReason && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-destructive">Project delay recorded</p>
                <p className="mt-1 text-sm">{project.delayReason}</p>
                {project.recommendation && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Recommendation: </span>
                    {project.recommendation}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Resources ───────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 text-sm font-semibold">Resources</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {resources.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold tabular-nums leading-tight">{value}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── small pieces ─────────────────────────────────────────────────────────────

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function MoneyTile({
  label,
  value,
  muted,
  valueClassName,
}: {
  label: string;
  value: number;
  muted?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={
          valueClassName ??
          (muted
            ? 'text-sm font-medium tabular-nums text-muted-foreground'
            : 'text-sm font-semibold tabular-nums')
        }
      >
        {formatMoney(value)}
      </p>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    maximumFractionDigits: 0,
  }).format(value);
}
