import apiClient from '@/api/client';
import type { ApiResponse } from '@/types';

/**
 * Helpdesk report client.
 *
 * The monthly payload is shaped by `services/helpdeskReport.service.ts` — one
 * request answers the whole page, so every chart on the screen describes the
 * same ticket set and the same period.
 */

export interface ReportPeriod {
  month: number;
  year: number;
  label: string;
}

export interface ReportSummary {
  totalCreated: number;
  totalResolved: number;
  totalOpen: number;
  avgResolutionMinutes: number | null;
  avgFirstResponseMinutes: number | null;
  slaBreached: number;
  slaComplianceRate: number | null;
  avgSatisfaction: number | null;
  totalRated: number;
}

export interface ReportComparison {
  previousPeriod: { month: number; year: number };
  created: { current: number; previous: number };
  resolved: { current: number; previous: number };
  avgResolutionMinutes: { current: number | null; previous: number | null };
  avgSatisfaction: { current: number | null; previous: number | null };
  slaBreached: { current: number; previous: number };
}

export interface DailyPoint {
  day: number;
  label: string;
  created: number;
  resolved: number;
  backlog: number;
}

export interface PriorityRow {
  priority: string;
  count: number;
  resolved: number;
  avgResolutionMinutes: number | null;
  slaBreaches: number;
  slaComplianceRate: number | null;
}

export interface CategoryRow {
  key: string;
  label: string;
  count: number;
  resolved: number;
  avgResolutionMinutes: number | null;
  slaBreaches: number;
  slaComplianceRate: number | null;
}

export interface AssigneeRow {
  key: string;
  label: string;
  count: number;
  open: number;
  resolved: number;
  avgResolutionMinutes: number | null;
  slaBreaches: number;
}

export interface TicketRow {
  id: number;
  /** Stable URL token — detail links prefer this over the enumerable id. */
  publicId: string | null;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  assignee: string | null;
  reporter: string | null;
  createdAt: string;
  resolvedAt: string | null;
  satisfaction: number | null;
  resolutionMinutes: number | null;
  slaBreached: boolean;
}

export interface MonthlyReport {
  period: {
    month: number;
    year: number;
    startDate: string;
    endDate: string;
    daysInMonth: number;
  };
  summary: ReportSummary;
  comparison: ReportComparison;
  daily: DailyPoint[];
  byStatus: { status: string; count: number }[];
  byPriority: PriorityRow[];
  byCategory: CategoryRow[];
  byAssignee: AssigneeRow[];
  satisfactionDistribution: { score: string; count: number }[];
  backlog: {
    open: number;
    breached: number;
    dueWithin24h: number;
    aging: { key: string; count: number; breached: number }[];
  };
  tickets: TicketRow[];
}

export const helpdeskApi = {
  monthlyReport: async (month: number, year: number): Promise<MonthlyReport> => {
    const response = await apiClient.get<ApiResponse<MonthlyReport>>('/helpdesk/reports/monthly', {
      params: { month, year },
    });
    return response.data.data;
  },

  periods: async (): Promise<ReportPeriod[]> => {
    const response = await apiClient.get<ApiResponse<ReportPeriod[]>>('/helpdesk/reports/periods');
    return response.data.data;
  },
};
