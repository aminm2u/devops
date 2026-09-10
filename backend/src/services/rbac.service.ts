import prisma from "../config/database.js";

export async function getUserRoles(userId: number): Promise<string[]> {
  const userRoles = await prisma.modelHasRole.findMany({
    where: {
      modelId: userId,
      modelType: "App\\Models\\User",
    },
    include: {
      role: true,
    },
  });

  return userRoles.map((ur) => ur.role.name);
}

export async function getUserPermissions(userId: number): Promise<string[]> {
  const userRoles = await prisma.modelHasRole.findMany({
    where: {
      modelId: userId,
      modelType: "App\\Models\\User",
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const permissions = new Set<string>();
  userRoles.forEach((ur) => {
    ur.role.permissions.forEach((rhp) => {
      permissions.add(rhp.permission.name);
    });
  });

  return Array.from(permissions);
}

export async function hasRole(
  userId: number,
  roles: string[]
): Promise<boolean> {
  const userRoles = await getUserRoles(userId);
  return roles.some((role) => userRoles.includes(role));
}

export async function hasPermission(
  userId: number,
  permissions: string[]
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId);
  return permissions.some((perm) => userPermissions.includes(perm));
}
