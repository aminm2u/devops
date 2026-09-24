import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  Server,
  AlertTriangle,
  Shield,
  Activity,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { dashboardApi } from '@/api/dashboard';
import { cn, formatRelativeTime, getStatusColor, formatStatus } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="h-4 w-24 skeleton rounded" />
        <div className="h-8 w-8 skeleton rounded-lg" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 skeleton rounded mb-2" />
        <div className="h-3 w-32 skeleton rounded" />
      </CardContent>
    </Card>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="h-8 w-8 skeleton rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 skeleton rounded" />
            <div className="h-3 w-1/4 skeleton rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DeploymentSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
          <div className="h-4 w-24 skeleton rounded" />
          <div className="h-4 w-16 skeleton rounded" />
          <div className="h-6 w-20 skeleton rounded-full" />
          <div className="ml-auto h-3 w-20 skeleton rounded" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.getDashboardStats(),
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold">Failed to load dashboard</h2>
        <p className="text-muted-foreground">Please try refreshing the page.</p>
      </div>
    );
  }

  const dashboardData = stats?.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Dashboard" description="Overview of your infrastructure and projects" />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.totalProjects ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {dashboardData?.activeProjects ?? 0} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Infrastructure Nodes</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.totalInfrastructureNodes ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  {dashboardData?.healthyNodes ?? 0} healthy
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.openIncidents ?? 0}</div>
                <p className="text-xs text-destructive">
                  {dashboardData?.criticalIncidents ?? 0} critical
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">SSL Expiring Soon</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.expiringSSLCertificates?.length ?? 0}</div>
                <p className="text-xs text-amber-600">Requires attention</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Resource Health & Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Resource Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resource Health</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-4 w-4 skeleton rounded" />
                    <div className="h-4 w-20 skeleton rounded" />
                    <div className="ml-auto h-4 w-8 skeleton rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm">Healthy</span>
                  </div>
                  <span className="text-sm font-medium">{dashboardData?.resourceHealth?.healthy ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Warning</span>
                  </div>
                  <span className="text-sm font-medium">{dashboardData?.resourceHealth?.warning ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm">Critical</span>
                  </div>
                  <span className="text-sm font-medium">{dashboardData?.resourceHealth?.critical ?? 0}</span>
                </div>

                {/* Health Bar */}
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                  {dashboardData?.resourceHealth && dashboardData.totalInfrastructureNodes > 0 && (
                    <>
                      <div
                        className="bg-emerald-500"
                        style={{
                          width: `${((dashboardData.resourceHealth?.healthy ?? 0) / dashboardData.totalInfrastructureNodes) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-amber-500"
                        style={{
                          width: `${((dashboardData.resourceHealth?.warning ?? 0) / dashboardData.totalInfrastructureNodes) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-red-500"
                        style={{
                          width: `${((dashboardData.resourceHealth?.critical ?? 0) / dashboardData.totalInfrastructureNodes) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ActivitySkeleton />
            ) : dashboardData?.recentActivities?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboardData?.recentActivities?.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{activity.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Deployments & Attention */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Deployments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Deployments</CardTitle>
            <Link
              to="/projects"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <DeploymentSkeleton />
            ) : dashboardData?.recentDeployments?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No deployments yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardData?.recentDeployments?.map((deployment) => (
                  <div
                    key={deployment.id}
                    className="flex items-center gap-4 rounded-lg bg-muted/50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {deployment.version ? `v${deployment.version}` : 'No version'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {deployment.commitMessage || 'No commit message'}
                      </p>
                    </div>
                    <Badge className={cn('shrink-0', getStatusColor(deployment.status))}>
                      {formatStatus(deployment.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items Requiring Attention */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requires Attention</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="h-8 w-8 skeleton rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 skeleton rounded" />
                      <div className="h-3 w-1/2 skeleton rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardData?.expiringSSLCertificates?.map((cert) => (
                  <div
                    key={cert.id}
                    className="flex items-center gap-3 rounded-lg bg-muted/50 p-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{cert.name}</p>
                      <p className="text-xs text-muted-foreground">
                        SSL certificate expiring soon
                      </p>
                    </div>
                  </div>
                ))}
                {dashboardData?.openIncidents === 0 &&
                  (!dashboardData?.expiringSSLCertificates ||
                    dashboardData.expiringSSLCertificates.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                      <p className="text-sm font-medium">All clear!</p>
                      <p className="text-xs text-muted-foreground">
                        Nothing requires your attention right now
                      </p>
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
