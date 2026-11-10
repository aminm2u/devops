import { Fragment, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from '@/lib/toast';
import { Plus, Pencil, Trash2, Boxes, Building2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import apiClient from '@/api/client';

/**
 * Units — the subdivisions of a department.
 *
 * IT may be split into Infrastructure, Application Development and Support;
 * HR into People Operations and Payroll. A person sits in at most one unit,
 * and a unit belongs to exactly one department, so this is a real table rather
 * than a `reference_data` group: the department is part of the unit's identity.
 *
 * Rendered bare (no Card) because it is mounted inside the Reference Data
 * picker — that tab already owns the card and the group selector.
 */

export interface UnitRecord {
  id: number;
  name: string;
  code: string | null;
  departmentId: number;
  sortOrder: number;
  department?: { id: number; name: string; code: string } | null;
  /** Present on the list response only — how many people sit in the unit. */
  _count?: { employees: number };
}

interface ReferencePayload {
  departments: { id: number; name: string; code: string }[];
  units: UnitRecord[];
}

function errMessage(err: any, fallback: string): string {
  return err?.response?.data?.error || err?.response?.data?.message || fallback;
}

/**
 * One fetch for both lists.
 *
 * `/references` already returns departments and units together, and the unit
 * form needs the department list to pick from — asking for them separately
 * would mean two round trips for one screen.
 */
function useReferencePayload() {
  return useQuery({
    queryKey: ['references'],
    queryFn: async () => {
      const res = await apiClient.get('/references');
      return res.data.data as ReferencePayload;
    },
  });
}

export function UnitsPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UnitRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<UnitRecord | null>(null);

  const { data, isLoading } = useReferencePayload();
  const departments = data?.departments ?? [];

  /**
   * Grouped by department, then by the unit's own order.
   *
   * A flat alphabetical list puts "Infrastructure" next to "Payroll" with no
   * hint that they live in different departments; grouping is what makes the
   * one-to-many relationship visible at a glance.
   */
  const grouped = useMemo(() => {
    const units = data?.units ?? [];
    const byDepartment = new Map<number, UnitRecord[]>();
    for (const unit of units) {
      const bucket = byDepartment.get(unit.departmentId) ?? [];
      bucket.push(unit);
      byDepartment.set(unit.departmentId, bucket);
    }
    return departments
      .map((department) => ({
        department,
        units: (byDepartment.get(department.id) ?? []).sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
        ),
      }))
      .sort((a, b) => a.department.name.localeCompare(b.department.name));
  }, [data, departments]);

  const total = data?.units.length ?? 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['references'] });
    queryClient.invalidateQueries({ queryKey: ['user'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (unit: UnitRecord) => apiClient.delete(`/references/units/${unit.id}`),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Unit deleted');
    },
    // The server refuses while people still sit in it and says how many — show
    // that rather than a generic failure, because it is the actionable part.
    onError: (err: any) => {
      setDeleting(null);
      toast.error(errMessage(err, 'Could not delete the unit'));
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 p-4">
        <div>
          <h3 className="text-sm font-semibold">Units</h3>
          <p className="text-xs text-muted-foreground">
            Subdivisions of a department — Infrastructure inside IT, Payroll inside HR. An
            employee may sit in one unit, and only one from their own department.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)} disabled={departments.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Unit
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Boxes className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No units yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {departments.length === 0
              ? 'Create a department on the org chart first — a unit belongs to one.'
              : 'Units are optional. Add them where a department splits into smaller teams.'}
          </p>
          {departments.length > 0 && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add first unit
            </Button>
          )}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Unit</TableHead>
              <TableHead className="w-32">Code</TableHead>
              <TableHead className="w-24">Employees</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map(({ department, units }) => (
              <Fragment key={department.id}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={4} className="py-1.5 pl-4">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {department.name}
                      <span className="font-mono font-normal normal-case opacity-70">
                        {department.code}
                      </span>
                      <span className="font-normal normal-case opacity-70">
                        · {units.length} unit{units.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
                {units.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="pl-8 font-medium dark:text-gray-400 text-gray-800">{unit.name}</TableCell>
                    <TableCell>
                      {unit.code ? (
                        <Badge variant="outline" className="font-mono font-normal dark:text-gray-400 text-gray-800">
                          {unit.code}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {unit._count?.employees ?? 0}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(unit)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Delete"
                          onClick={() => setDeleting(unit)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}

      {(adding || editing) && (
        <UnitDialog
          item={editing}
          departments={departments}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Delete unit?"
          description={`"${deleting.name}" will be removed. This is refused while employees still sit in it.`}
          confirmLabel="Delete"
          onConfirm={() => deleteMutation.mutate(deleting)}
          isConfirming={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function UnitDialog({
  item,
  departments,
  onClose,
}: {
  item: UnitRecord | null;
  departments: { id: number; name: string; code: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [code, setCode] = useState(item?.code ?? '');
  const [departmentId, setDepartmentId] = useState(
    item?.departmentId != null ? String(item.departmentId) : ''
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        // '' clears the code back to null rather than storing an empty string.
        code: code.trim() === '' ? null : code.trim(),
        departmentId: Number(departmentId),
      };
      if (item) return apiClient.put(`/references/units/${item.id}`, payload);
      return apiClient.post('/references/units', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['references'] });
      toast.success(item ? 'Unit updated' : 'Unit created');
      onClose();
    },
    onError: (err: any) => toast.error(errMessage(err, 'Could not save the unit')),
  });

  const handleSubmit = () => {
    if (name.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    if (!departmentId) {
      toast.error('Pick the department this unit belongs to');
      return;
    }
    mutation.mutate();
  };

  const movedDepartment =
    item != null && departmentId !== '' && Number(departmentId) !== item.departmentId;

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={item ? 'Edit unit' : 'New unit'}
      description="A unit is a subdivision of one department, shown on an employee's HR record."
      maxWidth="sm"
      onSubmit={handleSubmit}
      submitLabel={item ? 'Save' : 'Create'}
      isSubmitting={mutation.isPending}
    >
      <div className="space-y-2">
        <Label>Department *</Label>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger>
            <SelectValue placeholder="Which department does this unit sit in?" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((department) => (
              <SelectItem key={department.id} value={String(department.id)}>
                {department.name} ({department.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Moving a unit is allowed only while it is empty — everyone inside it
            would otherwise be left with a unit from another department. */}
        {movedDepartment && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Moving a unit to another department is refused while employees still sit in it.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Infrastructure"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Code</Label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Optional — e.g. INFRA"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Short label for reports. Leave blank if the name is enough.
        </p>
      </div>
    </FormDialog>
  );
}
