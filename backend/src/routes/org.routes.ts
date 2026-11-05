import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../rbac/authorize.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { AppError, NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import { MODEL_USER } from "../rbac/effective.js";
import prisma from "../config/database.js";
import {
  assertNoDepartmentCycle,
  assertNoManagerCycle,
  loadOrgTree,
  managerChain,
} from "../lib/org.js";

const router = Router();

router.use(authenticate);

// ---------------------------------------------------------------------------
// Org structure.
//
// Two things are modelled here and nowhere else:
//   * the reporting line — `users.direct_manager_id`
//   * the department tree — `departments.parent_id`
//
// Both are single-parent graphs, and both endpoints refuse writes that would
// close a loop. Reading the chart needs only `hr.org.view`; changing it needs
// `hr.org.manage`.
// ---------------------------------------------------------------------------

/** GET /api/org/tree — the whole chart as one flat, renderable payload. */
router.get(
  "/tree",
  authorize({ permission: "hr.org.view" }),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({ success: true, data: await loadOrgTree() });
    } catch (error) {
      next(error);
    }
  }
);

/** GET /api/org/users/:id/chain — everyone above this person, nearest first. */
router.get(
  "/users/:id/chain",
  authorize({ permission: "hr.org.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isFinite(userId)) throw new AppError(400, "Invalid user id");

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("User not found");

      res.status(200).json({
        success: true,
        data: { user: { id: user.id, name: user.name }, chain: await managerChain(userId) },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── Reporting line ──────────────────────────────────────────────────────────

const managerSchema = z.object({
  managerId: z.number().int().positive().nullable(),
});

/**
 * PUT /api/org/users/:id/manager
 * Set or clear one person's manager. This is what the org chart's drag-and-drop
 * calls, and what the user detail page uses for the "reports to" field.
 */
router.put(
  "/users/:id/manager",
  authorize({ permission: "hr.org.manage" }),
  validate(managerSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const { managerId } = req.body as z.infer<typeof managerSchema>;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError("User not found");

      if (managerId !== null) {
        const manager = await prisma.user.findUnique({ where: { id: managerId } });
        if (!manager) throw new NotFoundError("Manager not found");
      }

      // The platform owner reports to nobody — moving them would create a
      // second peak in the chart and break the "one root" expectation.
      const superAdminRole = await prisma.role.findUnique({ where: { name: "super-admin" } });
      if (superAdminRole) {
        const holder = await prisma.modelHasRole.findFirst({
          where: { roleId: superAdminRole.id, modelType: MODEL_USER },
        });
        if (holder?.modelId === userId && managerId !== null) {
          throw new AppError(422, "The super administrator cannot report to another employee");
        }
      }

      await assertNoManagerCycle(userId, managerId);

      await prisma.user.update({ where: { id: userId }, data: { directManagerId: managerId } });

      await logActivity({
        description: managerId
          ? `"${user.name}" now reports to user #${managerId}`
          : `"${user.name}" no longer has a manager`,
        subjectType: "User",
        subjectId: userId,
        event: "updated",
        causerId: req.user!.id,
        properties: { directManagerId: managerId },
      });

      res.status(200).json({
        success: true,
        data: { userId, directManagerId: managerId },
        message: "Reporting line updated",
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── Departments ─────────────────────────────────────────────────────────────

const departmentSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(16)
    .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers and hyphens"),
  name: z.string().min(2).max(120),
  parentId: z.number().int().positive().nullable().optional(),
  managerId: z.number().int().positive().nullable().optional(),
});

/**
 * Refuse a name that already exists, even under a different code.
 *
 * The department tree is seeded from the `division` reference data, so the
 * usual mistake is re-typing "Information Technology" as code `IT-DEPT` when
 * `IT` already exists. Matching on the name is what catches that; the code
 * uniqueness check above only catches the exact-key case.
 */
async function assertUniqueDepartmentName(name: string, exceptId?: number) {
  const clash = await prisma.department.findFirst({
    where: {
      name: { equals: name.trim(), mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
  if (clash) {
    throw new AppError(
      409,
      `A department named "${clash.name}" already exists (code ${clash.code}) — use it instead of creating a duplicate`
    );
  }
}

/** POST /api/org/departments */
router.post(
  "/departments",
  authorize({ permission: "hr.org.manage" }),
  validate(departmentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const body = req.body as z.infer<typeof departmentSchema>;

      const existing = await prisma.department.findUnique({ where: { code: body.code } });
      if (existing) throw new AppError(409, `Department code "${body.code}" is already in use`);
      await assertUniqueDepartmentName(body.name);

      if (body.parentId) {
        const parent = await prisma.department.findUnique({ where: { id: body.parentId } });
        if (!parent) throw new NotFoundError("Parent department not found");
      }
      if (body.managerId) {
        const manager = await prisma.user.findUnique({ where: { id: body.managerId } });
        if (!manager) throw new NotFoundError("Manager not found");
      }

      const department = await prisma.department.create({
        data: {
          code: body.code,
          name: body.name,
          parentId: body.parentId ?? null,
          managerId: body.managerId ?? null,
        },
      });

      await logActivity({
        description: `Department "${department.name}" created`,
        subjectType: "Department",
        subjectId: department.id,
        event: "created",
        causerId: req.user!.id,
      });

      res.status(201).json({ success: true, data: department });
    } catch (error) {
      next(error);
    }
  }
);

/** PUT /api/org/departments/:id */
router.put(
  "/departments/:id",
  authorize({ permission: "hr.org.manage" }),
  validate(departmentSchema.partial()),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const departmentId = Number(req.params.id);
      const body = req.body as Partial<z.infer<typeof departmentSchema>>;

      const department = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!department) throw new NotFoundError("Department not found");

      if (body.code && body.code !== department.code) {
        const clash = await prisma.department.findUnique({ where: { code: body.code } });
        if (clash) throw new AppError(409, `Department code "${body.code}" is already in use`);
      }
      if (body.name && body.name.trim().toLowerCase() !== department.name.toLowerCase()) {
        await assertUniqueDepartmentName(body.name, departmentId);
      }
      if (body.parentId !== undefined) {
        await assertNoDepartmentCycle(departmentId, body.parentId ?? null);
      }
      if (body.managerId) {
        const manager = await prisma.user.findUnique({ where: { id: body.managerId } });
        if (!manager) throw new NotFoundError("Manager not found");
      }

      const updated = await prisma.department.update({
        where: { id: departmentId },
        data: {
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
          ...(body.managerId !== undefined ? { managerId: body.managerId } : {}),
        },
      });

      await logActivity({
        description: `Department "${updated.name}" updated`,
        subjectType: "Department",
        subjectId: departmentId,
        event: "updated",
        causerId: req.user!.id,
        properties: { changed: Object.keys(body) },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/org/departments/:id
 * Refused while people or sub-departments still point at it — silently
 * detaching staff would lose the department a person was hired into.
 */
router.delete(
  "/departments/:id",
  authorize({ permission: "hr.org.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const departmentId = Number(req.params.id);
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        include: { _count: { select: { employees: true, children: true } } },
      });
      if (!department) throw new NotFoundError("Department not found");

      if (department._count.employees > 0) {
        throw new AppError(
          409,
          `${department._count.employees} employee(s) still belong to this department`
        );
      }
      if (department._count.children > 0) {
        throw new AppError(
          409,
          `${department._count.children} sub-department(s) still sit under this department`
        );
      }

      await prisma.department.delete({ where: { id: departmentId } });

      await logActivity({
        description: `Department "${department.name}" deleted`,
        subjectType: "Department",
        subjectId: departmentId,
        event: "deleted",
        causerId: req.user!.id,
      });

      res.status(200).json({ success: true, message: "Department deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
