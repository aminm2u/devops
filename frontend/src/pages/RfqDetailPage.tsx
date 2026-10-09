import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/form-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { InfoRow, DetailList } from '@/components/info-row';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { ArrowLeft, Plus, Send, Award, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface RfqItem {
  id: number;
  description: string;
  specification?: string;
  qty: number;
  uom?: string;
}

interface QuotationItem {
  id: number;
  description: string;
  qty: number;
  unitPrice: number;
  uom?: string;
  totalAmount: number;
}

interface Quotation {
  id: number;
  vendorId: number;
  quotedAmount: number;
  currency: string;
  validityDays?: number;
  deliveryDays?: number;
  paymentTerms?: string;
  remarks?: string;
  status: string;
  isAwarded: boolean;
  vendor: { id: number; name: string; contactPerson?: string; email?: string };
  items: QuotationItem[];
}

export function RfqDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();


  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [quoteItems, setQuoteItems] = useState<{ description: string; qty: number; unitPrice: number; uom: string }[]>([
    { description: '', qty: 1, unitPrice: 0, uom: '' },
  ]);

  const { data: rfq, isLoading } = useQuery({
    queryKey: ['rfq', id],
    queryFn: () => apiClient.get(`/rfq/${id}`).then((r) => r.data.data),
  });

  const quoteMutation = useMutation({
    mutationFn: (data: any) => apiClient.post(`/rfq/${id}/quotations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfq', id] });
      setIsQuoteOpen(false);
      setQuoteItems([{ description: '', qty: 1, unitPrice: 0, uom: '' }]);
      toast.success('Quotation submitted');
    },
  });

  const awardMutation = useMutation({
    mutationFn: (quoteId: number) => apiClient.put(`/rfq/${id}/quotations/${quoteId}/award`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfq', id] });
      toast.success('Quotation awarded');
    },
  });

  const addQuoteItem = () => setQuoteItems([...quoteItems, { description: '', qty: 1, unitPrice: 0, uom: '' }]);
  const updateQuoteItem = (idx: number, field: string, value: any) => {
    const updated = [...quoteItems];
    if (field === 'qty' || field === 'unitPrice') {
      (updated[idx] as any)[field] = parseFloat(value) || 0;
    } else {
      (updated[idx] as any)[field] = value;
    }
    setQuoteItems(updated);
  };
  const removeQuoteItem = (idx: number) => setQuoteItems(quoteItems.filter((_, i) => i !== idx));

  const handleQuoteSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const items = quoteItems.filter((i) => i.description);
    quoteMutation.mutate({
      vendorId: parseInt(formData.get('vendorId') as string),
      quotedAmount: items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0),
      currency: 'MYR',
      validityDays: formData.get('validityDays') ? parseInt(formData.get('validityDays') as string) : null,
      deliveryDays: formData.get('deliveryDays') ? parseInt(formData.get('deliveryDays') as string) : null,
      paymentTerms: formData.get('paymentTerms') || null,
      remarks: formData.get('remarks') || null,
      items,
    });
  };

  const itemColumns: DataTableColumn<RfqItem>[] = [
    { key: 'description', header: 'Description', accessor: (item) => item.description },
    { key: 'specification', header: 'Specification', accessor: (item) => item.specification || '-' },
    { key: 'qty', header: 'Qty', accessor: (item) => item.qty },
    { key: 'uom', header: 'UoM', accessor: (item) => item.uom || '-' },
  ];

  const quoteItemColumns = (q: Quotation): DataTableColumn<QuotationItem>[] => [
    { key: 'description', header: 'Description', accessor: (item) => item.description },
    { key: 'qty', header: 'Qty', accessor: (item) => item.qty },
    { key: 'unitPrice', header: 'Unit Price', accessor: (item) => `${q.currency} ${item.unitPrice.toLocaleString()}` },
    { key: 'uom', header: 'UoM', accessor: (item) => item.uom || '-' },
    { key: 'total', header: 'Total', align: 'right', accessor: (item) => `${q.currency} ${item.totalAmount.toLocaleString()}` },
  ];

  if (isLoading) return <div className="text-center py-8">Loading...</div>;
  if (!rfq) return <div className="text-center py-8">RFQ not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/rfq')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{rfq.rfqNumber}</h1>
            <p className="text-muted-foreground">{rfq.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {rfq.status === 'draft' && (
            <Button onClick={() => apiClient.put(`/rfq/${id}/send`).then(() => {
              queryClient.invalidateQueries({ queryKey: ['rfq', id] });
              toast.success('RFQ sent');
            })}>
              <Send className="mr-2 h-4 w-4" /> Send RFQ
            </Button>
          )}
          {rfq.status !== 'draft' && (
            <>
              <Button onClick={() => setIsQuoteOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Quotation
              </Button>

              <FormDialog
                open={isQuoteOpen}
                onOpenChange={setIsQuoteOpen}
                title="Submit Vendor Quotation"
                description="Enter quotation details and pricing for this RFQ"
                maxWidth="xl"
                onSubmit={handleQuoteSubmit}
                submitLabel="Submit Quotation"
                isSubmitting={quoteMutation.isPending}
              >
                <div className="grid grid-cols-3 gap-4">
                  <div><Label>Vendor ID *</Label><Input name="vendorId" type="number" required /></div>
                  <div><Label>Validity (days)</Label><Input name="validityDays" type="number" /></div>
                  <div><Label>Delivery (days)</Label><Input name="deliveryDays" type="number" /></div>
                  <div className="col-span-3"><Label>Payment Terms</Label><Input name="paymentTerms" /></div>
                  <div className="col-span-3"><Label>Remarks</Label><Textarea name="remarks" /></div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Quotation Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addQuoteItem}>+ Add</Button>
                  </div>
                  {quoteItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end mb-2">
                      <div className="col-span-4">
                        <Input placeholder="Description" value={item.description} onChange={(e) => updateQuoteItem(idx, 'description', e.target.value)} required />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Qty" value={item.qty} onChange={(e) => updateQuoteItem(idx, 'qty', e.target.value)} min={1} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Unit Price" value={item.unitPrice || ''} onChange={(e) => updateQuoteItem(idx, 'unitPrice', e.target.value)} min={0} step={0.01} />
                      </div>
                      <div className="col-span-2">
                        <Input placeholder="UoM" value={item.uom} onChange={(e) => updateQuoteItem(idx, 'uom', e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <span className="text-xs font-medium block truncate">= {(item.qty * item.unitPrice).toFixed(2)}</span>
                      </div>
                      <div className="col-span-1">
                        {quoteItems.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeQuoteItem(idx)} className="h-8 w-8 p-0 text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </FormDialog>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Overview</CardTitle></CardHeader>
        <CardContent>
          <DetailList>
            <InfoRow label="Status" value={<StatusBadge domain="rfq" value={rfq.status} />} />
            <InfoRow label="Type" value={<Badge variant="outline">{rfq.type}</Badge>} />
            <InfoRow
              label="Closing Date"
              value={rfq.closingDate ? new Date(rfq.closingDate).toLocaleDateString() : '-'}
            />
          </DetailList>
        </CardContent>
      </Card>

      {rfq.description && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Description</CardTitle></CardHeader>
          <CardContent><p>{rfq.description}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>RFQ Items</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={itemColumns} data={rfq.items} rowKey={(item) => item.id} emptyTitle="No items" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quotations ({rfq.quotations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rfq.quotations.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No quotations received yet</p>
          ) : (
            <div className="space-y-4">
              {rfq.quotations.map((q: Quotation) => (
                <div key={q.id} className={`border rounded-lg p-4 ${q.isAwarded ? 'border-green-500 bg-green-50' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{q.vendor.name}</h3>
                      <Badge variant={q.isAwarded ? 'default' : 'outline'}>{q.status}</Badge>
                      {q.isAwarded && <Badge className="bg-green-100 text-green-800">Awarded</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{q.currency} {q.quotedAmount.toLocaleString()}</span>
                      {rfq.status !== 'draft' && !q.isAwarded && (
                        <Button size="sm" onClick={() => awardMutation.mutate(q.id)}>
                          <Award className="h-4 w-4 mr-1" /> Award
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm text-muted-foreground mb-2">
                    {q.validityDays && <span>Valid for {q.validityDays} days</span>}
                    {q.deliveryDays && <span>Delivery in {q.deliveryDays} days</span>}
                    {q.paymentTerms && <span>Terms: {q.paymentTerms}</span>}
                    {q.remarks && <span>Note: {q.remarks}</span>}
                  </div>
                  {q.items.length > 0 && (
                    <DataTable
                      columns={quoteItemColumns(q)}
                      data={q.items}
                      rowKey={(item) => item.id}
                      emptyTitle="No items"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
