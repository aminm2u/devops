import apiClient from './client';
import { ApiResponse } from '@/types';

/** One row of the project scope tree (flat list; build the tree client-side). */
export interface ScopeItem {
  id: number;
  projectId: number;
  parentId: number | null;
  wbsNumber: string;
  sortOrder: number;
  title: string;
  description: string | null;
  status: 'planned' | 'in_progress' | 'completed';
  startDate: string | null;
  endDate: string | null;
  roleCodes: string[] | null;
  assigneeUserId: number | null;
  progress: number | null;
  // Server-derived: planCost = max(manual budget, linked cost items + children);
  // actualCost = approved requisitions + linked cost item actuals + children.
  planCost: string | number;
  manualPlanCost: string | number;
  actualCost: string | number;
  assignee?: { id: number; name: string } | null;
}

export type ScopeItemPayload = Partial<
  Omit<
    ScopeItem,
    'planCost' | 'manualPlanCost' | 'actualCost' | 'assignee' | 'wbsNumber' | 'projectId'
  >
> & { planCost?: number };

export const scopeApi = {
  list: async (projectId: number): Promise<ApiResponse<ScopeItem[]>> => {
    const response = await apiClient.get<ApiResponse<ScopeItem[]>>(`/projects/${projectId}/scope`);
    return response.data;
  },

  create: async (projectId: number, data: ScopeItemPayload & { afterSiblingId?: number | null }): Promise<ApiResponse<ScopeItem>> => {
    const response = await apiClient.post<ApiResponse<ScopeItem>>(`/projects/${projectId}/scope`, data);
    return response.data;
  },

  update: async (projectId: number, itemId: number, data: ScopeItemPayload): Promise<ApiResponse<ScopeItem>> => {
    const response = await apiClient.put<ApiResponse<ScopeItem>>(`/projects/${projectId}/scope/${itemId}`, data);
    return response.data;
  },

  remove: async (projectId: number, itemId: number): Promise<ApiResponse<unknown>> => {
    const response = await apiClient.delete<ApiResponse<unknown>>(`/projects/${projectId}/scope/${itemId}`);
    return response.data;
  },

  reorder: async (projectId: number, moves: { id: number; parentId: number | null; sortOrder: number }[]): Promise<ApiResponse<unknown>> => {
    const response = await apiClient.put<ApiResponse<unknown>>(`/projects/${projectId}/scope/reorder`, { moves });
    return response.data;
  },
};
