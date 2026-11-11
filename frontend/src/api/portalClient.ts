import apiClient from './client';

/**
 * Client for the public helpdesk portal.
 *
 * Two hard rules, both enforced through `skipAuthRedirect`:
 *  1. the staff JWT in localStorage is never attached — the portal identity
 *     is the portal token only;
 *  2. no 401 is allowed to trigger the app's "session expired → /login"
 *     redirect — an anonymous visitor would otherwise be thrown out of the
 *     portal into a staff login page.
 *
 * The portal token lives in sessionStorage: an anonymous 12-hour identity
 * should not outlive its tab on a shared or front-desk machine.
 */

const PORTAL_TOKEN_KEY = 'portal_token';

export function getPortalToken(): string | null {
  try {
    return sessionStorage.getItem(PORTAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setPortalToken(token: string): void {
  try {
    sessionStorage.setItem(PORTAL_TOKEN_KEY, token);
  } catch {
    // Private mode / blocked storage — the session just won't survive
    // navigation; every call re-reads so nothing crashes.
  }
}

export function clearPortalToken(): void {
  try {
    sessionStorage.removeItem(PORTAL_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

interface PortalConfig {
  enabled: boolean;
  subdomain: string;
  turnstileSiteKey: string;
}

export interface PortalTicketSummary {
  id: number;
  publicId: string | null;
  ticketNumber: string | null;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  _count?: { comments: number };
}

export interface PortalComment {
  id: number;
  content: string;
  authorName: string | null;
  userId: number | null;
  createdAt: string;
  user?: { name: string } | null;
}

export interface PortalTicketDetail {
  id: number;
  publicId: string | null;
  ticketNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdAt: string;
  category?: { id: number; name: string; color?: string | null } | null;
  assignee?: { id: number; name: string } | null;
  comments: PortalComment[];
}

async function portalRequest<T>(
  method: 'get' | 'post',
  url: string,
  body?: unknown
): Promise<T> {
  const config: Record<string, unknown> = { skipAuthRedirect: true, suppressErrorToast: true };
  if (method === 'get') {
    config.params = body;
  }
  const res = await apiClient[method]<{ data?: T; message?: string }>(url, method === 'get' ? undefined : body, config);
  return (res.data.data ?? (res.data as unknown)) as T;
}

function withPortalAuth(config: Record<string, unknown>): Record<string, unknown> {
  const token = getPortalToken();
  return {
    ...config,
    headers: { ...(config.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  };
}

// Anonymous endpoints

export const portalApi = {
  config: () => portalRequest<PortalConfig>('get', '/helpdesk/portal/config'),

  submitTicket: (payload: {
    title: string;
    description?: string;
    contactName: string;
    contactEmail: string;
    contactPhone?: string;
    categoryId?: number | null;
    priority?: string;
    turnstileToken: string;
  }) => portalRequest<{ id: number; publicId: string | null; ticketNumber: string | null }>('post', '/helpdesk/portal/tickets', payload),

  requestOtp: (email: string, turnstileToken: string) =>
    portalRequest<unknown>('post', '/helpdesk/portal/verify/request', { email, turnstileToken }),

  confirmOtp: (email: string, code: string) =>
    portalRequest<{ token: string; expiresIn: number }>('post', '/helpdesk/portal/verify/confirm', { email, code }),

  // Session-authenticated endpoints

  listTickets: () =>
    apiClient
      .get<{ data: PortalTicketSummary[] }>('/helpdesk/portal/tickets', withPortalAuth({ skipAuthRedirect: true, suppressErrorToast: true }))
      .then((res) => res.data.data),

  getTicket: (publicId: string) =>
    apiClient
      .get<{ data: PortalTicketDetail }>(`/helpdesk/portal/tickets/${publicId}`, withPortalAuth({ skipAuthRedirect: true, suppressErrorToast: true }))
      .then((res) => res.data.data),

  addComment: (publicId: string, content: string) =>
    apiClient
      .post<{ data: PortalComment }>(
        `/helpdesk/portal/tickets/${publicId}/comments`,
        { content },
        withPortalAuth({ skipAuthRedirect: true, suppressErrorToast: true })
      )
      .then((res) => res.data.data),
};
