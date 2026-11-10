import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from '@/lib/toast';
import { Plus, Pencil, Trash2, Headphones, RotateCcw } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';

/**
 * Helpdesk categories.
 *
 * These are what the "Category" dropdown on a ticket offers. Unlike reference
 * data they carry a description that the ticket list shows as a subtitle, and
 * they are retired by flipping `is_active` rather than deleted — tickets keep
 * pointing at their category forever, so the row has to survive.
 *
 * The list is fetched with `includeInactive=true` so a retired category can be
 * seen and restored here. Everywhere else (the ticket form, the filters) reads
 * the default response, which only returns active ones.
 *
 * Rendered bare (no Card) because it is mounted inside the Reference Data
 * picker — that tab already owns the card and the group selector.
 */

export interface HelpdeskCategoryRow {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { tickets: number };
}

function errMessage(err: any, fallback: string): string {
  return err?.response?.data?.error || err?.response?.data?.message || fallback;
}

export function HelpdeskCategoriesPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<HelpdeskCategoryRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [retiring, setRetiring] = useState<HelpdeskCategoryRow | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['helpdesk-categories', 'admin'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/categories?includeInactive=true');
      return res.data.data as HelpdeskCategoryRow[];
    },
  });

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [categories]
  );

  const retireMutation = useMutation({
    mutationFn: (category: HelpdeskCategoryRow) =>
      apiClient.delete(`/helpdesk/categories/${category.id}`),
    onSuccess: () => {
      // Every screen that lists categories keeps its own cache key; the shared
      // prefix is what makes a change appear in the ticket form without a reload.
      queryClient.invalidateQueries({ queryKey: ['helpdesk-categories'] });
      setRetiring(null);
      toast.success('Category retired');
    },
    onError: (err: any) => {
      setRetiring(null);
      toast.error(errMessage(err, 'Could not retire the category'));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (category: HelpdeskCategoryRow) =>
      apiClient.put(`/helpdesk/categories/${category.id}`, { isActive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-categories'] });
      toast.success('Category restored');
    },
    onError: (err: any) => toast.error(errMessage(err, 'Could not restore the category')),
  });

  const activeCount = sorted.filter((c) => c.isActive).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 p-4">
        <div>
          <h3 className="text-sm font-semibold">Helpdesk Categories</h3>
          <p className="text-xs text-muted-foreground">
            Offered when a ticket is raised. Retiring one hides it from the form but keeps it on the
            tickets that already used it.
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
            <Headphones className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No categories yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A ticket can still be raised without one, but it will not be classified.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add first category
          </Button>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 pl-4">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Tickets</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((category) => (
                <TableRow key={category.id} className={category.isActive ? undefined : 'opacity-60'}>
                  <TableCell className="pl-4 tabular-nums text-muted-foreground">
                    {category.sortOrder}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{category.name}</p>
                    {category.description && (
                      <p className="text-xs text-muted-foreground">{category.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {category._count?.tickets ?? 0}
                  </TableCell>
                  <TableCell>
                    {category.isActive ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Retired
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(category)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {category.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Retire"
                          onClick={() => setRetiring(category)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Restore"
                          onClick={() => restoreMutation.mutate(category)}
                          disabled={restoreMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4 text-emerald-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
            {activeCount} active of {sorted.length}
          </div>
        </>
      )}

      {(adding || editing) && (
        <CategoryDialog
          item={editing}
          nextSortOrder={sorted.length ? Math.max(...sorted.map((c) => c.sortOrder)) + 1 : 1}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}

      {retiring && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRetiring(null)}
          title="Retire this category?"
          description={
            `"${retiring.name}" will no longer be offered on new tickets. ` +
            `The ${retiring._count?.tickets ?? 0} ticket(s) already using it keep it, and you can restore it later.`
          }
          confirmLabel="Retire"
          onConfirm={() => retireMutation.mutate(retiring)}
          isConfirming={retireMutation.isPending}
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
  item: HelpdeskCategoryRow | null;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? nextSortOrder));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        // '' means "no description", not an empty string in the column.
        description: description.trim() === '' ? null : description.trim(),
        sortOrder: Number(sortOrder) || 0,
      };
      if (item) return apiClient.put(`/helpdesk/categories/${item.id}`, payload);
      return apiClient.post('/helpdesk/categories', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-categories'] });
      toast.success(item ? 'Category updated' : 'Category created');
      onClose();
    },
    onError: (err: any) => toast.error(errMessage(err, 'Could not save the category')),
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    mutation.mutate();
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={item ? 'Edit category' : 'New category'}
      description="The category is the main way a ticket list is filtered."
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
          placeholder="Hardware Issue"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Shown under the name in the ticket list"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Sort order</Label>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
      </div>
    </FormDialog>
  );
}
