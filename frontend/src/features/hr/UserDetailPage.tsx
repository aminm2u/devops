import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  GitBranch,
  KeyRound,
  Mail,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import { accessApi, type RoleSummary } from '@/api/access';
import { formatDate } from '@/lib/utils';

/**
 * The digital employee record.
 *
 * Replaces the edit modal that used to live on the directory page: a profile
 * has enough fields (employment, department, reporting line, access) that a
 * drawer hid most of it. Saving here is deliberately narrow — this page writes
 * the employment record only. Roles and direct overrides go through Access
 * Control, so editing a profile can never change what somebody can do.
 */

interface ReferenceData {
  departments: { id: number; name: string; code: string }[];
  positions: { id: number; name: string; gradeLevel?: string | null }[];
  employmentTypes: { id: number; name: string }[];
}

interface UserDetail {
  id: number;
  name: string;
  email: string;
  employeeId: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  joinDate: string | null;
  createdAt: string;
  updatedAt: string;
  departmentId: number | null;
  positionId: number | null;
  employmentTypeId: number | null;
  directManagerId: number | null;
  department: { id: number; name: string; code: string } | null;
  position: { id: number; name: string; gradeLevel: string | null } | null;
  employmentType: { id: number; name: string } | null;
  directManager: { id: number; name: string; email: string } | null;
  subordinates: { id: number; name: string; email: string }[];
  roles: { id: number; name: string; level: number; color: string | null; isSystem: boolean }[];
  directPermissions: { name: string; group: string; effect: string; scope: string }[];
  teams: { id: number; name: string; type: string; teamRole: string }[];
  managerChain: { id: number; name: string; email: string }[];
}

interface FormState {
  name: string;
  email: string;
  employeeId: string;
  departmentId: string;
  positionId: string;
  employmentTypeId: string;
  directManagerId: string;
  joinDate: string;
  isActive: boolean;
  newPassword: string;
}

/** `<input type="date">` wants YYYY-MM-DD; the API sends ISO timestamps. */
function toDateInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formFrom(user: UserDetail): FormState {
  return {
    name: user.name,
    email: user.email,
    employeeId: user.employeeId ?? '',
    departmentId: user.departmentId != null ? String(user.departmentId) : '',
    positionId: user.positionId != null ? String(user.positionId) : '',
    employmentTypeId: user.employmentTypeId != null ? String(user.employmentTypeId) : '',
    directManagerId: user.directManagerId != null ? String(user.directManagerId) : '',
    joinDate: toDateInput(user.joinDate),
    isActive: user.isActive,
    newPassword: '',
  };
}

/** Only send fields that actually changed — every write is activity-logged. */
function diff(user: UserDetail, form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const num = (value: string) => (value === '' ? null : Number(value));

  if (form.name.trim() !== user.name) payload.name = form.name.trim();
  if (form.email.trim() !== user.email) payload.email = form.email.trim();
  if ((form.employeeId.trim() || null) !== (user.employeeId ?? null)) {
    payload.employeeId = form.employeeId.trim() || null;
  }
  if (num(form.departmentId) !== user.departmentId) payload.departmentId = num(form.departmentId);
  if (num(form.positionId) !== user.positionId) payload.positionId = num(form.positionId);
  if (num(form.employmentTypeId) !== user.employmentTypeId) {
    payload.employmentTypeId = num(form.employmentTypeId);
  }
  if (num(form.directManagerId) !== user.directManagerId) {
    payload.directManagerId = num(form.directManagerId);
  }
  if (form.joinDate !== toDateInput(user.joinDate)) {
    // Sent as UTC midnight so the date survives the round trip unchanged.
    payload.joinDate = form.joinDate
      ? new Date(`${form.joinDate}T00:00:00.000Z`).toISOString()
      : null;
  }
  if (form.isActive !== user.isActive) payload.isActive = form.isActive;
  if (form.newPassword) payload.password = form.newPassword;

  return payload;
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can('hr.user.manage');
  const canDelete = can('hr.user.delete');

  const [form, setForm] = useState<FormState | null>(null);
  const [roleToAdd, setRoleToAdd] = useState('');
  const [removingRole, setRemovingRole] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => apiClient.get(`/admin/users/${userId}`).then((r) => r.data.data as UserDetail),
    enabled: Number.isFinite(userId),
  });

  const { data: references } = useQuery({
    queryKey: ['references'],
    queryFn: () => apiClient.get('/references').then((r) => r.data.data as ReferenceData),
    staleTime: 10 * 60 * 1000,
  });

  const { data: people } = useQuery({
    queryKey: ['users', 'list'],
    queryFn: () =>
      apiClient.get('/admin/users/list').then((r) => r.data.data as { id: number; name: string; email: string }[]),
    staleTime: 60_000,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['access', 'roles'],
    queryFn: () => accessApi.getRoles(),
    staleTime: 5 * 60 * 1000,
  });

  // Reset the draft whenever the record loads or a save lands, so "unsaved"
  // always means "differs from what the server currently holds".
  useEffect(() => {
    if (user) setForm(formFrom(user));
  }, [user]);

  const changes = useMemo(() => (user && form ? diff(user, form) : {}), [user, form]);
  const changeCount = Object.keys(changes).length;

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.put(`/admin/users/${userId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success('Employee record updated');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Save failed'),
  });

  const addRoleMutation = useMutation({
    mutationFn: (roleName: string) => accessApi.setUserRoles(userId, { add: [roleName] }),
    onSuccess: () => {
      setRoleToAdd('');
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Role added');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || 'Could not add the role'),
  });

  const removeRoleMutation = useMutation({
    mutationFn: (roleName: string) => accessApi.setUserRoles(userId, { remove: [roleName] }),
    onSuccess: () => {
      setRemovingRole(null);
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Role removed');
    },
    onError: (err: any) => {
      setRemovingRole(null);
      toast.error(err?.response?.data?.error || 'Could not remove the role');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Employee removed');
      navigate('/hr/users');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || 'Could not remove this employee'),
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading the employee record…</div>;
  }

  if (error || !user || !form) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <UserCheck className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">Employee not found</p>
        <p className="mt-1 text-xs text-muted-foreground">
          It may have been removed, or you may not have access to it.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/hr/users')}>
          Back to employees
        </Button>
      </div>
    );
  }

  const assignableRoles = roles.filter(
    (role: RoleSummary) =>
      role.isAssignable && !user.roles.some((held) => held.name === role.name)
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/hr/users')}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          All employees
        </Button>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {user.name}
              {!user.isActive && <Badge variant="destructive">Inactive</Badge>}
            </span>
          }
          description={user.position?.name ?? 'No position assigned'}
          icon={UserCheck}
        >
          {canDelete && (
            <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
          {canManage && (
            <Button
              onClick={() => {
                if (form.newPassword && form.newPassword.length < 8) {
                  toast.error('Passwords must be at least 8 characters');
                  return;
                }
                saveMutation.mutate(changes);
              }}
              disabled={changeCount === 0 || saveMutation.isPending}
            >
              <Check className="mr-2 h-4 w-4" />
              {changeCount === 0
                ? 'No changes'
                : saveMutation.isPending
                  ? 'Saving…'
                  : `Save ${changeCount} change${changeCount === 1 ? '' : 's'}`}
            </Button>
          )}
        </PageHeader>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── Employment record ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="mb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4" />
                Employment
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className='dark:text-gray-400 text-gray-500' htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className='dark:text-gray-400 text-gray-500' htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500' htmlFor="employeeId">Employee ID</Label>
                <Input
                  id="employeeId"
                  value={form.employeeId}
                  onChange={(e) => setField('employeeId', e.target.value)}
                  placeholder="e.g. MWP-0142"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500' htmlFor="joinDate">Join date</Label>
                <Input
                  id="joinDate"
                  type="date"
                  value={form.joinDate}
                  onChange={(e) => setField('joinDate', e.target.value)}
                  disabled={!canManage}
                />
              </div>

              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500'>Department</Label>
                <Select
                  value={form.departmentId || 'none'}
                  onValueChange={(v) => setField('departmentId', v === 'none' ? '' : v)}
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {(references?.departments ?? []).map((dept) => (
                      <SelectItem key={dept.id} value={String(dept.id)}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500'>Position</Label>
                <Select
                  value={form.positionId || 'none'}
                  onValueChange={(v) => setField('positionId', v === 'none' ? '' : v)}
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(references?.positions ?? []).map((position) => (
                      <SelectItem key={position.id} value={String(position.id)}>
                        {position.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500'>Employment type</Label>
                <Select
                  value={form.employmentTypeId || 'none'}
                  onValueChange={(v) => setField('employmentTypeId', v === 'none' ? '' : v)}
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(references?.employmentTypes ?? []).map((type) => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500'>Reports to</Label>
                <Select
                  value={form.directManagerId || 'none'}
                  onValueChange={(v) => setField('directManagerId', v === 'none' ? '' : v)}
                  disabled={!canManage}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nobody (top of chart)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Nobody (top of chart)</SelectItem>
                    {(people ?? [])
                      .filter((person) => person.id !== user.id)
                      .map((person) => (
                        <SelectItem key={person.id} value={String(person.id)}>
                          {person.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Also editable by dragging on the{' '}
                  <Link to="/hr/org-chart" className="text-primary hover:underline">
                    organisation chart
                  </Link>
                  .
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium dark:text-gray-400 text-gray-800">Active employee</p>
                  <p className="text-[11px] text-muted-foreground">
                    Inactive accounts keep their history but cannot sign in.
                  </p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setField('isActive', checked)}
                  disabled={!canManage}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4" />
                Sign-in
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {user.emailVerifiedAt
                  ? `Email verified ${formatDate(user.emailVerifiedAt)}`
                  : 'Email not verified'}
              </div>
              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500' htmlFor="password">Reset password</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    type="password"
                    value={form.newPassword}
                    onChange={(e) => setField('newPassword', e.target.value)}
                    placeholder="Leave empty to keep the current password"
                    disabled={!canManage}
                  />
                  <Button
                    variant="outline"
                    onClick={() => setField('newPassword', '')}
                    disabled={!form.newPassword}
                  >
                    Clear
                  </Button>
                </div>
                {form.newPassword && form.newPassword.length < 8 && (
                  <p className="text-[11px] text-destructive">
                    Passwords must be at least 8 characters.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Access & reporting ────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4" />
                Roles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {user.roles.length === 0 ? (
                <p className="text-xs text-muted-foreground">No role assigned — this account can
                  only reach the personal pages.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {user.roles.map((role) => (
                    <span
                      key={role.id}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                      style={
                        role.color
                          ? { backgroundColor: `${role.color}1a`, color: role.color, borderColor: `${role.color}33` }
                          : undefined
                      }
                    >
                      {role.name}
                      {role.isSystem && <span className="opacity-60">· system</span>}
                      {canManage && role.name !== 'super-admin' && (
                        <button
                          type="button"
                          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                          onClick={() => setRemovingRole(role.name)}
                          title="Remove role"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {canManage && assignableRoles.length > 0 && (
                <div className="flex gap-2">
                  <Select value={roleToAdd} onValueChange={setRoleToAdd}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Add a role…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {assignableRoles.map((role) => (
                        <SelectItem key={role.id} value={role.name}>
                          {role.name}
                          {role.description ? ` — ${role.description}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!roleToAdd || addRoleMutation.isPending}
                    onClick={() => addRoleMutation.mutate(roleToAdd)}
                  >
                    Add
                  </Button>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                A person may hold several roles. Their access is the union of every role, minus any
                direct deny. Fine-grained control lives in{' '}
                <Link to="/admin/access" className="text-primary hover:underline">
                  Access Control
                </Link>
                .
              </p>
            </CardContent>
          </Card>

          {user.directPermissions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <KeyRound className="h-4 w-4" />
                  Direct overrides
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {user.directPermissions.map((grant) => (
                  <div
                    key={grant.name}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5"
                  >
                    <code className="truncate text-[11px]">{grant.name}</code>
                    <Badge
                      variant={grant.effect === 'deny' ? 'destructive' : 'secondary'}
                      className="shrink-0 text-[9px]"
                    >
                      {grant.effect} · {grant.scope}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <GitBranch className="h-4 w-4" />
                Reporting
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Reports to
                </p>
                {user.directManager ? (
                  <Link
                    to={`/admin/users/${user.directManager.id}`}
                    className="text-sm hover:text-primary hover:underline"
                  >
                    {user.directManager.name}
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">Top of the chart</p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Line to the top
                </p>
                {user.managerChain.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  <ol className="mt-1 space-y-0.5">
                    {user.managerChain.map((entry, index) => (
                      <li key={entry.id} className="flex items-center gap-2 text-xs">
                        <span className="w-3 text-right text-muted-foreground">{index + 1}</span>
                        <Link to={`/admin/users/${entry.id}`} className="hover:text-primary hover:underline">
                          {entry.name}
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <Separator />

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Direct reports ({user.subordinates.length})
                </p>
                {user.subordinates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {user.subordinates.map((report) => (
                      <li key={report.id} className="flex items-center gap-1.5 text-xs">
                        <UserAvatar user={report} size="sm" />
                        <Link to={`/admin/users/${report.id}`} className="hover:text-primary hover:underline">
                          {report.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" />
                Teams
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {user.teams.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Not in a team yet. Team membership drives which records this person can see when a
                  permission is team-scoped.
                </p>
              ) : (
                user.teams.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5 dark:text-gray-400 text-gray-500"
                  >
                    <span className="truncate text-xs font-medium">{team.name}</span>
                    <Badge variant="secondary" className="shrink-0 text-[9px] dark:text-gray-400 text-gray-500">
                      {team.teamRole.replace('_', ' ')}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4" />
                Record
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p className="flex justify-between">
                <span>Created</span>
                <span>{formatDate(user.createdAt)}</span>
              </p>
              <p className="flex justify-between">
                <span>Last updated</span>
                <span>{formatDate(user.updatedAt)}</span>
              </p>
              <p className="flex justify-between">
                <span>Department</span>
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {user.department?.code ?? '—'}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Remove ${user.name}?`}
        description="The account will be removed from the directory. Anything they have already recorded stays intact."
        confirmLabel="Remove employee"
        onConfirm={() => deleteMutation.mutate()}
        isConfirming={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={removingRole != null}
        onOpenChange={(open) => !open && setRemovingRole(null)}
        title={`Remove the ${removingRole} role?`}
        description="This person loses every permission that came from this role. Other roles they hold are unaffected."
        confirmLabel="Remove role"
        onConfirm={() => removingRole && removeRoleMutation.mutate(removingRole)}
        isConfirming={removeRoleMutation.isPending}
      />
    </div>
  );
}
