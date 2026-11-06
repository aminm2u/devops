import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormDialog } from '@/components/ui/form-dialog';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import apiClient from '@/api/client';
import {
  TEAM_TYPE_LABEL,
  teamsApi,
  teamRoleLabel,
  type CreatedTeam,
  type TeamRole,
  type TeamType,
} from '@/api/teams';

/**
 * Team membership, edited on the employee's own record.
 *
 * A team is the unit of *scope*, not of capability: a role says what somebody
 * may do anywhere, a team says which records that applies to and who approves
 * work on them. Membership only ever described one person, so it lives here
 * rather than on a page of its own.
 *
 * It is a list rather than one dropdown because people genuinely hold more than
 * one membership — a DevOps lead can also sit on a project team. Setting
 * somebody to Lead goes through `POST /teams/:id/members`, whose transaction
 * demotes the incumbent to assistant lead, so the one-lead-per-team invariant
 * is enforced by the server and not by this form.
 */

export interface TeamMembership {
  id: number;
  name: string;
  type: string;
  teamRole: string;
}

interface ReferenceData {
  departments: { id: number; name: string; code: string }[];
}

/** Sentinel for the "+ Create new team…" choice in the team select. */
const CREATE = '__create__';

export function UserTeamsCard({
  userId,
  memberships,
  canManage,
  canView,
}: {
  userId: number;
  memberships: TeamMembership[];
  canManage: boolean;
  /** `hr.team.view` — the roster is a separate grant from managing it. */
  canView: boolean;
}) {
  const queryClient = useQueryClient();

  const [teamId, setTeamId] = useState('');
  const [teamRole, setTeamRole] = useState<TeamRole>('member');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTeam, setNewTeam] = useState<{ name: string; type: TeamType; departmentId: string }>({
    name: '',
    type: 'devops',
    departmentId: '',
  });

  // The full roster is an org-level read; without it the picker would be empty
  // for anyone who may edit memberships but may not see the team list.
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: teamsApi.list,
    enabled: canView,
  });

  // Shared cache entry with the employee form — same endpoint, same shape.
  const { data: references } = useQuery({
    queryKey: ['references'],
    queryFn: () => apiClient.get('/references').then((r) => r.data.data as ReferenceData),
    staleTime: 10 * 60 * 1000,
    enabled: canManage,
  });

  const joined = useMemo(() => new Set(memberships.map((m) => m.id)), [memberships]);
  const available = teams.filter((team) => team.isActive && !joined.has(team.id));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['teams'] });
    queryClient.invalidateQueries({ queryKey: ['user', userId] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const addMutation = useMutation({
    mutationFn: (input: { teamId: number; teamRole: TeamRole }) =>
      teamsApi.addMember(input.teamId, userId, input.teamRole),
    onSuccess: () => {
      invalidate();
      setTeamId('');
      setTeamRole('member');
      toast.success('Team membership updated');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message || 'Could not update team membership'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => teamsApi.removeMember(id, userId),
    onSuccess: () => {
      invalidate();
      toast.success('Removed from the team');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not remove membership'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      teamsApi.create({
        name: newTeam.name.trim(),
        type: newTeam.type,
        departmentId: newTeam.departmentId ? Number(newTeam.departmentId) : null,
      }),
    onSuccess: (team: CreatedTeam) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setCreateOpen(false);
      setNewTeam({ name: '', type: 'devops', departmentId: '' });
      // Select it straight away: creating a team here is nearly always followed
      // by putting this person in it.
      setTeamId(String(team.id));
      toast.success('Team created — add a lead so approvals route correctly');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to create team'),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4" />
          Teams
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {memberships.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Not in a team yet. Team membership drives which records this person can see when a
            permission is team-scoped.
          </p>
        ) : (
          <div className="space-y-1.5">
            {memberships.map((team) => (
              <div
                key={team.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 dark:text-gray-400 text-gray-500"
              >
                <span className="truncate text-xs font-medium">{team.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {canManage ? (
                    <Select
                      value={team.teamRole}
                      onValueChange={(value) =>
                        addMutation.mutate({ teamId: team.id, teamRole: value as TeamRole })
                      }
                      disabled={addMutation.isPending || removeMutation.isPending}
                    >
                      <SelectTrigger className="h-6 w-[112px] text-[10px]">
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
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[9px] dark:text-gray-400 text-gray-500"
                    >
                      {teamRoleLabel[team.teamRole as TeamRole] ?? team.teamRole.replace('_', ' ')}
                    </Badge>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      title="Remove from this team"
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMutation.mutate(team.id)}
                      disabled={addMutation.isPending || removeMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {canManage && canView && (
          <div className="space-y-2 border-t border-border/60 pt-3">
            <Select
              value={teamId}
              onValueChange={(value) => {
                if (value === CREATE) setCreateOpen(true);
                else setTeamId(value);
              }}
              disabled={addMutation.isPending}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Add to a team…" />
              </SelectTrigger>
              <SelectContent>
                {available.map((team) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.name}
                  </SelectItem>
                ))}
                <SelectItem value={CREATE}>
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3 w-3" />
                    Create new team…
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>

            {teamId && (
              <div className="flex items-center gap-2">
                <Select
                  value={teamRole}
                  onValueChange={(value) => setTeamRole(value as TeamRole)}
                  disabled={addMutation.isPending}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
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
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => addMutation.mutate({ teamId: Number(teamId), teamRole })}
                  disabled={addMutation.isPending}
                >
                  Add
                </Button>
              </div>
            )}
            {teamRole === 'lead' && teamId && (
              <p className="text-[11px] text-muted-foreground">
                Leads approve work on this team&apos;s records. The current lead becomes assistant
                lead.
              </p>
            )}
          </div>
        )}
      </CardContent>

      <FormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setNewTeam({ name: '', type: 'devops', departmentId: '' });
        }}
        title="New team"
        description="Records filed under a team are visible to its members first, and approved by its lead."
        maxWidth="md"
        onSubmit={(event) => {
          event.preventDefault();
          if (!newTeam.name.trim()) {
            toast.error('Give the team a name');
            return;
          }
          createMutation.mutate();
        }}
        submitLabel="Create team"
        isSubmitting={createMutation.isPending}
      >
        <FormField label="Team name" required>
          <Input
            value={newTeam.name}
            onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
            placeholder="e.g., Platform SRE"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Type" hint="Decides the approval chain the team takes part in.">
            <Select
              value={newTeam.type}
              onValueChange={(value) => setNewTeam({ ...newTeam, type: value as TeamType })}
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
              value={newTeam.departmentId || 'none'}
              onValueChange={(value) =>
                setNewTeam({ ...newTeam, departmentId: value === 'none' ? '' : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {(references?.departments ?? []).map((department) => (
                  <SelectItem key={department.id} value={String(department.id)}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </FormDialog>
    </Card>
  );
}
