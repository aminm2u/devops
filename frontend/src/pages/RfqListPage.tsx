import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormDialog } from '@/components/ui/form-dialog';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
import { Plus, Eye, Send, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';

interface RfqItem {
  id: number;
  description: string;
  specification?: string;
  qty: number;
  uom?: string;
}

interface Rfq {
  id: number;
  rfqNumber: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  closingDate?: string;
  issueDate?: string;
  requisition?: { id: number; division?: string; totalEstimatedCost?: number };
  items: RfqItem[];
  quotations: { id: number; vendorId: number; quotedAmount: number; status: string; isAwarded: boolean }[];
}

export function RfqListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [closingDate, setClosingDate] = useState('');

  useEffect(() => {
    if (isCreateOpen) setClosingDate('');
  }, [isCreateOpen]);
  const [createItems, setCreateItems] = useState<{ description: string; specification: string; qty: number; uom: string }[]>([
    { description: '', specification: '', qty: 1, uom: '' },
  ]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: uomOptions } = useReferenceData('uom');

  const { data: rfqs = [], isLoading } = useQuery({
    queryKey: ['rfqs', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      return apiClient.get(`/rfq?${params}`).then((r) => r.data.data);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/rfq', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] });
      setIsCreateOpen(false);
      setCreateItems([{ description: '', specification: '', qty: 1, uom: '' }]);
      toast.success('RFQ created successfully');
    },
    onError: () => toast.error('Failed to create RFQ'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => apiClient.put(`/rfq/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] });
      toast.success('RFQ sent successfully');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/rfq/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] });
      toast.success('RFQ cancelled');
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      title: formData.get('title'),
      description: formData.get('description') || null,
      type: formData.get('type') || 'material',
      closingDate: closingDate || null,
      items: createItems.filter((i) => i.description),
    });
  };

  const addItem = () => setCreateItems([...createItems, { description: '', specification: '', qty: 1, uom: '' }]);
  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...createItems];
    (updated[index] as any)[field] = field === 'qty' ? parseInt(value) || 1 : value;
    setCreateItems(updated);
  };
  const removeItem = (index: number) => setCreateItems(createItems.filter((_, i) => i !== index));

  const columns: DataTableColumn<Rfq>[] = [
    {
      key: 'rfqNumber',
      header: 'RFQ Number',
      accessor: (rfq) => <span className="font-mono font-medium">{rfq.rfqNumber}</span>,
      sortValue: (rfq) => rfq.rfqNumber,
      sortable: true,
    },
    {
      key: 'title',
      header: 'Title',
      accessor: (rfq) => rfq.title,
      sortable: true,
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (rfq) => <Badge variant="outline">{rfq.type}</Badge>,
      sortValue: (rfq) => rfq.type,
      sortable: true,
    },
    {
      key: 'items',
      header: 'Items',
      accessor: (rfq) => rfq.items.length,
      sortable: true,
    },
    {
      key: 'quotations',
      header: 'Quotations',
      accessor: (rfq) => rfq.quotations.length,
      sortable: true,
    },
    {
      key: 'closingDate',
      header: 'Closing Date',
      accessor: (rfq) => (rfq.closingDate ? new Date(rfq.closingDate).toLocaleDateString() : '-'),
      sortValue: (rfq) => (rfq.closingDate ? new Date(rfq.closingDate).getTime() : null),
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (rfq) => <StatusBadge domain="rfq" value={rfq.status} />,
      sortValue: (rfq) => rfq.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (rfq) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/rfq/${rfq.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          {rfq.status === 'draft' && (
            <Button variant="ghost" size="sm" onClick={() => sendMutation.mutate(rfq.id)}>
              <Send className="h-4 w-4" />
            </Button>
          )}
          {rfq.status === 'draft' && (
            <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(rfq.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Request for Quotation" description="Manage RFQs and vendor quotations">
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create RFQ
        </Button>
      </PageHeader>

      <FormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Create RFQ"
        description="Fill in the details to request quotes from vendors"
        maxWidth="xl"
        onSubmit={handleCreate}
        submitLabel="Create RFQ"
        isSubmitting={createMutation.isPending}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Title *</Label><Input name="title" required /></div>
          <div><Label>Type</Label>
            <Select name="type" defaultValue="material">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="material">Material</SelectItem>
                <SelectItem value="service">Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Closing Date</Label><DateTimePicker value={closingDate} onChange={setClosingDate} /></div>
          <div className="col-span-2"><Label>Description</Label><Textarea name="description" /></div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Items</Label>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>+ Add Item</Button>
          </div>
          <div className="space-y-2">
            {createItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4"><Label className="text-xs">Description</Label>
                  <Input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required />
                </div>
                <div className="col-span-3"><Label className="text-xs">Specification</Label>
                  <Input value={item.specification} onChange={(e) => updateItem(idx, 'specification', e.target.value)} />
                </div>
                <div className="col-span-2"><Label className="text-xs">Qty</Label>
                  <Input type="number" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} min={1} />
                </div>
                <div className="col-span-2"><Label className="text-xs">UoM</Label>
                  <Select value={item.uom} onValueChange={(v) => updateItem(idx, 'uom', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {toSelectOptions(uomOptions).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  {createItems.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </FormDialog>

      <DataTable
        columns={columns}
        data={rfqs}
        loading={isLoading}
        search={{ value: search, onChange: setSearch, placeholder: 'Search RFQs...' }}
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="receiving">Receiving</SelectItem>
              <SelectItem value="evaluating">Evaluating</SelectItem>
              <SelectItem value="awarded">Awarded</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyTitle="No RFQs found"
      />
    </div>
  );
}
