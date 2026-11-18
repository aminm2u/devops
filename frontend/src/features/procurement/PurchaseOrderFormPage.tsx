import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/layout/PageHeader';
import apiClient from '@/api/client';
import { formatMYR } from '@/lib/format';
import type { RequisitionForm } from '@/types';

/**
 * PO creation — blank, or sourced from an approved requisition.
 *
 * Sourcing prefills the line items and inherits the RF's project/budget; the
 * vendor is always a manual pick (an RF never names a vendor). The totals
 * shown are informational — the server recomputes from the lines on save.
 */

interface PoItemRow {
  description: string;
  qty: number | '';
  unitPrice: number | '';
  uom: string;
}

const emptyRow: PoItemRow = { description: '', qty: 1, unitPrice: 0, uom: 'Unit' };

export function PurchaseOrderFormPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkRfId = searchParams.get('requisitionId');

  const [sourcedRf, setSourcedRf] = useState<RequisitionForm | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [poType, setPoType] = useState<'po' | 'lo'>('po');
  const [taxAmount, setTaxAmount] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PoItemRow[]>([{ ...emptyRow }]);
  const [formError, setFormError] = useState('');

  // Approved/in-procurement RFs are the only legal sources.
  const { data: eligible } = useQuery({
    queryKey: ['requisitions', 'po-eligible'],
    queryFn: async () => {
      const [approved, inProc] = await Promise.all([
        apiClient.get('/requisitions', { params: { status: 'approved', limit: 100 } }),
        apiClient.get('/requisitions', { params: { status: 'in_procurement', limit: 100 } }),
      ]);
      return [
        ...((approved.data?.data ?? []) as RequisitionForm[]),
        ...((inProc.data?.data ?? []) as RequisitionForm[]),
      ];
    },
  });

  // Deep-link: load the RF straight into sourced mode.
  const { data: deepLinkData, isError: deepLinkFailed } = useQuery({
    queryKey: ['requisition', deepLinkRfId],
    queryFn: async () => {
      const res = await apiClient.get(`/requisitions/${deepLinkRfId}`);
      return res.data.data as RequisitionForm;
    },
    enabled: !!deepLinkRfId,
  });

  useEffect(() => {
    if (deepLinkData) applySource(deepLinkData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkData]);

  const { data: vendors } = useQuery({
    queryKey: ['vendors', 'for-po'],
    queryFn: async () => {
      const res = await apiClient.get('/vendors', { params: { limit: 500 } });
      return res.data?.data ?? [];
    },
  });

  function applySource(rf: RequisitionForm) {
    setSourcedRf(rf);
    setItems(
      rf.items?.length
        ? rf.items.map((item) => ({
            description: item.description,
            qty: Number(item.qty) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            uom: item.uom || 'Unit',
          }))
        : [{ ...emptyRow }]
    );
    setFormError('');
  }

  const clearSource = () => {
    setSourcedRf(null);
    setItems([{ ...emptyRow }]);
    if (deepLinkRfId) {
      searchParams.delete('requisitionId');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const eligibleOptions = (eligible ?? []).filter((rf) => {
    if (sourcedRf) return false;
    const needle = pickerQuery.trim().toLowerCase();
    if (!needle) return true;
    return (
      String(rf.id).includes(needle) ||
      (rf.purpose ?? '').toLowerCase().includes(needle) ||
      rf.division?.toLowerCase().includes(needle)
    );
  });

  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const tax = Number(taxAmount || 0);
  const grandTotal = subtotal + tax;

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        type: poType,
        vendorId: Number(vendorId),
        requisitionId: sourcedRf?.id ?? null,
        projectId: sourcedRf?.projectId ?? null,
        budgetItemId: sourcedRf?.budgetItemId ?? null,
        taxAmount: tax,
        totalAmount: subtotal,
        grandTotal,
        currency: 'MYR',
        deliveryAddress: deliveryAddress.trim() || null,
        expectedDeliveryDate: expectedDeliveryDate
          ? new Date(expectedDeliveryDate + 'T00:00:00').toISOString()
          : null,
        paymentTerms: paymentTerms.trim() || null,
        notes: notes.trim() || null,
        items: items
          .filter((row) => row.description.trim())
          .map((row) => ({
            description: row.description.trim(),
            qty: Number(row.qty) || 1,
            unitPrice: Number(row.unitPrice) || 0,
            uom: row.uom || null,
          })),
      };
      const res = await apiClient.post('/purchase-orders', payload);
      return res.data.data;
    },
    onSuccess: (po) => {
      navigate(`/procurement/purchase-orders/${po.id}`);
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error || 'Failed to create purchase order');
    },
  });

  const handleSubmit = () => {
    setFormError('');
    if (!vendorId) {
      setFormError('Pick a vendor for this order');
      return;
    }
    if (!items.some((row) => row.description.trim())) {
      setFormError('At least one item with a description is required');
      return;
    }
    createMutation.mutate();
  };

  const updateRow = (index: number, field: keyof PoItemRow, value: any) => {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="New Purchase Order"
        description="Blank order, or sourced from an approved requisition"
        icon={ShoppingCart}
      />

      {formError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {formError}
        </div>
      )}

      {/* Source requisition */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Source Requisition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sourcedRf ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium">
                  RF-{String(sourcedRf.id).padStart(4, '0')}
                </span>
                <StatusBadge domain="requisition" value={sourcedRf.status} />
                <span className="truncate text-sm text-muted-foreground">
                  {sourcedRf.purpose || 'No purpose recorded'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium tabular-nums">
                  {formatMYR(sourcedRf.totalEstimatedCost)}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearSource} aria-label="Unlink requisition">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : deepLinkFailed && deepLinkRfId ? (
            <p className="text-sm text-muted-foreground">
              Requisition #{deepLinkRfId} could not be loaded — raise this PO without a source.
            </p>
          ) : (
            <div className="space-y-2">
              <Input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search approved requisitions by number, purpose or division…"
              />
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {eligibleOptions.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No approved requisitions — this PO will be a standalone order.
                  </p>
                ) : (
                  eligibleOptions.map((rf) => (
                    <button
                      key={rf.id}
                      type="button"
                      className="flex w-full items-center justify-between border-b border-border/40 px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50"
                      onClick={() => applySource(rf)}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-mono font-medium">RF-{String(rf.id).padStart(4, '0')}</span>
                        <StatusBadge domain="requisition" value={rf.status} />
                        <span className="truncate text-muted-foreground">
                          {rf.purpose || rf.division || ''}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatMYR(rf.totalEstimatedCost)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {(vendors ?? []).map((vendor: any) => (
                    <SelectItem key={vendor.id} value={String(vendor.id)}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={poType} onValueChange={(v) => setPoType(v as 'po' | 'lo')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="po">Purchase Order</SelectItem>
                  <SelectItem value="lo">Local Order</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value="MYR" disabled />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Expected Delivery</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g., Net 30" />
            </div>
            <div className="space-y-2">
              <Label>Delivery Address</Label>
              <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          {sourcedRf?.projectId && (
            <p className="text-xs text-muted-foreground">
              Project and budget are inherited from the source requisition.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Items</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setItems((prev) => [...prev, { ...emptyRow }])}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Item
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="w-20">Qty</TableHead>
                <TableHead className="w-24">UoM</TableHead>
                <TableHead className="w-32 text-right">Unit Price</TableHead>
                <TableHead className="w-32 text-right">Line Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(index, 'description', e.target.value)}
                      placeholder="What is being ordered"
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={row.qty}
                      onChange={(e) => updateRow(index, 'qty', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                      className="h-8 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell>
                    <Input value={row.uom} onChange={(e) => updateRow(index, 'uom', e.target.value)} className="h-8" />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(index, 'unitPrice', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      className="h-8 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMYR((Number(row.qty) || 0) * (Number(row.unitPrice) || 0))}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={items.length <= 1}
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-col items-end gap-1 text-sm">
            <div className="flex gap-8">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="w-36 text-right font-medium tabular-nums">{formatMYR(subtotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Tax</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                className="h-8 w-36 text-right"
                placeholder="0.00"
              />
            </div>
            <div className="flex gap-8 border-t pt-1 font-semibold">
              <span>Grand Total</span>
              <span className="w-36 text-right tabular-nums">{formatMYR(grandTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          Create Purchase Order
        </Button>
      </div>
    </div>
  );
}
