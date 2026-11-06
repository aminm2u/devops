import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../rbac/authorize.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, AppError, ForbiddenError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { sendWelcomeEmail } from "../services/notification.service.js";
import { MODEL_USER } from "../rbac/effective.js";
import { assertNoManagerCycle, managerChain } from "../lib/org.js";
import { EMPLOYEE_REF_TYPE, generateReferenceNumber } from "../lib/numberGenerator.js";

const router = Router();

// ---------------------------------------------------------------------------
// Directory API — the "digital employee" record.
//
// Guards are capability-based (`hr.*`), not role-based, so the HR Manager role
// inherits these routes without this file naming it. Anyone the super admin
// grants `hr.user.manage` to gets the same behaviour.
// ---------------------------------------------------------------------------

// GET /api/admin/users/list — lightweight picker used by owner/assignee selects.
// Open to any authenticated user: it returns names only, and half the app's
// forms need to populate a person dropdown.
router.get(
  "/users/list",
  authenticate,
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      });
      res.status(200).json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  }
);

const createUserSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  /** Roles to assign on creation. Defaults to `employee`. Never super-admin. */
  roles: z.array(z.string()).optional(),
  employeeId: z.string().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  unitId: z.number().int().positive().optional().nullable(),
  positionId: z.number().int().positive().optional().nullable(),
  employmentTypeId: z.number().int().positive().optional().nullable(),
  directManagerId: z.number().int().positive().optional().nullable(),
  joinDate: z.string().datetime().optional().nullable(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
  isActive: z.boolean().optional(),
  employeeId: z.string().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  unitId: z.number().int().positive().optional().nullable(),
  positionId: z.number().int().positive().optional().nullable(),
  employmentTypeId: z.number().int().positive().optional().nullable(),
  directManagerId: z.number().int().positive().optional().nullable(),
  joinDate: z.string().datetime().optional().nullable(),
});

/**
 * Keep a person's unit and department agreeing.
 *
 * A unit exists only inside one department, so `users.unit_id` and
 * `users.department_id` have to name the same place. Two rules follow:
 *
 *  - Choosing a unit implies its department. The form sends both, but sending
 *    only `unitId` must not leave the pair half-applied.
 *  - Choosing a department other than the unit's clears the unit. Leaving it
 *    would show somebody in Finance while their unit still says IT.
 *
 * Returns the two ids to write. A null unit is always allowed.
 */
async function resolveUnitAssignment(input: {
  departmentId: number | null | undefined;
  unitId: number | null | undefined;
  currentDepartmentId: number | null;
  currentUnitId: number | null;
}): Promise<{ departmentId: number | null | undefined; unitId: number | null | undefined }> {
  const { departmentId, unitId } = input;

  if (unitId) {
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: { departmentId: true, name: true },
    });
    if (!unit) throw new AppError(400, "Unit not found");

    if (departmentId !== undefined && departmentId !== null && departmentId !== unit.departmentId) {
      throw new AppError(400, "That unit belongs to a different department");
    }
    return { departmentId: unit.departmentId, unitId };
  }

  // Explicitly clearing the unit.
  if (unitId === null) return { departmentId, unitId: null };

  // No unit in the payload: switching department drops a unit from the old one.
  if (departmentId !== undefined && departmentId !== input.currentDepartmentId) {
    return { departmentId, unitId: null };
  }

  return { departmentId, unitId };
}

/** The super-admin account must survive every directory operation. */
async function isSoleSuperAdmin(userId: number): Promise<boolean> {
  const role = await prisma.role.findUnique({ where: { name: "super-admin" } });
  if (!role) return false;
  const holder = await prisma.modelHasRole.findFirst({
    where: { roleId: role.id, modelType: MODEL_USER },
  });
  return holder?.modelId === userId;
}

/**
 * Issue the next employee number.
 *
 * The counter is shared with the imported numbers already in the table, which
 * were typed by hand ("EMP-001", "M2U100") rather than generated. The first
 * generated number therefore starts from the configured counter — an admin sets
 * it on Settings → Numbering to land above whatever the legacy set already
 * uses. `employee_id` is unique, so a collision surfaces as a 409 from the
 * generator loop rather than silently overwriting somebody's number.
 */
async function issueEmployeeNumber(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = await generateReferenceNumber(EMPLOYEE_REF_TYPE);
    const clash = await prisma.user.findUnique({ where: { employeeId: candidate } });
    if (!clash) return candidate;
  }
  throw new AppError(
    409,
    "Could not issue a unique employee number — raise the counter in Settings → Numbering"
  );
}

// GET /api/admin/users — paginated directory with roles, department, manager.
router.get(
  "/users",
  authenticate,
  authorize({ permission: "hr.user.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { search, page = "1", limit = "20", departmentId, roleId, status } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const where: Record<string, unknown> = {};
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
          { employeeId: { contains: search as string, mode: "insensitive" } },
        ];
      }
      if (departmentId) where.departmentId = Number(departmentId);
      if (status === "active") where.isActive = true;
      if (status === "inactive") where.isActive = false;
      if (roleId) {
        where.id = {
          in: (
            await prisma.modelHasRole.findMany({
              where: { roleId: Number(roleId), modelType: MODEL_USER },
              select: { modelId: true },
            })
          ).map((r) => r.modelId),
        };
      }

      const [rawUsers, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            isActive: true,
            emailVerifiedAt: true,
            joinDate: true,
            createdAt: true,
            department: { select: { id: true, name: true, code: true } },
            unit: { select: { id: true, name: true, code: true } },
            position: { select: { id: true, name: true } },
            employmentType: { select: { id: true, name: true } },
            directManager: { select: { id: true, name: true } },
          },
          orderBy: { name: "asc" },
          skip,
          take: limitNum,
        }),
        prisma.user.count({ where }),
      ]);

      // One query for every role on the page, then group in memory. The previous
      // implementation issued one query per user (N+1) and stalled at ~100 rows.
      const ids = rawUsers.map((u) => u.id);
      const assignments = ids.length
        ? await prisma.modelHasRole.findMany({
            where: { modelId: { in: ids }, modelType: MODEL_USER },
            include: { role: { select: { id: true, name: true, level: true, color: true } } },
          })
        : [];
      const rolesByUser = new Map<number, { id: number; name: string; level: number; color: string | null }[]>();
      for (const assignment of assignments) {
        const bucket = rolesByUser.get(assignment.modelId) ?? [];
        bucket.push(assignment.role);
        rolesByUser.set(assignment.modelId, bucket);
      }

      const teams = ids.length
        ? await prisma.teamMember.findMany({
            where: { userId: { in: ids }, isActive: true },
            include: { team: { select: { id: true, name: true, type: true } } },
          })
        : [];
      const teamsByUser = new Map<number, { id: number; name: string; type: string }[]>();
      for (const membership of teams) {
        const bucket = teamsByUser.get(membership.userId) ?? [];
        bucket.push(membership.team);
        teamsByUser.set(membership.userId, bucket);
      }

      const users = rawUsers.map((user) => ({
        ...user,
        roles: (rolesByUser.get(user.id) ?? []).sort((a, b) => b.level - a.level),
        teams: teamsByUser.get(user.id) ?? [],
      }));

      res.status(200).json({
        success: true,
        data: users,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Users retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/admin/users/:id — one employee with their full employment picture.
router.get(
  "/users/:id",
  authenticate,
  authorize({ permission: "hr.user.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(userId)) throw new AppError(400, "Invalid user id");

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          employeeId: true,
          isActive: true,
          emailVerifiedAt: true,
          joinDate: true,
          createdAt: true,
          updatedAt: true,
          departmentId: true,
          unitId: true,
          positionId: true,
          employmentTypeId: true,
          directManagerId: true,
          department: { select: { id: true, name: true, code: true } },
          unit: { select: { id: true, name: true, code: true } },
          position: { select: { id: true, name: true, gradeLevel: true } },
          employmentType: { select: { id: true, name: true } },
          directManager: { select: { id: true, name: true, email: true } },
          subordinates: { select: { id: true, name: true, email: true } },
        },
      });
      if (!user) throw new NotFoundError("User not found");

      const [roles, directPermissions, teams, chain] = await Promise.all([
        prisma.modelHasRole.findMany({
          where: { modelId: userId, modelType: MODEL_USER },
          include: { role: { select: { id: true, name: true, level: true, color: true, isSystem: true } } },
        }),
        prisma.modelHasPermission.findMany({
          where: { modelId: userId, modelType: MODEL_USER },
          include: { permission: { select: { name: true, group: true } } },
        }),
        prisma.teamMember.findMany({
          where: { userId, isActive: true },
          include: { team: { select: { id: true, name: true, type: true } } },
        }),
        managerChain(userId),
      ]);

      res.status(200).json({
        success: true,
        data: {
          ...user,
          roles: roles.map((r) => ({ ...r.role, assignedAt: null })),
          directPermissions: directPermissions.map((p) => ({
            name: p.permission.name,
            group: p.permission.group,
            effect: p.effect,
            scope: p.scope,
          })),
          teams: teams.map((t) => ({ ...t.team, teamRole: t.teamRole })),
          managerChain: chain,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/users — create a digital employee.
router.post(
  "/users",
  authenticate,
  authorize({ permission: "hr.user.create" }),
  validate(createUserSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const body = req.body as z.infer<typeof createUserSchema>;
      const {
        name,
        email,
        password,
        roles,
        employeeId,
        departmentId,
        unitId,
        positionId,
        employmentTypeId,
        directManagerId,
        joinDate,
      } = body;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new AppError(400, "A user with this email already exists");

      if (directManagerId) {
        const manager = await prisma.user.findUnique({ where: { id: directManagerId } });
        if (!manager) throw new AppError(400, "Reporting manager not found");
      }

      const placement = await resolveUnitAssignment({
        departmentId,
        unitId,
        currentDepartmentId: null,
        currentUnitId: null,
      });

      const requestedRoles = roles?.length ? roles : ["employee"];
      if (requestedRoles.includes("super-admin")) {
        throw new ForbiddenError("The super administrator role cannot be assigned at creation");
      }
      const roleRecords = await prisma.role.findMany({ where: { name: { in: requestedRoles } } });
      const unknown = requestedRoles.filter((r) => !roleRecords.some((rec) => rec.name === r));
      if (unknown.length) throw new AppError(400, `Unknown roles: ${unknown.join(", ")}`);

      // Escalation guard: an actor may only hand out roles below their own level.
      if (!req.access!.isSuperAdmin) {
        const tooHigh = roleRecords.filter((role) => role.level >= req.access!.level);
        if (tooHigh.length) {
          throw new ForbiddenError(
            `You cannot assign roles at or above your own level: ${tooHigh.map((r) => r.name).join(", ")}`
          );
        }
      }

      // Employee numbers are issued here, not typed by the caller: two HR
      // admins adding people at the same moment must not pick the same number,
      // and the format is a setting (Settings → Numbering). A caller-supplied
      // value is still honoured — imports carry legacy numbers — but the field
      // is read-only in the UI, so in practice this is the generator's output.
      const issuedEmployeeId = employeeId?.trim() || (await issueEmployeeNumber());

      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name,
            email,
            password: await bcrypt.hash(password, 12),
            employeeId: issuedEmployeeId,
            departmentId: placement.departmentId ?? null,
            unitId: placement.unitId ?? null,
            positionId: positionId ?? null,
            employmentTypeId: employmentTypeId ?? null,
            directManagerId: directManagerId ?? null,
            joinDate: joinDate ? new Date(joinDate) : null,
            emailVerifiedAt: new Date(),
          },
        });
        await tx.modelHasRole.createMany({
          data: roleRecords.map((role) => ({
            roleId: role.id,
            modelType: MODEL_USER,
            modelId: created.id,
          })),
        });
        await tx.notificationPreference.create({
          data: { userId: created.id, email: true, inApp: true, sound: true },
        });
        return created;
      });

      await logActivity({
        description: `Employee "${user.name}" created`,
        subjectType: "App\\Models\\User",
        subjectId: user.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: { name: user.name, email: user.email, roles: requestedRoles } },
      });

      sendWelcomeEmail({ id: user.id, name: user.name, email: user.email }).catch((err) =>
        console.error("[Email] Welcome email failed:", err)
      );

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: requestedRoles,
        },
        message: "User created successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/admin/users/:id — update the employment record.
//
// Role changes are deliberately NOT handled here: they live on
// PUT /admin/access/users/:id/roles so a directory edit can never silently
// rewrite someone's access. The old `role` field did exactly that.
router.put(
  "/users/:id",
  authenticate,
  authorize({ permission: "hr.user.manage" }),
  validate(updateUserSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id as string, 10);
      const body = req.body as z.infer<typeof updateUserSchema>;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("User not found");

      if (body.email && body.email !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email: body.email } });
        if (existing) throw new AppError(400, "A user with this email already exists");
      }

      // The platform owner must stay reachable and report to nobody.
      if (await isSoleSuperAdmin(userId)) {
        if (body.isActive === false) {
          throw new ForbiddenError("The super administrator account cannot be deactivated");
        }
        if (body.directManagerId) {
          throw new ForbiddenError("The super administrator cannot report to another employee");
        }
      }

      if (body.directManagerId !== undefined) {
        await assertNoManagerCycle(userId, body.directManagerId ?? null);
      }

      // Placement is resolved as a pair: a unit drags its department with it,
      // and switching department drops a unit that belonged to the old one.
      const placement = await resolveUnitAssignment({
        departmentId: body.departmentId,
        unitId: body.unitId,
        currentDepartmentId: user.departmentId,
        currentUnitId: user.unitId,
      });

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.email !== undefined) data.email = body.email;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (body.password) data.password = await bcrypt.hash(body.password, 12);
      if (body.employeeId !== undefined) data.employeeId = body.employeeId;
      if (placement.departmentId !== undefined) data.departmentId = placement.departmentId;
      if (placement.unitId !== undefined) data.unitId = placement.unitId;
      if (body.positionId !== undefined) data.positionId = body.positionId;
      if (body.employmentTypeId !== undefined) data.employmentTypeId = body.employmentTypeId;
      if (body.directManagerId !== undefined) data.directManagerId = body.directManagerId;
      if (body.joinDate !== undefined) {
        data.joinDate = body.joinDate ? new Date(body.joinDate) : null;
      }

      const updated = await prisma.user.update({ where: { id: userId }, data });

      // Note which fields changed, without recording the password value.
      const changed = Object.keys(data).filter((key) => key !== "password");
      if (data.password) changed.push("password");

      await logActivity({
        description: `Employee "${updated.name}" updated`,
        subjectType: "App\\Models\\User",
        subjectId: user.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { changed },
      });

      res.status(200).json({
        success: true,
        data: { id: updated.id, name: updated.name, email: updated.email },
        message: "User updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/admin/users/:id/employee-number — issue a number to someone who
// has none.
//
// Numbers are issued automatically at creation, but two kinds of account reach
// the directory without passing through that route: self-registered users
// (`auth.service.register`) and anyone imported before this feature existed.
// Without this endpoint their Employee ID would read "Not issued" forever —
// a row nobody can fix from the UI.
router.post(
  "/users/:id/employee-number",
  authenticate,
  authorize({ permission: "hr.user.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(userId)) throw new AppError(400, "Invalid user id");

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("User not found");
      if (user.employeeId) {
        throw new AppError(409, `${user.name} already has employee number ${user.employeeId}`);
      }

      const employeeId = await issueEmployeeNumber();
      // Conditional write: if two admins press the button at once, the second
      // update matches no row rather than overwriting the first number.
      const { count } = await prisma.user.updateMany({
        where: { id: userId, employeeId: null },
        data: { employeeId },
      });
      if (count === 0) throw new AppError(409, "An employee number was issued concurrently");

      await logActivity({
        description: `Employee number ${employeeId} issued to "${user.name}"`,
        subjectType: "App\\Models\\User",
        subjectId: userId,
        event: "updated",
        causerId: req.user!.id,
        properties: { changed: ["employeeId"], employeeId },
      });

      res.status(200).json({
        success: true,
        data: { id: userId, employeeId },
        message: "Employee number issued",
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/admin/users/:id
router.delete(
  "/users/:id",
  authenticate,
  authorize({ permission: "hr.user.delete" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id as string, 10);

      if (userId === req.user!.id) {
        throw new AppError(400, "You cannot delete your own account");
      }
      if (await isSoleSuperAdmin(userId)) {
        throw new ForbiddenError(
          "The super administrator cannot be deleted — transfer the role first"
        );
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("User not found");

      const reports = await prisma.user.count({ where: { directManagerId: userId } });
      if (reports > 0) {
        throw new AppError(
          409,
          `${reports} employee(s) still report to ${user.name} — reassign their manager first`
        );
      }

      await prisma.modelHasRole.deleteMany({ where: { modelType: MODEL_USER, modelId: userId } });
      await prisma.modelHasPermission.deleteMany({ where: { modelType: MODEL_USER, modelId: userId } });
      await prisma.user.delete({ where: { id: userId } });

      await logActivity({
        description: `Employee "${user.name}" deleted`,
        subjectType: "App\\Models\\User",
        subjectId: userId,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: { name: user.name, email: user.email } },
      });

      res.status(200).json({
        success: true,
        data: { id: userId },
        message: "User deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Role assignment — kept for backwards compatibility with the old Users page.
//
// Additive only. Replacing was the bug that made multi-role impossible: adding
// a second role silently dropped the first. Use
// PUT /admin/access/users/:id/roles for full add/remove control.
// ---------------------------------------------------------------------------

router.post(
  "/users/:id/roles",
  authenticate,
  authorize({ permission: "admin.role.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id as string, 10);
      const { role } = req.body as { role?: string };
      if (!role) throw new AppError(400, "Role is required");
      if (role === "super-admin") {
        throw new ForbiddenError(
          "The super administrator role can only be moved with the transfer action"
        );
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("User not found");

      const roleRecord = await prisma.role.findUnique({ where: { name: role } });
      if (!roleRecord) throw new AppError(400, "Invalid role");

      if (!req.access!.isSuperAdmin && roleRecord.level >= req.access!.level) {
        throw new ForbiddenError("You cannot assign a role at or above your own level");
      }

      await prisma.modelHasRole.createMany({
        data: [{ roleId: roleRecord.id, modelType: MODEL_USER, modelId: user.id }],
        skipDuplicates: true,
      });

      await logActivity({
        description: `Role "${role}" added to "${user.name}"`,
        subjectType: "App\\Models\\User",
        subjectId: user.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { added: role },
      });

      const roles = await prisma.modelHasRole.findMany({
        where: { modelId: user.id, modelType: MODEL_USER },
        include: { role: { select: { name: true } } },
      });

      res.status(200).json({
        success: true,
        data: { userId: user.id, roles: roles.map((r) => r.role.name) },
        message: "Role added successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/users/:id/roles/:roleName",
  authenticate,
  authorize({ permission: "admin.role.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id as string, 10);
      const roleName = req.params.roleName as string;

      if (roleName === "super-admin") {
        throw new ForbiddenError(
          "The super administrator role can only be moved with the transfer action"
        );
      }

      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) throw new NotFoundError("Role not found");

      const remaining = await prisma.modelHasRole.findMany({
        where: { modelId: userId, modelType: MODEL_USER },
        include: { role: { select: { name: true } } },
      });
      if (remaining.length <= 1) {
        throw new AppError(409, "A user must keep at least one role");
      }

      await prisma.modelHasRole.deleteMany({
        where: { modelId: userId, modelType: MODEL_USER, roleId: role.id },
      });

      await logActivity({
        description: `Role "${roleName}" removed from user #${userId}`,
        subjectType: "App\\Models\\User",
        subjectId: userId,
        event: "updated",
        causerId: req.user!.id,
        properties: { removed: roleName },
      });

      res.status(200).json({ success: true, message: "Role removed" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
