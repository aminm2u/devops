import apiClient from './client';
import type { Notification, NotificationPreferences, PaginatedResponse } from '@/types';

export interface NotificationListParams {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export async function getNotifications(params: NotificationListParams = {}): Promise<PaginatedResponse<Notification>> {
  const { page = 1, limit = 20, unreadOnly = false } = params;
  const res = await apiClient.get('/notifications', {
    params: { page, limit, unreadOnly },
  });
  return res.data;
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiClient.get('/notifications/unread-count');
  return res.data.data.unreadCount;
}

export async function markAsRead(id: number): Promise<void> {
  await apiClient.put(`/notifications/${id}/read`);
}

export async function markAllAsRead(): Promise<void> {
  await apiClient.put('/notifications/read-all');
}

export async function getPreferences(): Promise<NotificationPreferences> {
  const res = await apiClient.get('/notifications/preferences');
  return res.data.data;
}

export async function updatePreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  const res = await apiClient.put('/notifications/preferences', prefs);
  return res.data.data;
}
