import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';

/**
 * Job titles.
 *
 * `positions` is a real table, not reference data: a person's HR record points
 * at a row, so the title has to exist before it can be assigned, and renaming
 * it must move everyone holding it at once. `gradeLevel` is optional and is
 * what the org chart and approval routing read when they need seniority.
 *
 * Rendered bare (no Card) because it is mounted inside the Reference Data
 * picker — that tab already owns the card and the group selector.
 */

export interface PositionRecord {
  id: number;
  name: string;
  gradeLevel: number | null;
  /** Present on the list response only — how many people hold it. */
  _count?: { employees: number };
}

function errMessage(err: any, fallback: string): string {
  return err?.response?.data?.error || err?.response?.data?.message || fallback;
}

export function PositionsPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PositionRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<PositionRecord | null>(null);

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const res = await apiClient.get('/references');
      return res.data.data.positions as PositionRecord[];
    },
  });

  // Graded before ungraded, then highest grade first — the grade is what
  // expresses seniority, and the API only sorts by name. Ungraded titles go to
  // the bottom rather than being treated as grade 0, which would put them
  // below a real G1. Ties (and the ungraded block) fall back to the name so the
  // order is stable between loads.
  const sorted = useMemo(
    () =>
      [...positions].sort((a, b) => {
        const gradeA = a.gradeLevel ?? null;
        const gradeB = b.gradeLevel ?? null;
        if (gradeA !== gradeB) {
          if (gradeA === null) return 1;
          if (gradeB === null) return -1;
          return gradeB - gradeA;
        }
        return a.name.localeCompare(b.name);
      }),
    [positions]
  );

  const deleteMutation = useMutation({
    mutationFn: (position: PositionRecord) =>
      apiClient.delete(`/references/positions/${position.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['references'] });
      setDeleting(null);
      toast.success('Position deleted');
    },
    // The server refuses while people still hold it and says how many — show
    // that rather than a generic failure, because it is the actionable part.
    onError: (err: any) => {
      setDeleting(null);
      toast.error(errMessage(err, 'Could not delete the position'));
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 p-4">
        <div>
          <h3 className="text-sm font-semibold">Positions</h3>
          <p className="text-xs text-muted-foreground">
            Job titles available on an employee&apos;s HR record. Grade level is optional and orders
            seniority where a workflow needs it.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Position
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Briefcase className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No positions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Employees cannot be assigned a title until one exists.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add first position
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead className="w-32">Grade</TableHead>
              <TableHead className="w-32">Employees</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="pl-4 font-medium">{position.name}</TableCell>
                <TableCell>
                  {position.gradeLevel != null ? (
                    <Badge variant="outline" className="font-mono font-normal">
                      G{position.gradeLevel}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not set</span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {position._count?.employees ?? 0}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(position)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleting(position)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {(adding || editing) && (
        <PositionDialog item={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Delete position?"
          description={`"${deleting.name}" will be removed. This is refused if anyone still holds it.`}
          confirmLabel="Delete"
          onConfirm={() => deleteMutation.mutate(deleting)}
          isConfirming={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function PositionDialog({ item, onClose }: { item: PositionRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [grade, setGrade] = useState(item?.gradeLevel != null ? String(item.gradeLevel) : '');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        // '' clears the grade back to null rather than storing 0.
        gradeLevel: grade.trim() === '' ? null : Number(grade),
      };
      if (item) return apiClient.put(`/references/positions/${item.id}`, payload);
      return apiClient.post('/references/positions', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['references'] });
      toast.success(item ? 'Position updated' : 'Position created');
      onClose();
    },
    onError: (err: any) => toast.error(errMessage(err, 'Could not save the position')),
  });

  const handleSubmit = () => {
    if (name.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    mutation.mutate();
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={item ? 'Edit position' : 'New position'}
      description="The title shown on an employee's record and in the org chart."
      maxWidth="sm"
      onSubmit={handleSubmit}
      submitLabel={item ? 'Save' : 'Create'}
      isSubmitting={mutation.isPending}
    >
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Senior DevOps Engineer"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Grade level</Label>
        <Input
          type="number"
          min={1}
          max={99}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          placeholder="Optional — e.g. 4"
        />
        <p className="text-xs text-muted-foreground">
          Higher is more senior. Leave blank if grades are not used.
        </p>
      </div>
    </FormDialog>
  );
}
