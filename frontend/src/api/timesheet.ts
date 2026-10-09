import apiClient from '@/api/client';
import type {
  TimeEntry,
  CalendarEventsResponse,
  MyTaskOption,
  TimesheetApprovalRule,
} from '@/types';

export interface CreateTimeEntryInput {
  workDate: string; // YYYY-MM-DD
  hours: number;
  description: string;
  taskId?: number | null;
  subtaskId?: number | null;
  categoryValue?: string;
  userId?: number; // admin: log on behalf
}

export const timesheetApi = {
  listEntries: (params: {
    from: string;
    to: string;
    userId?: number;
    status?: string;
    all?: boolean;
  }) =>
    apiClient
      .get('/timesheet/entries', { params })
      .then((r) => r.data.data as TimeEntry[]),

  createEntry: (input: CreateTimeEntryInput) =>
    apiClient.post('/timesheet/entries', input).then((r) => r.data.data as TimeEntry),

  updateEntry: (id: number, input: Partial<CreateTimeEntryInput>) =>
    apiClient.put(`/timesheet/entries/${id}`, input).then((r) => r.data.data as TimeEntry),

  deleteEntry: (id: number) => apiClient.delete(`/timesheet/entries/${id}`),

  submitEntry: (id: number) =>
    apiClient.post(`/timesheet/entries/${id}/submit`).then((r) => r.data.data as TimeEntry),

  recallEntry: (id: number) =>
    apiClient.post(`/timesheet/entries/${id}/recall`).then((r) => r.data.data as TimeEntry),

  submitWeek: (from: string, to: string) =>
    apiClient
      .post('/timesheet/entries/submit-week', { from, to })
      .then((r) => r.data.data as TimeEntry[]),

  approveEntry: (id: number) =>
    apiClient.post(`/timesheet/entries/${id}/approve`).then((r) => r.data.data as TimeEntry),

  rejectEntry: (id: number, reason: string) =>
    apiClient.post(`/timesheet/entries/${id}/reject`, { reason }).then((r) => r.data.data as TimeEntry),

  listApprovals: (status: 'pending' | 'decided' = 'pending', all = false) =>
    apiClient
      .get('/timesheet/approvals', { params: { status, all } })
      .then((r) => r.data.data as TimeEntry[]),

  summary: (from: string, to: string, userId?: number) =>
    apiClient
      .get('/timesheet/summary', { params: { from, to, userId } })
      .then((r) => r.data.data as {
        total: number;
        byDay: Record<string, number>;
        byCategory: Record<string, number>;
        byStatus: Record<string, number>;
        count: number;
      }),

  calendar: (from: string, to: string) =>
    apiClient
      .get('/timesheet/calendar', { params: { from, to } })
      .then((r) => r.data.data as CalendarEventsResponse),

  myTasks: () =>
    apiClient.get('/timesheet/my-tasks').then((r) => r.data.data as MyTaskOption[]),

  listRules: () =>
    apiClient.get('/timesheet/approval-rules').then((r) => r.data.data as TimesheetApprovalRule[]),

  createRule: (input: Partial<TimesheetApprovalRule> & { name: string; approverType: string; userIds?: number[] }) =>
    apiClient.post('/timesheet/approval-rules', input).then((r) => r.data.data as TimesheetApprovalRule),

  updateRule: (id: number, input: Partial<TimesheetApprovalRule> & { userIds?: number[] }) =>
    apiClient.put(`/timesheet/approval-rules/${id}`, input).then((r) => r.data.data as TimesheetApprovalRule),

  deleteRule: (id: number) => apiClient.delete(`/timesheet/approval-rules/${id}`),
};
