import apiClient from './client';

export interface MicrosoftAppConfig {
  configured: boolean;
  tenantId?: string;
  clientId?: string;
  redirectUri?: string;
  clientSecretSet?: boolean;
}

export interface MicrosoftAccountStatus {
  connected: boolean;
  email?: string;
  displayName?: string | null;
  lastSyncedAt?: string | null;
  calendarSyncEnabled?: boolean;
  timesheetAutoSync?: boolean;
  minMeetingMinutes?: number;
  timesheetCategory?: string;
}

export interface MicrosoftCalendarEvent {
  id: number;
  msEventId: string;
  subject: string;
  startAt: string;
  endAt: string;
  isOnlineMeeting: boolean;
  joinUrl: string | null;
  organizer: string | null;
  attended: boolean;
  timeEntryId: number | null;
  timeEntryStatus?: string | null;
  timeEntryHours?: number | null;
}

export const microsoftApi = {
  getAppConfig: async (): Promise<MicrosoftAppConfig> => {
    const res = await apiClient.get('/microsoft/config');
    return res.data.data;
  },

  saveAppConfig: async (data: {
    tenantId: string;
    clientId: string;
    clientSecret?: string;
    redirectUri?: string;
  }): Promise<MicrosoftAppConfig> => {
    const res = await apiClient.put('/microsoft/config', data);
    return res.data.data;
  },

  getMe: async (): Promise<MicrosoftAccountStatus> => {
    const res = await apiClient.get('/microsoft/me');
    return res.data.data;
  },

  updateMe: async (data: {
    calendarSyncEnabled?: boolean;
    timesheetAutoSync?: boolean;
    minMeetingMinutes?: number;
    timesheetCategory?: string;
  }): Promise<MicrosoftAccountStatus> => {
    const res = await apiClient.put('/microsoft/me', data);
    return res.data.data;
  },

  connectUrl: '/api/microsoft/connect',

  disconnect: async (): Promise<void> => {
    await apiClient.post('/microsoft/disconnect');
  },

  sync: async (params?: { from?: string; to?: string }): Promise<{ imported: number; updated: number; total: number }> => {
    const res = await apiClient.post('/microsoft/sync', params ?? {});
    return res.data.data;
  },

  listEvents: (params: { from: string; to: string }): Promise<MicrosoftCalendarEvent[]> =>
    apiClient.get('/microsoft/events', { params }).then((r) => r.data.data),

  logAttendance: async (eventId: number, hours?: number): Promise<void> => {
    await apiClient.post(`/microsoft/events/${eventId}/log`, hours != null ? { hours } : {});
  },

  syncAll: async (): Promise<void> => {
    await apiClient.post('/microsoft/sync-all');
  },
};
