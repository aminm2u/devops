import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import { Eye, Send, Trash2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface PurchaseOrder {
  id: number;
  poNumber: string;
  type: string;
  status: string;
  totalAmount: number;
  grandTotal: number;
  currency: string;
  vendor: { id: number; name: string };
  items: { id: number; description: string; qty: number; unitPrice: number }[];
  requisition?: { id: number; division?: string };
  project?: { id: number; name: string };
}

export function PurchaseOrderListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: purchaseOrders = [], isLoading } = useQuery({
    queryKey: ['purchaseOrders', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return apiClient.get(`/purchase-orders?${params}`).then((r) => r.data.data);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/purchase-orders/${id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      toast.success('PO submitted for approval');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/purchase-orders/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      toast.success('PO approved');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/purchase-orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      toast.success('PO cancelled');
    },
  });

  const columns: DataTableColumn<PurchaseOrder>[] = [
    {
      key: 'poNumber',
      header: 'PO Number',
      accessor: (po) => <span className="font-mono font-medium">{po.poNumber}</span>,
      sortValue: (po) => po.poNumber,
      sortable: true,
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (po) => <Badge variant="outline">{po.type.toUpperCase()}</Badge>,
      sortValue: (po) => po.type,
      sortable: true,
    },
    {
      key: 'vendor',
      header: 'Vendor',
      accessor: (po) => po.vendor?.name || '-',
      sortValue: (po) => po.vendor?.name ?? '',
      sortable: true,
    },
    {
      key: 'items',
      header: 'Items',
      accessor: (po) => po.items.length,
      sortable: true,
    },
    {
      key: 'grandTotal',
      header: 'Grand Total',
      accessor: (po) => `${po.currency} ${po.grandTotal.toLocaleString()}`,
      sortValue: (po) => po.grandTotal,
      sortable: true,
    },
    {
      key: 'project',
      header: 'Project',
      accessor: (po) => po.project?.name || <span className="text-muted-foreground">-</span>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (po) => <StatusBadge domain="po" value={po.status} />,
      sortValue: (po) => po.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (po) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          {po.status === 'draft' && (
            <Button variant="ghost" size="sm" onClick={() => submitMutation.mutate(po.id)}>
              <Send className="h-4 w-4" />
            </Button>
          )}
          {po.status === 'submitted' && (
            <Button variant="ghost" size="sm" onClick={() => approveMutation.mutate(po.id)}>
              <Check className="h-4 w-4" />
            </Button>
          )}
          {['draft', 'submitted'].includes(po.status) && (
            <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(po.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase Orders" description="Manage and track purchase orders / local orders">
        <Button onClick={() => navigate('/purchase-orders/new')}>+ New PO</Button>
      </PageHeader>

      <DataTable
        columns={columns}
        data={purchaseOrders}
        loading={isLoading}
        search={{ value: search, onChange: setSearch, placeholder: 'Search POs...' }}
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="partially_received">Partially Received</SelectItem>
              <SelectItem value="fully_received">Fully Received</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyTitle="No purchase orders found"
      />
    </div>
  );
}
