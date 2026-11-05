import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Shield, Mail, Calendar, AlertTriangle, Pencil, Trash2, X } from 'lucide-react';
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
import apiClient from '@/api/client';
import { accessApi } from '@/api/access';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

interface User {
  id: number;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  roles: Array<{ id: number; name: string; level?: number; color?: string | null }>;
  department?: { id: number; name: string } | null;
  directManager?: { id: number; name: string } | null;
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const isAdmin = can('hr.user.manage');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState<User | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<User | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('employee');
  const [selectedRole, setSelectedRole] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', search, page],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (search) params.search = search;
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

  const users: User[] = data?.data || [];
  const meta = data?.meta;

  const columns: DataTableColumn<User>[] = [
    {
      key: 'user',
      header: 'User',
      render: (user) => (
        <div className="flex items-center gap-3">
          <UserAvatar user={user} size="lg" />
          <span className="font-medium">{user.name}</span>
        </div>
      ),
      sortValue: (user) => user.name,
      sortable: true,
      skeletonClassName: 'h-10 w-10 rounded-full',
    },
    {
      key: 'email',
      header: 'Email',
      accessor: (user) => (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Mail className="h-3 w-3" />
          {user.email}
        </div>
      ),
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
      header: 'Department',
      accessor: (user) =>
        user.department ? (
          <span className="text-sm">{user.department.name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        ),
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
            <Link to={`/admin/users/${user.id}`}>
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

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Users</span>
              <span className="text-2xl font-bold">{meta?.total || users.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active Sessions</span>
              <span className="text-2xl font-bold text-green-600">—</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Roles Assigned</span>
              <span className="text-2xl font-bold text-blue-600">4</span>
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
        pagination={{
          page,
          totalPages: meta?.lastPage ?? 1,
          onPageChange: setPage,
          totalItems: meta?.total,
          itemsPerPage: 20,
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
