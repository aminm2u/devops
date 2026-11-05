import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import { teamsApi, teamRoleLabel, type Team, type TeamRole, type TeamType } from '@/api/teams';
import { cn } from '@/lib/utils';

/**
 * Teams.
 *
 * A team is the unit of *scope*, not of capability: a role says what somebody
 * may do anywhere, a team says which records that applies to and who approves
 * work on them. This page therefore has two jobs — define teams, and get the
 * leadership line right, because `lib/teamScope.ts` routes approvals to the
 * team lead first and only falls back to the assistant lead.
 *
 * A team with no lead is called out rather than left to look fine: every
 * approval on its records silently escalates to the global lead pool.
 */

const TEAM_TYPE_LABEL: Record<TeamType, string> = {
  devops: 'DevOps',
  support: 'Support',
  project: 'Project',
  ops: 'Operations',
};

const TEAM_TYPE_TONE: Record<TeamType, string> = {
  devops: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  support: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  project: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  ops: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
};

interface Person {
  id: number;
  name: string;
  email: string;
}

interface TeamForm {
  name: string;
  type: TeamType;
  description: string;
  departmentId: number | null;
  projectId: number | null;
  isActive: boolean;
}

const emptyForm: TeamForm = {
  name: '',
  type: 'devops',
  description: '',
  departmentId: null,
  projectId: null,
  isActive: true,
};

export function TeamsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can('hr.team.manage');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamForm>(emptyForm);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [managing, setManaging] = useState<Team | null>(null);

  const { data: teams = [], isLoading, error } = useQuery({
    queryKey: ['teams'],
    queryFn: teamsApi.list,
  });

  const { data: people = [] } = useQuery({
    queryKey: ['users', 'list'],
    queryFn: () =>
      apiClient.get('/admin/users/list').then((r) => r.data.data as Person[]),
    enabled: formOpen || managing !== null,
  });

  const { data: departments = [] } = useQuery({
    // A distinct key from OrgChartPage's `['org', 'tree']`. Both pages fetch
    // the same endpoint, but this one keeps only the departments array while
    // the chart caches the whole `{ nodes, departments, rootIds }` payload —
    // sharing one key meant whichever page mounted first decided the shape and
    // the other crashed on `departments.map`.
    queryKey: ['org', 'tree', 'departments'],
    queryFn: () =>
      apiClient
        .get('/org/tree')
        .then((r) => (r.data.data.departments ?? []) as { id: number; name: string; code: string }[]),
    // Team management and the org chart are separate grants; a team editor
    // without the chart keeps the picker empty rather than showing a 403.
    enabled: formOpen && can('hr.org.view'),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () =>
      apiClient.get('/projects', { params: { limit: 100 } }).then((r) => r.data.data as { id: number; name: string }[]),
    enabled: formOpen && can('project.record.view'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['teams'] });
    queryClient.invalidateQueries({ queryKey: ['teams', 'mine'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: TeamForm) =>
      teamsApi.create({
        name: payload.name,
        type: payload.type,
        description: payload.description.trim() || null,
        departmentId: payload.departmentId,
        projectId: payload.projectId,
      }),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setForm(emptyForm);
      toast.success('Team created — add a lead so approvals route correctly');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create team'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<TeamForm> }) =>
      teamsApi.update(id, {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.departmentId !== undefined ? { departmentId: payload.departmentId } : {}),
        ...(payload.projectId !== undefined ? { projectId: payload.projectId } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success('Team updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update team'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => teamsApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Team deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete team'),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ teamId, userId, teamRole }: { teamId: number; userId: number; teamRole: TeamRole }) =>
      teamsApi.addMember(teamId, userId, teamRole),
    onSuccess: async () => {
      invalidate();
      // The roster in the drawer is read from the list payload, so refetch it
      // and re-point `managing` at the fresh row rather than trusting local state.
      const fresh = await teamsApi.list();
      queryClient.setQueryData(['teams'], fresh);
      setManaging((current) => (current ? fresh.find((t) => t.id === current.id) ?? current : current));
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update membership'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) =>
      teamsApi.removeMember(teamId, userId),
    onSuccess: async () => {
      invalidate();
      const fresh = await teamsApi.list();
      queryClient.setQueryData(['teams'], fresh);
      setManaging((current) => (current ? fresh.find((t) => t.id === current.id) ?? current : current));
      toast.success('Member removed');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to remove member'),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return teams.filter((team) => {
      if (typeFilter !== 'all' && team.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        team.name.toLowerCase().includes(needle) ||
        (team.lead?.name ?? '').toLowerCase().includes(needle) ||
        team.members.some((m) => m.name.toLowerCase().includes(needle))
      );
    });
  }, [teams, search, typeFilter]);

  const stats = useMemo(() => {
    const totalMembers = teams.reduce((sum, t) => sum + t.memberCount, 0);
    return {
      teams: teams.length,
      members: totalMembers,
      leaderless: teams.filter((t) => !t.lead && t.isActive).length,
      inactive: teams.filter((t) => !t.isActive).length,
    };
  }, [teams]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (team: Team) => {
    setEditing(team);
    setForm({
      name: team.name,
      type: team.type,
      description: team.description ?? '',
      departmentId: team.department?.id ?? null,
      projectId: team.project?.id ?? null,
      isActive: team.isActive,
    });
    setFormOpen(true);
  };

  const submitForm = () => {
    if (form.name.trim().length < 2) {
      toast.error('Team name needs at least two characters');
      return;
    }
    const payload: TeamForm = { ...form, name: form.name.trim() };
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else createMutation.mutate(payload);
  };

  const columns: DataTableColumn<Team>[] = [
    {
      key: 'name',
      header: 'Team',
      accessor: (team) => (
        <div className="flex items-center gap-2">
          <span className={cn('font-medium', !team.isActive && 'text-muted-foreground line-through')}>
            {team.name}
          </span>
          {!team.isActive && (
            <Badge variant="outline" className="text-[10px]">
              Inactive
            </Badge>
          )}
        </div>
      ),
      sortValue: (team) => team.name,
      sortable: true,
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (team) => (
        <Badge variant="outline" className={TEAM_TYPE_TONE[team.type]}>
          {TEAM_TYPE_LABEL[team.type]}
        </Badge>
      ),
      sortValue: (team) => team.type,
      sortable: true,
    },
    {
      key: 'lead',
      header: 'Team Lead',
      accessor: (team) =>
        team.lead ? (
          <div className="flex items-center gap-2">
            <UserAvatar user={team.lead} size="sm" />
            <span className="text-sm">{team.lead.name}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            No lead — approvals escalate
          </span>
        ),
      skeletonClassName: 'h-6 w-32',
    },
    {
      key: 'assistantLead',
      header: 'Assistant Lead',
      accessor: (team) =>
        team.assistantLead ? (
          <span className="text-sm">{team.assistantLead.name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'memberCount',
      header: 'Members',
      accessor: (team) => (
        <Badge variant="secondary" className="tabular-nums">
          {team.memberCount}
        </Badge>
      ),
      sortValue: (team) => team.memberCount,
      sortable: true,
      align: 'center',
    },
    {
      key: 'department',
      header: 'Department',
      accessor: (team) => (
        <span className="text-sm text-muted-foreground">{team.department?.name ?? '—'}</span>
      ),
      sortValue: (team) => team.department?.name ?? '',
      sortable: true,
    },
    {
      key: 'project',
      header: 'Project',
      accessor: (team) => (
        <span className="text-sm text-muted-foreground">{team.project?.name ?? '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-[168px]',
      render: (team) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setManaging(team);
            }}
          >
            <Users className="mr-1 h-3.5 w-3.5" />
            Members
          </Button>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(team);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(team);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Teams"
        description="A role decides what someone may do; a team decides which records it applies to and who approves them."
      >
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Team
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Teams', value: stats.teams, icon: Users, tone: 'text-foreground' },
          { label: 'Members', value: stats.members, icon: UserPlus, tone: 'text-emerald-600' },
          { label: 'Without a lead', value: stats.leaderless, icon: AlertTriangle, tone: 'text-amber-600' },
          { label: 'Inactive', value: stats.inactive, icon: CheckCircle2, tone: 'text-muted-foreground' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className={cn('text-2xl font-bold tabular-nums', item.tone)}>{item.value}</p>
                </div>
                <item.icon className={cn('h-8 w-8', item.tone, 'opacity-70')} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(team) => team.id}
        loading={isLoading}
        error={
          error ? (
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-sm text-destructive">Failed to load teams</p>
              <p className="mt-1 text-xs text-muted-foreground">Please try again later</p>
            </div>
          ) : undefined
        }
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search teams, leads, members…',
        }}
        filters={
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="devops">DevOps</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="ops">Operations</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyIcon={Users}
        emptyTitle="No teams yet"
        emptyDescription="Create a team so records can be scoped to the people who own them."
      />

      {/* Create / edit */}
      <FormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setForm(emptyForm);
          }
        }}
        title={editing ? `Edit ${editing.name}` : 'New team'}
        description={
          editing
            ? 'Changes apply to every record already filed under this team.'
            : 'Records filed under a team are visible to its members first, and approved by its lead.'
        }
        maxWidth="lg"
        onSubmit={submitForm}
        submitLabel={editing ? 'Save changes' : 'Create team'}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      >
        <FormField label="Team name" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., DevOps Operations"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Type" hint="Decides the approval chain the team takes part in.">
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v as TeamType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TEAM_TYPE_LABEL) as TeamType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {TEAM_TYPE_LABEL[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Department" hint="Used by department-scoped permissions.">
            <Select
              value={form.departmentId == null ? 'none' : String(form.departmentId)}
              onValueChange={(v) =>
                setForm({ ...form, departmentId: v === 'none' ? null : Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="Project" hint="Only for project teams; DevOps teams span projects.">
          <Select
            value={form.projectId == null ? 'none' : String(form.projectId)}
            onValueChange={(v) => setForm({ ...form, projectId: v === 'none' ? null : Number(v) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Description">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="What this team operates and who it serves."
          />
        </FormField>

        {editing && (
          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive teams are hidden from pickers; their records keep their scope.
              </p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
            />
          </div>
        )}
      </FormDialog>

      {/* Membership drawer */}
      <Sheet open={managing !== null} onOpenChange={(open) => !open && setManaging(null)}>
        <SheetContent side="right" className="sm:max-w-lg">
          {managing && (
            <MemberPanel
              team={managing}
              people={people}
              canManage={canManage}
              onAdd={(userId, teamRole) =>
                addMemberMutation.mutate({ teamId: managing.id, userId, teamRole })
              }
              onRemove={(userId) => removeMemberMutation.mutate({ teamId: managing.id, userId })}
              isSaving={addMemberMutation.isPending || removeMemberMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={() => setDeleting(null)}
        title="Delete team"
        description={
          deleting
            ? `Delete "${deleting.name}"? This is refused while any record still belongs to the team — reassign or archive those first.`
            : ''
        }
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        isConfirming={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Membership panel ────────────────────────────────────────────────────────

function MemberPanel({
  team,
  people,
  canManage,
  onAdd,
  onRemove,
  isSaving,
}: {
  team: Team;
  people: Person[];
  canManage: boolean;
  onAdd: (userId: number, teamRole: TeamRole) => void;
  onRemove: (userId: number) => void;
  isSaving: boolean;
}) {
  const [search, setSearch] = useState('');
  const [newRole, setNewRole] = useState<TeamRole>('member');

  const memberIds = new Set(team.members.map((m) => m.id));
  const candidates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return people
      .filter((p) => !memberIds.has(p.id))
      .filter((p) =>
        !needle ? true : p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle)
      )
      .slice(0, 8);
  }, [people, search, memberIds]);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {team.name}
          <Badge variant="outline" className={TEAM_TYPE_TONE[team.type]}>
            {TEAM_TYPE_LABEL[team.type]}
          </Badge>
        </SheetTitle>
        <SheetDescription>
          The lead approves work on this team&apos;s records. If the lead raises the request
          themselves, it goes to the assistant lead instead.
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Team Lead</p>
            <p className="mt-1 text-sm font-medium">{team.lead?.name ?? 'Unassigned'}</p>
          </div>
          <div className="rounded-md border px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Assistant Lead</p>
            <p className="mt-1 text-sm font-medium">{team.assistantLead?.name ?? 'Unassigned'}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Members ({team.members.length})</h3>
            {team.department && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {team.department.name}
              </span>
            )}
          </div>
          <div className="divide-y rounded-md border">
            {team.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-3 py-2">
                <UserAvatar user={member} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                </div>
                {canManage ? (
                  <Select
                    value={member.teamRole}
                    onValueChange={(v) => onAdd(member.id, v as TeamRole)}
                    disabled={isSaving}
                  >
                    <SelectTrigger className="h-7 w-[136px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(teamRoleLabel) as TeamRole[]).map((role) => (
                        <SelectItem key={role} value={role}>
                          {teamRoleLabel[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    {teamRoleLabel[member.teamRole]}
                  </Badge>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Remove from team"
                    onClick={() => onRemove(member.id)}
                    disabled={isSaving}
                  >
                    <UserX className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {team.members.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nobody is in this team yet.
              </p>
            )}
          </div>
        </div>

        {canManage && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Add someone</h3>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people by name or email…"
                  className="pl-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Join as</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as TeamRole)}>
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(teamRoleLabel) as TeamRole[]).map((role) => (
                      <SelectItem key={role} value={role}>
                        {teamRoleLabel[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                {candidates.map((person) => (
                  <button
                    key={person.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    onClick={() => {
                      onAdd(person.id, newRole);
                      setSearch('');
                    }}
                    disabled={isSaving}
                  >
                    <UserAvatar user={person} size="sm" />
                    <span className="truncate">{person.name}</span>
                    <span className="ml-auto truncate text-[11px] text-muted-foreground">
                      {person.email}
                    </span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {search.trim() ? 'Nobody matches that search.' : 'Everyone is already in this team.'}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </SheetBody>

      <SheetFooter>
        <p className="mr-auto text-[11px] text-muted-foreground">
          Removing someone keeps their history; it only ends their membership.
        </p>
      </SheetFooter>
    </>
  );
}
