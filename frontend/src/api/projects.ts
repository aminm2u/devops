import apiClient from './client';
import { ApiResponse, PaginatedResponse, Project, ProjectFilters } from '@/types';

export const projectsApi = {
  getProjects: async (filters?: ProjectFilters): Promise<PaginatedResponse<Project>> => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.perPage) params.append('per_page', filters.perPage.toString());

    const response = await apiClient.get<PaginatedResponse<Project>>('/projects', { params });
    return response.data;
  },

  getProject: async (id: number): Promise<ApiResponse<Project>> => {
    const response = await apiClient.get<ApiResponse<Project>>(`/projects/${id}`);
    return response.data;
  },

  createProject: async (data: Partial<Project>): Promise<ApiResponse<Project>> => {
    const response = await apiClient.post<ApiResponse<Project>>('/projects', data);
    return response.data;
  },

  updateProject: async (id: number, data: Partial<Project>): Promise<ApiResponse<Project>> => {
    const response = await apiClient.put<ApiResponse<Project>>(`/projects/${id}`, data);
    return response.data;
  },

  deleteProject: async (id: number): Promise<void> => {
    await apiClient.delete(`/projects/${id}`);
  },
};
