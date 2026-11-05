import { AlertTriangle, ExternalLink, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/status-badge';
import { ProgressBar } from '@/components/progress-bar';
import { formatDate } from '@/lib/utils';
import { ProjectOverviewDashboard } from './ProjectOverviewDashboard';
import { rollupBudget } from './overview/derive';

/**
 * Overview.
 *
 * Top half is the management dashboard (delivery, health, to-do, budget,
 * schedule, risks); bottom half keeps the reference detail the tab always had.
 * Every number is derived from the project payload the detail page has already
 * loaded — no separate request, so the tab cannot show a stale budget against a
 * fresh list elsewhere on the page.
 */
export function OverviewTab({ project }: { project: any }) {
  const budget = rollupBudget(project);
  const totalBudget = budget.allocated;
  const utilizedBudget = budget.utilized;
  const budgetUtilPct = budget.utilizationPercent;

  return (
    <div className="space-y-8">
      <ProjectOverviewDashboard project={project} />

      <div className="space-y-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Project details
        </h3>

        <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge domain="internalProject" value={project.status} />
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Priority</span>
              <StatusBadge domain="helpdeskPriority" value={project.priority} />
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Health Status</span>
              <span className="text-sm font-semibold">{project.healthStatus || 'N/A'}</span>
            </div>
            <Separator />
            {project.startDate && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Timeline</span>
                  <span className="text-sm">
                    {new Date(project.startDate).toLocaleDateString()} -{' '}
                    {project.expectedEndDate
                      ? new Date(project.expectedEndDate).toLocaleDateString()
                      : 'TBD'}
                  </span>
                </div>
                <Separator />
              </>
            )}
            {project.owner && (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Owner</span>
                  <span className="text-sm font-medium">{project.owner.name}</span>
                </div>
                <Separator />
              </>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{formatDate(project.createdAt)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Last Updated</span>
              <span className="text-sm">{formatDate(project.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Allocated Budget</span>
              <span className="text-sm font-semibold tabular-nums">
                MYR {totalBudget.toLocaleString()}
              </span>
            </div>
            <Separator />
            <div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Budget Utilized</span>
                <span className="text-sm tabular-nums">MYR {utilizedBudget.toLocaleString()}</span>
              </div>
              <ProgressBar value={budgetUtilPct} tone="auto" className="mt-2" />
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Committed on POs</span>
              <span className="text-sm tabular-nums">MYR {budget.committedOnPos.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Paid to Date</span>
              <span className="text-sm tabular-nums">MYR {budget.paidToDate.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Remaining Budget</span>
              <span className="text-sm font-semibold tabular-nums">
                MYR {budget.remaining.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>

        {project.delayReason && (
          <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Project Delay Alert
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-red-900 dark:text-red-300">
                <strong>Reason:</strong> {project.delayReason}
              </p>
              {project.recommendation && (
                <p className="text-sm text-red-800 dark:text-red-300">
                  <strong>Recommendation:</strong> {project.recommendation}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ['Environments', project.environments?.length ?? 0],
              ['Infrastructure Nodes', project.infrastructureNodes?.length ?? 0],
              ['Services', project.services?.length ?? 0],
              ['Applications', project.applications?.length ?? 0],
              ['Team Members', project.teamAssignments?.length ?? 0],
            ].map(([label, value], index) => (
              <div key={label as string}>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-medium">{value}</span>
                </div>
                {index < 4 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

        {project.documentationUrl && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              <a
                href={project.documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                <FileText className="h-4 w-4" />
                View Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
