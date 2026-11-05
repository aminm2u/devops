import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { AppError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { authorize, superAdminOnly } from "../rbac/authorize.js";
import {
  MODEL_USER,
  PermissionScope,
  ResolvedPermission,
  can,
  normaliseScope,
  permissionNames,
  resolveAccess,
  scopeRank,
} from "../rbac/effective.js";
import { PERMISSION_CATALOG, PERMISSION_GROUPS } from "../rbac/catalog.js";

const router = Router();

router.use(authenticate);

const SCOPE_ENUM = z.enum(["self", "team", "department", "all"]);

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Serialise the resolver output into a stable API shape. */
function serialiseAccess(access: Awaited<ReturnType<typeof resolveAccess>>) {
  return {
    userId: access.userId,
    isSuperAdmin: access.isSuperAdmin,
    level: access.level,
    roles: access.roles,
    teamIds: access.teamIds,
    departmentIds: access.departmentIds,
    directManagerId: access.directManagerId,
    permissions: Object.values(access.permissions)
      .map((perm) => ({
        name: perm.name,
        scope: perm.scope,
        denied: perm.denied,
        deniedBy: perm.deniedBy ?? null,
        widened: perm.widened,
        sources: perm.sources,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Guardrail: an actor may not touch anything at or above their own level.
 * The super admin is exempt — they own the platform.
 */
function assertCanManageRole(actor: NonNullable<RequestWithUser["access"]>, targetLevel: number) {
  if (actor.isSuperAdmin) return;
  if (targetLevel >= actor.level) {
    throw new ForbiddenError(
      "You cannot manage a role at or above your own level"
    );
  }
}

/** Guardrail: a grant may only contain permissions the actor already holds. */
function assertNoGrantEscalation(
  actor: NonNullable<RequestWithUser["access"]>,
  permissionNamesRequested: string[]
) {
  if (actor.isSuperAdmin) return;
  const missing = permissionNamesRequested.filter((name) => !can(actor, name));
  if (missing.length) {
    throw new ForbiddenError(
      `You cannot grant permissions you do not hold: ${missing.join(", ")}`
    );
  }
}

async function assertOneSuperAdminTransferPossible(targetUserId: number) {
  const role = await prisma.role.findUnique({ where: { name: "super-admin" } });
  if (!role) throw new NotFoundError("super-admin role is missing");
  const current = await prisma.modelHasRole.findFirst({
    where: { roleId: role.id, modelType: MODEL_USER },
  });
  return { role, current };
}

// ── Catalog ──────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/access/permissions
 * The full catalog with grouping. The UI builds the matrix from this — it must
 * never hard-code permission names.
 */
router.get(
  "/permissions",
  authorize({ permission: "admin.role.view" }),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const granted = await prisma.permission.findMany({ select: { name: true, id: true } });
      const byName = new Map(granted.map((p) => [p.name, p.id]));

      const groups = PERMISSION_GROUPS.map((group) => ({
        group,
        permissions: PERMISSION_CATALOG.filter((perm) => perm.group === group).map((perm) => ({
          id: byName.get(perm.name) ?? null,
          name: perm.name,
          description: perm.description,
          isDangerous: perm.isDangerous ?? false,
          supportsScope: perm.supportsScope ?? true,
        })),
      })).filter((g) => g.permissions.length > 0);

      res.json({ success: true, data: groups });
    } catch (error) {
      next(error);
    }
  }
);

// ── Roles ────────────────────────────────────────────────────────────────────

/** GET /api/admin/access/roles — every role with its grants and holder count. */
router.get(
  "/roles",
  authorize({ permission: "admin.role.view" }),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: [{ level: "desc" }, { name: "asc" }],
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { modelHasRoles: true } },
        },
      });

      // Same shape as `/matrix` so the UI has one role type, not two.
      res.json({
        success: true,
        data: roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          level: role.level,
          color: role.color,
          isSystem: role.isSystem,
          isAssignable: role.isAssignable,
          holderCount: role._count.modelHasRoles,
          grants: Object.fromEntries(
            role.permissions.map((rhp) => [rhp.permission.name, rhp.scope])
          ),
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

const createRoleSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens"),
  description: z.string().max(500).optional(),
  level: z.number().int().min(0).max(99),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Copy every grant from this role — the fastest way to start a new role. */
  cloneFrom: z.string().optional(),
});

router.post(
  "/roles",
  authorize({ permission: "admin.role.manage" }),
  validate(createRoleSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { name, description, level, color, cloneFrom } = req.body as z.infer<
        typeof createRoleSchema
      >;
      const actor = req.access!;
      assertCanManageRole(actor, level);

      const existing = await prisma.role.findUnique({ where: { name } });
      if (existing) throw new AppError(409, `Role "${name}" already exists`);

      const role = await prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: { name, description, level, color, guardName: "web" },
        });

        if (cloneFrom) {
          const source = await tx.role.findUnique({
            where: { name: cloneFrom },
            include: { permissions: true },
          });
          if (source) {
            assertNoGrantEscalation(
              actor,
              source.permissions.length
                ? await tx.permission
                    .findMany({
                      where: { id: { in: source.permissions.map((p) => p.permissionId) } },
                      select: { name: true },
                    })
                    .then((rows) => rows.map((r) => r.name))
                : []
            );
            await tx.roleHasPermission.createMany({
              data: source.permissions.map((p) => ({
                roleId: created.id,
                permissionId: p.permissionId,
                scope: p.scope,
              })),
            });
          }
        }
        return created;
      });

      await logActivity({
        logName: "access",
        description: `Created role "${role.name}" (level ${role.level})`,
        subjectType: "App\\Models\\Role",
        subjectId: role.id,
        event: "role.created",
        causerId: req.user!.id,
        properties: { name, level, cloneFrom: cloneFrom ?? null },
      });

      res.status(201).json({ success: true, data: role });
    } catch (error) {
      next(error);
    }
  }
);

const updateRoleSchema = z.object({
  description: z.string().max(500).optional().nullable(),
  level: z.number().int().min(0).max(99).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  isAssignable: z.boolean().optional(),
});

router.patch(
  "/roles/:id",
  authorize({ permission: "admin.role.manage" }),
  validate(updateRoleSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const role = await prisma.role.findUnique({ where: { id } });
      if (!role) throw new NotFoundError("Role not found");

      if (role.isSystem) {
        throw new ForbiddenError("System roles cannot be modified");
      }
      assertCanManageRole(req.access!, role.level);
      if (req.body.level !== undefined) assertCanManageRole(req.access!, req.body.level);

      const updated = await prisma.role.update({ where: { id }, data: req.body });
      await logActivity({
        logName: "access",
        description: `Updated role "${role.name}"`,
        subjectType: "App\\Models\\Role",
        subjectId: id,
        event: "role.updated",
        causerId: req.user!.id,
        properties: { changes: req.body },
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/roles/:id",
  authorize({ permission: "admin.role.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const role = await prisma.role.findUnique({
        where: { id },
        include: { _count: { select: { modelHasRoles: true } } },
      });
      if (!role) throw new NotFoundError("Role not found");
      if (role.isSystem) throw new ForbiddenError("System roles cannot be deleted");
      if (role._count.modelHasRoles > 0) {
        throw new AppError(
          409,
          `${role._count.modelHasRoles} user(s) still hold this role — reassign them first`
        );
      }
      assertCanManageRole(req.access!, role.level);

      await prisma.role.delete({ where: { id } });
      await logActivity({
        logName: "access",
        description: `Deleted role "${role.name}"`,
        subjectType: "App\\Models\\Role",
        subjectId: id,
        event: "role.deleted",
        causerId: req.user!.id,
      });

      res.json({ success: true, message: "Role deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Role permission matrix ───────────────────────────────────────────────────

const setRolePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      name: z.string().min(1),
      scope: SCOPE_ENUM.optional(),
    })
  ),
  /** Required when the save removes grants, so the audit trail explains why. */
  reason: z.string().max(500).optional(),
});

/**
 * PUT /api/admin/access/roles/:id/permissions
 * Replaces the role's grant set. Returns the permission delta so the UI can
 * show "3 added, 2 removed" without recomputing anything.
 */
router.put(
  "/roles/:id/permissions",
  authorize({ permission: "admin.role.manage" }),
  validate(setRolePermissionsSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const roleId = Number(req.params.id);
      const { permissions, reason } = req.body as z.infer<typeof setRolePermissionsSchema>;
      const actor = req.access!;

      const role = await prisma.role.findUnique({
        where: { id: roleId },
        include: { permissions: { include: { permission: true } } },
      });
      if (!role) throw new NotFoundError("Role not found");
      if (role.isSystem) throw new ForbiddenError("System role permissions are immutable");
      assertCanManageRole(actor, role.level);

      const requestedNames = [...new Set(permissions.map((p) => p.name))];
      assertNoGrantEscalation(actor, requestedNames);

      const catalogRows = await prisma.permission.findMany({
        where: { name: { in: requestedNames } },
        select: { id: true, name: true },
      });
      const unknown = requestedNames.filter((n) => !catalogRows.some((r) => r.name === n));
      if (unknown.length) {
        throw new AppError(400, `Unknown permissions: ${unknown.join(", ")}`);
      }
      const idByName = new Map(catalogRows.map((r) => [r.name, r.id]));

      const before = new Map(role.permissions.map((p) => [p.permission.name, p.scope]));
      const after = new Map(requestedNames.map((n) => [n, permissions.find((p) => p.name === n)!.scope ?? "all"]));

      const added = [...after.keys()].filter((n) => !before.has(n));
      const removed = [...before.keys()].filter((n) => !after.has(n));
      const rescoped = [...after.keys()].filter(
        (n) => before.has(n) && before.get(n) !== after.get(n)
      );

      if (removed.length && !reason) {
        throw new AppError(
          400,
          "A reason is required when removing permissions from a role"
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.roleHasPermission.deleteMany({ where: { roleId } });
        if (requestedNames.length) {
          await tx.roleHasPermission.createMany({
            data: requestedNames.map((name) => ({
              roleId,
              permissionId: idByName.get(name)!,
              scope: after.get(name)!,
            })),
          });
        }
      });

      await logActivity({
        logName: "access",
        description: `Updated permissions for role "${role.name}": +${added.length} −${removed.length}`,
        subjectType: "App\\Models\\Role",
        subjectId: roleId,
        event: "role.permissions.updated",
        causerId: req.user!.id,
        properties: { added, removed, rescoped, reason: reason ?? null },
      });

      res.json({
        success: true,
        data: { roleId, added, removed, rescoped },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── User ↔ role assignment (add / remove, never destructive replace) ────────

router.get(
  "/users/:id/roles",
  authorize({ permission: "admin.role.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const assignments = await prisma.modelHasRole.findMany({
        where: { modelId: userId, modelType: MODEL_USER },
        include: { role: true },
      });
      res.json({
        success: true,
        data: assignments.map((a) => ({
          id: a.role.id,
          name: a.role.name,
          level: a.role.level,
          color: a.role.color,
          isAssignable: a.role.isAssignable,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

const setUserRolesSchema = z.object({
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  reason: z.string().max(500).optional(),
});

/**
 * PUT /api/admin/access/users/:id/roles
 * Additive by design: `add` and `remove` are separate lists, so assigning a
 * second role can never silently drop the first (the old endpoint did exactly
 * that, which made multi-role impossible).
 */
router.put(
  "/users/:id/roles",
  authorize({ permission: "admin.role.manage" }),
  validate(setUserRolesSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const { add = [], remove = [], reason } = req.body as z.infer<typeof setUserRolesSchema>;
      const actor = req.access!;

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError("User not found");

      const roles = await prisma.role.findMany({
        where: { name: { in: [...add, ...remove] } },
      });
      const roleByName = new Map(roles.map((r) => [r.name, r]));

      for (const name of [...add, ...remove]) {
        if (!roleByName.has(name)) throw new AppError(400, `Unknown role: ${name}`);
      }

      // Super-admin is not assignable through this endpoint — only /super-admin/transfer.
      for (const name of add) {
        const role = roleByName.get(name)!;
        if (role.isSystem || !role.isAssignable) {
          throw new ForbiddenError(
            `The "${name}" role cannot be assigned here — use the transfer action`
          );
        }
        assertCanManageRole(actor, role.level);
      }

      const held = await prisma.modelHasRole.findMany({
        where: { modelId: userId, modelType: MODEL_USER },
        include: { role: true },
      });
      const heldNames = held.map((h) => h.role.name);

      for (const name of remove) {
        if (name === "super-admin") {
          throw new ForbiddenError(
            "The super administrator role can only be moved with the transfer action"
          );
        }
        const role = roleByName.get(name)!;
        assertCanManageRole(actor, role.level);
      }

      // Never leave an account with no role — it would silently lose the
      // personal floor (timesheet, calendar, notifications).
      const remaining = heldNames.filter((n) => !remove.includes(n));
      const finalRoles = [...new Set([...remaining, ...add])];
      if (finalRoles.length === 0) {
        throw new AppError(409, "A user must keep at least one role");
      }

      await prisma.$transaction(async (tx) => {
        if (remove.length) {
          await tx.modelHasRole.deleteMany({
            where: {
              modelId: userId,
              modelType: MODEL_USER,
              roleId: { in: remove.map((n) => roleByName.get(n)!.id) },
            },
          });
        }
        if (add.length) {
          await tx.modelHasRole.createMany({
            data: add.map((n) => ({
              modelId: userId,
              modelType: MODEL_USER,
              roleId: roleByName.get(n)!.id,
            })),
            skipDuplicates: true,
          });
        }
      });

      await logActivity({
        logName: "access",
        description: `Changed roles for ${target.email}: +${add.length} −${remove.length}`,
        subjectType: "App\\Models\\User",
        subjectId: userId,
        event: "user.roles.updated",
        causerId: req.user!.id,
        properties: { add, remove, reason: reason ?? null, finalRoles },
      });

      res.json({ success: true, data: { userId, roles: finalRoles } });
    } catch (error) {
      next(error);
    }
  }
);

// ── Direct permission grants / denies ───────────────────────────────────────

router.get(
  "/users/:id/permissions",
  authorize({ permission: "admin.role.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const grants = await prisma.modelHasPermission.findMany({
        where: { modelId: userId, modelType: MODEL_USER },
        include: { permission: true },
      });
      res.json({
        success: true,
        data: grants.map((g) => ({
          name: g.permission.name,
          effect: g.effect,
          scope: g.scope,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

const setUserPermissionsSchema = z.object({
  grants: z.array(
    z.object({
      name: z.string().min(1),
      effect: z.enum(["allow", "deny", "inherit"]),
      scope: SCOPE_ENUM.optional(),
    })
  ),
  reason: z.string().min(3).max(500),
});

/**
 * PUT /api/admin/access/users/:id/permissions
 * Writes the direct override layer (`model_has_permissions`).
 * `inherit` deletes the override, falling back to whatever roles grant.
 *
 * Denies are super-admin-only: an HR manager must not be able to lock someone
 * out of a DevOps page through an override.
 */
router.put(
  "/users/:id/permissions",
  authorize({ permission: "admin.permission.grant" }),
  validate(setUserPermissionsSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const { grants, reason } = req.body as z.infer<typeof setUserPermissionsSchema>;
      const actor = req.access!;

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError("User not found");

      const denies = grants.filter((g) => g.effect === "deny");
      if (denies.length && !actor.isSuperAdmin) {
        throw new ForbiddenError("Only the super administrator may deny permissions");
      }
      assertNoGrantEscalation(
        actor,
        grants.filter((g) => g.effect === "allow").map((g) => g.name)
      );

      const rows = await prisma.permission.findMany({
        where: { name: { in: grants.map((g) => g.name) } },
        select: { id: true, name: true },
      });
      const unknown = grants.map((g) => g.name).filter((n) => !rows.some((r) => r.name === n));
      if (unknown.length) throw new AppError(400, `Unknown permissions: ${unknown.join(", ")}`);
      const idByName = new Map(rows.map((r) => [r.name, r.id]));

      const keep = grants.filter((g) => g.effect !== "inherit");
      const cleared = grants.filter((g) => g.effect === "inherit");

      await prisma.$transaction(async (tx) => {
        if (cleared.length) {
          await tx.modelHasPermission.deleteMany({
            where: {
              modelId: userId,
              modelType: MODEL_USER,
              permissionId: { in: cleared.map((g) => idByName.get(g.name)!) },
            },
          });
        }
        // Replace semantics for the ones being set.
        if (keep.length) {
          await tx.modelHasPermission.deleteMany({
            where: {
              modelId: userId,
              modelType: MODEL_USER,
              permissionId: { in: keep.map((g) => idByName.get(g.name)!) },
            },
          });
          await tx.modelHasPermission.createMany({
            data: keep.map((g) => ({
              modelId: userId,
              modelType: MODEL_USER,
              permissionId: idByName.get(g.name)!,
              effect: g.effect,
              scope: g.scope ?? "all",
            })),
          });
        }
      });

      await logActivity({
        logName: "access",
        description: `Direct permissions changed for ${target.email}`,
        subjectType: "App\\Models\\User",
        subjectId: userId,
        event: "user.permissions.updated",
        causerId: req.user!.id,
        properties: { grants, reason },
      });

      res.json({ success: true, message: "Direct permissions updated" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Resolved effective access ───────────────────────────────────────────────

/**
 * GET /api/admin/access/users/:id/effective
 * The resolver's full output — every permission, its effective scope, every
 * source and any deny. This is what the Effective Access tab renders.
 */
router.get(
  "/users/:id/effective",
  authorize({ permission: "admin.role.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError("User not found");

      const access = await resolveAccess(userId);
      res.json({
        success: true,
        data: {
          user: { id: target.id, name: target.name, email: target.email },
          ...serialiseAccess(access),
          permissionCount: permissionNames(access).length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/access/preview
 * Dry-run the resolver for a hypothetical change: what would this user gain or
 * lose? Used by the assignment preview before any save.
 */
const previewSchema = z.object({
  addRoles: z.array(z.string()).optional(),
  removeRoles: z.array(z.string()).optional(),
  grants: z
    .array(
      z.object({
        name: z.string(),
        effect: z.enum(["allow", "deny", "inherit"]),
        scope: SCOPE_ENUM.optional(),
      })
    )
    .optional(),
});

router.post(
  "/users/:id/preview",
  authorize({ permission: "admin.role.manage" }),
  validate(previewSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const { addRoles = [], removeRoles = [], grants = [] } = req.body as z.infer<
        typeof previewSchema
      >;

      const current = await resolveAccess(userId);
      const before = new Set(permissionNames(current));

      // Simulate by diffing role grant sets rather than mutating the database.
      const addedRoleRows = addRoles.length
        ? await prisma.role.findMany({
            where: { name: { in: addRoles } },
            include: { permissions: { include: { permission: true } } },
          })
        : [];
      const removedRoleRows = removeRoles.length
        ? await prisma.role.findMany({
            where: { name: { in: removeRoles } },
            include: { permissions: { include: { permission: true } } },
          })
        : [];

      const hypothetical = new Map<string, ResolvedPermission>(
        Object.entries(current.permissions)
      );
      for (const role of removedRoleRows) {
        for (const rhp of role.permissions) {
          const stillHeld = current.roles
            .filter((r) => !removeRoles.includes(r.name))
            .some((r) => r.permissions.includes(rhp.permission.name));
          if (!stillHeld) hypothetical.delete(rhp.permission.name);
        }
      }
      for (const role of addedRoleRows) {
        for (const rhp of role.permissions) {
          if (!hypothetical.has(rhp.permission.name)) {
            hypothetical.set(rhp.permission.name, {
              name: rhp.permission.name,
              scope: normaliseScope(rhp.scope),
              sources: [{ type: "role", id: role.id, name: role.name, scope: normaliseScope(rhp.scope) }],
              denied: false,
              widened: false,
            });
          }
        }
      }
      for (const grant of grants) {
        const existing = hypothetical.get(grant.name);
        if (grant.effect === "deny") {
          if (existing) {
            hypothetical.set(grant.name, { ...existing, denied: true });
          }
        } else if (grant.effect === "inherit") {
          // Clearing an override: drop the direct source. What remains is
          // whatever the roles grant — possibly nothing at all.
          if (existing) {
            const roleSources = existing.sources.filter((s) => s.type === "role");
            if (roleSources.length === 0) {
              hypothetical.delete(grant.name);
            } else {
              const scope = roleSources.reduce<PermissionScope>(
                (widest, s) =>
                  scopeRank(s.scope) > scopeRank(widest) ? s.scope : widest,
                "self"
              );
              hypothetical.set(grant.name, {
                ...existing,
                scope,
                denied: false,
                sources: roleSources,
              });
            }
          }
        } else if (!existing) {
          hypothetical.set(grant.name, {
            name: grant.name,
            scope: normaliseScope(grant.scope),
            sources: [{ type: "direct", id: 0, name: "Direct grant", scope: normaliseScope(grant.scope) }],
            denied: false,
            widened: false,
          });
        }
      }

      const after = new Set(
        [...hypothetical.values()].filter((p) => !p.denied).map((p) => p.name)
      );

      res.json({
        success: true,
        data: {
          gained: [...after].filter((n) => !before.has(n)).sort(),
          lost: [...before].filter((n) => !after.has(n)).sort(),
          unchanged: [...after].filter((n) => before.has(n)).length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── Whole-page payload ───────────────────────────────────────────────────────

/**
 * GET /api/admin/access/matrix
 * One request for the entire Access Control page: roles with grants, the
 * catalog, and the super-admin holder.
 */
router.get(
  "/matrix",
  authorize({ permission: "admin.role.view" }),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: [{ level: "desc" }, { name: "asc" }],
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { modelHasRoles: true } },
        },
      });

      const superAdminRole = roles.find((r) => r.name === "super-admin");
      const holder = superAdminRole
        ? await prisma.modelHasRole.findFirst({
            where: { roleId: superAdminRole.id, modelType: MODEL_USER },
            include: { role: false as never },
          })
        : null;
      const holderUser = holder
        ? await prisma.user.findUnique({
            where: { id: holder.modelId },
            select: { id: true, name: true, email: true },
          })
        : null;

      res.json({
        success: true,
        data: {
          groups: PERMISSION_GROUPS.map((group) => {
            const permissions = PERMISSION_CATALOG.filter((perm) => perm.group === group);
            if (!permissions.length) return null;
            return {
              group,
              permissions: permissions.map((perm) => ({
                name: perm.name,
                description: perm.description,
                isDangerous: perm.isDangerous ?? false,
                supportsScope: perm.supportsScope ?? true,
              })),
            };
          }).filter(Boolean),
          roles: roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description,
            level: role.level,
            color: role.color,
            isSystem: role.isSystem,
            isAssignable: role.isAssignable,
            holderCount: role._count.modelHasRoles,
            grants: Object.fromEntries(role.permissions.map((p) => [p.permission.name, p.scope])),
          })),
          superAdmin: holderUser,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── Super-admin transfer ────────────────────────────────────────────────────

const transferSchema = z.object({
  userId: z.number().int().positive(),
  /** Must equal the target's email — prevents a mis-click from transferring. */
  confirmEmail: z.string().email(),
  reason: z.string().min(3).max(500),
});

/**
 * POST /api/admin/access/super-admin/transfer
 * The only way to move the super-admin role. Revokes from the current holder
 * and assigns to the target in a single transaction; the invariant of exactly
 * one holder is preserved throughout.
 */
router.post(
  "/super-admin/transfer",
  superAdminOnly,
  validate(transferSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { userId, confirmEmail, reason } = req.body as z.infer<typeof transferSchema>;

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError("Target user not found");
      if (target.email !== confirmEmail) {
        throw new AppError(400, "Confirmation email does not match the selected user");
      }
      if (target.id === req.user!.id) {
        throw new AppError(400, "You already hold the super administrator role");
      }

      const { role, current } = await assertOneSuperAdminTransferPossible(userId);
      if (!current) throw new AppError(409, "No current super administrator — data is inconsistent");

      await prisma.$transaction(async (tx) => {
        await tx.modelHasRole.deleteMany({
          where: { roleId: role.id, modelType: MODEL_USER },
        });
        await tx.modelHasRole.create({
          data: { roleId: role.id, modelType: MODEL_USER, modelId: userId },
        });
      });

      // Re-assert the invariant rather than trust the transaction.
      const holders = await prisma.modelHasRole.count({
        where: { roleId: role.id, modelType: MODEL_USER },
      });
      if (holders !== 1) {
        throw new AppError(500, `Transfer left ${holders} super administrators — aborted`);
      }

      await logActivity({
        logName: "access",
        description: `Super administrator transferred to ${target.email}`,
        subjectType: "App\\Models\\User",
        subjectId: userId,
        event: "superadmin.transferred",
        causerId: req.user!.id,
        properties: { from: current.modelId, to: userId, reason },
      });

      res.json({
        success: true,
        message: `Super administrator transferred to ${target.email}`,
        data: { userId },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
