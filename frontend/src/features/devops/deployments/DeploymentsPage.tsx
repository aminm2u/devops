import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Rocket, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { TeamFilter, TeamPicker } from '@/components/teams/TeamSelect';
import { environmentsApi } from '@/api/environments';
import { PageHeader } from '@/components/layout/PageHeader';
import { Can } from '@/components/Can';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import apiClient from '@/api/client';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';
import { formatDate } from '@/lib/utils';
import toast from '@/lib/toast';

interface Deployment {
  id: number;
  name: string;
  version: string;
  status: string;
  branch: string | null;
  commitHash: string | null;
  commitMessage: string | null;
  notes: string | null;
  deployedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  /** Null for records that predate teams, or that nobody filed under one. */
  teamId: number | null;
  team: { id: number; name: string } | null;
  project: { id: number; name: string; slug: string };
  deployedByUser: { id: number; name: string; email: string } | null;
}

export function DeploymentsPage() {
  const queryClient = useQueryClient();

  // Deployment states are master data, so the filter and both dialogs read the
  // same list the API validates against.
  const { data: statusData } = useReferenceData('status_deployment');
  const deploymentStatuses = toSelectOptions(statusData);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);

  // Create form state
  const [formProjectId, setFormProjectId] = useState<number>(1);
  const [formTeamId, setFormTeamId] = useState<number | null>(null);
  const [formEnvironmentId, setFormEnvironmentId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formVersion, setFormVersion] = useState('');
  const [formStatus, setFormStatus] = useState('pending');
  const [formCommit, setFormCommit] = useState('');
  const [formBranch, setFormBranch] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editCommit, setEditCommit] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['deployments', search, statusFilter, teamFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (teamFilter !== 'all') params.teamId = teamFilter;
      const res = await apiClient.get('/deployments', { params });
      return res.data;
    },
  });

  // Environments belong to a project, so the picker follows the chosen one.
  const { data: environmentsData } = useQuery({
    queryKey: ['environments', formProjectId],
    queryFn: () => environmentsApi.getEnvironments(formProjectId),
    enabled: showCreateDialog && !!formProjectId,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiClient.get('/projects', { params: { limit: 100 } });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiClient.post('/deployments', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setShowCreateDialog(false);
      resetCreateForm();
      toast.success('Deployment recorded');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to record deployment'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiClient.put(`/deployments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setShowEditDialog(false);
      setSelectedDeployment(null);
      toast.success('Deployment updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update deployment'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/deployments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setShowDeleteDialog(false);
      setSelectedDeployment(null);
      toast.success('Deployment deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete deployment'),
  });

  const resetCreateForm = () => {
    setFormName('');
    setFormVersion('');
    setFormStatus('pending');
    setFormCommit('');
    setFormBranch('');
    setFormNotes('');
    setFormTeamId(null);
    setFormEnvironmentId(null);
  };

  const openEditDialog = (dep: Deployment) => {
    setSelectedDeployment(dep);
    setEditName(dep.name);
    setEditVersion(dep.version);
    setEditStatus(dep.status);
    setEditCommit(dep.commitHash || '');
    setEditBranch(dep.branch || '');
    setEditNotes(dep.notes || '');
    setShowEditDialog(true);
  };

  const openDeleteDialog = (dep: Deployment) => {
    setSelectedDeployment(dep);
    setShowDeleteDialog(true);
  };

  const deployments: Deployment[] = data?.data || [];
  const meta = data?.meta;
  const projects = projectsData?.data || [];
  const environments = environmentsData?.data ?? [];
  const chosenEnvironment = environments.find((env) => env.id === formEnvironmentId);
  // The server asks the environment whether a deployment needs sign-off; the
  // dialog only has to say so before the request is sent.
  const needsProductionApproval = chosenEnvironment?.type === 'production';

  const statusCounts = {
    pending: deployments.filter((d) => d.status === 'pending').length,
    in_progress: deployments.filter((d) => d.status === 'in_progress').length,
    completed: deployments.filter((d) => d.status === 'completed').length,
    failed: deployments.filter((d) => d.status === 'failed').length,
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const columns: DataTableColumn<Deployment>[] = [
    {
      key: 'version',
      header: 'Version',
      accessor: (dep) => (
        <div>
          <span className="font-medium">{dep.name}</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">v{dep.version}</span>
        </div>
      ),
      sortValue: (dep) => `${dep.name} v${dep.version}`,
      sortable: true,
    },
    {
      key: 'project',
      header: 'Project',
      accessor: (dep) => <Badge variant="outline">{dep.project.name}</Badge>,
      sortValue: (dep) => dep.project.name,
      sortable: true,
    },
    {
      key: 'team',
      header: 'Team',
      accessor: (dep) =>
        dep.team ? (
          <Badge variant="secondary">{dep.team.name}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        ),
      sortValue: (dep) => dep.team?.name ?? '',
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (dep) => <StatusBadge domain="generic" value={dep.status} />,
      sortValue: (dep) => dep.status,
      sortable: true,
    },
    {
      key: 'commit',
      header: 'Commit',
      accessor: (dep) => (
        <span className="font-mono text-xs">{dep.commitHash ? dep.commitHash.slice(0, 7) : '-'}</span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      accessor: (dep) => formatDuration(dep.durationSeconds),
      sortValue: (dep) => dep.durationSeconds ?? null,
      sortable: true,
      className: 'text-sm text-muted-foreground',
    },
    {
      key: 'deployer',
      header: 'Deployer',
      render: (dep) =>
        dep.deployedByUser ? (
          <div className="flex items-center gap-1.5">
            <UserAvatar user={dep.deployedByUser} size="sm" />
            <span>{dep.deployedByUser.name}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Unknown</span>
        ),
      skeletonClassName: 'h-8 w-8 rounded-full',
    },
    {
      key: 'date',
      header: 'Date',
      accessor: (dep) => (
        <span className="text-sm text-muted-foreground">
          {dep.deployedAt ? formatDate(dep.deployedAt) : formatDate(dep.createdAt)}
        </span>
      ),
      sortValue: (dep) => new Date(dep.deployedAt || dep.createdAt).getTime(),
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (dep) => (
        <div className="flex items-center justify-end gap-1">
          <Can permission="devops.deployment.update">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openEditDialog(dep)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </Can>
          <Can permission="devops.deployment.delete">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => openDeleteDialog(dep)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Deployments" description="Track and manage deployments across projects">
        <Can permission="devops.deployment.create">
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record Deployment
          </Button>
        </Can>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Pending', count: statusCounts.pending, color: 'text-yellow-600' },
          { label: 'In Progress', count: statusCounts.in_progress, color: 'text-blue-600' },
          { label: 'Completed', count: statusCounts.completed, color: 'text-green-600' },
          { label: 'Failed', count: statusCounts.failed, color: 'text-red-600' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`text-2xl font-bold ${item.color}`}>{item.count}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={deployments}
        loading={isLoading}
        loadingRows={5}
        error={
          error ? (
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-sm text-destructive">Failed to load deployments</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : undefined
        }
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: 'Search deployments...',
        }}
        filters={
          <>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {deploymentStatuses.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TeamFilter value={teamFilter} onChange={(v) => { setTeamFilter(v); setPage(1); }} />
          </>
        }
        pagination={{
          page,
          totalPages: meta?.lastPage ?? 1,
          onPageChange: setPage,
          totalItems: meta?.total,
          itemsPerPage: 20,
        }}
        emptyIcon={Rocket}
        emptyTitle="No deployments found"
      />

      {/* Create Dialog */}
      <FormDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) resetCreateForm();
        }}
        title="Record Deployment"
        description="Log a new deployment for tracking"
        maxWidth="lg"
        onSubmit={() => {
          if (!formName.trim() || !formVersion.trim()) {
            toast.error('Name and version are required');
            return;
          }
          createMutation.mutate({
            projectId: formProjectId,
            name: formName.trim(),
            version: formVersion.trim(),
            status: formStatus,
            teamId: formTeamId,
            environmentId: formEnvironmentId,
            branch: formBranch.trim() || undefined,
            commitHash: formCommit.trim() || undefined,
            notes: formNotes.trim() || undefined,
          });
        }}
        submitLabel="Record"
        isSubmitting={createMutation.isPending}
      >
        <div className="space-y-2">
          <Label>Project *</Label>
          <Select value={String(formProjectId)} onValueChange={(v) => setFormProjectId(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TeamPicker
          value={formTeamId}
          onChange={setFormTeamId}
          hint="Decides who approves this deployment."
        />
        <div className="space-y-2">
          <Label>Environment</Label>
          <Select
            value={formEnvironmentId == null ? 'none' : String(formEnvironmentId)}
            onValueChange={(v) => setFormEnvironmentId(v === 'none' ? null : Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="No environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No environment</SelectItem>
              {environments.map((env) => (
                <SelectItem key={env.id} value={String(env.id)}>
                  {env.name}
                  {env.type === 'production' ? ' — needs approval' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsProductionApproval && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Production releases are held for approval by the team lead before they go live.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g., Production Release"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Version *</Label>
            <Input
              value={formVersion}
              onChange={(e) => setFormVersion(e.target.value)}
              placeholder="e.g., 1.2.0"
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={formStatus} onValueChange={setFormStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deploymentStatuses
                  .filter((option) => option.value === 'pending' || option.value === 'in_progress')
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Branch</Label>
          <Input
            value={formBranch}
            onChange={(e) => setFormBranch(e.target.value)}
            placeholder="e.g., main"
          />
        </div>
        <div className="space-y-2">
          <Label>Commit Hash</Label>
          <Input
            value={formCommit}
            onChange={(e) => setFormCommit(e.target.value)}
            placeholder="e.g., abc1234"
          />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Deployment notes..."
            rows={3}
          />
        </div>
      </FormDialog>

      {/* Edit Dialog */}
      <FormDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setSelectedDeployment(null);
        }}
        title="Edit Deployment"
        description={`Update deployment "${selectedDeployment?.name}" v${selectedDeployment?.version}`}
        maxWidth="lg"
        onSubmit={() => {
          if (!editName.trim() || !editVersion.trim()) {
            toast.error('Name and version are required');
            return;
          }
          if (!selectedDeployment) return;
          updateMutation.mutate({
            id: selectedDeployment.id,
            data: {
              name: editName.trim(),
              version: editVersion.trim(),
              status: editStatus,
              branch: editBranch.trim() || undefined,
              commitHash: editCommit.trim() || undefined,
              notes: editNotes.trim() || undefined,
            },
          });
        }}
        submitLabel="Save Changes"
        isSubmitting={updateMutation.isPending}
      >
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="e.g., Production Release"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Version *</Label>
            <Input
              value={editVersion}
              onChange={(e) => setEditVersion(e.target.value)}
              placeholder="e.g., 1.2.0"
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deploymentStatuses.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Branch</Label>
          <Input
            value={editBranch}
            onChange={(e) => setEditBranch(e.target.value)}
            placeholder="e.g., main"
          />
        </div>
        <div className="space-y-2">
          <Label>Commit Hash</Label>
          <Input
            value={editCommit}
            onChange={(e) => setEditCommit(e.target.value)}
            placeholder="e.g., abc1234"
          />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Deployment notes..."
            rows={3}
          />
        </div>
      </FormDialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setSelectedDeployment(null); }}
        title="Delete Deployment"
        description={<>Are you sure you want to delete deployment &quot;{selectedDeployment?.name}&quot; v{selectedDeployment?.version}? This action cannot be undone.</>}
        onConfirm={() => {
          if (!selectedDeployment) return;
          deleteMutation.mutate(selectedDeployment.id);
        }}
        isConfirming={deleteMutation.isPending}
      />
    </div>
  );
}
