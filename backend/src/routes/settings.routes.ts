import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { can } from "../rbac/effective.js";
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { EMPLOYEE_REF_TYPE, ensureReferenceConfig, formatReferenceNumber } from "../lib/numberGenerator.js";

const router = Router();

// ── Existing Settings (key-value) ────────────────────────────────────────────

const upsertSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.any(),
  group: z.string().max(50).optional(),
});

const upsertManySchema = z.object({
  settings: z.array(
    z.object({
      key: z.string().min(1).max(100),
      value: z.any(),
      group: z.string().max(50).optional(),
    })
  ),
});

// GET /api/settings - List all settings (or by group)
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { group } = req.query;
      const where: any = {};
      if (group) where.group = group;

      const settings = await prisma.setting.findMany({
        where,
        orderBy: { key: "asc" },
      });

      const data: Record<string, any> = {};
      settings.forEach((s) => {
        data[s.key] = s.value;
      });

      res.status(200).json({
        success: true,
        data,
        message: "Settings retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/settings/:key - Get a single setting
// (registered at the bottom of this file so specific routes like
//  /approval-policies, /numbering and /reference-data are not shadowed)

// PUT /api/settings - Upsert multiple settings at once
router.put(
  "/",
  authenticate,
  requirePermission("admin.settings.manage"),
  validate(upsertManySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { settings } = req.body;

      const upserts = settings.map((s: any) =>
        prisma.setting.upsert({
          where: { key: s.key },
          update: { value: s.value, group: s.group || "general" },
          create: { key: s.key, value: s.value, group: s.group || "general" },
        })
      );

      await prisma.$transaction(upserts);

      await logActivity({
        description: `Settings updated: ${settings.map((s: any) => s.key).join(", ")}`,
        subjectType: "App\\Models\\Setting",
        subjectId: 0,
        event: "updated",
        causerId: req.user!.id,
        properties: { keys: settings.map((s: any) => s.key) },
      });

      res.status(200).json({
        success: true,
        data: null,
        message: "Settings updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/settings/:key - Upsert a single setting
router.put(
  "/:key",
  authenticate,
  requirePermission("admin.settings.manage"),
  validate(upsertSettingSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const key = req.params.key as string;
      const { value, group } = req.body;

      const setting = await prisma.setting.upsert({
        where: { key },
        update: { value, group: group || "general" },
        create: { key, value, group: group || "general" },
      });

      await logActivity({
        description: `Setting "${key}" updated`,
        subjectType: "App\\Models\\Setting",
        subjectId: setting.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { key, value },
      });

      res.status(200).json({
        success: true,
        data: setting.value,
        message: "Setting updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/settings/:key - Delete a setting
router.delete(
  "/:key",
  authenticate,
  requirePermission("admin.settings.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const key = req.params.key as string;
      await prisma.setting.delete({ where: { key } });

      res.status(200).json({
        success: true,
        data: null,
        message: "Setting deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── Reference Data ───────────────────────────────────────────────────────────

/**
 * Which grant writes a given reference-data group.
 *
 * Most groups are plain master data under `admin.settings.manage`. A few are
 * configuration for one module and are edited by that module's own screen:
 * `timesheet_category` is the timesheet category list. Those keep working for
 * whoever holds the module grant, so that moving the editor into the shared
 * Reference Data tab did not take the list away from the people who already
 * had it. `admin.settings.manage` still writes everything.
 */
const GROUP_WRITE_PERMISSION: Record<string, string> = {
  timesheet_category: "timesheet.settings.manage",
};

/**
 * Guard for reference-data writes.
 *
 * Runs after `authenticate`, so `req.access` is populated and the group is
 * already on `req.params.group` (or `req.body` for the reorder route).
 */
function requireReferenceDataWrite(groupFrom: "params" | "body" = "params") {
  return (req: RequestWithUser, _res: Response, next: NextFunction): void => {
    if (!req.user || !req.access) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const raw = groupFrom === "params" ? req.params.group : req.body?.group;
    const modulePermission = typeof raw === "string" ? GROUP_WRITE_PERMISSION[raw] : undefined;

    // `admin.settings.manage` is the default owner of every group; the module
    // grant, when there is one, is an additional way in rather than a
    // replacement.
    if (can(req.access, "admin.settings.manage", "all")) return next();
    if (modulePermission && can(req.access, modulePermission, "all")) return next();

    return next(
      new ForbiddenError(
        modulePermission
          ? `Requires one of the following permissions: admin.settings.manage, ${modulePermission}`
          : "Requires one of the following permissions: admin.settings.manage"
      )
    );
  };
}

const upsertReferenceDataSchema = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  sortOrder: z.number().int().optional(),
  metadata: z.any().optional(),
});

const reorderReferenceDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      sortOrder: z.number().int(),
    })
  ),
});

// GET /api/settings/reference-data/:group - Get reference data by group
//
// `includeInactive=true` is for editors, which have to show the rows they are
// meant to reactivate. Every dropdown omits it and keeps getting only the
// active values — a deactivated category must not reappear in a timesheet form.
router.get(
  "/reference-data/:group",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const group = req.params.group as string;
      const includeInactive = req.query.includeInactive === "true";
      const items = await prisma.referenceData.findMany({
        where: includeInactive ? { group } : { group, isActive: true },
        orderBy: { sortOrder: "asc" },
      });

      res.status(200).json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/settings/reference-data - Get all reference data groups
router.get(
  "/reference-data",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const items = await prisma.referenceData.findMany({
        where: { isActive: true },
        orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
      });

      // Group by group field
      const grouped: Record<string, any[]> = {};
      items.forEach((item) => {
        if (!grouped[item.group]) grouped[item.group] = [];
        grouped[item.group].push(item);
      });

      res.status(200).json({ success: true, data: grouped });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/settings/reference-data/:group - Add reference data item
router.post(
  "/reference-data/:group",
  authenticate,
  requireReferenceDataWrite(),
  validate(upsertReferenceDataSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const group = req.params.group as string;
      const item = await prisma.referenceData.create({
        data: {
          group,
          value: req.body.value,
          label: req.body.label,
          sortOrder: req.body.sortOrder || 0,
          metadata: req.body.metadata || null,
        },
      });

      res.status(201).json({ success: true, data: item, message: "Reference data added" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/settings/reference-data/:group/:id - Update reference data item
//
// `division` is the exception to a plain update: the division entry is the
// authoritative department list, and rows join to departments by
// `departments.code = reference_data.value`. Renaming the label without
// renaming the department row leaves the two describing the same place with
// different words — the Units panel and org chart would keep showing the old
// name. The label is therefore pushed onto the department row in the same
// transaction. The value (the join key) is not editable here, so the link
// cannot be broken by a rename.
router.put(
  "/reference-data/:group/:id",
  authenticate,
  requireReferenceDataWrite(),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const existing = await prisma.referenceData.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: "Reference data not found" });
      }

      const newLabel = req.body.label as string | undefined;
      const labelChanged =
        existing.group === "division" && newLabel !== undefined && newLabel.trim() !== "" && newLabel !== existing.label;

      // Renaming a division renames its department row, whatever the row
      // currently says (the row may have drifted from every previous label) —
      // unless another department already uses the new name, which the org
      // chart treats as a duplicate and refuses on create.
      const renameClash = labelChanged
        ? await prisma.department.findFirst({
            where: { name: { equals: newLabel!.trim(), mode: "insensitive" }, code: { not: existing.value } },
          })
        : null;

      const [, item] = await prisma.$transaction([
        ...(labelChanged && !renameClash
          ? [
              prisma.department.updateMany({
                where: { code: existing.value },
                data: { name: newLabel!.trim() },
              }),
            ]
          : []),
        prisma.referenceData.update({
          where: { id },
          data: {
            ...(req.body.label !== undefined && { label: req.body.label }),
            ...(req.body.sortOrder !== undefined && { sortOrder: req.body.sortOrder }),
            ...(req.body.metadata !== undefined && { metadata: req.body.metadata }),
            ...(req.body.isActive !== undefined && { isActive: req.body.isActive }),
          },
        }),
      ]);

      res.status(200).json({ success: true, data: item, message: "Reference data updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/settings/reference-data/:group/:id - Soft delete reference data
//
// `division` is the exception to the soft-delete: a division entry is the
// authoritative list of departments (the org chart, the unit picker and the
// user department filter all read it), so leaving its Department row alive
// after the entry is removed means the "deleted" department keeps appearing —
// its units keep rendering on the Units panel, its staff keep showing it on
// their records. Removing a division therefore retires the department row too,
// under the same guards the org chart's own delete uses: refused while people
// or sub-departments still point at it. Units are not a guard — a unit is
// detail, not a placement, and it cascades away with its department.
router.delete(
  "/reference-data/:group/:id",
  authenticate,
  requireReferenceDataWrite(),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const item = await prisma.referenceData.findUnique({ where: { id } });

      if (!item) {
        throw new NotFoundError("Reference data not found");
      }
      if (item.group !== req.params.group) {
        throw new AppError(400, "Reference data does not belong to this group");
      }

      if (item.group === "division") {
        const department = await prisma.department.findUnique({
          where: { code: item.value },
          include: { _count: { select: { employees: true, children: true } } },
        });

        if (department) {
          if (department._count.employees > 0) {
            throw new AppError(
              409,
              `Cannot remove "${item.label}": ${department._count.employees} employee(s) still belong to this department. Move them first.`
            );
          }
          if (department._count.children > 0) {
            throw new AppError(
              409,
              `Cannot remove "${item.label}": ${department._count.children} sub-department(s) still sit under it. Remove those first.`
            );
          }

          await prisma.$transaction([
            prisma.referenceData.update({
              where: { id },
              data: { isActive: false },
            }),
            prisma.department.delete({ where: { id: department.id } }),
          ]);
        } else {
          // No department row was ever promoted from this entry (it exists
          // only as reference data) — just soft-delete the entry.
          await prisma.referenceData.update({
            where: { id },
            data: { isActive: false },
          });
        }
      } else {
        await prisma.referenceData.update({
          where: { id },
          data: { isActive: false },
        });
      }

      res.status(200).json({ success: true, message: "Reference data removed" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/settings/reference-data/:group/reorder - Reorder reference data items
router.put(
  "/reference-data/:group/reorder",
  authenticate,
  requireReferenceDataWrite(),
  validate(reorderReferenceDataSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { items } = req.body;

      await prisma.$transaction(
        items.map((item: any) =>
          prisma.referenceData.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          })
        )
      );

      res.status(200).json({ success: true, message: "Reference data reordered" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Reference Number Configuration ───────────────────────────────────────────

const updateNumberingSchema = z.object({
  prefix: z.string().min(1).max(20).optional(),
  separator: z.string().min(1).max(5).optional(),
  yearFormat: z.enum(["YYYY", "YY", "NONE"]).optional(),
  digitPadding: z.number().int().min(3).max(8).optional(),
  currentCounter: z.number().int().min(0).optional(),
});

// GET /api/settings/numbering - List all reference number configs
router.get(
  "/numbering",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      // Employee numbers are issued by the app itself, so their config must
      // exist even on a database seeded before that was true — otherwise the
      // row HR needs to edit is the one row missing from this table.
      await ensureReferenceConfig(EMPLOYEE_REF_TYPE);

      const configs = await prisma.referenceNumberConfig.findMany({
        orderBy: { refType: "asc" },
      });

      // Add computed example for each config — via the generator's own
      // formatter, so the preview cannot drift from what actually gets issued.
      const data = configs.map((c) => ({
        ...c,
        example: formatReferenceNumber(c),
      }));

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/settings/numbering/:refType - Update a reference number config
//
// `procurement.settings.manage` is accepted alongside `admin.settings.manage`
// because that is what the permission is *for* — its catalog description reads
// "Manage approval policies, numbering and reference data" — and because the
// Numbering tab that exposes these fields is itself gated on it. Without this,
// the finance role could open the tab, see nine editable rows and get a 403 on
// every save.
router.put(
  "/numbering/:refType",
  authenticate,
  requirePermission("admin.settings.manage", "procurement.settings.manage"),
  validate(updateNumberingSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const refType = req.params.refType as string;
      const existing = await prisma.referenceNumberConfig.findUnique({
        where: { refType },
      });

      if (!existing) {
        return res.status(404).json({ error: "Reference number config not found" });
      }

      const config = await prisma.referenceNumberConfig.update({
        where: { refType },
        data: req.body,
      });

      await logActivity({
        description: `Reference number config "${refType}" updated`,
        subjectType: "App\\Models\\ReferenceNumberConfig",
        subjectId: config.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { refType, changes: req.body },
      });

      res.status(200).json({ success: true, data: config, message: "Numbering config updated" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Approval Policies ────────────────────────────────────────────────────────

const approvalPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  budgetType: z.string().max(50).optional().nullable(),
  division: z.string().max(50).optional().nullable(),
  isActive: z.boolean().optional(),
  tiers: z
    .array(
      z.object({
        minAmount: z.number().min(0),
        maxAmount: z.number().min(0),
        requiredApprovals: z.number().int().min(1).max(10),
      })
    )
    .min(1),
  approverIds: z.array(z.number().int()).min(1),
});

const policyInclude = {
  tiers: { orderBy: { minAmount: "asc" as const } },
  assignments: {
    orderBy: { sortOrder: "asc" as const },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
};

// GET /api/settings/approval-policies - List all approval policies
router.get(
  "/approval-policies",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const policies = await prisma.approvalPolicy.findMany({
        where: { deletedAt: null },
        include: policyInclude,
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({ success: true, data: policies });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/settings/approval-policies - Create approval policy
router.post(
  "/approval-policies",
  authenticate,
  requirePermission("admin.settings.manage"),
  validate(approvalPolicySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { tiers, approverIds, ...policyData } = req.body;

      const policy = await prisma.approvalPolicy.create({
        data: {
          ...policyData,
          tiers: { create: tiers },
          assignments: {
            create: approverIds.map((userId: number, index: number) => ({
              userId,
              sortOrder: index,
            })),
          },
        },
        include: policyInclude,
      });

      await logActivity({
        description: `Approval policy "${policy.name}" created`,
        subjectType: "App\\Models\\ApprovalPolicy",
        subjectId: policy.id,
        event: "created",
        causerId: req.user!.id,
        properties: { name: policy.name },
      });

      res.status(201).json({ success: true, data: policy, message: "Approval policy created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/settings/approval-policies/:id - Update approval policy (replaces tiers + approvers)
router.put(
  "/approval-policies/:id",
  authenticate,
  requirePermission("admin.settings.manage"),
  validate(approvalPolicySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const existing = await prisma.approvalPolicy.findFirst({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Approval policy not found" });
      }

      const { tiers, approverIds, ...policyData } = req.body;

      const policy = await prisma.$transaction(async (tx) => {
        await tx.approvalPolicyTier.deleteMany({ where: { policyId: id } });
        await tx.approvalAssignment.deleteMany({ where: { policyId: id } });

        return tx.approvalPolicy.update({
          where: { id },
          data: {
            ...policyData,
            tiers: { create: tiers },
            assignments: {
              create: approverIds.map((userId: number, index: number) => ({
                userId,
                sortOrder: index,
              })),
            },
          },
          include: policyInclude,
        });
      });

      await logActivity({
        description: `Approval policy "${policy.name}" updated`,
        subjectType: "App\\Models\\ApprovalPolicy",
        subjectId: policy.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { name: policy.name, changes: req.body },
      });

      res.status(200).json({ success: true, data: policy, message: "Approval policy updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/settings/approval-policies/:id - Soft delete approval policy
router.delete(
  "/approval-policies/:id",
  authenticate,
  requirePermission("admin.settings.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      await prisma.approvalPolicy.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await logActivity({
        description: `Approval policy deleted`,
        subjectType: "App\\Models\\ApprovalPolicy",
        subjectId: id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { id },
      });

      res.status(200).json({ success: true, data: null, message: "Approval policy removed" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Get Single Setting (kept last so /:key does not shadow the routes above) ─

router.get(
  "/:key",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const key = req.params.key as string;
      const setting = await prisma.setting.findUnique({ where: { key } });

      res.status(200).json({
        success: true,
        data: setting ? setting.value : null,
        message: "Setting retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
