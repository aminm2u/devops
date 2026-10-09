import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import { Plus, Eye, Send, Trash2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface DirectPurchase {
  id: number;
  referenceNumber: string;
  description: string;
  amount: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  status: string;
  invoiceNumber?: string;
  vendor?: { id: number; name: string };
  project?: { id: number; name: string };
  requestedBy?: { id: number; name: string };
}

export function DirectPurchaseListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['directPurchases', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return apiClient.get(`/direct-purchases?${params}`).then((r) => r.data.data);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/direct-purchases', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directPurchases'] });
      setIsCreateOpen(false);
      toast.success('Direct purchase created');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/direct-purchases/${id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directPurchases'] });
      toast.success('Submitted for approval');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/direct-purchases/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directPurchases'] });
      toast.success('Direct purchase approved');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/direct-purchases/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directPurchases'] });
      toast.success('Direct purchase cancelled');
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string) || 0;
    const taxAmount = parseFloat(formData.get('taxAmount') as string) || 0;
    createMutation.mutate({
      description: formData.get('description'),
      vendorId: formData.get('vendorId') ? parseInt(formData.get('vendorId') as string) : null,
      projectId: formData.get('projectId') ? parseInt(formData.get('projectId') as string) : null,
      amount,
      taxAmount,
      grandTotal: amount + taxAmount,
      invoiceNumber: formData.get('invoiceNumber') || null,
    });
  };

  const columns: DataTableColumn<DirectPurchase>[] = [
    {
      key: 'referenceNumber',
      header: 'Reference',
      accessor: (dp) => <span className="font-mono font-medium">{dp.referenceNumber}</span>,
      sortValue: (dp) => dp.referenceNumber,
      sortable: true,
    },
    {
      key: 'description',
      header: 'Description',
      accessor: (dp) => dp.description,
    },
    {
      key: 'vendor',
      header: 'Vendor',
      accessor: (dp) => dp.vendor?.name || '-',
      sortValue: (dp) => dp.vendor?.name ?? '',
      sortable: true,
    },
    {
      key: 'grandTotal',
      header: 'Grand Total',
      accessor: (dp) => `${dp.currency} ${dp.grandTotal.toLocaleString()}`,
      sortValue: (dp) => dp.grandTotal,
      sortable: true,
    },
    {
      key: 'project',
      header: 'Project',
      accessor: (dp) => dp.project?.name || <span className="text-muted-foreground">-</span>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (dp) => <StatusBadge domain="directPurchase" value={dp.status} />,
      sortValue: (dp) => dp.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (dp) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/direct-purchases/${dp.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          {dp.status === 'draft' && (
            <Button variant="ghost" size="sm" onClick={() => submitMutation.mutate(dp.id)}>
              <Send className="h-4 w-4" />
            </Button>
          )}
          {dp.status === 'submitted' && (
            <Button variant="ghost" size="sm" onClick={() => approveMutation.mutate(dp.id)}>
              <Check className="h-4 w-4" />
            </Button>
          )}
          {['draft', 'submitted'].includes(dp.status) && (
            <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(dp.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Direct Purchases" description="Quick purchases that bypass RFQ process">
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Direct Purchase
        </Button>
      </PageHeader>

      <FormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create Direct Purchase"
        description="Quick direct purchase bypassing the RFQ process"
        maxWidth="lg"
        onSubmit={handleCreate}
        submitLabel="Create"
        isSubmitting={createMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Description *</Label><Input name="description" required /></div>
          <div><Label>Vendor ID</Label><Input name="vendorId" type="number" /></div>
          <div><Label>Invoice Number</Label><Input name="invoiceNumber" /></div>
          <div><Label>Amount (MYR) *</Label><Input name="amount" type="number" step="0.01" required /></div>
          <div><Label>Tax Amount (MYR)</Label><Input name="taxAmount" type="number" step="0.01" defaultValue="0" /></div>
          <div><Label>Project ID</Label><Input name="projectId" type="number" /></div>
        </div>
      </FormDialog>

      <DataTable
        columns={columns}
        data={purchases}
        loading={isLoading}
        search={{ value: search, onChange: setSearch, placeholder: 'Search direct purchases...' }}
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyTitle="No direct purchases found"
      />
    </div>
  );
}
