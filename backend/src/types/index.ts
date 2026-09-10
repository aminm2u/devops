import { Request } from "express";

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
}
