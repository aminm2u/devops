import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Eye, FilePlus2, MoreVertical, Pencil, Send, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { RequisitionFormDialog } from '@/components/requisitions/RequisitionFormDialog';
import { SpendingChart } from './finance/SpendingChart';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import toast from '@/lib/toast';
import { formatMYR } from '@/lib/format';
import type { RequisitionForm } from '@/types';

/**
 * Project finances: the spending projection, then requisitions and purchase
 * orders. A requisition raised here belongs to the project's budget; who may
 * view/edit/submit one is permission-gated — `procurement.requisition.view`
 * to see the tab's rows, `.create` to raise one, `.manage` to edit, submit or
 * delete a draft. The server re-checks every action.
 */
export function FinanceTab({ project, refetch }: { project: any, refetch: () => void }) {
  const { can } = useAuth();
  const requisitions = project.requisitionForms || [];
  const purchaseOrders = project.purchaseOrders || [];

  const canCreate = can('procurement.requisition.create');
  const canManageReq = can('procurement.requisition.manage');

  const [reqOpen, setReqOpen] = useState(false);
  const [editing, setEditing] = useState<RequisitionForm | null>(null);
  const [viewing, setViewing] = useState<RequisitionForm | null>(null);
  const [deleting, setDeleting] = useState<RequisitionForm | null>(null);
  const [submitting, setSubmitting] = useState<RequisitionForm | null>(null);
  const [loading, setLoading] = useState(false);

  const scopeOptions = (project.scopeItems ?? []).map((scope: any) => ({
    id: scope.id,
    wbsNumber: scope.wbsNumber,
    title: scope.title,
    planCost: scope.planCost,
  }));

  const handleCreate = async (data: any) => {
    try {
      setLoading(true);
      await apiClient.post('/requisitions', data);
      toast.success('Requisition drafted successfully');
      setReqOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to request items');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (id: number, data: any) => {
    try {
      setLoading(true);
      await apiClient.put(`/requisitions/${id}`, data);
      toast.success('Requisition updated');
      setEditing(null);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update requisition');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      setLoading(true);
      await apiClient.delete(`/requisitions/${id}`);
      toast.success('Requisition deleted');
      setDeleting(null);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete requisition');
      setDeleting(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (id: number) => {
    try {
      setLoading(true);
      await apiClient.put(`/requisitions/${id}/submit`);
      toast.success('Requisition submitted for approval');
      setSubmitting(null);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit requisition');
      setSubmitting(null);
    } finally {
      setLoading(false);
    }
  };

  const activeOrders = purchaseOrders.filter((po: any) => po.status !== 'cancelled');
  const poTotal = activeOrders.reduce((sum: number, po: any) => sum + Number(po.grandTotal || 0), 0);
  const poPaid = purchaseOrders.reduce((sum: number, po: any) =>
    sum + (po.payments || [])
      .filter((p: any) => p.status === 'paid')
      .reduce((ps: number, p: any) => ps + Number(p.totalPaid || 0), 0), 0);

  const scopeLabel = (scopeItemId?: number | null) => {
    if (!scopeItemId) return null;
    const scope = (project.scopeItems ?? []).find((s: any) => s.id === scopeItemId);
    if (!scope) return `#${scopeItemId}`;
    return `${scope.wbsNumber} ${scope.title.length > 18 ? `${scope.title.slice(0, 18)}…` : scope.title}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Finances & Requisitions</h2>
      </div>

      <SpendingChart project={project} scopeItems={project.scopeItems ?? []} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle>Project Requisitions</CardTitle>
            {/* {canCreate && (
              <Button size="sm" variant="outline" onClick={() => setReqOpen(true)}>
                <FilePlus2 className="w-4 h-4 mr-2" /> New Requisition
              </Button>
            )} */}
          </CardHeader>
          <CardContent>
            {requisitions.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">No requisitions created for this project.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Est. Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requisitions.map((req: any) => {
                    const editable = canManageReq && req.status === 'draft';
                    const label = scopeLabel(req.scopeItemId);
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium dark:text-gray-400 text-gray-800">RF-{req.id.toString().padStart(4, '0')}</TableCell>
                        <TableCell>
                          {label ? (
                            <Badge variant="outline" className="font-mono text-xs">{label}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="dark:text-gray-400 text-gray-800">{formatMYR(req.totalEstimatedCost)}</TableCell>
                        <TableCell><StatusBadge domain="requisition" value={req.status} /></TableCell>
                        <TableCell>
                          {(canManageReq || req.status === 'draft') && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Requisition actions">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewing(req)}>
                                  <Eye className="mr-2 h-3.5 w-3.5" />
                                  View
                                </DropdownMenuItem>
                                {editable && (
                                  <>
                                    <DropdownMenuItem onClick={() => setEditing(req as RequisitionForm)}>
                                      <Pencil className="mr-2 h-3.5 w-3.5" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSubmitting(req as RequisitionForm)}>
                                      <Send className="mr-2 h-3.5 w-3.5" />
                                      Submit for approval
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setDeleting(req as RequisitionForm)}>
                                      <Trash2 className="mr-2 h-3.5 w-3.5 text-destructive" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Purchase Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {purchaseOrders.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">No purchase orders recorded for this project.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Grand Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrders.map((po: any) => (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">
                          <Link to={`/purchase-orders/${po.id}`} className="font-mono text-primary hover:underline">
                            {po.poNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{po.vendor?.name || '—'}</TableCell>
                        <TableCell><Badge variant="outline">{(po.type || 'po').toUpperCase()}</Badge></TableCell>
                        <TableCell>{Number(po.grandTotal).toLocaleString()}</TableCell>
                        <TableCell><StatusBadge domain="po" value={po.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap gap-4 justify-end mt-3 text-sm text-muted-foreground">
                  <span>{purchaseOrders.length} order{purchaseOrders.length === 1 ? '' : 's'}</span>
                  <span>Total: <span className="font-medium text-foreground">MYR {poTotal.toLocaleString()}</span></span>
                  <span>Paid: <span className="font-medium text-foreground">MYR {poPaid.toLocaleString()}</span></span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {reqOpen && (
        <RequisitionFormDialog
          item={null}
          projectId={project.id}
          purchaseType="project"
          scopeItems={scopeOptions}
          onSubmit={handleCreate}
          onClose={() => setReqOpen(false)}
          isSubmitting={loading}
        />
      )}

      {editing && (
        <RequisitionFormDialog
          item={editing}
          projectId={project.id}
          purchaseType="project"
          scopeItems={scopeOptions}
          isSubmitting={loading}
          onClose={() => setEditing(null)}
          onSubmit={(data: any) => handleEdit(editing.id, data)}
        />
      )}

      {/* View dialog — a read-only summary of the requisition */}
      {viewing && (
        <RequisitionFormDialog
          item={viewing as RequisitionForm}
          projectId={project.id}
          purchaseType="project"
          scopeItems={scopeOptions}
          isSubmitting
          onClose={() => setViewing(null)}
          onSubmit={() => undefined}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={() => setDeleting(null)}
        title="Delete requisition?"
        description={`Delete ${deleting ? `RF-${deleting.id.toString().padStart(4, '0')}` : ''}? Only drafts can be deleted; this cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleting && handleDelete(deleting.id)}
        isConfirming={loading}
      />

      <ConfirmDialog
        open={submitting !== null}
        onOpenChange={() => setSubmitting(null)}
        title="Submit for approval?"
        description={
          submitting
            ? `RF-${submitting.id.toString().padStart(4, '0')} will leave draft and enter the procurement approval flow. Once approved, its value counts as actual spend on ${scopeLabel(submitting.scopeItemId) ?? 'the project'}.`
            : ''
        }
        confirmLabel="Submit"
        onConfirm={() => submitting && handleSubmit(submitting.id)}
        isConfirming={loading}
      />
    </div>
  );
}
