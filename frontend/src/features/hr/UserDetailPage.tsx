import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  KeyRound,
  Mail,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import toast from '@/lib/toast';
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
import { DatePicker } from '@/components/ui/date-picker';
import { RichListBox, type RichListBoxGroup, type RichListBoxItem } from '@/components/ui/rich-listbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useReferenceData } from '@/hooks/useReferenceData';
import apiClient from '@/api/client';
import { accessApi, type RoleSummary } from '@/api/access';
import { formatDate } from '@/lib/utils';
import { UserTeamsCard } from './UserTeamsCard';

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
  // `grade_level` is an Int column (`positions.grade_level`); it was typed as a
  // string here, which happened to work only because nothing compared it.
  positions: { id: number; name: string; gradeLevel?: number | null }[];
  employmentTypes: { id: number; name: string }[];
  /**
   * Units, each owned by exactly one department. Fetched with the rest of the
   * reference lists so the picker below the department field can filter them
   * without a second round trip.
   */
  units: {
    id: number;
    name: string;
    code: string | null;
    departmentId: number;
    _count?: { employees: number };
  }[];
}

interface UserDetail {
  id: number;
  publicId: string | null;
  name: string;
  email: string;
  employeeId: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  joinDate: string | null;
  createdAt: string;
  updatedAt: string;
  departmentId: number | null;
  unitId: number | null;
  positionId: number | null;
  employmentTypeId: number | null;
  directManagerId: number | null;
  department: { id: number; name: string; code: string } | null;
  unit: { id: number; name: string; code: string | null } | null;
  position: { id: number; name: string; gradeLevel: number | null } | null;
  employmentType: { id: number; name: string } | null;
  directManager: { id: number; publicId: string | null; name: string; email: string } | null;
  subordinates: { id: number; publicId: string | null; name: string; email: string }[];
  roles: { id: number; name: string; level: number; color: string | null; isSystem: boolean }[];
  directPermissions: { name: string; group: string; effect: string; scope: string }[];
  teams: { id: number; name: string; type: string; teamRole: string }[];
  managerChain: { id: number; publicId: string | null; name: string; email: string }[];
}

interface FormState {
  name: string;
  email: string;
  departmentId: string;
  unitId: string;
  positionId: string;
  employmentTypeId: string;
  directManagerId: string;
  joinDate: string;
  isActive: boolean;
  newPassword: string;
}

/**
 * The API stores a bare calendar date as UTC midnight, so it must be read back
 * in UTC. Using the local getters here would show the previous day to anyone
 * west of Greenwich — the picker and the saved value would then disagree on
 * every load, and `diff()` would think the field had been edited.
 */
function toDateInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function formFrom(user: UserDetail): FormState {
  return {
    name: user.name,
    email: user.email,
    departmentId: user.departmentId != null ? String(user.departmentId) : '',
    unitId: user.unitId != null ? String(user.unitId) : '',
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
  if (num(form.departmentId) !== user.departmentId) payload.departmentId = num(form.departmentId);
  // Sent whenever it differs — including back to null, which is how someone is
  // taken out of a unit without leaving the department.
  if (num(form.unitId) !== user.unitId) payload.unitId = num(form.unitId);
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
  /**
   * The route carries a `publicId` uuid (or a legacy numeric id from old
   * bookmarks). It identifies the record but is never used for writes — every
   * mutation below goes through `user.id` from the fetched record, so a uuid
   * URL can load the page and act on it without the backend ever seeing the
   * URL token as a number.
   */
  const userParam = id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can('hr.user.manage');
  const canDelete = can('hr.user.delete');
  // The numbering tab is gated on `procurement.settings.manage`, so an HR
  // manager who cannot open it should not be offered a link to a page whose
  // tab list will not contain the panel they were promised.
  const canManageNumbering = can('procurement.settings.manage');

  const [form, setForm] = useState<FormState | null>(null);
  const [roleToAdd, setRoleToAdd] = useState('');
  const [removingRole, setRemovingRole] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: user, isLoading, error } = useQuery({
    // Keyed by the URL token (uuid or legacy numeric id). Invalidation below
    // uses the ['user'] prefix, which matches this key and any numeric-keyed
    // copy elsewhere — UserTeamsCard invalidates the same way.
    queryKey: ['user', userParam],
    queryFn: () => apiClient.get(`/admin/users/${userParam}`).then((r) => r.data.data as UserDetail),
    enabled: !!userParam,
  });

  const { data: references } = useQuery({
    queryKey: ['references'],
    queryFn: () => apiClient.get('/references').then((r) => r.data.data as ReferenceData),
    staleTime: 10 * 60 * 1000,
  });

  const { data: people } = useQuery({
    queryKey: ['users', 'list'],
    queryFn: () =>
      apiClient
        .get('/admin/users/list')
        .then(
          (r) =>
            r.data.data as { id: number; publicId: string | null; name: string; email: string }[]
        ),
    staleTime: 60_000,
  });

  /**
   * Active staff in id order — the universe the prev/next chevrons walk.
   *
   * A separate query rather than reusing the name-ordered picker list above:
   * same endpoint, different cache entry, so the two orderings never overwrite
   * each other and the picker keeps its alphabetical list.
   */
  const { data: peopleById = [] } = useQuery({
    queryKey: ['users', 'list', 'by-id'],
    queryFn: () =>
      apiClient
        .get('/admin/users/list', { params: { orderBy: 'id' } })
        .then(
          (r) =>
            r.data.data as { id: number; publicId: string | null; name: string; email: string }[]
        ),
    staleTime: 60_000,
    enabled: !!user,
  });

  /**
   * Neighbours in the active-staff walk. An inactive current record is not in
   * the list (`idx === -1`), so both chevrons disable — stepping through the
   * directory is defined over active employees only.
   */
  const prevNext = useMemo(() => {
    if (!user) return { prev: undefined, next: undefined };
    const idx = peopleById.findIndex((p) => p.id === user.id);
    return {
      prev: idx > 0 ? peopleById[idx - 1] : undefined,
      next: idx >= 0 && idx < peopleById.length - 1 ? peopleById[idx + 1] : undefined,
    };
  }, [user, peopleById]);

  const { data: roles = [] } = useQuery({
    queryKey: ['access', 'roles'],
    queryFn: () => accessApi.getRoles(),
    staleTime: 5 * 60 * 1000,
  });

  // Departments are the master list — a department row on the org chart and a
  // `division` reference value are joined by `code`. Reading the reference list
  // here means a newly added department shows up in this picker immediately,
  // instead of waiting for a matching department row.
  const { data: departmentData = [] } = useReferenceData('division');

  /**
   * The department picker, driven entirely by the `division` reference list.
   *
   * Nothing outside that list is offered — including departments that exist on
   * the org chart but whose division entry was retired. Listing them (the old
   * "Other departments" group) meant a division deactivated under Reference
   * Data kept appearing here as a valid choice, which made the reference list
   * look like it had no effect.
   *
   * `users.department_id` still points at a department row, so a division can
   * only be assigned once it has been promoted on the org chart. The unpromoted
   * ones are shown anyway, disabled and labelled with the reason, because "it
   * is not in the dropdown" is a worse answer than "it is not a department yet
   * — add it on the org chart".
   */
  const departmentGroups = useMemo<RichListBoxGroup[]>(() => {
    const departments = references?.departments ?? [];
    const departmentByCode = new Map(departments.map((dept) => [dept.code, dept]));

    const departmentItems: RichListBoxItem[] = departmentData.map((entry) => {
      const department = departmentByCode.get(entry.value);
      return {
        // A disabled row must not share a value with a real one, or selecting
        // the department would render as the unmapped master-data row.
        value: department ? String(department.id) : `unmapped:${entry.value}`,
        label: entry.label,
        description: department
          ? department.name === entry.label
            ? department.code
            : `${department.code} — ${department.name}`
          : 'Not a department yet — add it on the org chart',
        icon: Building2,
        disabled: !department,
      };
    });

    return [
      { items: [{ value: '', label: 'Unassigned', icon: Users }] },
      { label: 'Departments', items: departmentItems },
    ];
  }, [references, departmentData]);

  /**
   * A department on the record that the reference list no longer carries.
   *
   * The picker only offers divisions from the reference list, so without this
   * the trigger would fall back to its "Unassigned" placeholder and the page
   * would report someone as having no department when they do have one. It is
   * not made selectable — the point of the list is that it is authoritative —
   * but the current value is still named, and the hint says where it came from
   * so the fix is obvious.
   */
  const strandedDepartment =
    user?.department && !departmentData.some((entry) => entry.value === user.department!.code)
      ? user.department
      : null;

  const units = useMemo(() => references?.units ?? [], [references]);

  /**
   * The unit picker, filtered to whatever department is selected.
   *
   * Units are owned by a department, so offering the full list would let
   * someone pick a Finance unit while sitting in IT. With nothing selected the
   * list is empty and the field explains why, rather than showing every unit in
   * the company with no indication of where they belong.
   */
  const unitGroups = useMemo<RichListBoxGroup[]>(() => {
    if (!form?.departmentId) return [];
    const inDepartment = units.filter(
      (unit) => String(unit.departmentId) === form.departmentId
    );
    return [
      {
        items: [
          { value: '', label: 'No unit', icon: Users },
          ...inDepartment.map((unit) => ({
            value: String(unit.id),
            label: unit.name,
            description: unit.code ?? undefined,
            icon: Building2,
          })),
        ],
      },
    ];
  }, [units, form?.departmentId]);

  /**
   * The position picker, fed by Reference Data → Positions.
   *
   * A position is a row in the `positions` table, and the panel under Reference
   * Data writes exactly that table, so an edit there lands here after the
   * `['references']` invalidation. Grouped by grade because that is the only
   * thing that orders seniority across titles (a G6 is above a G3 regardless of
   * the alphabet), while ungraded titles are a normal state — they go in their
   * own group at the bottom rather than being treated as grade 0.
   *
   * The description carries the grade, so the picker still says which rung a
   * title sits on when the grouping heading has scrolled out of view.
   */
  const positionGroups = useMemo<RichListBoxGroup[]>(() => {
    const all = references?.positions ?? [];
    if (all.length === 0) {
      return [{ items: [{ value: '', label: 'None', icon: Users }] }];
    }

    const graded = all
      .filter((position) => position.gradeLevel != null)
      .sort((a, b) => Number(b.gradeLevel) - Number(a.gradeLevel) || a.name.localeCompare(b.name));
    const ungraded = all
      .filter((position) => position.gradeLevel == null)
      .sort((a, b) => a.name.localeCompare(b.name));

    const toItem = (position: { id: number; name: string; gradeLevel?: number | null }) => ({
      value: String(position.id),
      label: position.name,
      description: position.gradeLevel != null ? `Grade ${position.gradeLevel}` : 'No grade set',
      icon: Briefcase,
    });

    return [
      { items: [{ value: '', label: 'None', icon: Users }] },
      // A heading with no rows under it reads as a rendering fault, so each
      // group only appears when it has something in it.
      ...(graded.length > 0 ? [{ label: 'Graded', items: graded.map(toItem) }] : []),
      ...(ungraded.length > 0
        ? [{ label: 'Ungraded', items: ungraded.map(toItem) }]
        : []),
    ];
  }, [references]);

  // Reset the draft whenever the record loads or a save lands, so "unsaved"
  // always means "differs from what the server currently holds".
  useEffect(() => {
    if (user) setForm(formFrom(user));
  }, [user]);

  const changes = useMemo(() => (user && form ? diff(user, form) : {}), [user, form]);
  const changeCount = Object.keys(changes).length;

  // Every write goes through the numeric id from the fetched record — never
  // the URL token, which is a uuid. Mutations only fire from the rendered
  // page, so `user` is always loaded by the time they can run.
  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.put(`/admin/users/${user!.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success('Employee record updated');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Save failed'),
  });

  const issueNumberMutation = useMutation({
    mutationFn: () => apiClient.post(`/admin/users/${user!.id}/employee-number`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Employee number ${res.data.data.employeeId} issued`);
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || 'Could not issue an employee number'),
  });

  const addRoleMutation = useMutation({
    mutationFn: (roleName: string) => accessApi.setUserRoles(user!.id, { add: [roleName] }),
    onSuccess: () => {
      setRoleToAdd('');
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Role added');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || 'Could not add the role'),
  });

  const removeRoleMutation = useMutation({
    mutationFn: (roleName: string) => accessApi.setUserRoles(user!.id, { remove: [roleName] }),
    onSuccess: () => {
      setRemovingRole(null);
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Role removed');
    },
    onError: (err: any) => {
      setRemovingRole(null);
      toast.error(err?.response?.data?.error || 'Could not remove the role');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/admin/users/${user!.id}`),
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

  /**
   * Changing the department drops a unit from the old one.
   *
   * A unit only exists inside one department, so keeping the selection would
   * leave the record showing (say) a Finance department with an IT unit — the
   * server refuses that pair rather than storing it, but the form should not
   * make the user discover that on save.
   */
  const selectDepartment = (value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const keepsUnit = units.some(
        (unit) => String(unit.id) === prev.unitId && String(unit.departmentId) === value
      );
      return { ...prev, departmentId: value, unitId: keepsUnit ? prev.unitId : '' };
    });
  };

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <div className="mb-2 flex items-center gap-1">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/hr/users')}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            All employees
          </Button>
          {/* Walk the active directory in id order. Both chevrons disable on
              an inactive record — it is not part of the walk. */}
          <div className="ml-1 flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!prevNext.prev}
              title={prevNext.prev ? `Previous: ${prevNext.prev.name}` : 'No previous employee'}
              onClick={() =>
                prevNext.prev &&
                navigate(`/hr/users/${prevNext.prev.publicId ?? prevNext.prev.id}`)
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!prevNext.next}
              title={prevNext.next ? `Next: ${prevNext.next.name}` : 'No next employee'}
              onClick={() =>
                prevNext.next &&
                navigate(`/hr/users/${prevNext.next.publicId ?? prevNext.next.id}`)
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
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
                {/* Issued by the server from a running counter — see
                    `issueEmployeeNumber` in admin.routes.ts. Letting this be
                    typed would defeat the number: two people entering "EMP-0142"
                    for different hires is exactly the collision the counter
                    exists to prevent. The format itself is configurable. */}
                <div className="flex gap-2">
                  <Input
                    id="employeeId"
                    value={user.employeeId || 'Not issued'}
                    readOnly
                    className="font-mono text-muted-foreground"
                    tabIndex={-1}
                  />
                  {/* Self-registered and legacy accounts have no number and
                      never passed through the create route that issues one. */}
                  {!user.employeeId && canManage && (
                    <Button
                      variant="outline"
                      onClick={() => issueNumberMutation.mutate()}
                      disabled={issueNumberMutation.isPending}
                    >
                      {issueNumberMutation.isPending ? 'Issuing…' : 'Issue'}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {canManageNumbering ? (
                    <>
                      Generated automatically.{' '}
                      <Link to="/admin/settings?tab=numbering" className="text-primary hover:underline">
                        Numbering settings
                      </Link>
                    </>
                  ) : (
                    'Generated automatically from the company numbering format.'
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500' htmlFor="joinDate">Join date</Label>
                <DatePicker
                  value={form.joinDate}
                  onChange={(value) => setField('joinDate', value)}
                  disabled={!canManage}
                  placeholder="Not set"
                />
              </div>

              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500'>Department</Label>
                <RichListBox
                  value={form.departmentId}
                  onChange={selectDepartment}
                  disabled={!canManage}
                  placeholder={
                    strandedDepartment
                      ? `${strandedDepartment.name} (${strandedDepartment.code})`
                      : 'Unassigned'
                  }
                  searchPlaceholder="Search departments…"
                  emptyMessage="No department matches that search."
                  // The default 320px panel truncates the "DMA — Digital
                  // Marketing & Analytics" descriptions, which is the half of
                  // the row that tells the two similarly-named ones apart.
                  contentClassName="w-[380px]"
                  groups={departmentGroups}
                />
                {strandedDepartment && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500">
                    {strandedDepartment.code} is not in the department reference list, so it is not
                    offered here. Pick a department to replace it.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500'>Unit</Label>
                {/* Only the units of the chosen department are offered: a unit
                    is a subdivision of one department, so a cross-department
                    pick would be a contradiction the server refuses anyway. */}
                <RichListBox
                  value={form.unitId}
                  onChange={(value) => setField('unitId', value)}
                  disabled={!canManage || !form.departmentId}
                  placeholder={
                    form.departmentId ? 'No unit' : 'Choose a department first'
                  }
                  searchPlaceholder="Search units…"
                  emptyMessage="No unit matches that search."
                  groups={unitGroups}
                />
                {form.departmentId && unitGroups[0].items.length <= 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    This department has no units yet — add them under{' '}
                    <Link to="/admin/settings?tab=reference-data" className="text-primary hover:underline">
                      Reference Data
                    </Link>
                    .
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className='dark:text-gray-400 text-gray-500'>Position</Label>
                {/* Same control as Department and Unit: a searchable list, not a
                    native select. Seeded and edited under Reference Data →
                    Positions, which writes the same table this reads. */}
                <RichListBox
                  value={form.positionId}
                  onChange={(value) => setField('positionId', value)}
                  disabled={!canManage}
                  placeholder="No position"
                  searchPlaceholder="Search positions…"
                  emptyMessage="No position matches that search."
                  groups={positionGroups}
                />
                {(references?.positions ?? []).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No positions have been defined yet — add them under{' '}
                    <Link to="/admin/settings?tab=reference-data" className="text-primary hover:underline">
                      Reference Data
                    </Link>
                    .
                  </p>
                )}
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
                {/* A directory with more than a screenful of people is not
                    usable as a plain select — this one searches by name and
                    email, and shows the email under each name so two people
                    with the same name can be told apart. */}
                <RichListBox
                  value={form.directManagerId}
                  onChange={(value) => setField('directManagerId', value)}
                  disabled={!canManage}
                  placeholder="Nobody (top of chart)"
                  searchPlaceholder="Search people…"
                  emptyMessage="No employee matches that search."
                  groups={[
                    {
                      items: [
                        { value: '', label: 'Nobody (top of chart)', icon: Users },
                        ...(people ?? [])
                          .filter((person) => person.id !== user.id)
                          .map((person) => ({
                            value: String(person.id),
                            label: person.name,
                            description: person.email,
                            icon: User,
                          })),
                      ],
                    },
                  ]}
                />
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
                  {/* Same searchable list control as Department and Unit on
                      this page: role rows carry their level and description so
                      two similarly-scoped roles can be told apart without
                      leaving the picker. Grouped by whether the role is one a
                      person can hold several of. */}
                  <RichListBox
                    value={roleToAdd}
                    onChange={setRoleToAdd}
                    placeholder="Add a role…"
                    searchPlaceholder="Search roles…"
                    emptyMessage="No role matches that search."
                    className="text-xs"
                    contentClassName="w-[340px]"
                    groups={[
                      {
                        items: assignableRoles.map((role) => ({
                          value: role.name,
                          label: role.name,
                          description: role.description ?? undefined,
                          icon: ShieldCheck,
                          shortcut: `L${role.level}`,
                        })),
                      },
                    ]}
                  />
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
                    to={`/hr/users/${user.directManager.publicId ?? user.directManager.id}`}
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
                        <Link
                          to={`/hr/users/${entry.publicId ?? entry.id}`}
                          className="hover:text-primary hover:underline"
                        >
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
                        <Link
                          to={`/hr/users/${report.publicId ?? report.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {report.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <UserTeamsCard
            userId={user.id}
            memberships={user.teams}
            canManage={can('hr.team.manage')}
            canView={can('hr.team.view')}
          />

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
              <p className="flex justify-between">
                <span>Unit</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {user.unit?.name ?? '—'}
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
