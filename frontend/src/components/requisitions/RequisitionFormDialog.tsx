import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
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
import { FormDialog } from '@/components/ui/form-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import apiClient from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { RequisitionForm, RequisitionItem } from '@/types';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

const DIVISIONS = ['IT', 'DMA', 'HR', 'BD', 'DI', 'ADMIN'];
const UOMS = ['Unit', 'Set', 'Box', 'Piece', 'Lot', 'Month', 'Year', 'License'];

const emptyItem: RequisitionItem = {
  description: '',
  qty: 1,
  unitPrice: 0,
  uom: 'Unit',
  remark: '',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(amount);
}

// ── Requisition Form Dialog (Create / Edit) ────────────────────────────────
// Shared by the Requisitions page and the project Finance tab. When `projectId`
// is passed the requisition is linked to that project with the given
// `purchaseType`; the form and its approval lifecycle stay identical.

export function RequisitionFormDialog({
  item,
  projectId,
  purchaseType,
  onSubmit,
  onClose,
  isSubmitting,
}: {
  item?: RequisitionForm | null;
  projectId?: number | null;
  purchaseType?: 'project' | 'non_project';
  onSubmit: (data: any) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const { user } = useAuth();

  const { data: budgetData } = useQuery({
    queryKey: ['budget-items-for-requisition'],
    queryFn: async () => {
      const res = await apiClient.get('/budget', { params: { limit: 500 } });
      return res.data;
    },
  });

  const [form, setForm] = useState({
    division: item?.division || 'IT',
    processOwner: item?.processOwner || '',
    budgetItemId: item?.budgetItemId || null as number | null,
    totalEstimatedCost: item?.totalEstimatedCost || 0,
    requiredDate: item?.requiredDate ? new Date(item.requiredDate).toISOString().split('T')[0] : '',
    purpose: item?.purpose || '',
    status: item?.status || 'draft',
  });

  const [items, setItems] = useState<RequisitionItem[]>(
    item?.items?.length
      ? item.items.map((i) => ({ ...i }))
      : [{ ...emptyItem }]
  );

  const budgetItems = budgetData?.data || [];

  const addItem = () => {
    setItems([...items, { ...emptyItem }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof RequisitionItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const calculatedTotal = items.reduce((sum, item) => {
    return sum + (item.qty * (item.unitPrice || 0));
  }, 0);

  const handleSubmit = () => {
    if (!form.division) {
      toast.error('Division is required');
      return;
    }
    if (items.length === 0 || !items.some((i) => i.description.trim())) {
      toast.error('At least one item with a description is required');
      return;
    }

    const payload = {
      ...form,
      budgetItemId: form.budgetItemId || null,
      totalEstimatedCost: calculatedTotal,
      requiredDate: form.requiredDate ? new Date(form.requiredDate + 'T00:00:00').toISOString() : null,
      items: items.filter((i) => i.description.trim()).map((i) => ({
        ...i,
        id: i.id || undefined,
        qty: Number(i.qty) || 1,
        unitPrice: Number(i.unitPrice) || 0,
      })),
      ...(projectId != null && { projectId }),
      ...(purchaseType && { purchaseType }),
      ...(!item && user?.name && {
        requestedByName: user.name,
        requestedByDate: new Date().toISOString(),
      }),
    };

    onSubmit(payload);
  };

  const getStatusBadge = (status: string) => (
    <StatusBadge domain="requisition" value={status} />
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={item ? 'Edit Requisition Form' : 'New Requisition Form'}
      description={item ? 'Update the requisition details' : 'Create a new requisition form'}
      maxWidth="xl"
      onSubmit={handleSubmit}
      submitLabel={item ? 'Update' : 'Create'}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-6">
        {/* Top Section */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Division / Department *</Label>
            <Select value={form.division} onValueChange={(v) => setForm({ ...form, division: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIVISIONS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Process Owner</Label>
            <Input
              value={form.processOwner}
              onChange={(e) => setForm({ ...form, processOwner: e.target.value })}
              placeholder="Enter process owner name"
            />
          </div>
          <div className="space-y-2">
            <Label>Required Date</Label>
            <DatePicker
              value={form.requiredDate}
              onChange={(v) => setForm({ ...form, requiredDate: v })}
            />
          </div>
        </div>

        {/* Budget Item Selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Budget Item <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Select
            value={form.budgetItemId ? String(form.budgetItemId) : 'none'}
            onValueChange={(v) => setForm({ ...form, budgetItemId: v === 'none' ? null : Number(v) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a budget item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No budget item</SelectItem>
              {budgetItems.map((b: any) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.description} ({b.division}) - {formatCurrency(b.allocatedBudget)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.budgetItemId && (
            <p className="text-xs text-muted-foreground">
              Remaining budget will be calculated from the selected budget item
            </p>
          )}
        </div>

        {/* Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold flex items-center gap-2">
              Items
              <Badge variant="secondary">{items.length}</Badge>
            </Label>
            <Button size="sm" variant="outline" type="button" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </div>
          <div className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10">No.</TableHead>
                  <TableHead>Description *</TableHead>
                  <TableHead className="w-20">Qty *</TableHead>
                  <TableHead className="w-28">Unit Price (RM) *</TableHead>
                  <TableHead className="w-28">UoM</TableHead>
                  <TableHead>Remark</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        placeholder="Enter description"
                        className="h-8 border-border/40 shadow-none"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateItem(index, 'qty', parseInt(e.target.value) || 1)}
                        min="1"
                        className="h-8 border-border/40 shadow-none"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.unitPrice || 0}
                        onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="h-8 border-border/40 shadow-none"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.uom || 'Unit'}
                        onValueChange={(v) => updateItem(index, 'uom', v)}
                      >
                        <SelectTrigger className="h-8 border-border/40 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UOMS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.remark || ''}
                        onChange={(e) => updateItem(index, 'remark', e.target.value)}
                        placeholder="Optional remark"
                        className="h-8 border-border/40 shadow-none"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        disabled={items.length <= 1}
                        className="h-8 w-8 p-0 text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Total */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">Total Estimated Cost</span>
          <span className="text-lg font-bold tabular-nums">{formatCurrency(calculatedTotal)}</span>
        </div>

        <div className="space-y-2">
          <Label>Purpose</Label>
          <Textarea
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            placeholder="Enter the purpose of this requisition"
            rows={3}
          />
        </div>

        {/* Approval Section (read-only for editing) */}
        {item && (item.requestedByName || item.approvedByName) && (
          <div className="grid gap-4 rounded-lg border border-border/40 bg-muted/30 p-4 sm:grid-cols-2">
            {item.requestedByName && (
              <div className="space-y-1">
                <Label className="font-semibold text-sm">Requested By</Label>
                <p className="text-sm">{item.requestedByName}</p>
                {item.requestedByDate && (
                  <p className="text-xs text-muted-foreground">{formatDate(item.requestedByDate)}</p>
                )}
              </div>
            )}
            {item.approvedByName && (
              <div className="space-y-1">
                <Label className="font-semibold text-sm">Approved By</Label>
                <p className="text-sm">{item.approvedByName}</p>
                {item.approvedByDate && (
                  <p className="text-xs text-muted-foreground">{formatDate(item.approvedByDate)}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status (read-only for editing) */}
        {item && (
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
            <span className="text-sm font-medium">Status:</span>
            {getStatusBadge(item.status)}
            {item.status === 'submitted' && (
              <span className="text-xs text-muted-foreground">Awaiting approval from admin</span>
            )}
            {item.status === 'approved' && (
              <span className="text-xs text-green-600">Budget utilization updated</span>
            )}
            {item.status === 'rejected' && (item as any).metadata?.rejectionReason && (
              <span className="text-xs text-red-600">Reason: {(item as any).metadata.rejectionReason}</span>
            )}
          </div>
        )}
      </div>
    </FormDialog>
  );
}
