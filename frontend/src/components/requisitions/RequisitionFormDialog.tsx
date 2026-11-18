import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Paperclip, Plus, Trash2 } from 'lucide-react';
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
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';
import { RequisitionForm, RequisitionItem } from '@/types';
import { formatDate } from '@/lib/utils';
import toast from '@/lib/toast';

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
  scopeItems,
  lockedScopeItemId,
  onSubmit,
  onClose,
  isSubmitting,
}: {
  item?: RequisitionForm | null;
  projectId?: number | null;
  purchaseType?: 'project' | 'non_project';
  /**
   * Project mode: when scope items are provided, this is spend raised for a
   * specific scope item — division/process-owner/budget pickers disappear (the
   * project is the budget), a scope picker ("sub-budget") appears, and
   * supporting documents (quotations etc.) can be attached.
   */
  scopeItems?: { id: number; wbsNumber: string; title: string; planCost: string | number }[];
  lockedScopeItemId?: number | null;
  onSubmit: (data: any) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const isProjectMode = !!(projectId != null && scopeItems && scopeItems.length > 0);
  const { user } = useAuth();
  // Division labels are reference data — resolve the stored code ("PMO") to
  // its display name ("Project Management Office") for the Charged To line.
  const { data: divisionData } = useReferenceData('division');
  // Units of measure are master data too (Settings → Reference Data). Division
  // is no longer picked — departmental RFs are charged to the raiser's own
  // department, derived server-side from their HR record.
  const { data: uomData } = useReferenceData('uom');
  const uoms = toSelectOptions(uomData);
  const divisionLabel = (code: string) => {
    const entry = (divisionData ?? []).find((d) => d.value === code);
    return entry?.label ?? code;
  };

  const { data: budgetData } = useQuery({
    queryKey: ['budget-items-for-requisition'],
    queryFn: async () => {
      const res = await apiClient.get('/budget', { params: { limit: 500 } });
      return res.data;
    },
    enabled: !isProjectMode,
  });

  const [form, setForm] = useState({
    budgetItemId: item?.budgetItemId || null as number | null,
    totalEstimatedCost: item?.totalEstimatedCost || 0,
    requiredDate: item?.requiredDate ? new Date(item.requiredDate).toISOString().split('T')[0] : '',
    purpose: item?.purpose || '',
    status: item?.status || 'draft',
    // Project mode: which scope item (sub-budget) this spend draws from
    scopeItemId: lockedScopeItemId ?? item?.scopeItemId ?? null as number | null,
  });

  const [items, setItems] = useState<RequisitionItem[]>(
    item?.items?.length
      ? item.items.map((i) => ({ ...i }))
      : [{ ...emptyItem }]
  );

  // Supporting documents: uploaded immediately via /api/upload, listed here,
  // and persisted on the requisition as metadata.attachments. Editing prefills
  // from the saved set so nothing is silently dropped on update.
  const [attachments, setAttachments] = useState<
    { url: string; name: string; size?: number; mimeType?: string }[]
  >((item?.metadata?.attachments as any[]) ?? []);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || projectId == null) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));
      formData.append('projectId', String(projectId));
      // The api client's default Content-Type is application/json; for a
      // multipart body the browser must set its own header (with the boundary),
      // or multer sees an empty body and answers "No files uploaded".
      const res = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = (res.data?.data ?? []) as { url: string; originalName: string; size: number; mimeType: string }[];
      setAttachments((prev) => [
        ...prev,
        ...uploaded.map((f) => ({ url: f.url, name: f.originalName, size: f.size, mimeType: f.mimeType })),
      ]);
      toast.success(`${uploaded.length} file(s) attached`);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

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
    if (items.length === 0 || !items.some((i) => i.description.trim())) {
      toast.error('At least one item with a description is required');
      return;
    }
    if (isProjectMode && !form.scopeItemId) {
      toast.error('Pick the scope item this spend draws from');
      return;
    }

    const payload = {
      ...form,
      // Division is never sent: departmental RFs are charged to the raiser's
      // department (derived server-side); project spend belongs to the project.
      division: undefined,
      processOwner: undefined,
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
      ...(isProjectMode && { scopeItemId: form.scopeItemId, attachments }),
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
      maxWidth="2xl"
      onSubmit={handleSubmit}
      submitLabel={item ? 'Update' : 'Create'}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-6">
        {/* Charged to — what this requisition actually draws from. Editing
            shows the stored division (the RF keeps its original charge even
            if the raiser has since moved department); a new departmental RF
            shows the raiser's current department, derived server-side on
            save. Project/programme RFs say so instead. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Charged To</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
              {isProjectMode ? (
                'Project budget — scope sub-budget below'
              ) : item?.division ? (
                divisionLabel(item.division)
              ) : user?.department?.name ? (
                user.department.name
              ) : (
                <span className="text-muted-foreground">Your department (derived on save)</span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Required Date</Label>
            <DatePicker
              value={form.requiredDate}
              onChange={(v) => setForm({ ...form, requiredDate: v })}
            />
          </div>
        </div>

        {/* Project mode: budget = the project itself; the scope item is the
            sub-budget this spend draws down. */}
        {isProjectMode && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Scope Item (sub-budget) *
            </Label>
            <Select
              value={form.scopeItemId ? String(form.scopeItemId) : undefined}
              onValueChange={(v) => setForm({ ...form, scopeItemId: Number(v) })}
              disabled={lockedScopeItemId != null}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick the scope item this spend is for" />
              </SelectTrigger>
              <SelectContent>
                {scopeItems!.map((scope) => (
                  <SelectItem key={scope.id} value={String(scope.id)}>
                    {scope.wbsNumber} — {scope.title} (plan {formatCurrency(Number(scope.planCost))})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Charged to this project's budget. Once approved, the amount counts as actual
              spend on the scope item and its project cost summary.
            </p>
          </div>
        )}

        {/* Budget Item Selection — departmental mode only */}
        {!isProjectMode && (
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
        )}

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
                  <TableHead>Item *</TableHead>
                  <TableHead className="w-20">Qty *</TableHead>
                  <TableHead className="w-28">Unit Price (RM) *</TableHead>
                  <TableHead className="w-28">UoM</TableHead>
                  <TableHead>Description</TableHead>
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
                        placeholder="e.g., King Deluxe Room"
                        className="h-8 border-border/40 shadow-none"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.qty}
                        onChange={(e) => {
                          const raw = e.target.value;
                          // Keep '' while the user clears the field — coercing
                          // mid-edit would turn "0" into "03…" as they type.
                          updateItem(index, 'qty', raw === '' ? ('' as any) : parseInt(raw) || 0);
                        }}
                        min="1"
                        className="h-8 border-border/40 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.unitPrice ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateItem(index, 'unitPrice', raw === '' ? ('' as any) : parseFloat(raw) || 0);
                        }}
                        min="0"
                        step="0.01"
                        className="h-8 border-border/40 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
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
                          {uoms.map((u) => (
                            <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.remark || ''}
                        onChange={(e) => updateItem(index, 'remark', e.target.value)}
                        placeholder="Further details of the item (optional)"
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

        {/* Supporting documents — quotations, approvals, anything that backs
            the request. Uploaded immediately; removed before submit just drops
            the file from the list (the upload itself stays in storage). */}
        {isProjectMode && (
          <div className="space-y-2">
            <Label>Supporting Documents</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed dark:border-gray-600 px-3 py-3 text-sm text-muted-foreground hover:bg-muted/40">
              <Paperclip className="h-4 w-4" />
              {uploading ? 'Uploading…' : 'Attach quotation or supporting document'}
              <input
                type="file"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  handleUpload(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((file, index) => (
                  <div key={file.url} className="flex items-center justify-between rounded-md border dark:border-gray-800 px-3 py-1.5 text-sm">
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
                      {file.name}
                    </a>
                    <div className="ml-2 flex items-center gap-2">
                      {file.size != null && (
                        <span className="text-xs text-muted-foreground">{Math.round(file.size / 1024)} KB</span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
