import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Loader2,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  AlertTriangle,
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
import { Skeleton } from '@/components/ui/skeleton';
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

function getStatusBadge(status: string) {
  switch (status) {
    case 'submitted':
      return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />Submitted</Badge>;
    case 'approved':
      return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
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
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      setApprovingItem(null);
      toast.success('Requisition approved. Budget utilization updated.');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to approve requisition');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const res = await apiClient.put(`/requisitions/${id}/approve`, {
        action: 'rejected',
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisitions-manage'] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      setRejectingItem(null);
      toast.success('Requisition rejected');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to reject requisition');
    },
  });

  const forms: RequisitionForm[] = data?.data || [];

  // Stats
  const stats = {
    total: forms.length,
    submitted: forms.filter((f) => f.status === 'submitted').length,
    approved: forms.filter((f) => f.status === 'approved').length,
    rejected: forms.filter((f) => f.status === 'rejected').length,
    totalCost: forms.reduce((sum, f) => sum + f.totalEstimatedCost, 0),
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Requisition Management</h1>
          <p className="text-muted-foreground">Review and approve requisition requests</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold text-blue-600">{stats.submitted}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
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
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalCost)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
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
                  <TableHead>Ref #</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Process Owner</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Budget Item</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead>Required Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell className="font-mono text-sm">RF-{String(form.id).padStart(4, '0')}</TableCell>
                    <TableCell>{form.division}</TableCell>
                    <TableCell>{form.processOwner || '-'}</TableCell>
                    <TableCell>{form.requestedByName || '-'}</TableCell>
                    <TableCell>
                      {form.budgetItem ? (
                        <span className="text-sm">
                          {form.budgetItem.description}
                          <span className="text-muted-foreground ml-1">({form.budgetItem.division})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(form.totalEstimatedCost)}
                    </TableCell>
                    <TableCell>
                      {form.requiredDate ? formatDate(form.requiredDate) : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(form.status)}</TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

      {/* Approve Dialog */}
      {approvingItem && (
        <ApproveDialog
          item={approvingItem}
          onApprove={(reason) => approveMutation.mutate({ id: approvingItem.id, reason })}
          onClose={() => setApprovingItem(null)}
          isSubmitting={approveMutation.isPending}
        />
      )}

      {/* Reject Dialog */}
      {rejectingItem && (
        <RejectDialog
          item={rejectingItem}
          onReject={(reason) => rejectMutation.mutate({ id: rejectingItem.id, reason })}
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
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Requisition RF-{String(item.id).padStart(4, '0')}</span>
            {getStatusBadge(item.status)}
          </DialogTitle>
          <DialogDescription>
            Submitted by {item.requestedByName || 'Unknown'} on {item.requestedByDate ? formatDate(item.requestedByDate) : '-'}
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canAction && (
            <>
              <Button
                variant="outline"
                onClick={onReject}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={onApprove}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Approve Dialog ──────────────────────────────────────────────────────────

function ApproveDialog({
  item,
  onApprove,
  onClose,
  isSubmitting,
}: {
  item: RequisitionForm;
  onApprove: (reason?: string) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            Approve Requisition
          </DialogTitle>
          <DialogDescription>
            Approve RF-{String(item.id).padStart(4, '0')} and update budget utilization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-sm">
            <div><span className="font-bold">Total Cost:</span> {formatCurrency(item.totalEstimatedCost)}</div>
            {item.budgetItem && (
              <div><span className="font-bold">Budget Item:</span> {item.budgetItem.description}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Approval Note (Optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add any notes about this approval..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onApprove(reason || undefined)}
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reject Dialog ───────────────────────────────────────────────────────────

function RejectDialog({
  item,
  onReject,
  onClose,
  isSubmitting,
}: {
  item: RequisitionForm;
  onReject: (reason?: string) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <XCircle className="h-5 w-5" />
            Reject Requisition
          </DialogTitle>
          <DialogDescription>
            Reject RF-{String(item.id).padStart(4, '0')}. The requester will be notified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-sm">
            <div><span className="font-bold">Total Cost:</span> {formatCurrency(item.totalEstimatedCost)}</div>
            {item.budgetItem && (
              <div><span className="font-bold">Budget Item:</span> {item.budgetItem.description}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Rejection Reason (Optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide a reason for rejection..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onReject(reason || undefined)}
            disabled={isSubmitting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
