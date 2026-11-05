import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { dashboardApi } from '@/api/dashboard';
import { useAuth } from '@/hooks/useAuth';
import { PersonalSection } from './sections/PersonalSection';
import { ApprovalsSection } from './sections/ApprovalsSection';
import { TeamSection } from './sections/TeamSection';
import { OrgSection } from './sections/OrgSection';
import { AttentionSection } from './sections/AttentionSection';

/**
 * Home dashboard, composed by capability.
 *
 * The page has no role-name branching at all: the API evaluates the caller's
 * effective permissions and returns a `visible` map plus only the blocks they
 * may see. Every user gets the personal tier; leading a team adds the team
 * tier; being an approver adds the queue; `dashboard.view.org` adds the
 * organisation tier. Tiers stack, so a manager who also approves sees both.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => dashboardApi.getOverview(),
    staleTime: 60_000,
  });

  const overview = data?.data;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h2 className="text-lg font-semibold">Could not load your dashboard</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The overview request failed. This is usually a session or server issue.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  const tiers = describeTiers(overview);

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        size="sm"
        title={greeting(user?.name)}
        description={
          tiers.length > 0
            ? `Showing ${tiers.join(' · ').toLowerCase()}`
            : 'Your summary for today'
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refresh
        </Button>
      </PageHeader>

      {isLoading || !overview ? (
        <DashboardSkeleton />
      ) : (
        <>
          {overview.visible.personal && <PersonalSection personal={overview.personal} />}

          {/* An empty approval queue is not a section — it is the absence of one.
              The attention list below already says "all clear" when it applies. */}
          {overview.approvals && overview.approvals.pending > 0 && (
            <ApprovalsSection approvals={overview.approvals} />
          )}

          {overview.visible.team && overview.team && <TeamSection team={overview.team} />}

          {overview.org && <OrgSection org={overview.org} />}

          <AttentionSection items={overview.attention} />

          <p className="text-[11px] text-muted-foreground">
            Figures as of{' '}
            {new Date(overview.generatedAt).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
            . Sections you cannot see are hidden because your access does not include them.
          </p>
        </>
      )}
    </div>
  );
}

/** Human names for the tiers the API unlocked — used only in the subtitle. */
function describeTiers(overview?: {
  visible: { personal: boolean; approvals: boolean; team: boolean; org: boolean };
  approvals: { pending: number } | null;
  org: unknown;
}): string[] {
  if (!overview) return [];
  const { visible } = overview;
  const tiers: string[] = [];
  if (visible.personal) tiers.push('Your work');
  if (visible.approvals && (overview.approvals?.pending ?? 0) > 0) tiers.push('Approvals');
  if (visible.team) tiers.push('Team');
  if (visible.org && overview.org) tiers.push('Organisation');
  return tiers;
}

function greeting(name?: string | null): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

function DashboardSkeleton() {
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
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="pt-6">
            <div className="h-48 skeleton rounded-lg" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 pt-6">
            {[1, 2, 3, 4, 5].map((key) => (
              <div key={key} className="h-10 skeleton rounded" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
