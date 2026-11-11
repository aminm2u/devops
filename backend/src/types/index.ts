import { Request } from "express";
import { ResolvedAccess } from "../rbac/effective.js";

export interface UserWithRoles {
  id: number;
  name: string;
  email: string;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: {
    name: string;
    permissions: {
      name: string;
    }[];
  }[];
}

export interface RequestWithUser extends Request {
  user?: UserWithRoles;
  /**
   * Resolved effective access — roles, permissions with scopes, team and
   * department scope, super-admin flag. Populated by `authenticate()`.
   * Every guard reads this; nothing should re-derive permissions in a route.
   */
  access?: ResolvedAccess;
  /**
   * External portal identity — the verified contact email behind an opaque
   * portal token. Populated by `requirePortalAuth()` only; `user` and
   * `access` stay undefined on portal routes by design.
   */
  portal?: { email: string; sessionId: number };
}
