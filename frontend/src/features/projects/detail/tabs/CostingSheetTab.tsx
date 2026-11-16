import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, FilePlus2, Lock, MoreVertical, Paperclip, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
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
  const { can, user } = useAuth();
  const canManage = can('project.costing.manage');
  const canManageTeam = can('project.team.manage');

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
    mutationFn: async (vars: { data: any; id?: number }) => {
      const { enroll, pickedUserId, ...line } = vars.data;

      // Resolve the team-assignment link for the picked user: an existing
      // member's assignment comes from the project payload; a new enrollment
      // gets one from the members endpoint. The link is what makes the
      // Position column render the assigned project role.
      let teamAssignmentId = line.teamAssignmentId ?? null;
      let positionCode = line.positionCode;
      if (!teamAssignmentId) {
        const existingAssignment = (project.teamAssignments ?? []).find(
          (assignment: any) => assignment.userId === pickedUserId && assignment.isActive !== false
        );
        if (existingAssignment) {
          teamAssignmentId = existingAssignment.id;
          positionCode = existingAssignment.projectRole?.name ?? positionCode;
        } else if (enroll) {
          const res = await apiClient.post(`/projects/${projectId}/members`, enroll);
          teamAssignmentId = res.data?.data?.id ?? null;
          positionCode = res.data?.data?.projectRole?.name ?? positionCode;
        }
      }

      const saved = await costingApi.saveResource(
        projectId,
        { ...line, positionCode, teamAssignmentId },
        vars.id
      );
      return { saved, enrolled: !!enroll && !!teamAssignmentId };
    },
    onSuccess: ({ enrolled }) => {
      invalidate();
      // Team membership may have changed — the header's assignments feed the picker.
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setResourceDialog(null);
      toast.success(enrolled ? 'Resource added and enrolled on the project team' : 'Resource saved');
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
    mutationFn: (vars: { verifier1Id: number; verifier2Id: number }) =>
      costingApi.submit(projectId, vars.verifier1Id, vars.verifier2Id),
    onSuccess: () => {
      invalidateSheet();
      toast.success('Submitted for approval');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to submit'),
  });

  const withdrawMutation = useMutation({
    mutationFn: () => costingApi.withdraw(projectId),
    onSuccess: () => {
      invalidateSheet();
      toast.success('Sheet withdrawn back to draft');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to withdraw'),
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
  // Only the project manager initiates/withdraws: holds costing.manage AND is
  // assigned a PM role on this project's team (or owns the project).
  const isProjectManager =
    canManage &&
    ((project.teamAssignments ?? []).some(
      (assignment: any) =>
        assignment.isActive !== false &&
        assignment.userId === user?.id &&
        /project\s*manager/i.test(assignment.projectRole?.name ?? '')
    ) || project.ownerId === user?.id);
  const canApprove = can('project.costing.approve.ceo');

  // For the scope select in the item dialog we need the scope tree; reuse the
  // scope query's cache if present, else fetch light via the same endpoint.
  const { data: scopeData } = useQuery({
    queryKey: ['project-scope', projectId],
    queryFn: () => import('@/api/scope').then((m) => m.scopeApi.list(projectId)),
    enabled: canManage,
  });
  // The API returns a flat sibling-ordered list (1, 1.1, 2.1, 1.2, ...) — sort
  // by WBS segments numerically so the table reads in tree order (1, 1.1, 1.2,
  // 2, 2.1, 2.1.1...), matching the Scope tab.
  const scopeItemsForSelect = [...(scopeData?.data ?? [])].sort(compareWbs);

  // The active baseline labels which scope revision the tracking figures
  // belong to — informational only.
  const { data: baselinesData } = useQuery({
    queryKey: ['scope-baselines', projectId],
    queryFn: () => import('@/api/scope').then((m) => m.scopeApi.listBaselines(projectId)),
  });
  const activeBaseline = (baselinesData?.data ?? []).find((b) => b.status === 'active');

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
        isProjectManager={isProjectManager}
        canApprove={canApprove}
        onSubmit={(verifier1Id, verifier2Id) => submitMutation.mutate({ verifier1Id, verifier2Id })}
        onWithdraw={() => withdrawMutation.mutate()}
        onSignOff={(stepKey, decision, comments) => signOffMutation.mutate({ stepKey, decision, comments })}
        onReopen={() => reopenMutation.mutate()}
        isPending={submitMutation.isPending || withdrawMutation.isPending || signOffMutation.isPending || reopenMutation.isPending}
      />

      {/* Scope tracking — every scope item the sheet should cost, plan vs actual.
          Plan is editable inline (a manual budget); actual accrues from approved
          requisitions raised for the item, so it is display-only here. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            Scope Cost Tracking
            {activeBaseline && (
              <Badge variant="outline" className="font-mono text-[10px]">
                Baseline: Rev {activeBaseline.revision} — {activeBaseline.name}
              </Badge>
            )}
          </CardTitle>
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
        <DialogContent className="max-w-lg px-6 pt-8 pb-6">
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
                {linked.map((req: any) => {
                  const files = (req.metadata?.attachments ?? []) as { url: string; name: string; size?: number }[];
                  return (
                    <div key={req.id} className="space-y-1 rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{req.division === 'PROJECT' ? 'Project spend' : req.division}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {req.items?.length ?? 0} item(s)
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatMYR(req.totalEstimatedCost)}</div>
                          <StatusBadge domain="requisition" value={req.status} />
                        </div>
                      </div>
                      {files.length > 0 && (
                        <div className="flex flex-wrap gap-1 border-t pt-1.5">
                          {files.map((file) => (
                            <a
                              key={file.url}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-primary hover:underline"
                            >
                              <Paperclip className="h-3 w-3" />
                              {file.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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

      {/* Raise a requisition for a scope item — project mode: the budget is the
          project, the scope item is the sub-budget, documents attach inline */}
      {requisitionFor && (
        <RequisitionFormDialog
          item={null}
          projectId={projectId}
          purchaseType="project"
          scopeItems={scopeItemsForSelect.map((scope) => ({
            id: scope.id,
            wbsNumber: scope.wbsNumber,
            title: scope.title,
            planCost: scope.planCost,
          }))}
          lockedScopeItemId={requisitionFor.id}
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
                      {/* Position = the project role held on the team; the
                          stored positionCode is only a fallback for lines
                          saved before the role link existed. */}
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {resource.teamAssignment?.projectRole?.name ?? resource.positionCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium dark:text-gray-400 text-gray-800">{resource.name}</TableCell>
                    <TableCell className="text-right dark:text-gray-400 text-gray-800">{formatMYR(resource.costPerDay)}</TableCell>
                    <TableCell className="text-right dark:text-gray-400 text-gray-800">{Number(resource.weeksRequired)}</TableCell>
                    <TableCell className="text-right dark:text-gray-400 text-gray-800">{resource.daysPerWeek}</TableCell>
                    <TableCell className="text-right font-medium dark:text-gray-400 text-gray-800">{formatMYR(resource.budget)}</TableCell>
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

      {/* Category creation is hidden for now — the costing model is
          scope + resources; per-category blocks return when needed. */}
      {/* RINGKASAN KOS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" />
            Cost Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            // Cost basis: what the scope is budgeted/has spent, plus the
            // resources block. Scope plan/actual are root-level sums so
            // children are not double-counted.
            const rootScopes = scopeItemsForSelect.filter((scope) => !scope.parentId);
            const scopePlan = rootScopes.reduce((sum, scope) => sum + Number(scope.planCost), 0);
            const scopeActual = rootScopes.reduce((sum, scope) => sum + Number(scope.actualCost), 0);
            const categoryPlan = categories.reduce((sum, category) => {
              const categoryItems = items.filter((item) => item.categoryId === category.id);
              return sum + categoryItems.reduce((s, item) => s + Number(item.planCost), 0);
            }, 0);
            const categoryActual = categories.reduce((sum, category) => {
              const categoryItems = items.filter((item) => item.categoryId === category.id);
              return sum + categoryItems.reduce((s, item) => s + Number(item.actualCost), 0);
            }, 0);
            const totalPlan = scopePlan + categoryPlan + Number(sheet.resourcesBudget);
            const totalActual = scopeActual + categoryActual;
            // Profit is measured against the contract value without tax —
            // SST is not revenue, matching the workbook's GPM basis.
            const contractValue = Number(project.valueWithoutTax ?? 0);
            const profitPlan = contractValue - totalPlan;
            const profitActual = contractValue - totalActual;
            const profitPlanPct = contractValue > 0 ? (profitPlan / contractValue) * 100 : null;
            const profitActualPct = contractValue > 0 ? (profitActual / contractValue) * 100 : null;

            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Plan</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => {
                    const categoryItems = items.filter((item) => item.categoryId === category.id);
                    const plan = categoryItems.reduce((s, item) => s + Number(item.planCost), 0);
                    const actual = categoryItems.reduce((s, item) => s + Number(item.actualCost), 0);
                    return (
                      <TableRow key={category.id}>
                        <TableCell>{category.name}</TableCell>
                        <TableCell className="text-right">{formatMYR(plan)}</TableCell>
                        <TableCell className="text-right">{formatMYR(actual)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-medium">
                    <TableCell className="dark:text-gray-400 text-gray-800">Scope cost</TableCell>
                    <TableCell className="text-right dark:text-gray-400 text-gray-800">{formatMYR(scopePlan)}</TableCell>
                    <TableCell className="text-right dark:text-gray-400 text-gray-800">{formatMYR(scopeActual)}</TableCell>
                  </TableRow>
                  <TableRow className="font-medium">
                    <TableCell className="dark:text-gray-400 text-gray-800">Resources cost</TableCell>
                    <TableCell className="text-right dark:text-gray-400 text-gray-800">{formatMYR(sheet.resourcesBudget)}</TableCell>
                    <TableCell className="text-right dark:text-gray-400 text-gray-800">{formatMYR(0)}</TableCell>
                  </TableRow>
                  <TableRow className="font-semibold">
                    <TableCell className="dark:text-gray-400 text-gray-800">Total cost</TableCell>
                    <TableCell className="text-right dark:text-gray-200 text-gray-800">{formatMYR(totalPlan)}</TableCell>
                    <TableCell className="text-right dark:text-gray-200 text-gray-800">{formatMYR(totalActual)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="dark:text-gray-400 text-gray-800">Contract value (without tax)</TableCell>
                    <TableCell className="text-right dark:text-gray-400 text-gray-800" colSpan={2}>
                      {formatMYR(contractValue)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="font-semibold">
                    <TableCell>
                      Profit{' '}
                      {profitPlanPct != null && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          plan {profitPlanPct.toFixed(1)}%
                          {profitActualPct != null && ` · actual ${profitActualPct.toFixed(1)}%`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right ${profitPlan < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}
                    >
                      {formatMYR(profitPlan)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${profitActual < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}
                    >
                      {formatMYR(profitActual)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            );
          })()}
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
          canEnroll={canManageTeam}
          teamMembers={(project.teamAssignments ?? [])
            .filter((assignment: any) => assignment.isActive !== false)
            .map((assignment: any) => ({ userId: assignment.userId as number }))}
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
      <TableCell className="font-medium">
        <div className="flex items-center">
          {/* WBS tree guides: one self-stretching column per ancestor level.
              Each line extends past the cell padding (-top/-bottom) so the
              segments from adjacent rows connect into one continuous line;
              the deepest level adds the elbow into this row. */}
          {Array.from({ length: wbsDepth(scope.wbsNumber) }).map((_, level) => (
            <span key={level} className="relative w-5 shrink-0 self-stretch">
              <span className="absolute -top-3 -bottom-3 left-2 w-px bg-border" />
              {level === wbsDepth(scope.wbsNumber) - 1 && (
                <span className="absolute top-1/2 left-2 h-px w-3.5 bg-border" />
              )}
            </span>
          ))}
          <span
            className={
              wbsDepth(scope.wbsNumber) === 0
                ? 'font-semibold text-foreground'
                : wbsDepth(scope.wbsNumber) === 1
                  ? 'font-medium text-foreground/80'
                  : 'font-normal text-muted-foreground'
            }
          >
            {scope.wbsNumber} - {scope.title}
          </span>
        </div>
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
            className="ml-auto h-7 w-28 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
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
        {/* Utilization: how much of the item's plan budget the approved spend
            has drawn — the link from procurement to the scope sub-budget. */}
        {Number(scope.planCost) > 0 && (
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${
                  Number(scope.actualCost) > Number(scope.planCost) ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (Number(scope.actualCost) / Number(scope.planCost)) * 100
                  )}%`,
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {Math.round((Number(scope.actualCost) / Number(scope.planCost)) * 100)}%
            </span>
          </div>
        )}
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

/** Tree order: compare WBS segment by numeric segment — "2" < "2.1" < "2.1.1" < "2.2". */
function compareWbs(a: ScopeItem, b: ScopeItem): number {
  const segsA = a.wbsNumber.split('.').map(Number);
  const segsB = b.wbsNumber.split('.').map(Number);
  const len = Math.max(segsA.length, segsB.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (segsA[i] ?? 0) - (segsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
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
