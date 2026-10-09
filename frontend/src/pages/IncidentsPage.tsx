import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '@/components/ui/form-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import apiClient from '@/api/client';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Incident {
  id: number;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  rootCause: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  project: { id: number; name: string; slug: string };
  reportedUser: { id: number; name: string; email: string } | null;
  assignedUser: { id: number; name: string; email: string } | null;
}

export function IncidentsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState<Incident | null>(null);

  // Form state for create
  const [formProjectId, setFormProjectId] = useState<number>(1);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSeverity, setFormSeverity] = useState('medium');
  const [formStatus, setFormStatus] = useState('open');
  const [formAffected, setFormAffected] = useState('');

  // Form state for update
  const [updateForm, setUpdateForm] = useState({
    title: '',
    description: '',
    severity: 'medium',
    status: 'open',
    rootCause: '',
    resolution: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['incidents', search, severityFilter, statusFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await apiClient.get('/incidents', { params });
      return res.data;
    },
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiClient.get('/projects', { params: { limit: 100 } });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/incidents', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowCreateDialog(false);
      resetForm();
      toast.success('Incident reported');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to report incident'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiClient.put(`/incidents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowUpdateDialog(null);
      toast.success('Incident updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update incident'),
  });

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormSeverity('medium');
    setFormStatus('open');
    setFormAffected('');
    setFormProjectId(1);
  };

  const openUpdateDialog = (incident: Incident) => {
    setUpdateForm({
      title: incident.title,
      description: incident.description || '',
      severity: incident.severity,
      status: incident.status,
      rootCause: incident.rootCause || '',
      resolution: incident.resolution || '',
    });
    setShowUpdateDialog(incident);
  };

  const incidents: Incident[] = data?.data || [];
  const meta = data?.meta;
  const projects = projectsData?.data || [];

  const severityCounts = {
    critical: incidents.filter((i) => i.severity === 'critical' && i.status !== 'resolved').length,
    high: incidents.filter((i) => i.severity === 'high' && i.status !== 'resolved').length,
    medium: incidents.filter((i) => i.severity === 'medium' && i.status !== 'resolved').length,
    low: incidents.filter((i) => i.severity === 'low' && i.status !== 'resolved').length,
  };

  const columns: DataTableColumn<Incident>[] = [
    {
      key: 'title',
      header: 'Title',
      accessor: (incident) => (
        <span className="font-medium max-w-[300px] truncate block">{incident.title}</span>
      ),
      sortValue: (incident) => incident.title,
      sortable: true,
    },
    {
      key: 'project',
      header: 'Project',
      accessor: (incident) => <Badge variant="outline">{incident.project.name}</Badge>,
      sortValue: (incident) => incident.project.name,
      sortable: true,
    },
    {
      key: 'severity',
      header: 'Severity',
      accessor: (incident) => <StatusBadge domain="helpdeskPriority" value={incident.severity} />,
      sortValue: (incident) => incident.severity,
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (incident) => <StatusBadge domain="helpdeskStatus" value={incident.status} />,
      sortValue: (incident) => incident.status,
      sortable: true,
    },
    {
      key: 'reporter',
      header: 'Reporter',
      render: (incident) =>
        incident.reportedUser ? (
          <div className="flex items-center gap-1.5">
            <UserAvatar user={incident.reportedUser} size="sm" />
            <span>{incident.reportedUser.name}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Unknown</span>
        ),
      skeletonClassName: 'h-8 w-8 rounded-full',
    },
    {
      key: 'createdAt',
      header: 'Created',
      accessor: (incident) => (
        <span className="text-sm text-muted-foreground">{formatDate(incident.createdAt)}</span>
      ),
      sortValue: (incident) => new Date(incident.createdAt).getTime(),
      sortable: true,
    },
    {
      key: 'resolvedAt',
      header: 'Resolved At',
      accessor: (incident) => (
        <span className="text-sm text-muted-foreground">
          {incident.resolvedAt ? formatDate(incident.resolvedAt) : '-'}
        </span>
      ),
      sortValue: (incident) => (incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : null),
      sortable: true,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-12',
      render: (incident) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            openUpdateDialog(incident);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Incidents" description="Report and track incidents">
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Report Incident
        </Button>
      </PageHeader>

      {/* Severity Summary */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Critical', count: severityCounts.critical, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
          { label: 'High', count: severityCounts.high, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
          { label: 'Medium', count: severityCounts.medium, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
          { label: 'Low', count: severityCounts.low, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`text-2xl font-bold px-2 py-0.5 rounded ${item.color}`}>
                  {item.count}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={incidents}
        loading={isLoading}
        onRowClick={openUpdateDialog}
        error={
          error ? (
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-sm text-destructive">Failed to load incidents</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : undefined
        }
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: 'Search incidents...',
        }}
        filters={
          <>
            <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="identified">Identified</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        pagination={{
          page,
          totalPages: meta?.lastPage ?? 1,
          onPageChange: setPage,
          totalItems: meta?.total,
          itemsPerPage: 20,
        }}
        emptyIcon={AlertTriangle}
        emptyTitle="No incidents found"
      />

      {/* Create Dialog */}
      <FormDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) resetForm();
        }}
        title="Report Incident"
        description="Document a new incident for tracking and resolution"
        maxWidth="lg"
        onSubmit={() => {
          if (!formTitle.trim()) { toast.error('Title is required'); return; }
          createMutation.mutate({
            projectId: formProjectId,
            title: formTitle.trim(),
            description: formDescription.trim() || undefined,
            severity: formSeverity,
            status: formStatus,
            affectedServices: formAffected.trim() || undefined,
          });
        }}
        submitLabel="Report Incident"
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
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Title *</Label>
          <Input
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="Brief description of the incident"
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Detailed description of what happened..."
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Severity *</Label>
            <Select value={formSeverity} onValueChange={setFormSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={formStatus} onValueChange={setFormStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="identified">Identified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Affected Services</Label>
          <Input
            value={formAffected}
            onChange={(e) => setFormAffected(e.target.value)}
            placeholder="e.g., API Gateway, Database, Auth Service"
          />
        </div>
      </FormDialog>

      {/* Update Dialog */}
      {showUpdateDialog && (
        <FormDialog
          open={!!showUpdateDialog}
          onOpenChange={() => setShowUpdateDialog(null)}
          title="Update Incident"
          description="Update the status and details of this incident"
          maxWidth="lg"
          onSubmit={() => {
            updateMutation.mutate({
              id: showUpdateDialog.id,
              data: {
                title: updateForm.title,
                description: updateForm.description,
                severity: updateForm.severity,
                status: updateForm.status,
                rootCause: updateForm.rootCause || undefined,
                resolution: updateForm.resolution || undefined,
              },
            });
          }}
          submitLabel="Update"
          isSubmitting={updateMutation.isPending}
        >
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={updateForm.title}
              onChange={(e) => setUpdateForm(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={updateForm.description}
              onChange={(e) => setUpdateForm(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={updateForm.severity}
                onValueChange={(v) => setUpdateForm(prev => ({ ...prev, severity: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={updateForm.status}
                onValueChange={(v) => setUpdateForm(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="identified">Identified</SelectItem>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Root Cause</Label>
            <Textarea
              value={updateForm.rootCause}
              onChange={(e) => setUpdateForm(prev => ({ ...prev, rootCause: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Resolution</Label>
            <Textarea
              value={updateForm.resolution}
              onChange={(e) => setUpdateForm(prev => ({ ...prev, resolution: e.target.value }))}
              rows={2}
            />
          </div>
        </FormDialog>
      )}
    </div>
  );
}
