import { useMemo, useState } from 'react';
import { Link2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { Label } from '@/components/ui/label';
import { compareWbs } from './scope/derive';
import apiClient from '@/api/client';
import toast from '@/lib/toast';

/**
 * Bulk-create Kanban tasks from the scope tree.
 *
 * Lists leaf scope items (parents roll up from children and never become
 * tasks themselves). Items that already have a linked task are shown with a
 * badge and will be skipped server-side — regeneration is idempotent, so the
 * dialog can be opened freely without risking duplicates.
 */

interface GenerateTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  /** Fat payload rows: parentId + wbsNumber are what the leaf test needs. */
  scopeItems: any[];
  columns: { id: number; name: string; position?: number }[];
  /** Project tasks already on the board — feeds the "has task" detection. */
  tasks: any[];
  /** Team assignments, for showing the scope item's assignee by name. */
  teamAssignments?: any[];
  /** Called after a successful generation (invalidates the project payload). */
  onGenerated: () => void;
}

export function GenerateTasksDialog({
  open,
  onOpenChange,
  projectId,
  scopeItems,
  columns,
  tasks,
  teamAssignments = [],
  onGenerated,
}: GenerateTasksDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [columnId, setColumnId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [columns]
  );

  // Leaf = no other scope item calls it parent. Sorted in WBS tree order so
  // the list reads like the workbook ("1.1" before "2.1.1", numerically).
  const { leaves, parents } = useMemo(() => {
    const parentIds = new Set(scopeItems.map((item) => item.parentId).filter(Boolean));
    const sorted = [...scopeItems].sort(compareWbs);
    return {
      leaves: sorted.filter((item) => !parentIds.has(item.id)),
      parents: sorted.filter((item) => parentIds.has(item.id)),
    };
  }, [scopeItems]);

  // A leaf with any linked task is skipped server-side — show that upfront so
  // nobody selects it expecting a second task.
  const linkedScopeIds = useMemo(
    () => new Set(tasks.map((task) => task.scopeItemId).filter(Boolean)),
    [tasks]
  );

  const selectable = leaves.filter((item) => !linkedScopeIds.has(item.id));
  const selectableIds = useMemo(() => selectable.map((item) => item.id), [selectable]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(selectableIds));
  const clearAll = () => setSelected(new Set());

  const targetColumnId = columnId || String(sortedColumns[0]?.id ?? '');

  const submit = async () => {
    if (selected.size === 0 || !targetColumnId) return;
    try {
      setSubmitting(true);
      const res = await apiClient.post('/tasks/generate-from-scope', {
        projectId,
        scopeItemIds: Array.from(selected),
        columnId: Number(targetColumnId),
      });
      const { created, skipped } = res.data.data ?? { created: [], skipped: [] };
      const skippedLinked = skipped.filter((s: any) => s.reason === 'already_has_task').length;
      toast.success(
        `${created.length} task(s) created` +
          (skippedLinked > 0 ? `, ${skippedLinked} skipped — already linked` : '')
      );
      setSelected(new Set());
      setColumnId('');
      onOpenChange(false);
      onGenerated();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to generate tasks');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
      title="Generate Tasks from Scope"
      description="One board task per selected work package. Items that already have a task are skipped, so re-running this never duplicates."
      maxWidth="lg"
      onSubmit={submit}
      submitLabel={`Create ${selected.size || ''} Task${selected.size === 1 ? '' : 's'}`.trim()}
      isSubmitting={submitting}
    >
      {leaves.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No leaf scope items yet — add work packages on the Scope tab first.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectable.length} available · {leaves.length - selectable.length} already linked
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                Select all
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
                Clear
              </Button>
            </div>
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border dark:border-gray-800 p-2 thin-scrollbar">
            {leaves.map((item) => {
              const hasTask = linkedScopeIds.has(item.id);
              const checked = selected.has(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/50 ${
                    checked ? 'bg-primary/5' : ''
                  }`}
                >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(item.id)}
                  className="mt-0.5"
                  aria-label={`Select ${item.title}`}
                />
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">
                    {item.wbsNumber}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {hasTask ? (
                    <Badge variant="outline" className="shrink-0 gap-1 text-[10px] text-muted-foreground">
                      <Link2 className="h-3 w-3" /> Has task
                    </Badge>
                  ) : item.assigneeUserId ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {teamAssignments.find((m: any) => m.userId === item.assigneeUserId)?.user?.name ?? `User ${item.assigneeUserId}`}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>

          {parents.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {parents.length} parent item(s) not listed — they roll up progress from their children.
            </p>
          )}

          <div className="mt-4 space-y-2">
            <Label>Target column</Label>
            <Select value={targetColumnId} onValueChange={setColumnId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a column..." />
              </SelectTrigger>
              <SelectContent>
                {sortedColumns.map((col) => (
                  <SelectItem key={col.id} value={String(col.id)}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </FormDialog>
  );
}
