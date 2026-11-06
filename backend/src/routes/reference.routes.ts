import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../rbac/authorize.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { AppError, NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

router.use(authenticate);

// GET /api/references - Get all reference data
router.get(
  "/",
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const [
        departments,
        positions,
        employmentTypes,
        projectTypes,
        projectRoles,
        units,
      ] = await Promise.all([
        prisma.department.findMany({ orderBy: { name: "asc" } }),
        // `_count.employees` is what the Positions admin screen reads to show
        // why a delete will be refused; without it the column is always 0.
        prisma.position.findMany({
          orderBy: { name: "asc" },
          include: { _count: { select: { employees: true } } },
        }),
        prisma.employmentType.findMany({ orderBy: { name: "asc" } }),
        prisma.projectType.findMany({ orderBy: { name: "asc" } }),
        prisma.projectRole.findMany({ orderBy: { name: "asc" } }),
        prisma.unit.findMany({
          orderBy: [{ departmentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
          include: { _count: { select: { employees: true } } },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          departments,
          positions,
          employmentTypes,
          projectTypes,
          projectRoles,
          units,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Positions.
//
// A position is the job title on a person's HR record (`users.position_id`),
// so it has to be a real row rather than free text: renaming "Software
// Engineer" must move everyone holding it in one step, and a typo must not
// silently create a second title nobody reports against.
//
// Guarded by `hr.org.manage` — the same permission that guards departments
// (org.routes.ts), because both are the shape of the org rather than a
// per-person edit.
// ---------------------------------------------------------------------------

/**
 * Grade level is optional, and the column is nullable — but the form cannot
 * express "no grade" through a number input without a sentinel, and an
 * empty string arriving from a cleared field must mean null, not 0.
 */
const gradeLevelSchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.number().int().min(1).max(99).nullable()
);

const positionSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  gradeLevel: gradeLevelSchema.optional(),
});

/**
 * Refuse a name that already exists, case-insensitively.
 *
 * `positions` has no unique constraint on `name` — adding one would fail on any
 * existing duplicate — so the check lives here. Without it the picker fills up
 * with "Team Lead" / "team lead" and nobody can tell which one people hold.
 */
async function assertUniquePositionName(name: string, exceptId?: number) {
  const clash = await prisma.position.findFirst({
    where: {
      name: { equals: name.trim(), mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
  if (clash) {
    throw new AppError(409, `A position named "${clash.name}" already exists — use it instead`);
  }
}

/** POST /api/references/positions */
router.post(
  "/positions",
  authorize({ permission: "hr.org.manage" }),
  validate(positionSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const body = req.body as z.infer<typeof positionSchema>;
      await assertUniquePositionName(body.name);

      const position = await prisma.position.create({
        data: { name: body.name.trim(), gradeLevel: body.gradeLevel ?? null },
      });

      await logActivity({
        description: `Position "${position.name}" created`,
        subjectType: "Position",
        subjectId: position.id,
        event: "created",
        causerId: req.user!.id,
      });

      res.status(201).json({ success: true, data: position });
    } catch (error) {
      next(error);
    }
  }
);

/** PUT /api/references/positions/:id */
router.put(
  "/positions/:id",
  authorize({ permission: "hr.org.manage" }),
  validate(positionSchema.partial()),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const positionId = Number(req.params.id);
      if (!Number.isFinite(positionId)) throw new AppError(400, "Invalid position id");

      const existing = await prisma.position.findUnique({ where: { id: positionId } });
      if (!existing) throw new NotFoundError("Position not found");

      const body = req.body as Partial<z.infer<typeof positionSchema>>;
      if (body.name && body.name.trim() !== existing.name) {
        await assertUniquePositionName(body.name, positionId);
      }

      const position = await prisma.position.update({
        where: { id: positionId },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.gradeLevel !== undefined ? { gradeLevel: body.gradeLevel } : {}),
        },
      });

      await logActivity({
        description: `Position "${existing.name}" updated`,
        subjectType: "Position",
        subjectId: position.id,
        event: "updated",
        causerId: req.user!.id,
      });

      res.status(200).json({ success: true, data: position });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/references/positions/:id
 *
 * Refused while anyone still holds it. `users.position_id` is a plain nullable
 * FK with no cascade, so a delete either fails on the constraint or — worse —
 * leaves people pointing at a row that no longer exists. Counting first lets
 * the message say how many, which is what tells an admin whether to reassign.
 */
router.delete(
  "/positions/:id",
  authorize({ permission: "hr.org.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const positionId = Number(req.params.id);
      if (!Number.isFinite(positionId)) throw new AppError(400, "Invalid position id");

      const position = await prisma.position.findUnique({
        where: { id: positionId },
        include: { _count: { select: { employees: true } } },
      });
      if (!position) throw new NotFoundError("Position not found");

      if (position._count.employees > 0) {
        throw new AppError(
          409,
          `${position._count.employees} employee(s) still hold this position — reassign them first`
        );
      }

      await prisma.position.delete({ where: { id: positionId } });

      await logActivity({
        description: `Position "${position.name}" deleted`,
        subjectType: "Position",
        subjectId: positionId,
        event: "deleted",
        causerId: req.user!.id,
      });

      res.status(200).json({ success: true, message: "Position deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Units.
//
// A unit belongs to exactly one department ("Infrastructure" inside IT), and a
// person may sit in at most one unit. The department link is what makes this a
// table rather than a `reference_data` group: the same unit name can exist in
// two departments, and a department with no units is a normal state.
//
// Guarded by `hr.org.manage` — the same grant that guards departments and
// positions, because a unit is part of the shape of the org rather than a
// per-person edit.
// ---------------------------------------------------------------------------

const unitSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  /** Optional short code — "INFRA" — for reports that have no room for a name. */
  code: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(24).nullable().optional()
  ),
  departmentId: z.number().int().positive(),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * Names must be unique *within* a department, never across the company.
 *
 * Enforced here rather than by the unique index alone so the message can name
 * the department the clash is in — "Operations already exists" is confusing
 * when the duplicate is in a department the admin is not looking at.
 */
async function assertUniqueUnitName(
  departmentId: number,
  name: string,
  exceptId?: number
) {
  const clash = await prisma.unit.findFirst({
    where: {
      departmentId,
      name: { equals: name.trim(), mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    include: { department: { select: { name: true } } },
  });
  if (clash) {
    throw new AppError(
      409,
      `"${clash.name}" already exists in ${clash.department.name} — use it instead`
    );
  }
}

/** POST /api/references/units */
router.post(
  "/units",
  authorize({ permission: "hr.org.manage" }),
  validate(unitSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const body = req.body as z.infer<typeof unitSchema>;

      const department = await prisma.department.findUnique({
        where: { id: body.departmentId },
      });
      if (!department) throw new NotFoundError("Department not found");

      await assertUniqueUnitName(body.departmentId, body.name);

      const unit = await prisma.unit.create({
        data: {
          name: body.name.trim(),
          code: body.code?.trim() || null,
          departmentId: body.departmentId,
          sortOrder: body.sortOrder ?? 0,
        },
      });

      await logActivity({
        description: `Unit "${unit.name}" created in ${department.name}`,
        subjectType: "Unit",
        subjectId: unit.id,
        event: "created",
        causerId: req.user!.id,
      });

      res.status(201).json({ success: true, data: unit });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/references/units/:id
 *
 * Moving a unit to another department is refused while people still sit in it:
 * their `department_id` would then disagree with their unit's, and the record
 * would read as somebody in IT belonging to a Finance unit. Reassign them first
 * — the message says how many.
 */
router.put(
  "/units/:id",
  authorize({ permission: "hr.org.manage" }),
  validate(unitSchema.partial()),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const unitId = Number(req.params.id);
      if (!Number.isFinite(unitId)) throw new AppError(400, "Invalid unit id");

      const existing = await prisma.unit.findUnique({
        where: { id: unitId },
        include: { _count: { select: { employees: true } } },
      });
      if (!existing) throw new NotFoundError("Unit not found");

      const body = req.body as Partial<z.infer<typeof unitSchema>>;
      const departmentId = body.departmentId ?? existing.departmentId;

      if (body.departmentId !== undefined && body.departmentId !== existing.departmentId) {
        if (existing._count.employees > 0) {
          throw new AppError(
            409,
            `${existing._count.employees} employee(s) sit in this unit — move them before moving the unit`
          );
        }
        const department = await prisma.department.findUnique({
          where: { id: body.departmentId },
        });
        if (!department) throw new NotFoundError("Department not found");
      }

      if (body.name && body.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        await assertUniqueUnitName(departmentId, body.name, unitId);
      }

      const unit = await prisma.unit.update({
        where: { id: unitId },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.code !== undefined ? { code: body.code?.trim() || null } : {}),
          ...(body.departmentId !== undefined ? { departmentId: body.departmentId } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        },
      });

      await logActivity({
        description: `Unit "${existing.name}" updated`,
        subjectType: "Unit",
        subjectId: unit.id,
        event: "updated",
        causerId: req.user!.id,
      });

      res.status(200).json({ success: true, data: unit });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/references/units/:id
 *
 * Refused while employees still sit in it. `users.unit_id` is `SetNull`, so a
 * delete would not fail — it would quietly drop the unit from everyone's
 * record. Counting first makes that a decision the admin takes explicitly.
 */
router.delete(
  "/units/:id",
  authorize({ permission: "hr.org.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const unitId = Number(req.params.id);
      if (!Number.isFinite(unitId)) throw new AppError(400, "Invalid unit id");

      const unit = await prisma.unit.findUnique({
        where: { id: unitId },
        include: { _count: { select: { employees: true } } },
      });
      if (!unit) throw new NotFoundError("Unit not found");

      if (unit._count.employees > 0) {
        throw new AppError(
          409,
          `${unit._count.employees} employee(s) still sit in this unit — reassign them first`
        );
      }

      await prisma.unit.delete({ where: { id: unitId } });

      await logActivity({
        description: `Unit "${unit.name}" deleted`,
        subjectType: "Unit",
        subjectId: unitId,
        event: "deleted",
        causerId: req.user!.id,
      });

      res.status(200).json({ success: true, message: "Unit deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;