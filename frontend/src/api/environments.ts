import apiClient from './client';
import { ApiResponse, Environment } from '@/types';

export const environmentsApi = {
  getEnvironments: async (projectId: number): Promise<ApiResponse<Environment[]>> => {
    const response = await apiClient.get<ApiResponse<Environment[]>>(`/projects/${projectId}/environments`);
    return response.data;
  },

  createEnvironment: async (projectId: number, data: Partial<Environment>): Promise<ApiResponse<Environment>> => {
    const response = await apiClient.post<ApiResponse<Environment>>(`/projects/${projectId}/environments`, data);
    return response.data;
  },

  updateEnvironment: async (projectId: number, id: number, data: Partial<Environment>): Promise<ApiResponse<Environment>> => {
    const response = await apiClient.put<ApiResponse<Environment>>(`/projects/${projectId}/environments/${id}`, data);
    return response.data;
  },

  deleteEnvironment: async (projectId: number, id: number): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}/environments/${id}`);
  },
};
