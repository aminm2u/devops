import apiClient from './client';
import { ApiResponse, DashboardStats } from '@/types';

/** Which sections the viewer's capabilities unlock. Mirrors the API. */
export interface DashboardBlocks {
  personal: boolean;
  approvals: boolean;
  team: boolean;
  org: boolean;
}

export interface DashboardAttentionItem {
  kind: 'approval' | 'task' | 'ticket' | 'incident' | 'ssl' | 'timesheet' | 'budget';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  href: string;
}

export interface PersonalSummary {
  hours: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    daily: { date: string; label: string; hours: number }[];
  };
  timesheet: { drafts: number; submitted: number };
  tasks: {
    open: number;
    overdue: number;
    dueThisWeek: number;
    next: {
      id: number;
      title: string;
      priority: string;
      dueDate: string | null;
      projectId: number;
      projectName: string | null;
      column: string | null;
      subtaskDone: number;
      subtaskTotal: number;
      isOverdue: boolean;
    }[];
  };
  subtasks: {
    id: number;
    title: string;
    dueDate: string | null;
    taskId: number;
    isOverdue: boolean;
  }[];
  tickets: { reportedOpen: number; assignedOpen: number; total: number };
}

export interface ApprovalsSummary {
  pending: number;
  oldestDays: number;
  byModule: { module: string; count: number }[];
  items: {
    id: number;
    module: string;
    title: string;
    requesterName: string | null;
    createdAt: string;
    ageDays: number;
  }[];
}

export interface TeamSummary {
  teams: { id: number; name: string; type: string; role: string }[];
  headcount: number;
  canSeeHours: boolean;
  activeToday: number | null;
  hoursThisWeek: number | null;
  avgHoursPerMember: number | null;
  daily: { date: string; label: string; hours: number }[];
  leaderboard: {
    userId: number;
    name: string;
    teamRole: string;
    hours: number;
    loggedToday: boolean;
  }[];
  tasks: {
    open: number;
    overdue: number;
    items: { id: number; title: string; priority: string; dueDate: string | null; isOverdue: boolean }[];
  };
  incidents: {
    open: number;
    critical: number;
    items: { id: number; title: string; severity: string; status: string }[];
  };
  tickets: { open: number; slaAtRisk: number };
  hasActivity: boolean;
}

export interface OrgSummary {
  projects: {
    total: number;
    byStatus: { status: string; count: number }[];
    byHealth: { key: string; count: number }[];
    atRisk: number;
  };
  budget: {
    allocated: number;
    utilized: number;
    remaining: number;
    utilizationPercent: number;
  };
  incidents: {
    open: number;
    bySeverity: { key: string; count: number }[];
    critical: number;
    oldest: { id: number; title: string; ageDays: number }[];
  };
  deployments: { thisWeek: number; failed: number; successRate: number | null };
  infrastructure: { total: number; byStatus: { status: string; count: number }[] };
  ssl: {
    expiring: number;
    items: { id: number; name: string; notAfter: string; daysLeft: number }[];
  };
  helpdesk: { open: number; byStatus: { status: string; count: number }[] };
  headcount: number;
}

export interface DashboardOverview {
  visible: DashboardBlocks;
  personal: PersonalSummary;
  approvals: ApprovalsSummary | null;
  team: TeamSummary | null;
  org: OrgSummary | null;
  attention: DashboardAttentionItem[];
  generatedAt: string;
}

export const dashboardApi = {
  getDashboardStats: async (): Promise<ApiResponse<DashboardStats>> => {
    const response = await apiClient.get<ApiResponse<DashboardStats>>('/dashboard/stats');
    return response.data;
  },

  getOverview: async (): Promise<ApiResponse<DashboardOverview>> => {
    const response = await apiClient.get<ApiResponse<DashboardOverview>>('/dashboard/overview');
    return response.data;
  },
};
