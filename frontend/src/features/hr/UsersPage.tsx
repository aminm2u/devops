import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Shield, Calendar, AlertTriangle, Pencil, Trash2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { useAuth } from '@/hooks/useAuth';
import { useReferenceData } from '@/hooks/useReferenceData';
import apiClient from '@/api/client';
import { accessApi } from '@/api/access';
import { orgApi, type OrgDepartment } from '@/api/org';
import { formatDate } from '@/lib/utils';
import toast from '@/lib/toast';

interface User {
  id: number;
  publicId: string | null;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  roles: Array<{ id: number; name: string; level?: number; color?: string | null }>;
  department?: { id: number; name: string; code?: string } | null;
  unit?: { id: number; name: string; code?: string | null } | null;
  directManager?: { id: number; name: string } | null;
}

/**
 * Rows per page. Kept in one place because the request and the pagination
 * footer must agree — the footer computes "showing 1 to 10" from it, and a
 * mismatch would misreport which slice of the directory is on screen.
 */
const PAGE_SIZE = 10;

export function UsersPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const isAdmin = can('hr.user.manage');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState<User | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<User | null>(null);

  // '' means no department filter. The value is a department id, not a
  // division code, because the server filters on users.department_id.
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('employee');
  const [selectedRole, setSelectedRole] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', search, page, departmentFilter],
    queryFn: async () => {
      const params: any = { page, limit: PAGE_SIZE };
      if (search) params.search = search;
      if (departmentFilter !== 'all') params.departmentId = departmentFilter;
      const res = await apiClient.get('/admin/users', { params });
      return res.data;
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiClient.post('/admin/users', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowCreateDialog(false);
      resetForm();
      toast.success('User created');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create user'),
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      apiClient.post(`/admin/users/${userId}/roles`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowRoleDialog(null);
      toast.success('Role updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update role'),
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      apiClient.delete(`/admin/users/${userId}/roles/${encodeURIComponent(role)}`),
    onSuccess: (_, { role }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowRoleDialog((current) =>
        current
          ? { ...current, roles: current.roles.filter((r) => r.name !== role) }
          : current
      );
      toast.success(`Role "${role}" removed`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to remove role'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => apiClient.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowDeleteDialog(null);
      toast.success('User deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete user'),
  });

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('employee');
  };

  /**
   * Roles are data. The picker is populated from Access Control rather than a
   * literal list, so a new role is assignable the moment it is created, and
   * `super-admin` never appears because it is not assignable.
   */
  const { data: availableRoles = [] } = useQuery({
    queryKey: ['access', 'roles'],
    queryFn: () => accessApi.getRoles(),
    staleTime: 5 * 60 * 1000,
  });

  const assignableRoles = availableRoles.filter((role) => role.isAssignable);

  /**
   * The department filter dropdown, driven by the Reference Data page.
   *
   * The reference list is the source of the options (the `division` group is
   * what the Reference Data page configures as departments), but a reference
   * entry alone cannot filter anything — `users.department_id` points at a
   * department row. So each entry is mapped to its department row by code,
   * exactly as the UserDetailPage picker does. Divisions that have not been
   * promoted to departments on the org chart are listed but disabled, because
   * "it is not in the dropdown" is a worse answer than "it is not a department
   * yet — add it on the org chart".
   */
  const { data: departmentRefs = [] } = useReferenceData('division');
  const { data: orgTree } = useQuery({
    queryKey: ['org-tree'],
    queryFn: () => orgApi.getTree(),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const departmentOptions = useMemo(() => {
    const departments: OrgDepartment[] = orgTree?.departments ?? [];
    const byCode = new Map(departments.map((dept) => [dept.code, dept]));
    return departmentRefs.map((ref) => ({
      id: byCode.get(ref.value)?.id ?? null,
      label: ref.label,
    }));
  }, [departmentRefs, orgTree]);

  const hasAnyDepartment = departmentOptions.some((opt) => opt.id !== null);

  const users: User[] = data?.data || [];
  const meta = data?.meta;

  /**
   * Deleting the last person on the last page leaves `page` past the end, and
   * the refetched page comes back empty — which reads as "the directory is
   * empty" rather than "go back one page". Step back instead. `lastPage` is 0
   * when nothing matches, so clamp to 1.
   */
  const lastPage = meta ? Math.max(1, meta.lastPage ?? 1) : null;
  useEffect(() => {
    if (lastPage !== null && page > lastPage) setPage(lastPage);
  }, [lastPage, page]);

  const columns: DataTableColumn<User>[] = [
    {
      key: 'user',
      header: 'User',
      // Name and email share a column: the email is how you tell two people
      // with the same name apart, so it belongs under the name rather than in
      // its own column eating width the placement column needs.
      render: (user) => (
        <div className="flex items-center gap-3">
          <UserAvatar user={user} size="lg" className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="truncate">{user.email}</span>
            </p>
          </div>
        </div>
      ),
      sortValue: (user) => user.name,
      sortable: true,
      className: 'min-w-[220px]',
      headerClassName: 'min-w-[220px]',
      skeletonClassName: 'h-10 w-10 rounded-full',
    },
    {
      key: 'roles',
      header: 'Roles',
      accessor: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">No role</span>
          ) : (
            user.roles.map((role) => (
              <Badge
                key={role.id}
                variant={role.name === 'super-admin' ? 'default' : 'secondary'}
                // Role colour comes from the DB (set in Access Control) so the
                // list matches the role cards on the access page.
                style={role.color ? { backgroundColor: `${role.color}1a`, color: role.color, borderColor: `${role.color}33` } : undefined}
              >
                {role.name}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department / Unit',
      // Department on top, unit underneath. A unit only means something next to
      // its department ("Infrastructure" could belong to IT or to Ops), so they
      // are read as one placement rather than as two unrelated columns.
      render: (user) => {
        if (!user.department) {
          return <span className="text-xs text-muted-foreground">Unassigned</span>;
        }
        return (
          <div className="min-w-0">
            <p className="truncate text-sm">
              <span className="truncate">{user.department.name}</span>
            </p>
            {/* Indented to sit under the department name, so the pair reads as
                one placement rather than two peer lines. */}
            <p className="truncate pl-0 text-xs text-muted-foreground">
              {user.unit ? user.unit.name : 'No unit'}
            </p>
          </div>
        );
      },
      sortValue: (user) =>
        user.department
          ? `${user.department.name}${user.unit ? ` / ${user.unit.name}` : ''}`
          : null,
      sortable: true,
      className: 'min-w-[200px]',
      headerClassName: 'min-w-[200px]',
    },
    {
      key: 'directManager',
      header: 'Reports to',
      accessor: (user) =>
        user.directManager ? (
          <span className="text-sm">{user.directManager.name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Joined',
      accessor: (user) => (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {formatDate(user.createdAt)}
        </div>
      ),
      sortValue: (user) => new Date(user.createdAt).getTime(),
      sortable: true,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-24',
      render: (user) => (
        <div className="flex gap-1">
          {/* Editing a profile has more fields than a dialog can hold, so it
              opens the employee's own page. */}
          <Button variant="ghost" size="sm" asChild>
            {/* uuid URL when the record has one — numeric ids in links let a
                directory be enumerated by editing the address bar. */}
            <Link to={`/hr/users/${user.publicId ?? user.id}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowRoleDialog(user);
              // Default to the first role they do not already hold, so the
              // picker is never pre-filled with an option that is filtered out.
              const next = assignableRoles.find(
                (role) => !user.roles.some((held) => held.name === role.name)
              );
              setSelectedRole(next?.name ?? '');
            }}
          >
            <Shield className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowDeleteDialog(user)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">You need admin privileges to manage users</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="User Management" description="Manage system users and their access">
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </PageHeader>

      {/* Summary — every figure here is real. The previous version had a
          permanent dash for "Active Sessions" (there is no session table) and a
          hardcoded 4 for "Roles Assigned", which read as data and was not. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Users</span>
              <span className="text-2xl font-bold tabular-nums">{meta?.total ?? users.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role Assignments</span>
              <span className="text-2xl font-bold tabular-nums text-blue-600">
                {/* holderCount is per role, so the sum is every held role. */}
                {availableRoles.reduce((sum, role) => sum + role.holderCount, 0)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Roles Defined</span>
              <span className="text-2xl font-bold tabular-nums text-green-600">
                {availableRoles.length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={users}
        loading={isLoading}
        error={
          error ? (
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-sm text-destructive">Failed to load users</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : undefined
        }
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: 'Search users by name or email...',
        }}
        filters={
          hasAnyDepartment ? (
            <Select
              value={departmentFilter}
              onValueChange={(v) => { setDepartmentFilter(v); setPage(1); }}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {/* Inactive reference entries are filtered out at the source by
                    the reference-data endpoint; unmapped ones stay visible but
                    disabled so the list matches what Reference Data configures. */}
                {departmentOptions.map((opt) => (
                  <SelectItem
                    key={opt.label}
                    value={opt.id !== null ? String(opt.id) : `unmapped:${opt.label}`}
                    disabled={opt.id === null}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
        pagination={{
          page,
          totalPages: lastPage ?? 1,
          onPageChange: setPage,
          totalItems: meta?.total,
          itemsPerPage: PAGE_SIZE,
        }}
        emptyIcon={Users}
        emptyTitle="No users found"
      />

      {/* Create User Dialog */}
      <FormDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) resetForm();
        }}
        title="Add User"
        description="Create a new user account"
        maxWidth="md"
        onSubmit={() => {
          if (!formName.trim() || !formEmail.trim()) {
            toast.error('Name and email are required');
            return;
          }
          if (formPassword.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
          }
          createMutation.mutate({
            name: formName.trim(),
            email: formEmail.trim(),
            password: formPassword,
            roles: [formRole],
          });
        }}
        submitLabel="Create User"
        isSubmitting={createMutation.isPending}
      >
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500' htmlFor="create-name">Name *</Label>
          <Input
            id="create-name"
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500' htmlFor="create-email">Email *</Label>
          <Input
            id="create-email"
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500' htmlFor="create-password">Password *</Label>
          <Input
            id="create-password"
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Role</Label>
          <Select value={formRole} onValueChange={setFormRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((role) => (
                <SelectItem key={role.id} value={role.name}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormDialog>

      {/* Role Assignment Dialog */}
      {showRoleDialog && (
        <FormDialog
          open={!!showRoleDialog}
          onOpenChange={() => setShowRoleDialog(null)}
          title="Manage Roles"
          description={`${showRoleDialog.name} may hold several roles — they add up.`}
          maxWidth="md"
          onSubmit={() => {
            assignRoleMutation.mutate({
              userId: showRoleDialog.id,
              role: selectedRole,
            });
          }}
          submitLabel="Add Role"
          isSubmitting={assignRoleMutation.isPending || !selectedRole}
        >
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <UserAvatar user={showRoleDialog} size="lg" />
            <div>
              <p className="font-medium">{showRoleDialog.name}</p>
              <p className="text-sm text-muted-foreground">{showRoleDialog.email}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className='dark:text-gray-400 text-gray-500'>Current Roles</Label>
            <div className="flex flex-wrap gap-2">
              {showRoleDialog.roles.length === 0 && (
                <span className="text-xs text-muted-foreground">No roles assigned</span>
              )}
              {showRoleDialog.roles.map((role) => (
                <Badge
                  key={role.id}
                  variant={role.name === 'super-admin' ? 'default' : 'secondary'}
                  style={
                    role.color
                      ? {
                          backgroundColor: `${role.color}1a`,
                          color: role.color,
                          borderColor: `${role.color}33`,
                        }
                      : undefined
                  }
                  className="gap-1"
                >
                  {role.name}
                  {/* super-admin never appears removable; the server refuses it too. */}
                  {role.name !== 'super-admin' && (
                    <button
                      type="button"
                      className="ml-0.5 rounded-full opacity-60 hover:opacity-100"
                      title="Remove role"
                      onClick={() =>
                        removeRoleMutation.mutate({
                          userId: showRoleDialog.id,
                          role: role.name,
                        })
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              A person must keep at least one role.
            </p>
          </div>
          <div className="space-y-2">
            <Label className='dark:text-gray-400 text-gray-500'>Add a role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role…" />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles
                  .filter(
                    (role) => !showRoleDialog.roles.some((held) => held.name === role.name)
                  )
                  .map((role) => (
                    <SelectItem key={role.id} value={role.name}>
                      {role.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </FormDialog>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!showDeleteDialog}
        onOpenChange={() => setShowDeleteDialog(null)}
        title="Delete User"
        description={<>Are you sure you want to delete <strong>{showDeleteDialog?.name}</strong>? This action cannot be undone.</>}
        confirmLabel="Delete User"
        onConfirm={() => {
          deleteMutation.mutate(showDeleteDialog!.id);
        }}
        isConfirming={deleteMutation.isPending}
      >
        <div className="flex items-center gap-3 p-3 bg-destructive/10 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-destructive">
            This will permanently remove the user and all their data.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
