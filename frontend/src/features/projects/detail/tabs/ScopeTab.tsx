import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scopeApi, type ScopeItem, type ScopeItemPayload } from '@/api/scope';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/hooks/useAuth';
import toast from '@/lib/toast';
import { buildScopeTree, moveWithinParent } from './scope/derive';
import { ScopeTree } from './scope/ScopeTree';
import { ScopeItemDialog } from './scope/ScopeItemDialog';

/**
 * Scope of work — the project's WBS tree and the spine of the page: costing
 * lines attach to these items and the Timeline tab renders their dates. This
 * tab owns its own query and dialogs (the page passes only the project
 * payload), because the fat project payload deliberately excludes the tree.
 */
export function ScopeTab({ project }: { project: any }) {
  const projectId = project.id as number;
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can('project.scope.manage');

  const { data, isLoading } = useQuery({
    queryKey: ['project-scope', projectId],
    queryFn: () => scopeApi.list(projectId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project-scope', projectId] });
    // The Timeline tab (fat payload) and costing rollups read scope dates.
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };

  const createMutation = useMutation({
    mutationFn: (vars: { data: ScopeItemPayload; parentId: number | null; afterSiblingId: number | null }) =>
      scopeApi.create(projectId, { ...vars.data, parentId: vars.parentId, afterSiblingId: vars.afterSiblingId }),
    onSuccess: () => {
      invalidate();
      setShowDialog(false);
      toast.success('Scope item added');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add scope item'),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: number; data: ScopeItemPayload }) => scopeApi.update(projectId, vars.id, vars.data),
    onSuccess: () => {
      invalidate();
      setShowDialog(false);
      toast.success('Scope item updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update scope item'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => scopeApi.remove(projectId, id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Scope item deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete scope item'),
  });

  const reorderMutation = useMutation({
    mutationFn: (moves: { id: number; parentId: number | null; sortOrder: number }[]) =>
      scopeApi.reorder(projectId, moves),
    onSuccess: invalidate,
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to reorder'),
  });

  const [showDialog, setShowDialog] = useState(false);
  const [dialogContext, setDialogContext] = useState<{
    item: ScopeItem | null;
    parentId: number | null;
    afterSiblingId: number | null;
  }>({ item: null, parentId: null, afterSiblingId: null });
  const [deleting, setDeleting] = useState<{ id: number; title: string } | null>(null);

  const items = data?.data ?? [];
  const tree = buildScopeTree(items);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const teamMembers = (project.teamAssignments ?? [])
    .filter((assignment: any) => assignment.isActive !== false)
    .map((assignment: any) => ({
      userId: assignment.userId as number,
      name: (assignment.user?.name as string) ?? `User ${assignment.userId}`,
    }));

  return (
    <>
      <ScopeTree
        tree={tree}
        isLoading={isLoading}
        canEdit={canEdit}
        onAddChild={(parentId) => {
          setDialogContext({ item: null, parentId, afterSiblingId: null });
          setShowDialog(true);
        }}
        onAddSibling={(afterSiblingId, parentId) => {
          setDialogContext({ item: null, parentId, afterSiblingId: afterSiblingId >= 0 ? afterSiblingId : null });
          setShowDialog(true);
        }}
        onEdit={(id) => {
          setDialogContext({ item: itemById.get(id) ?? null, parentId: null, afterSiblingId: null });
          setShowDialog(true);
        }}
        onDelete={(id, title) => setDeleting({ id, title })}
        onMove={(id, direction) => {
          const moves = moveWithinParent(tree, id, direction);
          if (moves.length) reorderMutation.mutate(moves);
        }}
      />

      <ScopeItemDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        item={dialogContext.item}
        parentTitle={
          dialogContext.parentId
            ? itemById.get(dialogContext.parentId)?.title ?? null
            : dialogContext.item
              ? itemById.get(dialogContext.item.parentId ?? -1)?.title ?? null
              : null
        }
        teamMembers={teamMembers}
        onSubmit={(form) => {
          if (dialogContext.item) {
            updateMutation.mutate({ id: dialogContext.item.id, data: form });
          } else {
            createMutation.mutate({
              data: form,
              parentId: dialogContext.parentId,
              afterSiblingId: dialogContext.afterSiblingId,
            });
          }
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={() => setDeleting(null)}
        title="Delete Scope Item"
        description={`Delete "${deleting?.title ?? ''}"? Its children (if any) are deleted too. Items with cost lines linked must be unlinked on the Costing Sheet first.`}
        confirmLabel="Delete"
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
