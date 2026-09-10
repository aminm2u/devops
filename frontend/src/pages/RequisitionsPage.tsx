import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Loader2,
  Search,
  Trash2,
  Eye,
  Printer,
  Edit2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Send,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';
import { RequisitionForm, RequisitionItem, RequisitionFormStatus } from '@/types';
import { cn, formatDate, formatStatus } from '@/lib/utils';
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

const emptyForm = {
  division: 'IT',
  processOwner: '',
  totalEstimatedCost: 0,
  requiredDate: '',
  purpose: '',
  status: 'draft' as RequisitionFormStatus,
  items: [{ ...emptyItem }],
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <Badge className="bg-gray-100 text-gray-700">Draft</Badge>;
    case 'submitted':
      return <Badge className="bg-blue-100 text-blue-700">Submitted</Badge>;
    case 'approved':
      return <Badge className="bg-green-100 text-green-700">Approved</Badge>;
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700">Rejected</Badge>;
    default:
      return <Badge variant="outline">{formatStatus(status)}</Badge>;
  }
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function RequisitionsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<RequisitionForm | null>(null);
  const [viewingItem, setViewingItem] = useState<RequisitionForm | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['requisitions', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const res = await apiClient.get(`/requisitions?${params.toString()}`);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: any) => {
      const res = await apiClient.post('/requisitions', formData);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      setShowCreateDialog(false);
      toast.success('Requisition form created');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create requisition form');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiClient.put(`/requisitions/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      setEditingItem(null);
      toast.success('Requisition form updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update requisition form');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/requisitions/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success('Requisition form deleted');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete requisition form');
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.put(`/requisitions/${id}/submit`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success('Requisition submitted for approval');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to submit requisition');
    },
  });

  const forms: RequisitionForm[] = data?.data || [];
  const meta = data?.meta;

  // Stats
  const stats = {
    total: forms.length,
    draft: forms.filter((f) => f.status === 'draft').length,
    submitted: forms.filter((f) => f.status === 'submitted').length,
    approved: forms.filter((f) => f.status === 'approved').length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Requisition Form</h1>
          <p className="text-muted-foreground">Manage and track requisition requests</p>
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Requisition
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold text-gray-600">{stats.draft}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                <FileText className="h-4 w-4 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="text-2xl font-bold text-blue-600">{stats.submitted}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <FileText className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search requisitions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[150px]" />
                  <Skeleton className="h-4 w-[120px]" />
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-[80px]" />
                </div>
              ))}
            </div>
          ) : forms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No requisition forms found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Process Owner</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead>Required Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form) => (
                  <TableRow
                    key={form.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedRow(expandedRow === form.id ? null : form.id)}
                  >
                    <TableCell>
                      {expandedRow === form.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">RF-{String(form.id).padStart(4, '0')}</TableCell>
                    <TableCell>{form.division}</TableCell>
                    <TableCell>{form.processOwner || '-'}</TableCell>
                    <TableCell>{form.items?.length || 0} items</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(form.totalEstimatedCost)}
                    </TableCell>
                    <TableCell>
                      {form.requiredDate ? formatDate(form.requiredDate) : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(form.status)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingItem(form)}
                          title="View / Print"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {form.status === 'draft' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingItem(form)}
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => submitMutation.mutate(form.id)}
                              title="Submit for Approval"
                              className="text-blue-600 hover:text-blue-700"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {form.status === 'draft' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" title="Delete">
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Requisition</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete RF-{String(form.id).padStart(4, '0')}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(form.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.lastPage > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.currentPage} of {meta.lastPage} ({meta.total} total)
          </p>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {(showCreateDialog || editingItem) && (
        <RequisitionFormDialog
          item={editingItem}
          onSubmit={(data) => {
            if (editingItem) {
              updateMutation.mutate({ id: editingItem.id, data });
            } else {
              createMutation.mutate(data);
            }
          }}
          onClose={() => {
            setShowCreateDialog(false);
            setEditingItem(null);
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* View / Print Dialog */}
      {viewingItem && (
        <RequisitionViewDialog
          item={viewingItem}
          onClose={() => setViewingItem(null)}
        />
      )}
    </div>
  );
}

// ── Requisition Form Dialog (Create / Edit) ────────────────────────────────

function RequisitionFormDialog({
  item,
  onSubmit,
  onClose,
  isSubmitting,
}: {
  item?: RequisitionForm | null;
  onSubmit: (data: any) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
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
    };

    onSubmit(payload);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Requisition Form' : 'New Requisition Form'}</DialogTitle>
          <DialogDescription>
            {item ? 'Update the requisition details' : 'Create a new requisition form'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Top Section */}
          <div className="grid grid-cols-2 gap-4">
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
          </div>

          {/* Budget Item Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Budget Item (Optional)
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
              <Label className="text-base font-semibold">Items</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
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
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateItem(index, 'qty', parseInt(e.target.value) || 1)}
                          min="1"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.unitPrice || 0}
                          onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          min="0"
                          step="0.01"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.uom || 'Unit'}
                          onValueChange={(v) => updateItem(index, 'uom', v)}
                        >
                          <SelectTrigger className="h-8">
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
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
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

          {/* Bottom Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Total Estimated Cost (RM)</Label>
              <Input
                type="text"
                value={formatCurrency(calculatedTotal)}
                readOnly
                className="bg-muted font-bold text-lg"
              />
              <input type="hidden" value={calculatedTotal} name="totalEstimatedCost" />
            </div>
            <div className="space-y-2">
              <Label>Required Date</Label>
              <Input
                type="date"
                value={form.requiredDate}
                onChange={(e) => setForm({ ...form, requiredDate: e.target.value })}
              />
            </div>
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
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
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
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center gap-2">
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
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {item ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Requisition View / Print Dialog ─────────────────────────────────────────

function RequisitionViewDialog({
  item,
  onClose,
}: {
  item: RequisitionForm;
  onClose: () => void;
}) {
  const handlePrint = () => {
    const printContent = document.getElementById('requisition-print-area');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Requisition Form RF-${String(item.id).padStart(4, '0')}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Roboto', Arial, sans-serif; padding: 20px; color: #000; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .header-left { display: flex; align-items: center; gap: 15px; }
          .header-left img { height: 50px; }
          .header-left h1 { font-size: 18px; font-weight: bold; }
          .header-right { text-align: right; font-size: 12px; }
          .form-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 13px; }
          .form-info label { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          th, td { border: 1px solid #000; padding: 8px; text-align: left; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .bottom-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 13px; }
          .bottom-section label { font-weight: bold; }
          .approval-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; font-size: 13px; }
          .approval-box { border-top: 1px solid #000; padding-top: 10px; }
          .approval-box .sig-line { border-bottom: 1px solid #000; height: 40px; margin: 10px 0; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Requisition Form RF-{String(item.id).padStart(4, '0')}</span>
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div id="requisition-print-area" className="border rounded-lg p-6 bg-white text-black">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
            <div className="flex items-center gap-4">
              <img src="/map2u-logo.png" alt="MAP2U" className="h-12" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div>
                <h1 className="text-lg font-bold">MAP2U SDN BHD</h1>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-bold text-base">REQUISITION FORM</div>
              <div>F-MAP2U-QMS-003</div>
              <div>Rev: 00</div>
            </div>
          </div>

          {/* Form Info */}
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <span className="font-bold">Division / Department:</span> {item.division}
            </div>
            <div>
              <span className="font-bold">Process Owner:</span> {item.processOwner || '-'}
            </div>
            {item.budgetItem && (
              <div className="col-span-2">
                <span className="font-bold">Budget Item:</span> {item.budgetItem.description} ({item.budgetItem.division}) - {formatCurrency(item.budgetItem.allocatedBudget)} allocated, {formatCurrency(item.budgetItem.utilizedBudget)} utilized
              </div>
            )}
          </div>

          {/* Items Table */}
          <table className="w-full border-collapse border mb-6 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-2 w-10">No.</th>
                <th className="border border-black p-2">Description</th>
                <th className="border border-black p-2 w-20">Qty</th>
                <th className="border border-black p-2 w-28">Unit Price (RM)</th>
                <th className="border border-black p-2 w-28">UoM</th>
                <th className="border border-black p-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {item.items?.map((itm, idx) => (
                <tr key={idx}>
                  <td className="border border-black p-2 text-center">{idx + 1}</td>
                  <td className="border border-black p-2">{itm.description}</td>
                  <td className="border border-black p-2 text-center">{itm.qty}</td>
                  <td className="border border-black p-2 text-right">{formatCurrency(itm.unitPrice || 0)}</td>
                  <td className="border border-black p-2">{itm.uom || '-'}</td>
                  <td className="border border-black p-2">{itm.remark || '-'}</td>
                </tr>
              ))}
              {(!item.items || item.items.length === 0) && (
                <tr>
                  <td className="border border-black p-2 text-center">1</td>
                  <td className="border border-black p-2" colSpan={5}>-</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Bottom Section */}
          <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
            <div>
              <span className="font-bold">Total Estimated Cost (RM):</span>{' '}
              {formatCurrency(item.totalEstimatedCost)}
            </div>
            <div>
              <span className="font-bold">Required Date:</span>{' '}
              {item.requiredDate ? formatDate(item.requiredDate) : '-'}
            </div>
          </div>

          <div className="mb-6 text-sm">
            <span className="font-bold">Purpose:</span> {item.purpose || '-'}
          </div>

          {/* Approval Section */}
          <div className="grid grid-cols-2 gap-16 mt-10 text-sm">
            <div>
              <div className="font-bold mb-2">Requested By:</div>
              <div className="border-b border-black h-10 mb-1"></div>
              <div className="flex justify-between">
                <span>{item.requestedByName || '___________________'}</span>
                <span>{item.requestedByDate ? formatDate(item.requestedByDate) : '____/____/____'}</span>
              </div>
            </div>
            <div>
              <div className="font-bold mb-2">Approved By:</div>
              <div className="border-b border-black h-10 mb-1"></div>
              <div className="flex justify-between">
                <span>{item.approvedByName || '___________________'}</span>
                <span>{item.approvedByDate ? formatDate(item.approvedByDate) : '____/____/____'}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
