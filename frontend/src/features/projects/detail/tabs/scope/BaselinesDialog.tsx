import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitCompare, History, Plus } from 'lucide-react';
import { scopeApi, type ScopeBaseline, type ScopeItem } from '@/api/scope';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import toast from '@/lib/toast';
import { formatDateTime } from '@/lib/utils';
import { formatMYR } from '@/lib/format';
import { diffBaseline, type DiffRow } from './baselineDiff';

/**
 * Baseline history for the scope tree: the immutable revision list, a
 * create form (PM action — no approval chain), and a per-revision diff
 * against the current tree. The dialog owns its fetches; the tab just
 * opens it and lets it work.
 */
export function BaselinesDialog({
  open,
  onOpenChange,
  projectId,
  canEdit,
  currentItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  canEdit: boolean;
  currentItems: ScopeItem[];
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [comparing, setComparing] = useState<ScopeBaseline | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['scope-baselines', projectId],
    queryFn: () => scopeApi.listBaselines(projectId),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => scopeApi.createBaseline(projectId, { name: name.trim(), reason: reason.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scope-baselines', projectId] });
      setCreating(false);
      setName('');
      setReason('');
      toast.success('Baseline created — the current scope is frozen as a revision');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create baseline'),
  });

  // Full snapshot (with items) for the diff view — fetched on demand.
  const { data: compareData, isLoading: compareLoading } = useQuery({
    queryKey: ['scope-baseline', projectId, comparing?.id],
    queryFn: () => scopeApi.getBaseline(projectId, comparing!.id),
    enabled: comparing !== null,
  });

  const diffRows: DiffRow[] | null =
    comparing && compareData?.data?.items ? diffBaseline(compareData.data.items, currentItems) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl px-6 pt-8 pb-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Scope Baselines
          </DialogTitle>
          <DialogDescription>
            Immutable snapshots of the scope, taken at EOTs, variation orders and change
            requests. History is append-only — it stands as the record.
          </DialogDescription>
        </DialogHeader>

        {creating ? (
          <div className="space-y-3 rounded-md border dark:border-gray-800 p-3">
            <div className="space-y-2">
              <Label className="dark:text-gray-400 text-gray-800">Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g., "Rev 1 — EOT #1" or "VO-2024-03 additional survey"'
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-400 text-gray-800">Reason</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What changed and why (optional but recommended)"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
                Freeze as new revision
              </Button>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Rev</TableHead>
                <TableHead>Name / Reason</TableHead>
                <TableHead className="text-right">Total Plan</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-36 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : (data?.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No baselines yet.</p>
                    {canEdit && (
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreating(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Freeze the current scope as Rev 0
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                (data?.data ?? []).map((baseline) => (
                  <TableRow key={baseline.id}>
                    <TableCell>
                      <Badge variant={baseline.status === 'active' ? 'default' : 'outline'} className="font-mono">
                        Rev {baseline.revision}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{baseline.name}</div>
                      {baseline.reason && (
                        <div className="text-xs text-muted-foreground">{baseline.reason}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMYR(baseline.totalPlanCost)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {baseline.createdByName ?? '—'}
                      <div>{formatDateTime(baseline.createdAt)}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setComparing(baseline)}
                      >
                        <GitCompare className="mr-1.5 h-3.5 w-3.5" />
                        Compare
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {canEdit && !creating && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Baseline
            </Button>
          </div>
        )}

        {/* Diff view — one revision against the live tree */}
        {comparing && (
          <Dialog open onOpenChange={(next) => !next && setComparing(null)}>
            <DialogContent className="max-w-3xl px-6 pt-8 pb-6">
              <DialogHeader>
                <DialogTitle>
                  Diff — Rev {comparing.revision} "{comparing.name}" vs current
                </DialogTitle>
                <DialogDescription>
                  Matched by WBS number. Green = added since the baseline, red = removed,
                  amber = changed (old → new).
                </DialogDescription>
              </DialogHeader>
              {compareLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading snapshot…</p>
              ) : !diffRows ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Snapshot unavailable.</p>
              ) : (
                <div className="max-h-[55vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">WBS</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Changes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diffRows.map((row) => (
                        <TableRow
                          key={`${row.kind}-${row.wbsNumber}`}
                          className={
                            row.kind === 'added'
                              ? 'bg-green-500/5'
                              : row.kind === 'removed'
                                ? 'bg-destructive/5'
                                : row.kind === 'changed'
                                  ? 'bg-amber-500/5'
                                  : ''
                          }
                        >
                          <TableCell className="font-mono text-xs">{row.wbsNumber}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">
                              {row.kind === 'added' ? row.current?.title : row.baseline?.title}
                            </div>
                            <div className="text-xs text-muted-foreground capitalize">{row.kind}</div>
                          </TableCell>
                          <TableCell>
                            {row.changes.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <div className="space-y-0.5">
                                {row.changes.map((change) => (
                                  <div key={change.field} className="text-xs">
                                    <span className="text-muted-foreground">{change.field}:</span>{' '}
                                    <span className="line-through decoration-destructive/60">{change.from}</span>
                                    {' → '}
                                    <span className="font-medium">{change.to}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
