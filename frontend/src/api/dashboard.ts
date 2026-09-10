import apiClient from './client';
import { ApiResponse, DashboardStats } from '@/types';

export const dashboardApi = {
  getDashboardStats: async (): Promise<ApiResponse<DashboardStats>> => {
    const response = await apiClient.get<ApiResponse<DashboardStats>>('/dashboard/stats');
    return response.data;
  },
};
