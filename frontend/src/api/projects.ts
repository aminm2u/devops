import apiClient from './client';
import { ApiResponse, PaginatedResponse, Project, ProjectFilters } from '@/types';

/** One row of the team-contribution table. */
export interface ProjectContributionMember {
  userId: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isOwner: boolean;
  totalHours: number;
  approvedHours: number;
  daysWorked: number;
  /** Hours ÷ 8 — effort in standard working days, fractional. */
  personDays: number;
  tasksTouched: number;
  lastLoggedDate: string | null;
  sharePercent: number;
  byStatus: { draft: number; submitted: number; approved: number; rejected: number };
}

export interface ProjectContributionBucket {
  key: string;
  label: string;
  start: string;
  end: string;
  totalHours: number;
  /** The part of `totalHours` already approved — the chart's lower stack. */
  approvedHours: number;
  /** User id (as string) → hours in this bucket. */
  byUser: Record<string, number>;
}

export interface ProjectContribution {
  projectId: number;
  projectName: string;
  from: string;
  to: string;
  /** 1 = daily buckets, 7 = weekly, 0 = monthly (long ranges). */
  bucketDays: number;
  granularity: 'day' | 'week' | 'month';
  /** Hours the server counts as one working day (currently 8). */
  hoursPerWorkingDay: number;
  members: ProjectContributionMember[];
  buckets: ProjectContributionBucket[];
  byCategory: { value: string; label: string; hours: number }[];
  byTask: { id: number; title: string; hours: number }[];
  totals: {
    hours: number;
    approvedHours: number;
    personDays: number;
    contributors: number;
    entries: number;
    byStatus: { draft: number; submitted: number; approved: number; rejected: number };
  };
}

export const projectsApi = {
  getProjects: async (filters?: ProjectFilters): Promise<PaginatedResponse<Project>> => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.mine) params.append('mine', 'true');
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.perPage) params.append('per_page', filters.perPage.toString());

    const response = await apiClient.get<PaginatedResponse<Project>>('/projects', { params });
    return response.data;
  },

  getProject: async (id: number): Promise<ApiResponse<Project>> => {
    const response = await apiClient.get<ApiResponse<Project>>(`/projects/${id}`);
    return response.data;
  },

  createProject: async (data: Partial<Project>): Promise<ApiResponse<Project>> => {
    const response = await apiClient.post<ApiResponse<Project>>('/projects', data);
    return response.data;
  },

  updateProject: async (id: number, data: Partial<Project>): Promise<ApiResponse<Project>> => {
    const response = await apiClient.put<ApiResponse<Project>>(`/projects/${id}`, data);
    return response.data;
  },

  deleteProject: async (id: number): Promise<void> => {
    await apiClient.delete(`/projects/${id}`);
  },

  /**
   * Join a project's team yourself. Only allowed when the project has
   * `allowSelfEnroll` on; the server picks the lowest-privilege role.
   */
  enroll: async (id: number): Promise<ApiResponse<unknown>> => {
    const response = await apiClient.post<ApiResponse<unknown>>(`/projects/${id}/enroll`);
    return response.data;
  },

  /**
   * Team contribution — hours logged against this project, rolled up per
   * member, per bucket and per category for a date range.
   *
   * Gated server-side on the Timesheet read capability, not project
   * membership: hours are personal data. Callers should check
   * `can('timesheet.entry.read.team')` before rendering the panel.
   */
  getContribution: async (
    id: number,
    from: string,
    to: string
  ): Promise<ApiResponse<ProjectContribution>> => {
    const response = await apiClient.get<ApiResponse<ProjectContribution>>(
      `/projects/${id}/contribution`,
      { params: { from, to } }
    );
    return response.data;
  },
};
