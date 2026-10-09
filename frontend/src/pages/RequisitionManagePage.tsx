import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { FormDialog } from '@/components/ui/form-dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/status-badge';
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

function getStatusIcon(status: string) {
  switch (status) {
    case 'submitted':
      return <Clock className="h-3 w-3 mr-1" />;
    case 'approved':
      return <CheckCircle className="h-3 w-3 mr-1" />;
    case 'rejected':
      return <XCircle className="h-3 w-3 mr-1" />;
    default:
      return undefined;
  }
}

function getStatusBadge(status: string) {
  return <StatusBadge domain="requisition" value={status} icon={getStatusIcon(status)} />;
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function RequisitionManagePage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [viewingItem, setViewingItem] = useState<RequisitionForm | null>(null);
  const [approvingItem, setApprovingItem] = useState<RequisitionForm | null>(null);
  const [rejectingItem, setRejectingItem] = useState<RequisitionForm | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['requisitions-manage', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const res = await apiClient.get(`/requisitions?${params.toString()}`);
      return res.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const res = await apiClient.put(`/requisitions/${id}/approve`, {
        action: 'approved',
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions-manage'] });
      setApprovingItem(null);
      toast.success('Requisition approved');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to approve requisition');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const res = await apiClient.put(`/requisitions/${id}/reject`, {
        action: 'rejected',
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions-manage'] });
      setRejectingItem(null);
      toast.success('Requisition rejected');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to reject requisition');
    },
  });

  const forms: RequisitionForm[] = data?.data || [];

  const columns: DataTableColumn<RequisitionForm>[] = [
    {
      key: 'ref',
      header: 'Ref #',
      accessor: (form) => <span className="font-mono text-sm">RF-{String(form.id).padStart(4, '0')}</span>,
      sortValue: (form) => form.id,
      sortable: true,
    },
    {
      key: 'division',
      header: 'Division',
      accessor: (form) => form.division,
      sortable: true,
    },
    {
      key: 'processOwner',
      header: 'Process Owner',
      accessor: (form) => form.processOwner || '-',
    },
    {
      key: 'requestedBy',
      header: 'Requested By',
      accessor: (form) => form.requestedByName || '-',
    },
    {
      key: 'budgetItem',
      header: 'Budget Item',
      render: (form) =>
        form.budgetItem ? (
          <span className="text-sm">
            {form.budgetItem.description}
            <span className="text-muted-foreground ml-1">({form.budgetItem.division})</span>
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'totalEstimatedCost',
      header: 'Total Cost',
      accessor: (form) => <span className="font-medium tabular-nums">{formatCurrency(form.totalEstimatedCost)}</span>,
      sortValue: (form) => form.totalEstimatedCost,
      sortable: true,
      align: 'right',
    },
    {
      key: 'requiredDate',
      header: 'Required Date',
      accessor: (form) => (form.requiredDate ? formatDate(form.requiredDate) : '-'),
      sortValue: (form) => (form.requiredDate ? new Date(form.requiredDate).getTime() : null),
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (form) => getStatusBadge(form.status),
      sortValue: (form) => form.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (form) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewingItem(form)}
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {form.status === 'submitted' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setApprovingItem(form)}
                title="Approve"
                className="text-green-600 hover:text-green-700"
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRejectingItem(form)}
                title="Reject"
                className="text-red-600 hover:text-red-700"
              >
                <XCircle className="h-4 w-4" />
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
      <PageHeader title="Manage Requisitions" description="Review, approve, and track department requisitions" />

      <DataTable
        columns={columns}
        data={forms}
        loading={isLoading}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search requisitions...',
        }}
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyIcon={FileText}
        emptyTitle="No requisition forms found"
      />

      {/* View Dialog */}
      {viewingItem && (
        <RequisitionManageViewDialog
          item={viewingItem}
          onClose={() => setViewingItem(null)}
          onApprove={() => {
            setViewingItem(null);
            setApprovingItem(viewingItem);
          }}
          onReject={() => {
            setViewingItem(null);
            setRejectingItem(viewingItem);
          }}
        />
      )}

      {/* Approve / Reject Dialog */}
      {approvingItem && (
        <ApprovalDialog
          item={approvingItem}
          action="approve"
          onConfirm={(reason) => approveMutation.mutate({ id: approvingItem.id, reason })}
          onClose={() => setApprovingItem(null)}
          isSubmitting={approveMutation.isPending}
        />
      )}

      {rejectingItem && (
        <ApprovalDialog
          item={rejectingItem}
          action="reject"
          onConfirm={(reason) => rejectMutation.mutate({ id: rejectingItem.id, reason })}
          onClose={() => setRejectingItem(null)}
          isSubmitting={rejectMutation.isPending}
        />
      )}
    </div>
  );
}

// ── View Dialog ─────────────────────────────────────────────────────────────

function RequisitionManageViewDialog({
  item,
  onClose,
  onApprove,
  onReject,
}: {
  item: RequisitionForm;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const canAction = item.status === 'submitted';

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={
        <span className="flex items-center gap-2">
          Requisition RF-{String(item.id).padStart(4, '0')}
          {getStatusBadge(item.status)}
        </span>
      }
      description={`Submitted by ${item.requestedByName || 'Unknown'} on ${item.requestedByDate ? formatDate(item.requestedByDate) : '-'}`}
      maxWidth="lg"
      footer={
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {canAction && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onReject}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                type="button"
                onClick={onApprove}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      }
    >

        <div className="space-y-4">
          {/* Form Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-bold">Division:</span> {item.division}
            </div>
            <div>
              <span className="font-bold">Process Owner:</span> {item.processOwner || '-'}
            </div>
            <div>
              <span className="font-bold">Total Estimated Cost:</span>{' '}
              <span className="text-lg font-bold text-primary">{formatCurrency(item.totalEstimatedCost)}</span>
            </div>
            <div>
              <span className="font-bold">Required Date:</span>{' '}
              {item.requiredDate ? formatDate(item.requiredDate) : '-'}
            </div>
          </div>

          {/* Budget Item */}
          {item.budgetItem && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-blue-600" />
                <span className="font-bold text-blue-800">Linked Budget Item</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="font-medium">Description:</span> {item.budgetItem.description}</div>
                <div><span className="font-medium">Division:</span> {item.budgetItem.division}</div>
                <div><span className="font-medium">Allocated:</span> {formatCurrency(item.budgetItem.allocatedBudget)}</div>
                <div><span className="font-medium">Utilized:</span> {formatCurrency(item.budgetItem.utilizedBudget)}</div>
                <div className="col-span-2">
                  <span className="font-medium">Remaining:</span>{' '}
                  <span className={item.budgetItem.allocatedBudget - item.budgetItem.utilizedBudget < item.totalEstimatedCost ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                    {formatCurrency(item.budgetItem.allocatedBudget - item.budgetItem.utilizedBudget)}
                  </span>
                  {item.budgetItem.allocatedBudget - item.budgetItem.utilizedBudget < item.totalEstimatedCost && (
                    <span className="ml-2 text-red-600 text-xs">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      Insufficient budget
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Items */}
          <div>
            <h3 className="font-bold mb-2">Items</h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">No.</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-20">Qty</TableHead>
                    <TableHead className="w-28">UoM</TableHead>
                    <TableHead>Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.items?.map((itm, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>{itm.description}</TableCell>
                      <TableCell className="text-center">{itm.qty}</TableCell>
                      <TableCell>{itm.uom || '-'}</TableCell>
                      <TableCell>{itm.remark || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Purpose */}
          {item.purpose && (
            <div className="text-sm">
              <span className="font-bold">Purpose:</span> {item.purpose}
            </div>
          )}

          {/* Approval Info */}
          {item.approvedByName && (
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <span className="font-bold">Processed by:</span> {item.approvedByName}
              {item.approvedByDate && ` on ${formatDate(item.approvedByDate)}`}
            </div>
          )}
        </div>
    </FormDialog>
  );
}

// ── Approve / Reject Dialog ─────────────────────────────────────────────────

function ApprovalDialog({
  item,
  action,
  onConfirm,
  onClose,
  isSubmitting,
}: {
  item: RequisitionForm;
  action: 'approve' | 'reject';
  onConfirm: (reason?: string) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState('');
  const isApprove = action === 'approve';

  const remaining = item.budgetItem
    ? item.budgetItem.allocatedBudget - item.budgetItem.utilizedBudget
    : null;
  const insufficient = remaining !== null && remaining < item.totalEstimatedCost;

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={
        <span className="flex items-center gap-2">
          {isApprove ? 'Approve' : 'Reject'} RF-{String(item.id).padStart(4, '0')}
          {getStatusBadge(item.status)}
        </span>
      }
      description={
        isApprove
          ? 'Review the summary below before approving this requisition.'
          : 'Provide feedback so the requester knows why this was rejected.'
      }
      maxWidth="md"
      footer={
        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          {isApprove ? (
            <Button type="button" onClick={() => onConfirm(reason || undefined)} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Approve
            </Button>
          ) : (
            <Button type="button" variant="destructive" onClick={() => onConfirm(reason || undefined)} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject
            </Button>
          )}
        </DialogFooter>
      }
    >
      {/* Summary */}
      <div className="rounded-lg border border-border/40 bg-muted/30 p-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Total Estimated Cost</span>
          <span className="text-base font-bold tabular-nums">{formatCurrency(item.totalEstimatedCost)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Requested By</span>
          <span>{item.requestedByName || '-'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Required Date</span>
          <span>{item.requiredDate ? formatDate(item.requiredDate) : '-'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Items</span>
          <span className="tabular-nums">{item.items?.length || 0}</span>
        </div>
        {item.purpose && (
          <div className="flex items-start justify-between gap-4">
            <span className="text-muted-foreground shrink-0">Purpose</span>
            <span className="text-right line-clamp-2">{item.purpose}</span>
          </div>
        )}
      </div>

      {/* Budget impact */}
      {item.budgetItem && (
        <div className={`rounded-lg border p-4 text-sm ${
          insufficient
            ? 'border-amber-500/30 bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
            : 'border-border/40 bg-muted/30'
        }`}>
          <div className="flex items-center gap-2 font-semibold mb-1">
            <DollarSign className="h-4 w-4" />
            {item.budgetItem.description}
            <span className="font-normal text-muted-foreground">({item.budgetItem.division})</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Remaining after {isApprove ? 'approval' : 'this request'}</span>
            <span className={`font-bold tabular-nums ${
              insufficient ? '' : 'text-green-600 dark:text-green-400'
            }`}>
              {formatCurrency(isApprove ? remaining! - item.totalEstimatedCost : remaining!)}
            </span>
          </div>
          {insufficient && (
            <p className="flex items-center gap-1.5 mt-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              This request exceeds the remaining budget of {formatCurrency(remaining!)}
            </p>
          )}
        </div>
      )}

      {/* Approval chain */}
      {item.approvals && item.approvals.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Approval Chain
          </p>
          <div className="rounded-lg border border-border/40 bg-muted/30 divide-y divide-border/40">
            {item.approvals.map((step, i) => (
              <div key={step.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{step.approver?.name || `User #${step.approverId}`}</span>
                {step.comments && (
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">{step.comments}</span>
                )}
                {step.status === 'approved' && <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
                {step.status === 'rejected' && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                {step.status === 'cancelled' && <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                {step.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      <div className="space-y-2">
        <Label>{isApprove ? 'Approval Note (Optional)' : 'Rejection Reason'}</Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            isApprove
              ? 'Add any notes about this approval...'
              : 'Explain why this requisition is being rejected...'
          }
          rows={3}
        />
      </div>
    </FormDialog>
  );
}
