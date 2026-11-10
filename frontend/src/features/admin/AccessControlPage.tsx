import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
} from 'lucide-react';
import toast from '@/lib/toast';
import apiClient from '@/api/client';
import { accessApi, type MatrixPayload, type RoleSummary } from '@/api/access';
import type { PermissionScope } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SCOPES: PermissionScope[] = ['self', 'team', 'department', 'all'];

const SCOPE_LABEL: Record<PermissionScope, string> = {
  self: 'Own records',
  team: 'My team',
  department: 'My department',
  all: 'Everything',
};

const SCOPE_SHORT: Record<PermissionScope, string> = {
  self: 'self',
  team: 'team',
  department: 'dept',
  all: 'all',
};

interface PersonOption {
  id: number;
  name: string;
  email: string;
}

/**
 * Access Control.
 *
 * Every list on this page comes from the server: the catalog, the roles and
 * every grant in `GET /admin/access/matrix`. Nothing here names a permission,
 * so adding one to `rbac/catalog.ts` and re-seeding makes it appear in the
 * matrix with no frontend change.
 */
export function AccessControlPage() {
  const { can, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const canManageRoles = can('admin.role.manage');
  const canGrantDirect = can('admin.permission.grant');

  const { data, isLoading, error } = useQuery({
    queryKey: ['access', 'matrix'],
    queryFn: () => accessApi.getMatrix(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Access Control unavailable
            </CardTitle>
            <CardDescription>
              You do not have permission to view roles, or the request failed.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Access Control</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Roles decide <em>what</em> a person may do; scope decides <em>which records</em>. A
            person may hold several roles — grants are unioned, the widest scope wins, and a
            direct deny always overrides.
          </p>
        </div>
      </header>

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="grants">Direct Grants</TabsTrigger>
          <TabsTrigger value="users">Effective Access</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <PermissionMatrixTab data={data} canManage={canManageRoles} />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <RolesTab data={data} canManage={canManageRoles} />
        </TabsContent>

        <TabsContent value="grants" className="mt-4">
          <DirectGrantsTab data={data} canEdit={canGrantDirect} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <EffectiveAccessTab data={data} canManage={canManageRoles} />
        </TabsContent>
      </Tabs>

      <SuperAdminCard
          superAdmin={data.superAdmin}
          canTransfer={isSuperAdmin}
          onTransferred={() => queryClient.invalidateQueries({ queryKey: ['access', 'matrix'] })}
        />
    </div>
  );
}

// ── Super admin card ────────────────────────────────────────────────────────

/**
 * The single-holder card.
 *
 * Transferring super admin is the one action in the whole console that can
 * remove a person's ability to undo it, so it is deliberately awkward: choose
 * the successor, re-type their email, and give a reason that lands in the
 * activity log.
 */
function SuperAdminCard({
  superAdmin,
  canTransfer,
  onTransferred,
}: {
  superAdmin: MatrixPayload['superAdmin'];
  canTransfer: boolean;
  onTransferred: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="w-full mt-4 border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-destructive" />
          Super Administrator
        </CardTitle>
        <CardDescription>
          Exactly one holder at a time. This role is not assignable through role editing — it
          moves only by transfer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {superAdmin ? (
          <>
            <div>
              <p className="text-sm font-medium">{superAdmin.name}</p>
              <p className="text-xs text-muted-foreground">{superAdmin.email}</p>
            </div>
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              sole holder
            </Badge>
          </>
        ) : (
          <p className="text-sm text-destructive">
            No super administrator found — the database is inconsistent.
          </p>
        )}
        {canTransfer ? (
          <Button variant="outline" size="sm" className="mt-1" onClick={() => setOpen(true)}>
            Transfer super admin
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only the current super administrator can transfer this role.
          </p>
        )}
      </CardContent>

      <TransferSuperAdminDialog
        open={open}
        onOpenChange={setOpen}
        current={superAdmin}
        onTransferred={() => {
          setOpen(false);
          onTransferred();
        }}
      />
    </Card>
  );
}

function TransferSuperAdminDialog({
  open,
  onOpenChange,
  current,
  onTransferred,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: MatrixPayload['superAdmin'];
  onTransferred: () => void;
}) {
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<{ id: number; name: string; email: string } | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [reason, setReason] = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['users', 'transfer-candidates', search],
    queryFn: async () => {
      const res = await apiClient.get('/admin/users', {
        params: { search: search || undefined, limit: 20 },
      });
      return res.data;
    },
    enabled: open,
  });

  const candidates: { id: number; name: string; email: string; isActive: boolean }[] = (
    usersData?.data ?? []
  ).filter((user: any) => user.id !== current?.id && user.isActive);

  const transferMutation = useMutation({
    mutationFn: () =>
      accessApi.transferSuperAdmin({
        userId: target!.id,
        confirmEmail: confirmEmail.trim(),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success('Super administrator transferred — please sign in again');
      onTransferred();
      // The session that just gave the role away must not keep acting as owner.
      window.setTimeout(() => {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }, 1200);
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || 'Could not transfer the role'),
  });

  const matches =
    target !== null && confirmEmail.trim().toLowerCase() === target.email.toLowerCase();
  const canSubmit = Boolean(target) && matches && reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Transfer super administrator</DialogTitle>
          <DialogDescription>
            The role moves from {current?.name ?? 'the current holder'} to the person you choose.
            You will be signed out and will no longer hold it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Successor</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
            />
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {candidates.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No eligible people found.
                </p>
              ) : (
                candidates.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setTarget(user);
                      setConfirmEmail('');
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                      target?.id === user.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <span>
                      <span className="font-medium">{user.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{user.email}</span>
                    </span>
                    {target?.id === user.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))
              )}
            </div>
          </div>

          {target && (
            <>
              <div className="space-y-2">
                <Label htmlFor="confirm-email">Type {target.email} to confirm</Label>
                <Input
                  id="confirm-email"
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                  placeholder={target.email}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-reason">Reason</Label>
                <Input
                  id="transfer-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Recorded in the activity log"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit || transferMutation.isPending}
            onClick={() => transferMutation.mutate()}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Transfer role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Permission matrix ───────────────────────────────────────────────────────

function PermissionMatrixTab({
  data,
  canManage,
}: {
  data: MatrixPayload;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [grantedOnly, setGrantedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{
    role: RoleSummary;
    grants: Record<string, PermissionScope>;
    removed: string[];
  } | null>(null);
  const [reason, setReason] = useState('');

  const saveMutation = useMutation({
    mutationFn: ({
      roleId,
      grants,
      reason: why,
    }: {
      roleId: number;
      grants: Record<string, PermissionScope>;
      reason?: string;
    }) =>
      accessApi.setRolePermissions(
        roleId,
        Object.entries(grants).map(([name, scope]) => ({ name, scope })),
        why
      ),
    onSuccess: (delta) => {
      queryClient.invalidateQueries({ queryKey: ['access'] });
      toast.success(`Saved — ${delta.added.length} added, ${delta.removed.length} removed`);
      setConfirm(null);
      setReason('');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Could not save permissions'),
  });

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((perm) => {
          if (
            needle &&
            !perm.name.toLowerCase().includes(needle) &&
            !perm.description.toLowerCase().includes(needle)
          ) {
            return false;
          }
          if (!grantedOnly) return true;
          return data.roles.some((role) => perm.name in role.grants);
        }),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [data, search, grantedOnly]);

  const toggle = (role: RoleSummary, permission: string) => {
    const next: Record<string, PermissionScope> = { ...role.grants };
    if (permission in next) delete next[permission];
    else next[permission] = 'all';

    const removed = Object.keys(role.grants).filter((name) => !(name in next));
    if (removed.length > 0) {
      // Revoking is the destructive direction, so it has to carry a reason —
      // that sentence is what explains the change in the audit log later.
      setConfirm({ role, grants: next, removed });
      return;
    }
    saveMutation.mutate({ roleId: role.id, grants: next });
  };

  const changeScope = (role: RoleSummary, permission: string, scope: PermissionScope) => {
    saveMutation.mutate({
      roleId: role.id,
      grants: { ...role.grants, [permission]: scope },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search permissions…"
            className="h-9 w-64 pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={grantedOnly} onCheckedChange={setGrantedOnly} />
          Only granted
        </label>
        <span className="text-xs text-muted-foreground">
          {groups.reduce((n, g) => n + g.permissions.length, 0)} permissions
        </span>
        {!canManage && (
          <Badge variant="outline" className="ml-auto">
            read-only
          </Badge>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-330px)] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur">
              <tr>
                <th className="sticky left-0 z-30 min-w-[300px] bg-muted/90 px-4 py-3 text-left font-medium">
                  Permission
                </th>
                {data.roles.map((role) => (
                  <th key={role.id} className="min-w-[128px] px-3 py-3 text-center font-medium">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="flex items-center gap-1">
                        {role.isSystem && <Lock className="h-3 w-3" />}
                        {role.name}
                      </span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        lvl {role.level} · {role.holderCount} user
                        {role.holderCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isCollapsed = collapsed.has(group.group);
                return (
                  <Fragment key={`group-${group.group}`}>
                    <tr className="bg-muted/40">
                      <td
                        colSpan={data.roles.length + 1}
                        className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(group.group)) next.delete(group.group);
                            else next.add(group.group);
                            return next;
                          })
                        }
                      >
                        <span className="flex items-center gap-1">
                          {isCollapsed ? (
                            <ChevronRight className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          {group.group}
                          <span className="ml-1 font-normal normal-case">
                            ({group.permissions.length})
                          </span>
                        </span>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      group.permissions.map((permission) => (
                        <tr
                          key={permission.name}
                          className="border-t border-border/40 hover:bg-accent/30"
                        >
                          <td className="sticky left-0 z-10 bg-background px-4 py-2 align-top">
                            <div className="flex items-start gap-1.5">
                              {permission.isDangerous && (
                                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                              )}
                              <div>
                                <code className="text-[12.5px]">{permission.name}</code>
                                <p className="text-[11px] leading-snug text-muted-foreground">
                                  {permission.description}
                                </p>
                              </div>
                            </div>
                          </td>
                          {data.roles.map((role) => {
                            const granted = permission.name in role.grants;
                            const scope = role.grants[permission.name];
                            const locked = role.isSystem || !canManage;
                            return (
                              <td key={role.id} className="px-3 py-2 text-center align-middle">
                                {locked ? (
                                  <span
                                    className={
                                      granted ? 'text-primary' : 'text-muted-foreground/30'
                                    }
                                    title={
                                      role.isSystem
                                        ? 'System role — always holds every permission'
                                        : 'You cannot change this role'
                                    }
                                  >
                                    {granted ? '✓' : '—'}
                                  </span>
                                ) : granted && permission.supportsScope ? (
                                  <Select
                                    value={scope}
                                    onValueChange={(value) =>
                                      changeScope(role, permission.name, value as PermissionScope)
                                    }
                                  >
                                    <SelectTrigger className="mx-auto h-7 w-[104px] text-[11px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SCOPES.map((s) => (
                                        <SelectItem key={s} value={s} className="text-xs">
                                          {SCOPE_LABEL[s]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                    checked={granted}
                                    onChange={() => toggle(role, permission.name)}
                                    aria-label={`${permission.name} for ${role.name}`}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove permissions from “{confirm?.role.name}”?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This revokes access for every user holding this role:
            </p>
            <ul className="max-h-40 list-inside list-disc overflow-y-auto rounded bg-muted/50 p-2 text-xs">
              {confirm?.removed.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <Label htmlFor="revoke-reason">Reason (recorded in the audit log)</Label>
              <Input
                id="revoke-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. QA lead no longer needs deployment access"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reason.trim().length < 3 || saveMutation.isPending}
              onClick={() => {
                if (!confirm) return;
                saveMutation.mutate({
                  roleId: confirm.role.id,
                  grants: confirm.grants,
                  reason,
                });
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Roles ───────────────────────────────────────────────────────────────────

function RolesTab({ data, canManage }: { data: MatrixPayload; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    level: 20,
    color: '#64748b',
    cloneFrom: '',
  });

  const createMutation = useMutation({
    mutationFn: () =>
      accessApi.createRole({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        level: form.level,
        color: form.color,
        cloneFrom: form.cloneFrom || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access'] });
      toast.success('Role created');
      setCreating(false);
      setForm({ name: '', description: '', level: 20, color: '#64748b', cloneFrom: '' });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Could not create role'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accessApi.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access'] });
      toast.success('Role deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Could not delete role'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Roles are ordered by level. Nobody can assign or edit a role at or above their own
          level — that is what stops privilege escalation.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New role
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.roles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: role.color ?? '#64748b' }}
                  />
                  <CardTitle className="text-base">{role.name}</CardTitle>
                  {role.isSystem && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Lock className="h-2.5 w-2.5" /> system
                    </Badge>
                  )}
                </div>
                {!role.isSystem && canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(role.id)}
                    disabled={role.holderCount > 0 || deleteMutation.isPending}
                    title={
                      role.holderCount > 0
                        ? `${role.holderCount} user(s) still hold this role`
                        : 'Delete role'
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <CardDescription className="text-xs">
                {role.description || 'No description'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
              <span>level {role.level}</span>
              <span>
                {Object.keys(role.grants).length} permissions · {role.holderCount} user
                {role.holderCount === 1 ? '' : 's'}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New role</SheetTitle>
            <SheetDescription>
              Start empty, or clone an existing role and adjust it in the matrix.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  }))
                }
                placeholder="qa-lead"
              />
              <p className="text-[11px] text-muted-foreground">
                Lowercase letters, numbers and hyphens. This identifier is what code and API
                responses use.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-desc">Description</Label>
              <Input
                id="role-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What this role is responsible for"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="role-level">Level</Label>
                <Input
                  id="role-level"
                  type="number"
                  min={0}
                  max={99}
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}
                />
                <p className="text-[11px] text-muted-foreground">0–99. 100 is super-admin.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-color">Colour</Label>
                <Input
                  id="role-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 p-1"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Clone permissions from</Label>
              <Select
                value={form.cloneFrom || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, cloneFrom: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Start empty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Start empty</SelectItem>
                  {data.roles
                    .filter((role) => !role.isSystem)
                    .map((role) => (
                      <SelectItem key={role.id} value={role.name}>
                        {role.name} ({Object.keys(role.grants).length} permissions)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={form.name.trim().length < 2 || createMutation.isPending}
            >
              Create role
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Direct grants ───────────────────────────────────────────────────────────

type GrantEffect = 'inherit' | 'allow' | 'deny';

function DirectGrantsTab({ data, canEdit }: { data: MatrixPayload; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, { effect: GrantEffect; scope: PermissionScope }>>(
    {}
  );
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<{ gained: string[]; lost: string[] } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: current } = useQuery({
    queryKey: ['access', 'grants', userId],
    queryFn: () => accessApi.getUserPermissions(userId!),
    enabled: !!userId,
  });

  // A draft is per-person. Carrying it across a switch would quietly rewrite
  // someone else's access, so selecting a person always starts clean.
  const selectUser = (id: number) => {
    setUserId(id);
    setDraft({});
    setReason('');
    setPreview(null);
  };

  const savedEffect = (name: string): GrantEffect => {
    const row = current?.find((p) => p.name === name);
    if (!row) return 'inherit';
    return row.effect === 'deny' ? 'deny' : 'allow';
  };

  const effectOf = (name: string): GrantEffect => draft[name]?.effect ?? savedEffect(name);

  const scopeOf = (name: string): PermissionScope => {
    if (draft[name]) return draft[name].scope;
    const row = current?.find((p) => p.name === name);
    return (row?.scope as PermissionScope) ?? 'all';
  };

  /**
   * Clearing an override is sent to the API as `inherit`, which deletes the
   * row. The preview understands that state too, so every edit is dry-run.
   */
  const changes = useMemo(() => Object.entries(draft), [draft]);

  const setEffect = (name: string, effect: GrantEffect) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (effect === savedEffect(name)) delete next[name];
      else next[name] = { effect, scope: prev[name]?.scope ?? scopeOf(name) };
      return next;
    });
  };

  const setScope = (name: string, scope: PermissionScope) => {
    setDraft((prev) => ({
      ...prev,
      [name]: { effect: prev[name]?.effect ?? effectOf(name), scope },
    }));
  };

  const previewMutation = useMutation({
    mutationFn: () =>
      accessApi.preview(userId!, {
        grants: changes.map(([name, v]) => ({
          name,
          effect: v.effect,
          scope: v.scope,
        })),
      }),
    onSuccess: (delta) => {
      setPreview({ gained: delta.gained, lost: delta.lost });
      setConfirmOpen(true);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Preview failed'),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      accessApi.setUserPermissions(
        userId!,
        Object.entries(draft).map(([name, v]) => ({
          name,
          effect: v.effect,
          scope: v.scope,
        })),
        reason.trim()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Direct grants saved');
      setDraft({});
      setReason('');
      setPreview(null);
      setConfirmOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Could not save grants'),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <UserPicker selectedId={userId} onSelect={selectUser} />

      {!userId ? (
        <EmptyHint text="Pick a person to grant or deny individual permissions on top of their roles." />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Direct overrides</CardTitle>
              <CardDescription className="text-xs">
                A direct grant applies on top of every role. <strong>Deny always wins</strong> —
                use it to remove one capability from a person without touching their role.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.groups.map((group) => (
                <div key={group.group}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.group}
                  </p>
                  <div className="space-y-1">
                    {group.permissions.map((perm) => {
                      const effect = effectOf(perm.name);
                      return (
                        <div
                          key={perm.name}
                          className={`flex flex-wrap items-center gap-2 rounded border px-2.5 py-1.5 text-xs ${
                            effect === 'deny'
                              ? 'border-destructive/40 bg-destructive/5'
                              : effect === 'allow'
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-border/50'
                          }`}
                        >
                          <code className="min-w-[240px] flex-1 text-[12px]">{perm.name}</code>
                          {effect === 'allow' && perm.supportsScope && (
                            <Select
                              value={scopeOf(perm.name)}
                              onValueChange={(v) => setScope(perm.name, v as PermissionScope)}
                            >
                              <SelectTrigger className="h-7 w-[104px] text-[11px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SCOPES.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {SCOPE_LABEL[s]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Select
                            value={effect}
                            disabled={!canEdit}
                            onValueChange={(v) => setEffect(perm.name, v as GrantEffect)}
                          >
                            <SelectTrigger className="h-7 w-[92px] text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit" className="text-xs">
                                Inherit
                              </SelectItem>
                              <SelectItem value="allow" className="text-xs">
                                Allow
                              </SelectItem>
                              <SelectItem value="deny" className="text-xs">
                                Deny
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-1.5">
                <Label htmlFor="grant-reason">Reason (required — written to the audit log)</Label>
                <Input
                  id="grant-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. temporary cover for the DevOps lead during leave"
                  disabled={!canEdit}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {changes.length > 0
                    ? `${changes.length} pending change(s)`
                    : 'No changes yet'}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDraft({});
                      setReason('');
                      setPreview(null);
                    }}
                    disabled={changes.length === 0}
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => previewMutation.mutate()}
                    disabled={
                      !canEdit ||
                      changes.length === 0 ||
                      reason.trim().length < 3 ||
                      previewMutation.isPending
                    }
                  >
                    Preview &amp; save
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This change would:</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <DeltaList
              title="Gains"
              items={preview?.gained ?? []}
              empty="No new permissions"
              tone="positive"
            />
            <DeltaList
              title="Loses"
              items={preview?.lost ?? []}
              empty="No lost permissions"
              tone="negative"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Effective access ────────────────────────────────────────────────────────

function EffectiveAccessTab({
  data,
  canManage,
}: {
  data: MatrixPayload;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<number | null>(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<{ gained: string[]; lost: string[] } | null>(null);

  const { data: effective, isLoading } = useQuery({
    queryKey: ['access', 'effective', userId],
    queryFn: () => accessApi.getEffective(userId!),
    enabled: !!userId,
  });

  const assigned = useMemo(() => new Set(effective?.roles.map((r) => r.name) ?? []), [effective]);

  const openRoles = () => {
    setRoleDraft([...assigned]);
    setReason('');
    setPreview(null);
    setRolesOpen(true);
  };

  const add = roleDraft.filter((r) => !assigned.has(r));
  const remove = [...assigned].filter((r) => !roleDraft.includes(r));

  const previewMutation = useMutation({
    mutationFn: () => accessApi.preview(userId!, { addRoles: add, removeRoles: remove }),
    onSuccess: (delta) => setPreview({ gained: delta.gained, lost: delta.lost }),
    onError: (err: any) => toast.error(err.response?.data?.message || 'Preview failed'),
  });

  const saveMutation = useMutation({
    mutationFn: () => accessApi.setUserRoles(userId!, { add, remove, reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Roles updated');
      setRolesOpen(false);
      setPreview(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Could not update roles'),
  });

  const grouped = useMemo(() => {
    if (!effective) return [];
    const map = new Map<string, typeof effective.permissions>();
    for (const perm of effective.permissions) {
      const group = perm.name.split('.')[0];
      const bucket = map.get(group) ?? [];
      bucket.push(perm);
      map.set(group, bucket);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [effective]);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <UserPicker selectedId={userId} onSelect={setUserId} />

      {!userId ? (
        <EmptyHint text="Pick a person to see their resolved permissions and where each one comes from." />
      ) : isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : effective ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{effective.user.name}</CardTitle>
                  <CardDescription>
                    {effective.permissionCount} effective permissions · {effective.roles.length}{' '}
                    role{effective.roles.length === 1 ? '' : 's'} · highest level {effective.level}
                  </CardDescription>
                </div>
                {canManage && (
                  <Button variant="outline" size="sm" onClick={openRoles}>
                    <UserCog className="mr-1.5 h-3.5 w-3.5" />
                    Edit roles
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {effective.roles.length === 0 && (
                <span className="text-xs text-muted-foreground">No roles assigned</span>
              )}
              {effective.roles.map((role) => (
                <Badge
                  key={role.id}
                  variant="secondary"
                  style={
                    role.color ? { backgroundColor: `${role.color}1a`, color: role.color } : undefined
                  }
                >
                  {role.name} · lvl {role.level}
                </Badge>
              ))}
              {effective.isSuperAdmin && <Badge variant="destructive">bypasses all checks</Badge>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Where each permission comes from</CardTitle>
              <CardDescription className="text-xs">
                “Widened” means two sources disagreed on scope and the widest one won.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {grouped.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  This person holds no permissions at all.
                </p>
              )}
              {grouped.map(([group, perms]) => (
                <div key={group}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </p>
                  <div className="space-y-1">
                    {perms.map((perm) => (
                      <div
                        key={perm.name}
                        className={`rounded border px-2.5 py-1.5 text-xs ${
                          perm.denied
                            ? 'border-destructive/40 bg-destructive/5'
                            : 'border-border/50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="text-[12px]">{perm.name}</code>
                          {perm.denied ? (
                            <Badge variant="destructive" className="text-[10px]">
                              revoked by override
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {SCOPE_LABEL[perm.scope]}
                            </Badge>
                          )}
                          {perm.widened && !perm.denied && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              widened
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {perm.sources.length === 0 && perm.denied && (
                            <span>No role grants this — the deny has no visible effect.</span>
                          )}
                          {perm.sources.map((source, i) => (
                            <span key={`${source.type}-${source.id}-${i}`}>
                              {source.type === 'role' ? '↳' : '★'} {source.name} —{' '}
                              {SCOPE_SHORT[source.scope]}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Sheet open={rolesOpen} onOpenChange={setRolesOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Roles for {effective?.user.name}</SheetTitle>
            <SheetDescription>
              Roles are additive — removing one only takes away what no other role still grants.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3">
            {data.roles
              .filter((role) => role.isAssignable || assigned.has(role.name))
              .map((role) => {
                const checked = roleDraft.includes(role.name);
                const locked = role.isSystem || !canManage;
                return (
                  <label
                    key={role.id}
                    className={`flex items-start gap-3 rounded border px-3 py-2 text-sm ${
                      checked ? 'border-primary/40 bg-primary/5' : 'border-border/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      checked={checked}
                      disabled={locked}
                      onChange={(e) =>
                        setRoleDraft((prev) =>
                          e.target.checked
                            ? [...prev, role.name]
                            : prev.filter((name) => name !== role.name)
                        )
                      }
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: role.color ?? '#64748b' }}
                        />
                        <span className="font-medium">{role.name}</span>
                        <span className="text-[11px] text-muted-foreground">lvl {role.level}</span>
                        {role.isSystem && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {Object.keys(role.grants).length} permissions · {role.description || '—'}
                      </p>
                    </div>
                  </label>
                );
              })}
          </SheetBody>
          <SheetFooter className="flex-col sm:flex-col">
            {preview && (
              <div className="grid w-full gap-3 sm:grid-cols-2">
                <DeltaList
                  title="Gains"
                  items={preview.gained}
                  empty="Nothing gained"
                  tone="positive"
                />
                <DeltaList
                  title="Loses"
                  items={preview.lost}
                  empty="Nothing lost"
                  tone="negative"
                />
              </div>
            )}
            {remove.length > 0 && (
              <div className="w-full space-y-1.5">
                <Label htmlFor="role-reason">Reason for removing a role (required)</Label>
                <Input
                  id="role-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. moved from DevOps to PMO"
                />
              </div>
            )}
            <div className="flex w-full flex-wrap gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setRolesOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={() => previewMutation.mutate()}
                disabled={add.length === 0 && remove.length === 0}
              >
                Preview impact
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={
                  (add.length === 0 && remove.length === 0) ||
                  (remove.length > 0 && reason.trim().length < 3) ||
                  !preview ||
                  saveMutation.isPending
                }
              >
                Save
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function UserPicker({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const { data: people } = useQuery({
    queryKey: ['users', 'list'],
    queryFn: () => apiClient.get('/admin/users/list').then((r) => r.data.data as PersonOption[]),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return people ?? [];
    return (people ?? []).filter(
      (u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    );
  }, [people, search]);

  return (
    <Card className="h-fit">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Person</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            className="h-8 pl-7 text-sm"
          />
        </div>
        <div className="max-h-[520px] space-y-0.5 overflow-y-auto">
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelect(u.id)}
              className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                selectedId === u.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
              }`}
            >
              <div className="truncate font-medium">{u.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{u.email}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No one matches that search.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <Card className="flex items-center justify-center">
      <CardContent className="py-16 text-center text-sm text-muted-foreground">
        <UserCog className="mx-auto mb-2 h-8 w-8 opacity-40" />
        {text}
      </CardContent>
    </Card>
  );
}

function DeltaList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: string[];
  empty: string;
  tone: 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
  return (
    <div className="rounded border border-border/60 p-2">
      <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${toneClass}`}>
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
          {items.map((name) => (
            <li key={name} className="font-mono text-[11px]">
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
