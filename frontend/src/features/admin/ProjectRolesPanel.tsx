import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from '@/lib/toast';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
 * Project roles — the role a person holds on a project's team (Team tab,
 * resource costing lines, costing-sheet verifiers). A real table, not free
 * text: renaming "Project Manager" re-labels every assignment at once.
 *
 * Rendered bare (no Card) because it is mounted inside the Reference Data
 * picker — that tab already owns the card and the group selector.
 */

export interface ProjectRoleRecord {
  id: number;
  name: string;
  /** Present on the list response only — how many assignments hold it. */
  _count?: { assignments: number };
}

function errMessage(err: any, fallback: string): string {
  return err?.response?.data?.error || err?.response?.data?.message || fallback;
}

export function ProjectRolesPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProjectRoleRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ProjectRoleRecord | null>(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['project-roles', 'admin'],
    queryFn: async () => {
      const res = await apiClient.get('/references/project-roles');
      return res.data.data as ProjectRoleRecord[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (role: ProjectRoleRecord) =>
      apiClient.delete(`/references/project-roles/${role.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-roles'] });
      queryClient.invalidateQueries({ queryKey: ['references'] });
      setDeleting(null);
      toast.success('Project role deleted');
    },
    // The server refuses while assignments still use it and says how many.
    onError: (err: any) => {
      setDeleting(null);
      toast.error(errMessage(err, 'Could not delete the project role'));
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 p-4">
        <div>
          <h3 className="text-sm font-semibold dark:text-gray-300 text-gray-800">Project roles</h3>
          <p className="text-xs text-muted-foreground">
            Roles a person can hold on a project&apos;s team. Renaming one re-labels every
            assignment that uses it.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Role
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No project roles yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Team members cannot be assigned a role until one exists.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add first role
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead className="w-40">Assignments</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="pl-4 font-medium dark:text-gray-400 text-gray-800">
                  {role.name}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  <span className="dark:text-gray-400 text-gray-800">
                    {role._count?.assignments ?? 0}
                  </span>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(role)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleting(role)}>
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
        <ProjectRoleDialog item={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Delete project role?"
          description={`"${deleting.name}" will be removed. This is refused if any team assignment still uses it.`}
          confirmLabel="Delete"
          onConfirm={() => deleteMutation.mutate(deleting)}
          isConfirming={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function ProjectRoleDialog({ item, onClose }: { item: ProjectRoleRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim() };
      if (item) return apiClient.put(`/references/project-roles/${item.id}`, payload);
      return apiClient.post('/references/project-roles', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-roles'] });
      queryClient.invalidateQueries({ queryKey: ['references'] });
      toast.success(item ? 'Project role updated' : 'Project role created');
      onClose();
    },
    onError: (err: any) => toast.error(errMessage(err, 'Could not save the project role')),
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
      title={item ? 'Edit project role' : 'New project role'}
      description="The role shown on team assignments and the costing sheet's resource lines."
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
          placeholder="Project Manager"
          autoFocus
        />
      </div>
    </FormDialog>
  );
}
