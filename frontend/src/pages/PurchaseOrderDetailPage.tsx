import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { InfoRow, DetailList } from '@/components/info-row';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { ArrowLeft, Send } from 'lucide-react';
import toast from 'react-hot-toast';

interface PoDetail {
  id: number;
  poNumber: string;
  type: string;
  status: string;
  totalAmount: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  deliveryAddress?: string;
  expectedDeliveryDate?: string;
  paymentTerms?: string;
  notes?: string;
  vendor: { id: number; name: string; contactPerson?: string; email?: string; phone?: string };
  items: { id: number; description: string; qty: number; unitPrice: number; uom?: string; totalAmount: number; receivedQty: number }[];
  requisition?: { id: number; division?: string; totalEstimatedCost?: number };
  quotation?: { id: number; quotedAmount: number; vendor?: { name: string } };
  project?: { id: number; name: string };
  budgetItem?: { id: number; description: string; allocatedBudget: number; utilizedBudget: number };
  createdBy?: { id: number; name: string };
  approvedBy?: { id: number; name: string };
  goodsReceipts: { id: number; grnNumber: string; status: string; receivedDate: string }[];
  payments: { id: number; referenceNumber: string; amount: number; status: string }[];
}

type PoItem = PoDetail['items'][number];
type GrRow = PoDetail['goodsReceipts'][number];
type PaymentRow = PoDetail['payments'][number];

export function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();



  const { data: po, isLoading } = useQuery({
    queryKey: ['purchaseOrder', id],
    queryFn: () => apiClient.get(`/purchase-orders/${id}`).then((r) => r.data.data as PoDetail),
  });

  const submitMutation = useMutation({
    mutationFn: () => apiClient.put(`/purchase-orders/${id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrder', id] });
      toast.success('PO submitted for approval');
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => apiClient.put(`/purchase-orders/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrder', id] });
      toast.success('PO approved');
    },
  });

  if (isLoading) return <div className="text-center py-8">Loading...</div>;
  if (!po) return <div className="text-center py-8">Purchase order not found</div>;

  const itemColumns: DataTableColumn<PoItem>[] = [
    { key: 'description', header: 'Description', accessor: (item) => item.description },
    { key: 'qty', header: 'Qty', accessor: (item) => item.qty },
    { key: 'unitPrice', header: 'Unit Price', accessor: (item) => `${po.currency} ${item.unitPrice.toLocaleString()}` },
    { key: 'uom', header: 'UoM', accessor: (item) => item.uom || '-' },
    { key: 'total', header: 'Total', accessor: (item) => `${po.currency} ${item.totalAmount.toLocaleString()}` },
    {
      key: 'receivedQty',
      header: 'Received Qty',
      render: (item) => (
        <Badge variant={item.receivedQty >= item.qty ? 'default' : 'outline'}>
          {item.receivedQty} / {item.qty}
        </Badge>
      ),
    },
  ];

  const grColumns: DataTableColumn<GrRow>[] = [
    { key: 'grnNumber', header: 'GRN #', className: 'font-mono text-sm', accessor: (gr) => gr.grnNumber },
    { key: 'receivedDate', header: 'Received', accessor: (gr) => new Date(gr.receivedDate).toLocaleDateString() },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (gr) => <Badge variant="outline">{gr.status}</Badge>,
    },
  ];

  const paymentColumns: DataTableColumn<PaymentRow>[] = [
    { key: 'referenceNumber', header: 'Reference', className: 'font-mono text-sm', accessor: (p) => p.referenceNumber },
    { key: 'amount', header: 'Amount', accessor: (p) => `${po.currency} ${p.amount.toLocaleString()}` },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (p) => <Badge variant="outline">{p.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/purchase-orders')} className="mb-2 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <PageHeader
          size="sm"
          title={po.poNumber}
          description={`${po.type.toUpperCase()} - ${po.vendor?.name}`}
        >
          {po.status === 'draft' && (
            <Button onClick={() => submitMutation.mutate()}>
              <Send className="mr-2 h-4 w-4" /> Submit for Approval
            </Button>
          )}
          {po.status === 'submitted' && (
            <Button onClick={() => approveMutation.mutate()}>Approve</Button>
          )}
        </PageHeader>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
          <CardContent>
            <DetailList>
              <InfoRow label="Status" value={<StatusBadge domain="po" value={po.status} />} />
              <InfoRow label="Type" value={<Badge variant="outline">{po.type.toUpperCase()}</Badge>} />
              <InfoRow
                label="Grand Total"
                value={<span className="text-xl font-bold">{po.currency} {po.grandTotal.toLocaleString()}</span>}
              />
              <InfoRow
                label="Expected Delivery"
                value={po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString() : '-'}
              />
            </DetailList>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader>
          <CardContent>
            <p className="font-medium mb-2">{po.vendor?.name}</p>
            <DetailList>
              {po.vendor?.contactPerson && <InfoRow label="Contact" value={po.vendor.contactPerson} />}
              {po.vendor?.email && <InfoRow label="Email" value={po.vendor.email} />}
              {po.vendor?.phone && <InfoRow label="Phone" value={po.vendor.phone} />}
              {po.project && <InfoRow label="Project" value={po.project.name} />}
              {po.requisition && <InfoRow label="Requisition" value={`#${po.requisition.id}`} />}
              {po.budgetItem && <InfoRow label="Budget" value={po.budgetItem.description} />}
              {po.createdBy && <InfoRow label="Created by" value={po.createdBy.name} />}
              {po.approvedBy && <InfoRow label="Approved by" value={po.approvedBy.name} />}
            </DetailList>
          </CardContent>
        </Card>
      </div>

      {po.deliveryAddress && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Delivery Address</CardTitle></CardHeader>
          <CardContent><p>{po.deliveryAddress}</p></CardContent>
        </Card>
      )}

      {po.paymentTerms && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Payment Terms</CardTitle></CardHeader>
          <CardContent><p>{po.paymentTerms}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={itemColumns} data={po.items} rowKey={(item) => item.id} emptyTitle="No line items" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Goods Receipts ({po.goodsReceipts.length})</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={grColumns}
              data={po.goodsReceipts}
              rowKey={(gr) => gr.id}
              emptyTitle="No goods receipts yet"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Payments ({po.payments.length})</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={paymentColumns}
              data={po.payments}
              rowKey={(p) => p.id}
              emptyTitle="No payments yet"
            />
          </CardContent>
        </Card>
      </div>

      {po.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
          <CardContent><p>{po.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
