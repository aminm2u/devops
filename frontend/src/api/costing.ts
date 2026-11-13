import apiClient from './client';
import { ApiResponse } from '@/types';
import type { ScopeItem } from './scope';

export interface CostCategory {
  id: number;
  projectId: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CostItem {
  id: number;
  projectId: number;
  categoryId: number;
  scopeItemId: number | null;
  budgetItemId: number | null;
  description: string;
  qty: string | number;
  uom: string | null;
  unitCost: string | number;
  // qty * unitCost, computed server-side
  planCost: string | number;
  actualCost: string | number;
  remarks: string | null;
  scopeItem?: { id: number; wbsNumber: string; title: string } | null;
  budgetItem?: { id: number; category: string; description: string } | null;
}

export interface ResourceAssignment {
  id: number;
  projectId: number;
  scopeItemId: number | null;
  teamAssignmentId: number | null;
  name: string;
  positionCode: string;
  costPerDay: string | number;
  weeksRequired: string | number;
  daysPerWeek: number;
  // costPerDay * weeks * daysPerWeek, computed server-side
  budget: string | number;
  remarks: string | null;
  scopeItem?: { id: number; wbsNumber: string; title: string } | null;
  teamAssignment?: {
    id: number;
    user: { id: number; name: string };
    projectRole: { name: string };
  } | null;
}

export type SheetStatus =
  | 'draft'
  | 'submitted'
  | 'hod_verified'
  | 'finance_verified'
  | 'approved'
  | 'rejected';

export interface CostingApproval {
  id: number;
  step: number;
  stepKey: 'prepared' | 'hod_verified' | 'finance_verified' | 'ceo_approved';
  status: 'pending' | 'approved' | 'rejected';
  actorUserId: number | null;
  actorName: string | null;
  actedAt: string | null;
  comments: string | null;
}

export interface CostingSheet {
  id: number;
  projectId: number;
  status: SheetStatus;
  currency: string;
  totalPlanCost: string | number;
  totalActualCost: string | number;
  resourcesBudget: string | number;
  approvals: CostingApproval[];
}

export interface CostingSheetPayload {
  sheet: CostingSheet;
  categories: CostCategory[];
  items: CostItem[];
  resources: ResourceAssignment[];
}

export interface CostItemPayload {
  categoryId?: number;
  scopeItemId?: number | null;
  budgetItemId?: number | null;
  description?: string;
  qty?: number;
  uom?: string | null;
  unitCost?: number;
  actualCost?: number;
  remarks?: string | null;
}

export interface ResourcePayload {
  scopeItemId?: number | null;
  teamAssignmentId?: number | null;
  name?: string;
  positionCode?: string;
  costPerDay?: number;
  weeksRequired?: number;
  daysPerWeek?: number;
  remarks?: string | null;
}

export const costingApi = {
  getSheet: async (projectId: number): Promise<ApiResponse<CostingSheetPayload>> => {
    const response = await apiClient.get<ApiResponse<CostingSheetPayload>>(
      `/projects/${projectId}/costing-sheet`
    );
    return response.data;
  },

  saveCategory: async (projectId: number, data: { name: string }, categoryId?: number): Promise<ApiResponse<CostCategory>> => {
    const request = categoryId
      ? apiClient.put<ApiResponse<CostCategory>>(
          `/projects/${projectId}/costing-sheet/categories/${categoryId}`,
          data
        )
      : apiClient.post<ApiResponse<CostCategory>>(
          `/projects/${projectId}/costing-sheet/categories`,
          data
        );
    const response = await request;
    return response.data;
  },

  deleteCategory: async (projectId: number, categoryId: number): Promise<ApiResponse<unknown>> => {
    const response = await apiClient.delete<ApiResponse<unknown>>(
      `/projects/${projectId}/costing-sheet/categories/${categoryId}`
    );
    return response.data;
  },

  saveItem: async (projectId: number, data: CostItemPayload, itemId?: number): Promise<ApiResponse<CostItem>> => {
    const request = itemId
      ? apiClient.put<ApiResponse<CostItem>>(
          `/projects/${projectId}/costing-sheet/items/${itemId}`,
          data
        )
      : apiClient.post<ApiResponse<CostItem>>(`/projects/${projectId}/costing-sheet/items`, data);
    const response = await request;
    return response.data;
  },

  deleteItem: async (projectId: number, itemId: number): Promise<ApiResponse<unknown>> => {
    const response = await apiClient.delete<ApiResponse<unknown>>(
      `/projects/${projectId}/costing-sheet/items/${itemId}`
    );
    return response.data;
  },

  saveResource: async (projectId: number, data: ResourcePayload, resourceId?: number): Promise<ApiResponse<ResourceAssignment>> => {
    const request = resourceId
      ? apiClient.put<ApiResponse<ResourceAssignment>>(
          `/projects/${projectId}/costing-sheet/resources/${resourceId}`,
          data
        )
      : apiClient.post<ApiResponse<ResourceAssignment>>(
          `/projects/${projectId}/costing-sheet/resources`,
          data
        );
    const response = await request;
    return response.data;
  },

  deleteResource: async (projectId: number, resourceId: number): Promise<ApiResponse<unknown>> => {
    const response = await apiClient.delete<ApiResponse<unknown>>(
      `/projects/${projectId}/costing-sheet/resources/${resourceId}`
    );
    return response.data;
  },

  submit: async (projectId: number): Promise<ApiResponse<CostingSheet>> => {
    const response = await apiClient.post<ApiResponse<CostingSheet>>(
      `/projects/${projectId}/costing-sheet/submit`
    );
    return response.data;
  },

  signOff: async (
    projectId: number,
    data: { stepKey: string; decision: 'approve' | 'reject'; comments?: string | null }
  ): Promise<ApiResponse<CostingSheet>> => {
    const response = await apiClient.post<ApiResponse<CostingSheet>>(
      `/projects/${projectId}/costing-sheet/sign-off`,
      data
    );
    return response.data;
  },

  reopen: async (projectId: number): Promise<ApiResponse<CostingSheet>> => {
    const response = await apiClient.post<ApiResponse<CostingSheet>>(
      `/projects/${projectId}/costing-sheet/reopen`
    );
    return response.data;
  },
};

export type { ScopeItem };
