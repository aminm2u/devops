import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Rocket, Plus, Loader2, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import apiClient from '@/api/client';
import { formatDate, getStatusColor, formatStatus } from '@/lib/utils';
import toast from 'react-hot-toast';

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
  project: { id: number; name: string; slug: string };
  deployedByUser: { id: number; name: string; email: string } | null;
}

export function DeploymentsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);

  // Create form state
  const [formProjectId, setFormProjectId] = useState<number>(1);
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
    queryKey: ['deployments', search, statusFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await apiClient.get('/deployments', { params });
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deployments</h1>
          <p className="text-sm text-muted-foreground">Track and manage deployments across projects</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Record Deployment
        </Button>
      </div>

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

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Input
            placeholder="Search deployments..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="rolled_back">Rolled Back</SelectItem>
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
                  <Skeleton className="h-4 w-[120px]" />
                  <Skeleton className="h-6 w-[80px]" />
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[100px]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-destructive">Failed to load deployments</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : deployments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Rocket className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No deployments found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Deployer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deployments.map((dep) => (
                  <TableRow key={dep.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{dep.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">v{dep.version}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{dep.project.name}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(dep.status)}>
                        {formatStatus(dep.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {dep.commitHash ? dep.commitHash.slice(0, 7) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(dep.durationSeconds)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dep.deployedByUser ? (
                        <div className="flex items-center gap-1.5">
                          <UserAvatar user={dep.deployedByUser} size="sm" />
                          <span>{dep.deployedByUser.name}</span>
                        </div>
                      ) : (
                        'Unknown'
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dep.deployedAt ? formatDate(dep.deployedAt) : formatDate(dep.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(dep)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => openDeleteDialog(dep)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.lastPage} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Deployment</DialogTitle>
            <DialogDescription>Log a new deployment for tracking</DialogDescription>
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
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetCreateForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!formName.trim() || !formVersion.trim()) {
                  toast.error('Name and version are required');
                  return;
                }
                createMutation.mutate({
                  projectId: formProjectId,
                  name: formName.trim(),
                  version: formVersion.trim(),
                  status: formStatus,
                  branch: formBranch.trim() || undefined,
                  commitHash: formCommit.trim() || undefined,
                  notes: formNotes.trim() || undefined,
                });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Deployment</DialogTitle>
            <DialogDescription>
              Update deployment &quot;{selectedDeployment?.name}&quot; v{selectedDeployment?.version}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="rolled_back">Rolled Back</SelectItem>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setSelectedDeployment(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
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
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Deployment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete deployment &quot;{selectedDeployment?.name}&quot; v{selectedDeployment?.version}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setSelectedDeployment(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedDeployment) return;
                deleteMutation.mutate(selectedDeployment.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
