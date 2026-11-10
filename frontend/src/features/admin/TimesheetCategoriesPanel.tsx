import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from '@/lib/toast';
import { Plus, Pencil, Trash2, Clock } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';

/**
 * Timesheet categories.
 *
 * A `timesheet_category` reference-data group, not a table of its own — but it
 * gets the same panel treatment as Positions and Units because it carries an
 * `isActive` flag and a sort order that the generic key/value editor cannot
 * show together with a live/inactive status.
 *
 * This used to be its own Settings tab, editing these same rows through a
 * second screen. Two editors for one list meant deactivating a category in one
 * place left the other showing it as active, so the list now lives here and
 * the tab is gone.
 *
 * Rendered bare (no Card) because it is mounted inside the Reference Data
 * picker — that tab already owns the card and the group selector.
 */

export const TIMESHEET_CATEGORY_GROUP = 'timesheet_category';

interface CategoryRecord {
  id: number;
  group: string;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

function errMessage(err: any, fallback: string): string {
  return err?.response?.data?.error || err?.response?.data?.message || fallback;
}

export function TimesheetCategoriesPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<CategoryRecord | null>(null);

  // The picker already fetches every group; reading that cache avoids a second
  // request for a list that is on screen anyway.
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['reference-data', TIMESHEET_CATEGORY_GROUP, 'all'],
    queryFn: async () => {
      const res = await apiClient.get(
        `/settings/reference-data/${TIMESHEET_CATEGORY_GROUP}`,
        // Editors must see the rows they are meant to reactivate; dropdowns
        // read the same group without the flag and get only active values.
        { params: { includeInactive: true } }
      );
      return res.data.data as CategoryRecord[];
    },
    staleTime: 30_000,
  });

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder),
    [items]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['reference-data'] });
    queryClient.invalidateQueries({ queryKey: ['timesheet-rules'] });
  };
  const deleteMutation = useMutation({
    mutationFn: (item: CategoryRecord) =>
      apiClient.delete(`/settings/reference-data/${TIMESHEET_CATEGORY_GROUP}/${item.id}`),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Category removed');
    },
    onError: (err: any) => {
      setDeleting(null);
      toast.error(errMessage(err, 'Could not remove the category'));
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 p-4">
        <div>
          <h3 className="text-sm font-semibold">Timesheet categories</h3>
          <p className="text-xs text-muted-foreground">
            What kind of work a timesheet row records. Task-linked entries are always
            &ldquo;project&rdquo;.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Category
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
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No categories yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A timesheet entry cannot be saved without one.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add first category
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 pl-4">Order</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-44">Value</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((item) => (
              <TableRow key={item.id} className={item.isActive ? undefined : 'opacity-60'}>
                <TableCell className="pl-4 tabular-nums text-muted-foreground">
                  {item.sortOrder}
                </TableCell>
                <TableCell className="font-medium">{item.label}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono font-normal">
                    {item.value}
                  </Badge>
                </TableCell>
                <TableCell>
                  {item.isActive ? (
                    <Badge variant="outline" className="border-green-600/30 text-green-600">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Remove"
                      onClick={() => setDeleting(item)}
                    >
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
        <CategoryDialog
          item={editing}
          nextSortOrder={sorted.length ? Math.max(...sorted.map((i) => i.sortOrder)) + 1 : 1}
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
          title="Remove category?"
          description={`"${deleting.label}" will no longer appear in timesheet category dropdowns. Entries already using it are unaffected.`}
          confirmLabel="Remove"
          onConfirm={() => deleteMutation.mutate(deleting)}
          isConfirming={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function CategoryDialog({
  item,
  nextSortOrder,
  onClose,
}: {
  item: CategoryRecord | null;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(item?.label ?? '');
  const [value, setValue] = useState(item?.value ?? '');
  const [sortOrder, setSortOrder] = useState(item?.sortOrder ?? nextSortOrder);
  const [isActive, setIsActive] = useState(item?.isActive ?? true);

  const mutation = useMutation({
    mutationFn: async () => {
      if (item) {
        return apiClient.put(
          `/settings/reference-data/${TIMESHEET_CATEGORY_GROUP}/${item.id}`,
          { label, sortOrder: Number(sortOrder), isActive }
        );
      }
      return apiClient.post(`/settings/reference-data/${TIMESHEET_CATEGORY_GROUP}`, {
        label,
        value,
        sortOrder: Number(sortOrder),
        isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-data'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet-rules'] });
      toast.success(item ? 'Category updated' : 'Category added');
      onClose();
    },
    onError: (err: any) => toast.error(errMessage(err, 'Could not save the category')),
  });

  const handleSubmit = () => {
    if (!label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (!item && !value.trim()) {
      toast.error('Value is required');
      return;
    }
    mutation.mutate();
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={item ? 'Edit category' : 'New category'}
      description="Shown in the category picker on a timesheet entry."
      maxWidth="sm"
      onSubmit={handleSubmit}
      submitLabel={item ? 'Save' : 'Add'}
      isSubmitting={mutation.isPending}
    >
      <div className="space-y-2">
        <Label>Label *</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Management"
          autoFocus
        />
      </div>
      {!item && (
        <div className="space-y-2">
          <Label>Value *</Label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. management"
            className="font-mono"
          />
          {/* The value is stored on every entry, so it is worth saying that it
              is not a display string that can be retyped later. */}
          <p className="text-xs text-muted-foreground">
            Lowercase identifier stored on each entry. Cannot be changed later.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Sort order</Label>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} id="timesheet-category-active" />
          <Label htmlFor="timesheet-category-active" className="cursor-pointer">
            Active
          </Label>
        </div>
      </div>
    </FormDialog>
  );
}
