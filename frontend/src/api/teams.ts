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

export const teamsApi = {
  list: () => apiClient.get('/teams').then((r) => r.data.data as Team[]),
  mine: () => apiClient.get('/teams/mine').then((r) => r.data.data as MyTeam[]),
  get: (id: number) => apiClient.get(`/teams/${id}`).then((r) => r.data.data as Team),
  create: (payload: {
    name: string;
    type?: TeamType;
    description?: string | null;
    departmentId?: number | null;
    projectId?: number | null;
  }) => apiClient.post('/teams', payload).then((r) => r.data.data as Team),
  update: (
    id: number,
    payload: Partial<
      Pick<Team, 'name' | 'description' | 'isActive' | 'type'> & {
        departmentId: number | null;
        projectId: number | null;
      }
    >
  ) => apiClient.put(`/teams/${id}`, payload).then((r) => r.data.data as Team),
  remove: (id: number) => apiClient.delete(`/teams/${id}`),
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
