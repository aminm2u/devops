import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import { Plus, Send, Trash2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';

interface Payment {
  id: number;
  referenceNumber: string;
  amount: number;
  taxAmount: number;
  totalPaid: number;
  currency: string;
  status: string;
  paymentMethod?: string;
  paymentDate?: string;
  purchaseOrder?: { id: number; poNumber: string };
  directPurchase?: { id: number; referenceNumber: string };
  paidBy?: { id: number; name: string };
}

export function PaymentListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');

  useEffect(() => {
    if (isCreateOpen) setPaymentDate('');
  }, [isCreateOpen]);
  const queryClient = useQueryClient();

  const { data: paymentMethods } = useReferenceData('payment_method');

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return apiClient.get(`/payments?${params}`).then((r) => r.data.data);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/payments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsCreateOpen(false);
      toast.success('Payment created');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/payments/${id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Payment submitted for approval');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/payments/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Payment approved and marked as paid');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Payment cancelled');
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string) || 0;
    const taxAmount = parseFloat(formData.get('taxAmount') as string) || 0;
    createMutation.mutate({
      purchaseOrderId: formData.get('purchaseOrderId') ? parseInt(formData.get('purchaseOrderId') as string) : null,
      directPurchaseId: formData.get('directPurchaseId') ? parseInt(formData.get('directPurchaseId') as string) : null,
      amount,
      taxAmount,
      totalPaid: amount + taxAmount,
      paymentMethod: formData.get('paymentMethod') || null,
      paymentDate: paymentDate || null,
      notes: formData.get('notes') || null,
    });
  };

  const columns: DataTableColumn<Payment>[] = [
    {
      key: 'referenceNumber',
      header: 'Reference',
      accessor: (p) => <span className="font-mono font-medium">{p.referenceNumber}</span>,
      sortValue: (p) => p.referenceNumber,
      sortable: true,
    },
    {
      key: 'order',
      header: 'PO / DP',
      accessor: (p) => p.purchaseOrder?.poNumber || p.directPurchase?.referenceNumber || '-',
    },
    {
      key: 'totalPaid',
      header: 'Amount',
      accessor: (p) => `${p.currency} ${p.totalPaid.toLocaleString()}`,
      sortValue: (p) => p.totalPaid,
      sortable: true,
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      accessor: (p) => p.paymentMethod || '-',
    },
    {
      key: 'paymentDate',
      header: 'Date',
      accessor: (p) => (p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '-'),
      sortValue: (p) => (p.paymentDate ? new Date(p.paymentDate).getTime() : null),
      sortable: true,
    },
    {
      key: 'paidBy',
      header: 'Paid By',
      accessor: (p) => p.paidBy?.name || '-',
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (p) => <StatusBadge domain="payment" value={p.status} />,
      sortValue: (p) => p.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (p) => (
        <div className="flex gap-1">
          {p.status === 'draft' && (
            <Button variant="ghost" size="sm" onClick={() => submitMutation.mutate(p.id)}>
              <Send className="h-4 w-4" />
            </Button>
          )}
          {p.status === 'submitted' && (
            <Button variant="ghost" size="sm" onClick={() => approveMutation.mutate(p.id)}>
              <Check className="h-4 w-4" />
            </Button>
          )}
          {p.status !== 'paid' && (
            <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(p.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Track payments against purchase orders and direct purchases">
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Payment
        </Button>
      </PageHeader>

      <FormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create Payment"
        description="Record a new payment for a purchase order or direct purchase"
        maxWidth="lg"
        onSubmit={handleCreate}
        submitLabel="Create"
        isSubmitting={createMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Purchase Order ID</Label><Input name="purchaseOrderId" type="number" /></div>
          <div><Label>Direct Purchase ID</Label><Input name="directPurchaseId" type="number" /></div>
          <div><Label>Amount (MYR) *</Label><Input name="amount" type="number" step="0.01" required /></div>
          <div><Label>Tax Amount (MYR)</Label><Input name="taxAmount" type="number" step="0.01" defaultValue="0" /></div>
          <div><Label>Payment Method</Label>
            <Select name="paymentMethod">
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                {toSelectOptions(paymentMethods).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Payment Date</Label><DatePicker value={paymentDate} onChange={setPaymentDate} /></div>
          <div className="col-span-2"><Label>Notes</Label><Input name="notes" /></div>
        </div>
      </FormDialog>

      <DataTable
        columns={columns}
        data={payments}
        loading={isLoading}
        search={{ value: search, onChange: setSearch, placeholder: 'Search payments...' }}
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyTitle="No payments found"
      />
    </div>
  );
}
