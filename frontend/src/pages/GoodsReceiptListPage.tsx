import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import { Eye, Trash2, PackageOpen } from 'lucide-react';
import toast from 'react-hot-toast';

interface GoodsReceipt {
  id: number;
  grnNumber: string;
  receivedDate: string;
  status: string;
  inspectionNotes?: string;
  purchaseOrder: { id: number; poNumber: string; vendor?: { name: string } };
  items: { id: number; description: string; receivedQty: number; acceptedQty: number; rejectedQty: number }[];
}

export function GoodsReceiptListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ['goodsReceipts', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return apiClient.get(`/goods-receipts?${params}`).then((r) => r.data.data);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/goods-receipts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] });
      toast.success('Goods receipt cancelled');
    },
  });

  const columns: DataTableColumn<GoodsReceipt>[] = [
    {
      key: 'grnNumber',
      header: 'GRN Number',
      accessor: (gr) => <span className="font-mono font-medium">{gr.grnNumber}</span>,
      sortValue: (gr) => gr.grnNumber,
      sortable: true,
    },
    {
      key: 'poNumber',
      header: 'PO Number',
      accessor: (gr) => gr.purchaseOrder?.poNumber || '-',
    },
    {
      key: 'vendor',
      header: 'Vendor',
      accessor: (gr) => gr.purchaseOrder?.vendor?.name || '-',
      sortValue: (gr) => gr.purchaseOrder?.vendor?.name ?? '',
      sortable: true,
    },
    {
      key: 'items',
      header: 'Items',
      accessor: (gr) => gr.items.length,
      sortable: true,
    },
    {
      key: 'receivedDate',
      header: 'Received Date',
      accessor: (gr) => new Date(gr.receivedDate).toLocaleDateString(),
      sortValue: (gr) => new Date(gr.receivedDate).getTime(),
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (gr) => <StatusBadge domain="grn" value={gr.status} />,
      sortValue: (gr) => gr.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (gr) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/goods-receipts/${gr.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          {gr.status === 'pending' && (
            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(gr.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Goods Receipts" description="Track material deliveries and inspections" />

      <DataTable
        columns={columns}
        data={receipts}
        loading={isLoading}
        search={{ value: search, onChange: setSearch, placeholder: 'Search GRNs...' }}
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="inspected">Inspected</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyIcon={PackageOpen}
        emptyTitle="No goods receipts found"
      />
    </div>
  );
}
