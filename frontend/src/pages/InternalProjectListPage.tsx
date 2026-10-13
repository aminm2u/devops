import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import { ProgressBar } from '@/components/progress-bar';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface InternalProject {
  id: number;
  name: string;
  description?: string;
  scopeOfWork?: string;
  totalValue: number;
  currency: string;
  status: string;
  progress: number;
  startDate?: string;
  expectedEndDate?: string;
  vendor?: { id: number; name: string };
  project?: { id: number; name: string };
  assignedTo?: { id: number; name: string };
}

export function InternalProjectListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<InternalProject | null>(null);
  const [startDate, setStartDate] = useState('');
  const [expectedEndDate, setExpectedEndDate] = useState('');

  useEffect(() => {
    setStartDate(editingProject?.startDate?.split('T')[0] || '');
    setExpectedEndDate(editingProject?.expectedEndDate?.split('T')[0] || '');
  }, [editingProject, isCreateOpen]);
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['internalProjects', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return apiClient.get(`/internal-projects?${params}`).then((r) => r.data.data);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/internal-projects', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internalProjects'] });
      setIsCreateOpen(false);
      toast.success('Internal project created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiClient.put(`/internal-projects/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internalProjects'] });
      setIsCreateOpen(false);
      setEditingProject(null);
      toast.success('Internal project updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/internal-projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internalProjects'] });
      toast.success('Internal project deleted');
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      description: formData.get('description') || null,
      scopeOfWork: formData.get('scopeOfWork') || null,
      vendorId: formData.get('vendorId') ? parseInt(formData.get('vendorId') as string) : null,
      projectId: formData.get('projectId') ? parseInt(formData.get('projectId') as string) : null,
      totalValue: parseFloat(formData.get('totalValue') as string) || 0,
      startDate: startDate || null,
      expectedEndDate: expectedEndDate || null,
    };

    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      setEditingProject(null);
    }
  };

  const columns: DataTableColumn<InternalProject>[] = [
    {
      key: 'name',
      header: 'Name',
      accessor: (p) => <span className="font-medium">{p.name}</span>,
      sortValue: (p) => p.name,
      sortable: true,
    },
    {
      key: 'vendor',
      header: 'Vendor',
      accessor: (p) => p.vendor?.name || '-',
      sortValue: (p) => p.vendor?.name ?? '',
      sortable: true,
    },
    {
      key: 'project',
      header: 'Project',
      accessor: (p) => p.project?.name || '-',
    },
    {
      key: 'totalValue',
      header: 'Value',
      accessor: (p) => `${p.currency} ${p.totalValue.toLocaleString()}`,
      sortValue: (p) => p.totalValue,
      sortable: true,
    },
    {
      key: 'progress',
      header: 'Progress',
      accessor: (p) => (
        <div className="flex items-center gap-2">
          <ProgressBar value={p.progress} tone="primary" className="w-16" />
          <span className="text-sm text-muted-foreground">{p.progress}%</span>
        </div>
      ),
      sortValue: (p) => p.progress,
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (p) => <StatusBadge domain="internalProject" value={p.status} />,
      sortValue: (p) => p.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditingProject(p); setIsCreateOpen(true); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(p.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Internal Projects" description="Service-based projects executed by vendors">
        <Button onClick={() => { setEditingProject(null); setIsCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Internal Project
        </Button>
      </PageHeader>

      <FormDialog
        key={editingProject?.id || 'new'}
        open={isCreateOpen}
        onOpenChange={handleOpenChange}
        title={editingProject ? 'Edit Internal Project' : 'Create Internal Project'}
        description={editingProject ? 'Update project scope, vendor and timelines' : 'Set up a new vendor-executed internal project'}
        maxWidth="lg"
        onSubmit={handleSubmit}
        submitLabel={editingProject ? 'Update' : 'Create'}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Name *</Label><Input name="name" defaultValue={editingProject?.name} required /></div>
          <div className="col-span-2"><Label>Description</Label><Textarea name="description" defaultValue={editingProject?.description} /></div>
          <div className="col-span-2"><Label>Scope of Work</Label><Textarea name="scopeOfWork" defaultValue={editingProject?.scopeOfWork} /></div>
          <div><Label>Vendor ID</Label><Input name="vendorId" type="number" defaultValue={editingProject?.vendor?.id} /></div>
          <div><Label>Parent Project ID</Label><Input name="projectId" type="number" defaultValue={editingProject?.project?.id} /></div>
          <div><Label>Total Value (MYR)</Label><Input name="totalValue" type="number" step="0.01" defaultValue={editingProject?.totalValue} /></div>
          <div><Label>Start Date</Label><DatePicker value={startDate} onChange={setStartDate} /></div>
          <div><Label>Expected End Date</Label><DatePicker value={expectedEndDate} onChange={setExpectedEndDate} /></div>
        </div>
      </FormDialog>

      <DataTable
        columns={columns}
        data={projects}
        loading={isLoading}
        search={{ value: search, onChange: setSearch, placeholder: 'Search internal projects...' }}
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyTitle="No internal projects found"
      />
    </div>
  );
}
