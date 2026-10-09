import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import apiClient from '@/api/client';
import { formatDate, formatStatus } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Domain {
  id: number;
  projectId: number;
  name: string;
  type: string;
  status: string;
  registrar: string | null;
  expirationDate: string | null;
  autoRenew: boolean;
  isActive: boolean;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  project?: { id: number; name: string; slug: string };
}

const emptyForm = {
  projectId: 0,
  name: '',
  type: 'primary',
  registrar: '',
  expirationDate: '',
  autoRenew: false,
};

export function DomainsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<Domain | null>(null);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['domains', search, statusFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await apiClient.get('/domains', { params });
      return res.data;
    },
  });

  // Separate query for stats (fetches all domains)
  const { data: statsData } = useQuery({
    queryKey: ['domains-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/domains', { params: { limit: 1000 } });
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
    mutationFn: (d: any) => apiClient.post('/domains', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setShowFormDialog(false);
      setForm(emptyForm);
      toast.success('Domain created');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create domain'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiClient.put(`/domains/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setShowFormDialog(false);
      setEditingDomain(null);
      setForm(emptyForm);
      toast.success('Domain updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update domain'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/domains/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setShowDeleteDialog(null);
      toast.success('Domain deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete domain'),
  });

  const syncNpmMutation = useMutation({
    mutationFn: () => apiClient.post('/npm/sync-domains'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      const { imported, updated, skipped } = res.data.data;
      toast.success(`NPM sync complete: ${imported} imported, ${updated} updated, ${skipped} skipped`);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to sync domains from NPM';
      toast.error(msg);
    },
  });

  const openCreateDialog = () => {
    setEditingDomain(null);
    setForm({
      ...emptyForm,
      projectId: 0,
    });
    setShowFormDialog(true);
  };

  const openEditDialog = (domain: Domain) => {
    setEditingDomain(domain);
    setForm({
      projectId: domain.projectId,
      name: domain.name,
      type: domain.type,
      registrar: domain.registrar || '',
      expirationDate: domain.expirationDate ? new Date(domain.expirationDate).toISOString().split('T')[0] : '',
      autoRenew: domain.autoRenew,
    });
    setShowFormDialog(true);
  };

  const handleFormSubmit = () => {
    if (!form.name.trim()) {
      toast.error('Domain name is required');
      return;
    }
    const payload: any = {
      projectId: form.projectId || null,
      name: form.name.trim(),
      type: form.type,
      registrar: form.registrar.trim() || null,
      expirationDate: form.expirationDate ? new Date(form.expirationDate + 'T00:00:00').toISOString() : null,
      autoRenew: form.autoRenew,
    };

    if (editingDomain) {
      updateMutation.mutate({ id: editingDomain.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const domains: Domain[] = data?.data || [];
  const meta = data?.meta;
  const projects = projectsData?.data || [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Stats - use statsData for all domains
  const allDomains: Domain[] = statsData?.data || [];
  const stats = {
    total: meta?.total || allDomains.length,
    active: allDomains.filter((d) => d.status === 'active').length,
    expiringSoon: allDomains.filter((d) => {
      if (!d.expirationDate) return false;
      const daysUntil = Math.ceil((new Date(d.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysUntil <= 30 && daysUntil > 0;
    }).length,
    expired: allDomains.filter((d) => {
      if (!d.expirationDate) return false;
      return new Date(d.expirationDate) < new Date();
    }).length,
  };

  const getExpiryBadge = (expirationDate: string | null) => {
    if (!expirationDate) {
      return <Badge variant="outline">Unknown</Badge>;
    }
    const daysUntil = Math.ceil((new Date(expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0) {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Expired</Badge>;
    }
    if (daysUntil <= 30) {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{daysUntil}d</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{daysUntil}d</Badge>;
  };

  const columns: DataTableColumn<Domain>[] = [
    {
      key: 'name',
      header: 'Domain',
      accessor: (domain) => (
        <div className="flex items-center gap-2 font-medium">
          <Globe className="h-4 w-4 text-muted-foreground" />
          {domain.name}
        </div>
      ),
      sortValue: (domain) => domain.name,
      sortable: true,
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (domain) => <Badge variant="outline">{formatStatus(domain.type)}</Badge>,
    },
    {
      key: 'project',
      header: 'Project',
      accessor: (domain) => <Badge variant="outline">{domain.project?.name || 'Internal'}</Badge>,
      sortValue: (domain) => domain.project?.name ?? '',
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (domain) => <StatusBadge domain="generic" value={domain.status} />,
      sortValue: (domain) => domain.status,
      sortable: true,
    },
    {
      key: 'registrar',
      header: 'Registrar',
      accessor: (domain) => (
        <span className="text-sm text-muted-foreground">{domain.registrar || '-'}</span>
      ),
    },
    {
      key: 'expires',
      header: 'Expires',
      accessor: (domain) => (
        <div className="flex items-center gap-2">
          <span className="text-sm">{domain.expirationDate ? formatDate(domain.expirationDate) : '-'}</span>
          {getExpiryBadge(domain.expirationDate)}
        </div>
      ),
      sortValue: (domain) => (domain.expirationDate ? new Date(domain.expirationDate).getTime() : null),
      sortable: true,
    },
    {
      key: 'autoRenew',
      header: 'Auto-Renew',
      accessor: (domain) =>
        domain.autoRenew ? (
          <CheckCircle className="h-4 w-4 text-emerald-600" />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (domain) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(domain)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setShowDeleteDialog(domain)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader title="Domains" description="Manage and monitor registered domains">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncNpmMutation.mutate()}
          disabled={syncNpmMutation.isPending}
        >
          {syncNpmMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Globe className="mr-2 h-4 w-4" />
          )}
          Sync from NPM
        </Button>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Domain
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Domains</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Globe className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expiring Soon</p>
                <p className="text-2xl font-bold text-amber-600">{stats.expiringSoon}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={domains}
        loading={isLoading}
        error={
          error ? (
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-sm text-destructive">Failed to load domains</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : undefined
        }
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: 'Search domains...',
        }}
        filters={
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        }
        pagination={{
          page,
          totalPages: meta?.lastPage ?? 1,
          onPageChange: setPage,
          totalItems: meta?.total,
          itemsPerPage: 20,
        }}
        emptyIcon={Globe}
        emptyTitle="No domains found"
        emptyAction={
          <Button variant="link" size="sm" onClick={() => syncNpmMutation.mutate()}>
            Sync domains from NPM
          </Button>
        }
      />

      {/* Create / Edit Dialog */}
      <FormDialog
        open={showFormDialog}
        onOpenChange={(open) => {
          setShowFormDialog(open);
          if (!open) setEditingDomain(null);
        }}
        title={editingDomain ? 'Edit Domain' : 'Add Domain'}
        description={editingDomain ? 'Update the domain details' : 'Add a new domain'}
        maxWidth="lg"
        onSubmit={handleFormSubmit}
        submitLabel={editingDomain ? 'Update' : 'Create'}
        isSubmitting={isPending}
      >
        <FormField label="Domain Name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., example.com" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Project">
            <Select value={String(form.projectId)} onValueChange={(v) => setForm({ ...form, projectId: Number(v) || 0 })}>
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Internal</SelectItem>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Type">
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="redirect">Redirect</SelectItem>
                <SelectItem value="alias">Alias</SelectItem>
                <SelectItem value="subdomain">Subdomain</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <FormField label="Registrar">
          <Input value={form.registrar} onChange={(e) => setForm({ ...form, registrar: e.target.value })} placeholder="e.g., GoDaddy, Namecheap" />
        </FormField>
        <FormField label="Expiration Date">
          <DatePicker value={form.expirationDate} onChange={(v) => setForm({ ...form, expirationDate: v })} />
        </FormField>
        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant={form.autoRenew ? "default" : "outline"}
            size="sm"
            onClick={() => setForm({ ...form, autoRenew: !form.autoRenew })}
          >
            {form.autoRenew ? "Auto-renew: ON" : "Auto-renew: OFF"}
          </Button>
        </div>
      </FormDialog>

      {/* Delete Dialog */}
      <ConfirmDialog
        open={!!showDeleteDialog}
        onOpenChange={() => setShowDeleteDialog(null)}
        title="Delete Domain"
        description={`Are you sure you want to delete "${showDeleteDialog?.name}"? This action cannot be undone.`}
        onConfirm={() => showDeleteDialog && deleteMutation.mutate(showDeleteDialog.id)}
        isConfirming={deleteMutation.isPending}
      />
    </div>
  );
}
