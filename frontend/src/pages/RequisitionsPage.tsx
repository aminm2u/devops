import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Trash2,
  Eye,
  Printer,
  Edit2,
  ChevronDown,
  ChevronUp,
  Send,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { RequisitionFormDialog } from '@/components/requisitions/RequisitionFormDialog';
import apiClient from '@/api/client';
import { RequisitionForm } from '@/types';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(amount);
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function RequisitionsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<RequisitionForm | null>(null);
  const [viewingItem, setViewingItem] = useState<RequisitionForm | null>(null);
  const [deletingForm, setDeletingForm] = useState<RequisitionForm | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['requisitions', search, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('page', String(page));
      params.append('limit', '10');
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

  const columns: DataTableColumn<RequisitionForm>[] = [
    {
      key: 'expand',
      header: '',
      width: 'w-10',
      render: (form) =>
        expandedRow === form.id ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ),
    },
    {
      key: 'ref',
      header: 'Ref #',
      className: 'font-mono text-sm font-medium',
      accessor: (form) => `RF-${String(form.id).padStart(4, '0')}`,
    },
    {
      key: 'division',
      header: 'Division',
      render: (form) => <Badge variant="outline">{form.division}</Badge>,
    },
    {
      key: 'processOwner',
      header: 'Process Owner',
      className: 'text-muted-foreground',
      accessor: (form) => form.processOwner || '-',
    },
    {
      key: 'items',
      header: 'Items',
      className: 'text-muted-foreground tabular-nums',
      accessor: (form) => `${form.items?.length || 0} items`,
    },
    {
      key: 'totalCost',
      header: 'Total Cost',
      align: 'right',
      className: 'font-semibold tabular-nums',
      accessor: (form) => formatCurrency(form.totalEstimatedCost),
    },
    {
      key: 'requiredDate',
      header: 'Required Date',
      className: 'whitespace-nowrap text-muted-foreground',
      accessor: (form) => (form.requiredDate ? formatDate(form.requiredDate) : '-'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (form) => <StatusBadge domain="requisition" value={form.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (form) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
              <Button
                variant="ghost"
                size="sm"
                title="Delete"
                onClick={() => setDeletingForm(form)}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Requisition Form"
        description="Create, submit and track requisition requests"
        icon={FileText}
      >
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Requisition
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total', value: stats.total, icon: FileText, chip: 'bg-primary/10 text-primary' },
          { label: 'Draft', value: stats.draft, icon: Edit2, chip: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-300' },
          { label: 'Submitted', value: stats.submitted, icon: Send, chip: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
          { label: 'Approved', value: stats.approved, icon: CheckCircle, chip: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
        ].map((s) => (
          <Card key={s.label} className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4 py-5">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${s.chip}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold leading-tight tabular-nums">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={forms}
        loading={isLoading}
        loadingRows={5}
        onRowClick={(form) => setExpandedRow(expandedRow === form.id ? null : form.id)}
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: 'Search requisitions...',
        }}
        filters={
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[160px]">
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
        }
        pagination={{
          page,
          totalPages: meta?.lastPage ?? 1,
          onPageChange: setPage,
          totalItems: meta?.total,
          itemsPerPage: 10,
        }}
        emptyIcon={FileText}
        emptyTitle="No requisition forms found"
        emptyDescription={
          search || statusFilter !== 'all'
            ? 'Try adjusting your search or filters'
            : 'Get started by creating your first requisition'
        }
        emptyAction={
          !search && statusFilter === 'all' ? (
            <Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Requisition
            </Button>
          ) : undefined
        }
        renderRowAfter={(form) =>
          expandedRow === form.id ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="bg-muted/30 px-6 py-4">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Items ({form.items?.length || 0})
                    </p>
                    {form.items?.length ? (
                      <div className="space-y-1.5">
                        {form.items.map((itm, i) => (
                          <div key={i} className="flex items-center justify-between gap-4 text-sm border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                            <span className="truncate">
                              <span className="text-muted-foreground mr-2">{i + 1}.</span>
                              {itm.description}
                            </span>
                            <span className="whitespace-nowrap text-muted-foreground tabular-nums shrink-0">
                              {itm.qty} × {formatCurrency(itm.unitPrice || 0)} ={' '}
                              <span className="font-medium text-foreground">
                                {formatCurrency(itm.qty * (itm.unitPrice || 0))}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No items recorded</p>
                    )}
                  </div>
                  <div className="space-y-3 min-w-0">
                    {form.purpose && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Purpose</p>
                        <p className="text-sm">{form.purpose}</p>
                      </div>
                    )}
                    {form.budgetItem && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Linked Budget Item</p>
                        <p className="text-sm">
                          {form.budgetItem.description}{' '}
                          <span className="text-muted-foreground">({form.budgetItem.division})</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ) : null
        }
      />

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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingForm}
        onOpenChange={(open) => { if (!open) setDeletingForm(null); }}
        title="Delete Requisition"
        description={`Are you sure you want to delete RF-${deletingForm ? String(deletingForm.id).padStart(4, '0') : ''}? This action cannot be undone.`}
        onConfirm={() => deletingForm && deleteMutation.mutate(deletingForm.id)}
      />
    </div>
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
    <FormDialog
      open
      onOpenChange={onClose}
      title={`Requisition Form RF-${String(item.id).padStart(4, '0')}`}
      maxWidth="xl"
      footer={
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button type="button" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      }
    >

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
    </FormDialog>
  );
}
