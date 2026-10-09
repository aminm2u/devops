import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timesheetApi, CreateTimeEntryInput } from '@/api/timesheet';
import toast from 'react-hot-toast';

/**
 * Time entries for a date range (week grid, calendar fallback, summaries).
 * queryKey: ['timesheet', from, to, userId?, all?]
 */
export function useTimeEntries(params: {
  from: string;
  to: string;
  userId?: number;
  status?: string;
  all?: boolean;
  enabled?: boolean;
}) {
  const { from, to, userId, status, all, enabled = true } = params;
  return useQuery({
    queryKey: ['timesheet', from, to, userId ?? 'me', status ?? 'all', all ?? false],
    queryFn: () => timesheetApi.listEntries({ from, to, userId, status, all }),
    enabled,
  });
}

export function useTimesheetSummary(from: string, to: string, userId?: number) {
  return useQuery({
    queryKey: ['timesheet-summary', from, to, userId ?? 'me'],
    queryFn: () => timesheetApi.summary(from, to, userId),
  });
}

export function useMyTasks() {
  return useQuery({
    queryKey: ['timesheet-my-tasks'],
    queryFn: () => timesheetApi.myTasks(),
    staleTime: 60 * 1000,
  });
}

export function useCalendarEvents(from: string, to: string) {
  return useQuery({
    queryKey: ['timesheet-calendar', from, to],
    queryFn: () => timesheetApi.calendar(from, to),
  });
}

export function useTimesheetApprovals(status: 'pending' | 'decided' = 'pending', all = false) {
  return useQuery({
    queryKey: ['timesheet-approvals', status, all],
    queryFn: () => timesheetApi.listApprovals(status, all),
  });
}

export function useTimesheetRules(enabled = true) {
  return useQuery({
    queryKey: ['timesheet-rules'],
    queryFn: () => timesheetApi.listRules(),
    enabled,
  });
}

/** Invalidate all timesheet-related queries (entries, summary, calendar, approvals). */
export function useInvalidateTimesheet() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['timesheet'] });
    queryClient.invalidateQueries({ queryKey: ['timesheet-summary'] });
    queryClient.invalidateQueries({ queryKey: ['timesheet-calendar'] });
    queryClient.invalidateQueries({ queryKey: ['timesheet-approvals'] });
    queryClient.invalidateQueries({ queryKey: ['timesheet-my-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
  };
}

export function useCreateTimeEntry() {
  const invalidate = useInvalidateTimesheet();
  return useMutation({
    mutationFn: (input: CreateTimeEntryInput) => timesheetApi.createEntry(input),
    onSuccess: () => {
      toast.success('Entry saved');
      invalidate();
    },
    onError: () => toast.error('Failed to save entry'),
  });
}

export function useUpdateTimeEntry() {
  const invalidate = useInvalidateTimesheet();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CreateTimeEntryInput> }) =>
      timesheetApi.updateEntry(id, input),
    onSuccess: () => {
      toast.success('Entry updated');
      invalidate();
    },
    onError: () => toast.error('Failed to update entry'),
  });
}

export function useDeleteTimeEntry() {
  const invalidate = useInvalidateTimesheet();
  return useMutation({
    mutationFn: (id: number) => timesheetApi.deleteEntry(id),
    onSuccess: () => {
      toast.success('Entry deleted');
      invalidate();
    },
    onError: () => toast.error('Failed to delete entry'),
  });
}

export function useSubmitTimeEntry() {
  const invalidate = useInvalidateTimesheet();
  return useMutation({
    mutationFn: (id: number) => timesheetApi.submitEntry(id),
    onSuccess: () => {
      toast.success('Entry submitted for approval');
      invalidate();
    },
    onError: () => toast.error('Failed to submit entry'),
  });
}

export function useRecallTimeEntry() {
  const invalidate = useInvalidateTimesheet();
  return useMutation({
    mutationFn: (id: number) => timesheetApi.recallEntry(id),
    onSuccess: () => {
      toast.success('Entry recalled');
      invalidate();
    },
    onError: () => toast.error('Failed to recall entry'),
  });
}

export function useSubmitWeek() {
  const invalidate = useInvalidateTimesheet();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => timesheetApi.submitWeek(from, to),
    onSuccess: (data) => {
      toast.success(`${data.length} entries submitted`);
      invalidate();
    },
    onError: () => toast.error('Failed to submit week'),
  });
}

export function useApproveTimeEntry() {
  const invalidate = useInvalidateTimesheet();
  return useMutation({
    mutationFn: (id: number) => timesheetApi.approveEntry(id),
    onSuccess: () => {
      toast.success('Entry approved');
      invalidate();
    },
    onError: () => toast.error('Failed to approve entry'),
  });
}

export function useRejectTimeEntry() {
  const invalidate = useInvalidateTimesheet();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      timesheetApi.rejectEntry(id, reason),
    onSuccess: () => {
      toast.success('Entry rejected');
      invalidate();
    },
    onError: () => toast.error('Failed to reject entry'),
  });
}
