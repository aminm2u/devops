import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, FilePlus2, Lock, MoreVertical, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { costingApi, type CostItem, type CostItemPayload, type ResourceAssignment } from '@/api/costing';
import { scopeApi, type ScopeItem } from '@/api/scope';
import apiClient from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/ui/status-badge';
import { RequisitionFormDialog } from '@/components/requisitions/RequisitionFormDialog';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import toast from '@/lib/toast';
import { formatMYR } from '@/lib/format';
import { CostItemDialog } from './costing/CostItemDialog';
import { ResourceDialog } from './costing/ResourceDialog';
import { SignOffPanel } from './costing/SignOffPanel';

/**
 * The costing sheet, mirroring the workbook: cost categories (per-project
 * data) holding plan-vs-actual items, a resources block, and the RINGKASAN
 * (summary). Items may link to a scope item — those roll up into the Scope
 * tab's costs server-side — and optionally to a budget item for later
 * procurement. All money is computed by the API; this UI only displays.
 */
export function CostingSheetTab({ project }: { project: any }) {
  const projectId = project.id as number;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can('project.costing.manage');

  const { data, isLoading } = useQuery({
    queryKey: ['project-costing', projectId],
    queryFn: () => costingApi.getSheet(projectId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project-costing', projectId] });
    // Scope items carry the rolled-up costs
    queryClient.invalidateQueries({ queryKey: ['project-scope', projectId] });
  };

  const invalidateSheet = () => queryClient.invalidateQueries({ queryKey: ['project-costing', projectId] });

  const saveItemMutation = useMutation({
    mutationFn: (vars: { data: CostItemPayload; id?: number }) =>
      costingApi.saveItem(projectId, vars.data, vars.id),
    onSuccess: () => {
      invalidate();
      setItemDialog(null);
      toast.success('Cost item saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save cost item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => costingApi.deleteItem(projectId, id),
    onSuccess: () => {
      invalidate();
      setDeletingItem(null);
      toast.success('Cost item deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete cost item'),
  });

  const saveResourceMutation = useMutation({
    mutationFn: (vars: { data: any; id?: number }) => costingApi.saveResource(projectId, vars.data, vars.id),
    onSuccess: () => {
      invalidate();
      setResourceDialog(null);
      toast.success('Resource saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save resource'),
  });

  const deleteResourceMutation = useMutation({
    mutationFn: (id: number) => costingApi.deleteResource(projectId, id),
    onSuccess: () => {
      invalidate();
      setDeletingResource(null);
      toast.success('Resource removed');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to remove resource'),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: (vars: { name: string; id?: number }) => costingApi.saveCategory(projectId, { name: vars.name }, vars.id),
    onSuccess: () => {
      invalidate();
      setCategoryDialog(null);
      toast.success('Category saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save category'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => costingApi.deleteCategory(projectId, id),
    onSuccess: () => {
      invalidate();
      setDeletingCategory(null);
      toast.success('Category deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete category'),
  });

  const submitMutation = useMutation({
    mutationFn: () => costingApi.submit(projectId),
    onSuccess: () => {
      invalidateSheet();
      toast.success('Submitted for approval');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to submit'),
  });

  const signOffMutation = useMutation({
    mutationFn: (vars: { stepKey: string; decision: 'approve' | 'reject'; comments: string | null }) =>
      costingApi.signOff(projectId, vars),
    onSuccess: (result) => {
      invalidateSheet();
      toast.success(result.message || 'Sign-off recorded');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Sign-off failed'),
  });

  const reopenMutation = useMutation({
    mutationFn: () => costingApi.reopen(projectId),
    onSuccess: () => {
      invalidateSheet();
      toast.success('Sheet reopened for editing');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to reopen'),
  });

  // Inline plan-cost edit from the tracking table — writes manualPlanCost
  // server-side; the stored planCost stays derived (max of manual and linked lines).
  const updateScopePlanMutation = useMutation({
    mutationFn: (vars: { id: number; planCost: number }) =>
      scopeApi.update(projectId, vars.id, { planCost: vars.planCost }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-scope', projectId] });
      toast.success('Plan cost updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update plan cost'),
  });

  // Raise a requisition straight from a scope row (row menu), linked to the item.
  const createRequisitionMutation = useMutation({
    mutationFn: (vars: { payload: any }) =>
      apiClient.post('/requisitions', vars.payload).then((res) => res.data),
    onSuccess: () => {
      setRequisitionFor(null);
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Requisition created — it feeds the scope actual cost once approved');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create requisition'),
  });

  // Dialog state
  const [categoryDialog, setCategoryDialog] = useState<{ id?: number; name?: string } | null>(null);
  const [itemDialog, setItemDialog] = useState<{ item: CostItem | null; categoryId: number | null } | null>(null);
  const [resourceDialog, setResourceDialog] = useState<{ resource: ResourceAssignment | null } | null>(null);
  const [deletingItem, setDeletingItem] = useState<CostItem | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<{ id: number; name: string } | null>(null);
  const [deletingResource, setDeletingResource] = useState<ResourceAssignment | null>(null);
  const [spendingFor, setSpendingFor] = useState<{ id: number; wbsNumber: string; title: string } | null>(null);
  const [requisitionFor, setRequisitionFor] = useState<{ id: number; wbsNumber: string; title: string } | null>(null);

  const payload = data?.data;
  const sheet = payload?.sheet;
  const categories = payload?.categories ?? [];
  const items = payload?.items ?? [];
  const resources = payload?.resources ?? [];
  const locked = sheet?.status === 'approved';
  const editable = canManage && !locked;

  // For the scope select in the item dialog we need the scope tree; reuse the
  // scope query's cache if present, else fetch light via the same endpoint.
  const { data: scopeData } = useQuery({
    queryKey: ['project-scope', projectId],
    queryFn: () => import('@/api/scope').then((m) => m.scopeApi.list(projectId)),
    enabled: canManage,
  });
  const scopeItemsForSelect = scopeData?.data ?? [];

  const budgetItems = (project.budgetItems ?? [])
    .filter((budget: any) => budget.isActive !== false)
    .map((budget: any) => ({ id: budget.id as number, category: budget.category as string, description: budget.description as string }));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading costing sheet…</CardContent>
      </Card>
    );
  }

  if (!sheet) return null;

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-md border border-green-600/40 bg-green-500/5 px-3 py-2 text-sm">
          <Lock className="h-4 w-4 text-green-600" />
          This sheet is approved and read-only. A CEO reopen unlocks it.
        </div>
      )}

      <SignOffPanel
        status={sheet.status}
        approvals={sheet.approvals}
        onSubmit={() => submitMutation.mutate()}
        onSignOff={(stepKey, decision, comments) => signOffMutation.mutate({ stepKey, decision, comments })}
        onReopen={() => reopenMutation.mutate()}
        isPending={submitMutation.isPending || signOffMutation.isPending || reopenMutation.isPending}
      />

      {/* Scope tracking — every scope item the sheet should cost, plan vs actual.
          Plan is editable inline (a manual budget); actual accrues from approved
          requisitions raised for the item, so it is display-only here. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Scope Cost Tracking</CardTitle>
          <span className="text-xs text-muted-foreground">
            Plan is editable; actual accrues from approved requisitions for the item
          </span>
        </CardHeader>
        <CardContent>
          {scopeItemsForSelect.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No scope items yet — add them on the Scope tab, then link cost lines to them below.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope Item</TableHead>
                  <TableHead className="text-right">Plan Cost</TableHead>
                  <TableHead className="text-right">Actual Cost</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopeItemsForSelect.map((scope) => (
                  <ScopeTrackingRow
                    key={scope.id}
                    scope={scope}
                    editable={editable}
                    isPending={updateScopePlanMutation.isPending}
                    onSavePlan={(value) =>
                      updateScopePlanMutation.mutate({ id: scope.id, planCost: value })
                    }
                    onShowSpending={() => setSpendingFor(scope)}
                    onCreateRequisition={() =>
                      setRequisitionFor({ id: scope.id, wbsNumber: scope.wbsNumber, title: scope.title })
                    }
                  />
                ))}
                <TableRow className="font-medium">
                  <TableCell>Total assigned to scope</TableCell>
                  <TableCell className="text-right">
                    {formatMYR(
                      scopeItemsForSelect
                        .filter((scope) => !scope.parentId)
                        .reduce((sum, scope) => sum + Number(scope.planCost), 0)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMYR(
                      scopeItemsForSelect
                        .filter((scope) => !scope.parentId)
                        .reduce((sum, scope) => sum + Number(scope.actualCost), 0)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMYR(
                      scopeItemsForSelect
                        .filter((scope) => !scope.parentId)
                        .reduce((sum, scope) => sum + Number(scope.planCost) - Number(scope.actualCost), 0)
                    )}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Spending details for one scope item */}
      <Dialog open={spendingFor !== null} onOpenChange={(open) => !open && setSpendingFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Spending — {spendingFor?.wbsNumber} {spendingFor?.title}
            </DialogTitle>
            <DialogDescription>
              Approved requisitions raised for this scope item.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const linked = (project.requisitionForms ?? []).filter(
              (req: any) => req.scopeItemId === spendingFor?.id && req.status === 'approved'
            );
            return linked.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No approved requisitions for this item yet. Use the row menu → “Create requisition” to raise one.
              </p>
            ) : (
              <div className="space-y-1.5">
                {linked.map((req: any) => (
                  <div key={req.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{req.division}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {req.items?.length ?? 0} item(s)
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatMYR(req.totalEstimatedCost)}</div>
                      <StatusBadge domain="requisition" value={req.status} />
                    </div>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 text-sm font-medium">
                  <span>Total spend</span>
                  <span>
                    {formatMYR(linked.reduce((sum: number, req: any) => sum + Number(req.totalEstimatedCost), 0))}
                  </span>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Raise a requisition for a scope item — pre-seeded with one line */}
      {requisitionFor && (
        <RequisitionFormDialog
          item={null}
          projectId={projectId}
          purchaseType="project"
          isSubmitting={createRequisitionMutation.isPending}
          onClose={() => setRequisitionFor(null)}
          onSubmit={(payload: any) =>
            createRequisitionMutation.mutate({
              payload: {
                ...payload,
                scopeItemId: requisitionFor.id,
                purpose: payload.purpose
                  ? `${payload.purpose} (for scope ${requisitionFor.wbsNumber} ${requisitionFor.title})`
                  : `For scope ${requisitionFor.wbsNumber} ${requisitionFor.title}`,
              },
            })
          }
        />
      )}

      {/* Resources cost block */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Resources Cost</CardTitle>
          {editable && (
            <Button size="sm" variant="outline" onClick={() => setResourceDialog({ resource: null })}>
              <Plus className="mr-2 h-4 w-4" />
              Add Resource
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {resources.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No resource lines yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Position</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Cost / Day</TableHead>
                  <TableHead className="text-right">Weeks</TableHead>
                  <TableHead className="text-right">Days / Wk</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  {editable && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((resource) => (
                  <TableRow key={resource.id}>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[10px]">{resource.positionCode}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{resource.name}</TableCell>
                    <TableCell className="text-right">{formatMYR(resource.costPerDay)}</TableCell>
                    <TableCell className="text-right">{Number(resource.weeksRequired)}</TableCell>
                    <TableCell className="text-right">{resource.daysPerWeek}</TableCell>
                    <TableCell className="text-right font-medium">{formatMYR(resource.budget)}</TableCell>
                    {editable && (
                      <TableCell>
                        <div className="flex justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setResourceDialog({ resource })} aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingResource(resource)} aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Category blocks with items */}
      {categories.map((category) => {
        const categoryItems = items.filter((item) => item.categoryId === category.id);
        const categoryPlan = categoryItems.reduce((sum, item) => sum + Number(item.planCost), 0);
        const categoryActual = categoryItems.reduce((sum, item) => sum + Number(item.actualCost), 0);
        return (
          <Card key={category.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{category.name}</CardTitle>
              <div className="flex items-center gap-2">
                {editable && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setItemDialog({ item: null, categoryId: category.id })}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Item
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCategoryDialog({ id: category.id, name: category.name })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeletingCategory({ id: category.id, name: category.name })}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {categoryItems.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No items in this category.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Plan</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      {editable && <TableHead className="w-12" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.description}</div>
                          {item.budgetItem && (
                            <div className="text-xs text-muted-foreground">Budget: {item.budgetItem.category}</div>
                          )}
                          {item.remarks && <div className="text-xs text-muted-foreground">{item.remarks}</div>}
                        </TableCell>
                        <TableCell>
                          {item.scopeItem ? (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {item.scopeItem.wbsNumber}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(item.qty)} {item.uom ?? ''}
                        </TableCell>
                        <TableCell className="text-right">{formatMYR(item.unitCost)}</TableCell>
                        <TableCell className="text-right">{formatMYR(item.planCost)}</TableCell>
                        <TableCell className="text-right">{formatMYR(item.actualCost)}</TableCell>
                        <TableCell className="text-right">
                          {formatMYR(Number(item.planCost) - Number(item.actualCost))}
                        </TableCell>
                        {editable && (
                          <TableCell>
                            <div className="flex justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setItemDialog({ item, categoryId: null })}
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingItem(item)} aria-label="Delete">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    <TableRow className="font-medium">
                      <TableCell colSpan={4}>Subtotal</TableCell>
                      <TableCell className="text-right">{formatMYR(categoryPlan)}</TableCell>
                      <TableCell className="text-right">{formatMYR(categoryActual)}</TableCell>
                      <TableCell className="text-right">{formatMYR(categoryPlan - categoryActual)}</TableCell>
                      {editable && <TableCell />}
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}

      {editable && (
        <Button variant="outline" size="sm" onClick={() => setCategoryDialog(null)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      )}

      {/* RINGKASAN KOS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" />
            Cost Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Plan</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => {
                const categoryItems = items.filter((item) => item.categoryId === category.id);
                const plan = categoryItems.reduce((sum, item) => sum + Number(item.planCost), 0);
                const actual = categoryItems.reduce((sum, item) => sum + Number(item.actualCost), 0);
                return (
                  <TableRow key={category.id}>
                    <TableCell>{category.name}</TableCell>
                    <TableCell className="text-right">{formatMYR(plan)}</TableCell>
                    <TableCell className="text-right">{formatMYR(actual)}</TableCell>
                    <TableCell className="text-right">{formatMYR(plan - actual)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-medium">
                <TableCell>Resources budget</TableCell>
                <TableCell className="text-right" colSpan={2}>{formatMYR(sheet.resourcesBudget)}</TableCell>
                <TableCell />
              </TableRow>
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatMYR(sheet.totalPlanCost)}</TableCell>
                <TableCell className="text-right">{formatMYR(sheet.totalActualCost)}</TableCell>
                <TableCell className="text-right">
                  {formatMYR(Number(sheet.totalPlanCost) - Number(sheet.totalActualCost))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialogs */}
      {categoryDialog !== null && (
        <CategoryNameDialog
          open
          initial={categoryDialog}
          isSubmitting={saveCategoryMutation.isPending}
          onClose={() => setCategoryDialog(null)}
          onSubmit={(name) => saveCategoryMutation.mutate({ name, id: categoryDialog.id })}
        />
      )}

      {itemDialog !== null && (
        <CostItemDialog
          open
          onOpenChange={() => setItemDialog(null)}
          isSubmitting={saveItemMutation.isPending}
          categories={categories}
          scopeItems={scopeItemsForSelect}
          budgetItems={budgetItems}
          item={itemDialog.item}
          defaultCategoryId={itemDialog.categoryId}
          onSubmit={(form) => saveItemMutation.mutate({ data: form, id: itemDialog.item?.id })}
        />
      )}

      {resourceDialog !== null && (
        <ResourceDialog
          open
          onOpenChange={() => setResourceDialog(null)}
          isSubmitting={saveResourceMutation.isPending}
          resource={resourceDialog.resource}
          onSubmit={(form) => saveResourceMutation.mutate({ data: form, id: resourceDialog.resource?.id })}
        />
      )}

      <ConfirmDialog
        open={deletingItem !== null}
        onOpenChange={() => setDeletingItem(null)}
        title="Delete Cost Item"
        description={`Delete "${deletingItem?.description ?? ''}"? Scope rollups and sheet totals update automatically.`}
        confirmLabel="Delete"
        onConfirm={() => deletingItem && deleteItemMutation.mutate(deletingItem.id)}
        isConfirming={deleteItemMutation.isPending}
      />

      <ConfirmDialog
        open={deletingCategory !== null}
        onOpenChange={() => setDeletingCategory(null)}
        title="Delete Category"
        description={`Delete "${deletingCategory?.name ?? ''}" and all of its cost items? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deletingCategory && deleteCategoryMutation.mutate(deletingCategory.id)}
        isConfirming={deleteCategoryMutation.isPending}
      />

      <ConfirmDialog
        open={deletingResource !== null}
        onOpenChange={() => setDeletingResource(null)}
        title="Remove Resource"
        description={`Remove "${deletingResource?.name ?? ''}" from the resources cost block?`}
        confirmLabel="Remove"
        onConfirm={() => deletingResource && deleteResourceMutation.mutate(deletingResource.id)}
        isConfirming={deleteResourceMutation.isPending}
      />
    </div>
  );
}

/**
 * One row of the scope tracking table. Plan cost is click-to-edit inline
 * (enter commits, escape cancels); actual cost is read-only — it accrues from
 * approved procurement. The 3-dot menu offers spending details and raising a
 * requisition for the item.
 */
function ScopeTrackingRow({
  scope,
  editable,
  isPending,
  onSavePlan,
  onShowSpending,
  onCreateRequisition,
}: {
  scope: ScopeItem;
  editable: boolean;
  isPending: boolean;
  onSavePlan: (value: number) => void;
  onShowSpending: () => void;
  onCreateRequisition: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    if (!editable) return;
    setDraft(String(Number(scope.manualPlanCost) || ''));
    setEditing(true);
  };

  const commit = () => {
    const value = Number(draft);
    if (!Number.isNaN(value) && value >= 0 && value !== Number(scope.manualPlanCost)) {
      onSavePlan(value);
    }
    setEditing(false);
  };

  return (
    <TableRow className="group">
      <TableCell className="relative font-medium">
        {wbsDepth(scope.wbsNumber) > 0 && (
          <span className="absolute top-0 bottom-0 flex items-stretch" style={{ left: 0 }}>
            {Array.from({ length: wbsDepth(scope.wbsNumber) }).map((_, level) => (
              <span
                key={level}
                className="relative w-4 shrink-0"
              >
                <span className="absolute top-0 bottom-0 left-2 w-px bg-border" />
                {level === wbsDepth(scope.wbsNumber) - 1 && (
                  <span className="absolute top-1/2 left-2 h-px w-3 bg-border" />
                )}
              </span>
            ))}
          </span>
        )}
        <span className="dark:text-gray-400 text-gray-800" style={{ marginLeft: wbsDepth(scope.wbsNumber) * 16 }}>{scope.wbsNumber} - {scope.title}</span>
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <Input
            autoFocus
            type="number"
            min={0}
            step="any"
            value={draft}
            disabled={isPending}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="ml-auto h-7 w-28 text-right tabular-nums"
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            disabled={!editable}
            className={`ml-auto flex h-7 w-28 items-center justify-end rounded px-2 tabular-nums hover:bg-muted dark:text-gray-400 text-gray-800 ${
              editable ? 'cursor-text underline decoration-dashed decoration-border underline-offset-4' : ''
            }`}
            title={editable ? 'Click to edit plan cost' : undefined}
          >
            {formatMYR(scope.planCost)}
          </button>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums dark:text-gray-400 text-gray-800">
        {formatMYR(scope.actualCost)}
      </TableCell>
      <TableCell className="text-right tabular-nums dark:text-gray-400 text-gray-800">
        {formatMYR(Number(scope.planCost) - Number(scope.actualCost))}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Row actions">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onShowSpending}>
              <ReceiptText className="mr-2 h-3.5 w-3.5" />
              Spending details
            </DropdownMenuItem>
            {editable && (
              <DropdownMenuItem onClick={onCreateRequisition}>
                <FilePlus2 className="mr-2 h-3.5 w-3.5" />
                Create new requisition
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function wbsDepth(wbsNumber: string): number {
  return wbsNumber.split('.').length - 1;
}

/** Tiny inline dialog for creating/renaming a cost category. */
function CategoryNameDialog({
  open,
  initial,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: { id?: number; name?: string };
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial.name ?? '');
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title={initial.id ? 'Rename Category' : 'Add Category'}
      submitLabel={initial.id ? 'Save' : 'Add'}
      isSubmitting={isSubmitting}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          toast.error('Category name is required');
          return;
        }
        onSubmit(name.trim());
      }}
    >
      <div className="space-y-2">
        <Label className="text-sm font-medium">Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Travel & Accommodation" />
      </div>
    </FormDialog>
  );
}
