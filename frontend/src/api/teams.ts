import apiClient from '@/api/client';

/**
 * Teams client.
 *
 * A team is the unit of *scope*: a role says what you may do, a team says to
 * which records. Every DevOps list page therefore needs two things from here —
 * the caller's own memberships (for the picker and the filter) and, for people
 * who administer teams, the full roster.
 */

export type TeamType = 'devops' | 'support' | 'project' | 'ops';
export type TeamRole = 'lead' | 'assistant_lead' | 'member';

/** Type labels, kept beside the union they describe so they cannot drift. */
export const TEAM_TYPE_LABEL: Record<TeamType, string> = {
  devops: 'DevOps',
  support: 'Support',
  project: 'Project',
  ops: 'Operations',
};

export interface TeamMemberSummary {
  id: number;
  name: string;
  email: string;
  teamRole: TeamRole;
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  type: TeamType;
  description: string | null;
  isActive: boolean;
  department: { id: number; name: string; code: string } | null;
  project: { id: number; name: string } | null;
  memberCount: number;
  lead: { id: number; name: string; email: string } | null;
  assistantLead: { id: number; name: string; email: string } | null;
  members: TeamMemberSummary[];
}

/** What `GET /teams/mine` returns — the team plus the caller's role in it. */
export interface MyTeam {
  id: number;
  name: string;
  slug: string;
  type: TeamType;
  teamRole: TeamRole;
  department: { id: number; name: string } | null;
}

/** What `POST /teams` returns — the new row, without the list's derived counts. */
export interface CreatedTeam {
  id: number;
  name: string;
  slug: string;
  type: TeamType;
}

export const teamsApi = {
  list: () => apiClient.get('/teams').then((r) => r.data.data as Team[]),
  mine: () => apiClient.get('/teams/mine').then((r) => r.data.data as MyTeam[]),
  create: (payload: {
    name: string;
    type?: TeamType;
    description?: string | null;
    departmentId?: number | null;
    projectId?: number | null;
  }) => apiClient.post('/teams', payload).then((r) => r.data.data as CreatedTeam),
  addMember: (id: number, userId: number, teamRole: TeamRole = 'member') =>
    apiClient.post(`/teams/${id}/members`, { userId, teamRole }).then((r) => r.data.data),
  removeMember: (id: number, userId: number) => apiClient.delete(`/teams/${id}/members/${userId}`),
};

/** Human label for a membership role, used by pickers and badges. */
export const teamRoleLabel: Record<TeamRole, string> = {
  lead: 'Team Lead',
  assistant_lead: 'Assistant Lead',
  member: 'Member',
};
