import apiClient from '@/api/client';

/**
 * Org structure client.
 *
 * The chart is read as one flat payload and rendered from `reportIds`; the
 * server owns the graph and refuses writes that would create a loop, so the
 * UI never has to reason about cycles itself — it just shows the error.
 */

export interface OrgNode {
  id: number;
  name: string;
  email: string;
  employeeId: string | null;
  isActive: boolean;
  departmentId: number | null;
  departmentName: string | null;
  departmentCode: string | null;
  positionName: string | null;
  /** Raw edge — set even when the manager is inactive, so it can differ from tree placement. */
  directManagerId: number | null;
  roles: string[];
  reportIds: number[];
}

export interface OrgDepartment {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  managerId: number | null;
  managerName: string | null;
}

export interface OrgTree {
  nodes: OrgNode[];
  departments: OrgDepartment[];
  rootIds: number[];
}

export interface ChainEntry {
  id: number;
  name: string;
  email: string;
}

export const orgApi = {
  getTree: () => apiClient.get('/org/tree').then((r) => r.data.data as OrgTree),

  getChain: (userId: number) =>
    apiClient
      .get(`/org/users/${userId}/chain`)
      .then((r) => r.data.data as { user: { id: number; name: string }; chain: ChainEntry[] }),

  setManager: (userId: number, managerId: number | null) =>
    apiClient
      .put(`/org/users/${userId}/manager`, { managerId })
      .then((r) => r.data.data as { userId: number; directManagerId: number | null }),

  createDepartment: (input: {
    code: string;
    name: string;
    parentId?: number | null;
    managerId?: number | null;
  }) => apiClient.post('/org/departments', input).then((r) => r.data.data as OrgDepartment),

  updateDepartment: (
    id: number,
    input: {
      code?: string;
      name?: string;
      parentId?: number | null;
      managerId?: number | null;
    }
  ) => apiClient.put(`/org/departments/${id}`, input).then((r) => r.data.data as OrgDepartment),

  deleteDepartment: (id: number) => apiClient.delete(`/org/departments/${id}`),
};
