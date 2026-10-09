import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Shield, Mail, Calendar, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
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
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

interface User {
  id: number;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  roles: Array<{ id: number; name: string }>;
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('super-admin');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState<User | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState<User | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<User | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('viewer');
  const [selectedRole, setSelectedRole] = useState('viewer');

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

  const editMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: any }) =>
      apiClient.put(`/admin/users/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowEditDialog(null);
      resetForm();
      toast.success('User updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update user'),
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
    setFormRole('viewer');
  };

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
        <div className="flex gap-1">
          {user.roles.map((role) => (
            <Badge
              key={role.id}
              variant={role.name === 'admin' ? 'default' : 'secondary'}
            >
              {role.name}
            </Badge>
          ))}
        </div>
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowEditDialog(user);
              setFormName(user.name);
              setFormEmail(user.email);
              setFormPassword('');
              setFormRole(user.roles[0]?.name || 'viewer');
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowRoleDialog(user);
              setSelectedRole(user.roles[0]?.name || 'viewer');
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
            role: formRole,
          });
        }}
        submitLabel="Create User"
        isSubmitting={createMutation.isPending}
      >
        <div className="space-y-2">
          <Label htmlFor="create-name">Name *</Label>
          <Input
            id="create-name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-email">Email *</Label>
          <Input
            id="create-email"
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="create-password">Password *</Label>
          <Input
            id="create-password"
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={formRole} onValueChange={setFormRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="devops-engineer">DevOps Engineer</SelectItem>
              <SelectItem value="devops-admin">DevOps Admin</SelectItem>
              <SelectItem value="super-admin">Super Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FormDialog>

      {/* Role Assignment Dialog */}
      {showRoleDialog && (
        <FormDialog
          open={!!showRoleDialog}
          onOpenChange={() => setShowRoleDialog(null)}
          title="Manage Role"
          description={`Assign a role to ${showRoleDialog.name}`}
          maxWidth="md"
          onSubmit={() => {
            assignRoleMutation.mutate({
              userId: showRoleDialog.id,
              role: selectedRole,
            });
          }}
          submitLabel="Update Role"
          isSubmitting={assignRoleMutation.isPending}
        >
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <UserAvatar user={showRoleDialog} size="lg" />
            <div>
              <p className="font-medium">{showRoleDialog.name}</p>
              <p className="text-sm text-muted-foreground">{showRoleDialog.email}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Current Roles</Label>
            <div className="flex gap-2">
              {showRoleDialog.roles.map((role) => (
                <Badge key={role.id} variant={role.name === 'admin' ? 'default' : 'secondary'}>
                  {role.name}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assign New Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="devops-engineer">DevOps Engineer</SelectItem>
                <SelectItem value="devops-admin">DevOps Admin</SelectItem>
                <SelectItem value="super-admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FormDialog>
      )}

      {/* Edit User Dialog */}
      {showEditDialog && (
        <FormDialog
          open={!!showEditDialog}
          onOpenChange={() => {
            setShowEditDialog(null);
            resetForm();
          }}
          title="Edit User"
          description={`Update user information for ${showEditDialog.name}`}
          maxWidth="md"
          onSubmit={() => {
            if (!formName.trim() || !formEmail.trim()) {
              toast.error('Name and email are required');
              return;
            }
            const updateData: any = {
              name: formName.trim(),
              email: formEmail.trim(),
              role: formRole,
            };
            if (formPassword.length >= 8) {
              updateData.password = formPassword;
            }
            editMutation.mutate({
              userId: showEditDialog.id,
              data: updateData,
            });
          }}
          submitLabel="Save Changes"
          isSubmitting={editMutation.isPending}
        >
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-password">New Password (leave blank to keep current)</Label>
            <Input
              id="edit-password"
              type="password"
              value={formPassword}
              onChange={(e) => setFormPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={formRole} onValueChange={setFormRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="devops-engineer">DevOps Engineer</SelectItem>
                <SelectItem value="devops-admin">DevOps Admin</SelectItem>
                <SelectItem value="super-admin">Super Admin</SelectItem>
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
