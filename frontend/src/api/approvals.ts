import apiClient from '@/api/client';

/**
 * Approval Section client.
 *
 * One ledger serves every module, so the inbox never has to know how a
 * timesheet entry or a production deployment is decided — it asks for the
 * caller's queue and posts a decision.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type ApprovalModule =
  | 'timesheet'
  | 'requisition'
  | 'purchase-order'
  | 'payment'
  | 'deployment'
  | 'change'
  | 'enrollment';

export interface ApprovalRequest {
  id: number;
  module: string;
  subjectType: string;
  subjectId: number;
  title: string;
  status: ApprovalStatus;
  comment: string | null;
  decidedAt: string | null;
  createdAt: string;
  /** Hours since the request was opened — drives the SLA badge. */
  ageHours: number;
  metadata: Record<string, unknown> | null;
  requester: { id: number; name: string; email: string };
  approver: { id: number; name: string };
}

export interface ApprovalListParams {
  status?: ApprovalStatus | 'any';
  module?: ApprovalModule | 'all';
  /** "all" requires `approval.request.read.all` and is an audit view. */
  scope?: 'mine' | 'all';
  page?: number;
  limit?: number;
}

export interface ApprovalListResult {
  data: ApprovalRequest[];
  meta: {
    currentPage: number;
    lastPage: number;
    perPage: number;
    total: number;
    scope: 'mine' | 'all';
    byModule: Record<string, number>;
  };
}

export const approvalsApi = {
  list: (params: ApprovalListParams = {}) =>
    apiClient.get('/approvals', { params }).then((r) => r.data as ApprovalListResult),

  summary: () =>
    apiClient.get('/approvals/summary').then((r) => r.data.data as { pending: number }),

  /** Full decision history for one record, oldest first is not guaranteed. */
  history: (subjectType: string, subjectId: number) =>
    apiClient
      .get(`/approvals/subject/${encodeURIComponent(subjectType)}/${subjectId}`)
      .then((r) => r.data.data as ApprovalRequest[]),

  decide: (id: number, action: 'approve' | 'reject', comment?: string | null) =>
    apiClient
      .post(`/approvals/${id}/decide`, { action, comment: comment || null })
      .then(
        (r) =>
          r.data.data as {
            module: string;
            subjectType: string;
            subjectId: number;
            status: string;
            /** The record's own status — a chain step can leave it `under_review`. */
            subjectStatus: string;
          }
      ),
};

/** Modules are stored as slugs on the server; the inbox shows their names. */
export const moduleLabel: Record<string, string> = {
  timesheet: 'Timesheet',
  requisition: 'Requisition',
  'purchase-order': 'Purchase Order',
  payment: 'Payment',
  deployment: 'Deployment',
  change: 'Change',
  enrollment: 'Enrollment',
};

/**
 * Age thresholds for the SLA badge. A day-old request is normal, three days is
 * worth chasing, a week is overdue — the inbox should make that obvious
 * without an extra click.
 */
export function ageTone(hours: number): 'calm' | 'warn' | 'late' {
  if (hours >= 168) return 'late';
  if (hours >= 72) return 'warn';
  return 'calm';
}

export function formatAge(hours: number): string {
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
