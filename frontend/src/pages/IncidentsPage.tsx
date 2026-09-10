import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import { formatDate, getStatusColor, getPriorityColor, formatStatus } from '@/lib/utils';
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
  const { hasRole } = useAuth();

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-sm text-muted-foreground">Report and track incidents</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Report Incident
        </Button>
      </div>

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

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Input
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
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
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-[300px]" />
                  <Skeleton className="h-6 w-[80px]" />
                  <Skeleton className="h-6 w-[80px]" />
                  <Skeleton className="h-4 w-[100px]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-destructive">Failed to load incidents</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No incidents found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Resolved At</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow
                    key={incident.id}
                    className="cursor-pointer"
                    onClick={() => openUpdateDialog(incident)}
                  >
                    <TableCell className="font-medium max-w-[300px] truncate">
                      {incident.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{incident.project.name}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(incident.severity)}>
                        {formatStatus(incident.severity)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(incident.status)}>
                        {formatStatus(incident.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {incident.reportedUser ? (
                        <div className="flex items-center gap-1.5">
                          <UserAvatar user={incident.reportedUser} size="sm" />
                          <span>{incident.reportedUser.name}</span>
                        </div>
                      ) : (
                        'Unknown'
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(incident.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {incident.resolvedAt ? formatDate(incident.resolvedAt) : '-'}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.lastPage > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.currentPage} of {meta.lastPage} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Incident</DialogTitle>
            <DialogDescription>Document a new incident for tracking and resolution</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
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
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Report Incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Dialog */}
      {showUpdateDialog && (
        <Dialog open={!!showUpdateDialog} onOpenChange={() => setShowUpdateDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Update Incident</DialogTitle>
              <DialogDescription>Update the status and details of this incident</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUpdateDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
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
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
