import apiClient from '@/api/client';
import type { PermissionScope } from '@/types';

/** A permission as returned by the catalog endpoint. */
export interface CatalogPermission {
  id: number | null;
  name: string;
  description: string;
  isDangerous: boolean;
  supportsScope: boolean;
}

export interface CatalogGroup {
  group: string;
  permissions: CatalogPermission[];
}

export interface RoleSummary {
  id: number;
  name: string;
  description: string | null;
  level: number;
  color: string | null;
  isSystem: boolean;
  isAssignable: boolean;
  holderCount: number;
  /** permission name → scope */
  grants: Record<string, PermissionScope>;
}

export interface MatrixPayload {
  groups: { group: string; permissions: Omit<CatalogPermission, 'id'>[] }[];
  roles: RoleSummary[];
  superAdmin: { id: number; name: string; email: string } | null;
}

/** A permission source shown in the Effective Access tab. */
export interface PermissionSource {
  type: 'role' | 'direct';
  id: number;
  name: string;
  scope: PermissionScope;
}

export interface EffectivePermission {
  name: string;
  scope: PermissionScope;
  denied: boolean;
  deniedBy: { type: 'direct'; id: number } | null;
  /** Two or more sources disagreed and the widest scope won. */
  widened: boolean;
  sources: PermissionSource[];
}

export interface EffectiveAccess {
  user: { id: number; name: string; email: string };
  userId: number;
  isSuperAdmin: boolean;
  level: number;
  permissionCount: number;
  roles: { id: number; name: string; level: number; color: string | null; permissions: string[] }[];
  teamIds: number[];
  departmentIds: number[];
  directManagerId: number | null;
  permissions: EffectivePermission[];
}

export interface PermissionDelta {
  gained: string[];
  lost: string[];
  unchanged: number;
}

export const accessApi = {
  /** Everything the Access Control page needs, in one request. */
  getMatrix: () =>
    apiClient.get('/admin/access/matrix').then((r) => r.data.data as MatrixPayload),

  getPermissions: () =>
    apiClient.get('/admin/access/permissions').then((r) => r.data.data as CatalogGroup[]),

  getRoles: () =>
    apiClient.get('/admin/access/roles').then((r) => r.data.data as RoleSummary[]),

  createRole: (input: {
    name: string;
    description?: string;
    level: number;
    color?: string;
    cloneFrom?: string;
  }) => apiClient.post('/admin/access/roles', input).then((r) => r.data.data),

  updateRole: (
    id: number,
    input: { description?: string | null; level?: number; color?: string | null; isAssignable?: boolean }
  ) => apiClient.patch(`/admin/access/roles/${id}`, input).then((r) => r.data.data),

  deleteRole: (id: number) => apiClient.delete(`/admin/access/roles/${id}`),

  /** Replace a role's grant set. `reason` is required by the API when removing. */
  setRolePermissions: (
    roleId: number,
    permissions: { name: string; scope?: PermissionScope }[],
    reason?: string
  ) =>
    apiClient
      .put(`/admin/access/roles/${roleId}/permissions`, { permissions, reason })
      .then((r) => r.data.data as { added: string[]; removed: string[]; rescoped: string[] }),

  getUserRoles: (userId: number) =>
    apiClient
      .get(`/admin/access/users/${userId}/roles`)
      .then((r) => r.data.data as { id: number; name: string; level: number }[]),

  /** Additive: `add` and `remove` are separate lists. */
  setUserRoles: (
    userId: number,
    input: { add?: string[]; remove?: string[]; reason?: string }
  ) => apiClient.put(`/admin/access/users/${userId}/roles`, input).then((r) => r.data.data),

  getUserPermissions: (userId: number) =>
    apiClient
      .get(`/admin/access/users/${userId}/permissions`)
      .then((r) => r.data.data as { name: string; effect: string; scope: PermissionScope }[]),

  setUserPermissions: (
    userId: number,
    grants: { name: string; effect: 'allow' | 'deny' | 'inherit'; scope?: PermissionScope }[],
    reason: string
  ) =>
    apiClient
      .put(`/admin/access/users/${userId}/permissions`, { grants, reason })
      .then((r) => r.data.data),

  getEffective: (userId: number) =>
    apiClient
      .get(`/admin/access/users/${userId}/effective`)
      .then((r) => r.data.data as EffectiveAccess),

  /** Dry-run a change — used by the assignment preview. */
  preview: (
    userId: number,
    input: {
      addRoles?: string[];
      removeRoles?: string[];
      grants?: { name: string; effect: 'allow' | 'deny' | 'inherit'; scope?: PermissionScope }[];
    }
  ) =>
    apiClient
      .post(`/admin/access/users/${userId}/preview`, input)
      .then((r) => r.data.data as PermissionDelta),

  transferSuperAdmin: (input: { userId: number; confirmEmail: string; reason: string }) =>
    apiClient.post('/admin/access/super-admin/transfer', input).then((r) => r.data.data),
};
