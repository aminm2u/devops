import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ForbiddenError, ValidationError, AppError } from "../lib/errors.js";
import { generateSlug } from "../lib/slug.js";
import { logActivity } from "../middleware/activity.js";
import { createNotification } from "../services/notification.service.js";
import prisma from "../config/database.js";

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent", "critical"]).optional(),
  ownerId: z.number().int().positive().optional(),
  repositoryUrl: z.string().url().optional().nullable(),
  documentationUrl: z.string().url().optional().nullable(),
  projectTypeId: z.number().int().positive().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  expectedEndDate: z.string().datetime().optional().nullable(),
  // Commercial value: valueWithoutTax + taxAmount → valueWithTax (server-derived)
  valueWithoutTax: z.number().min(0).max(999_999_999_999).optional().nullable(),
  taxAmount: z.number().min(0).max(999_999_999_999).optional().nullable(),
  hasWarranty: z.boolean().optional(),
  warrantyMonths: z.number().int().min(0).max(600).optional().nullable(),
});

const updateProjectSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent", "critical"]).optional(),
  ownerId: z.number().int().positive().optional(),
  repositoryUrl: z.string().url().optional().nullable(),
  documentationUrl: z.string().url().optional().nullable(),
  isActive: z.boolean().optional(),
  projectTypeId: z.number().int().positive().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  expectedEndDate: z.string().datetime().optional().nullable(),
  actualEndDate: z.string().datetime().optional().nullable(),
  healthStatus: z.string().optional(),
  delayReason: z.string().optional().nullable(),
  valueWithoutTax: z.number().min(0).max(999_999_999_999).optional().nullable(),
  taxAmount: z.number().min(0).max(999_999_999_999).optional().nullable(),
  hasWarranty: z.boolean().optional(),
  warrantyMonths: z.number().int().min(0).max(600).optional().nullable(),
});

// GET /api/projects - List projects
router.get(
  "/",
  authenticate,
  requirePermission("project.record.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const userRoles = req.user!.roles.map((r) => r.name);
      // `viewer` was removed from the role catalog, so this branch had become
      // dead and every signed-in user saw every project. The `mine` filter is
      // now the explicit, per-request version of what it was trying to do.
      const isViewer = userRoles.includes("viewer");

      const { search, status, priority, page = "1", limit, per_page, mine } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      // The client has always sent `per_page` while this handler read `limit`,
      // so page size silently ignored the caller. Accept both.
      const rawLimit = (limit ?? per_page ?? "12") as string;
      const limitNum = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 12));
      const skip = (pageNum - 1) * limitNum;

      // Build where clause
      const where: any = {
        deletedAt: null,
      };

      if (isViewer || mine === "true") {
        // `isActive: false` rows are people who were removed; they must not keep
        // project visibility after leaving the team.
        const assignments = await prisma.teamAssignment.findMany({
          where: { userId, isActive: true },
          select: { projectId: true },
        });
        where.AND = [
          {
            OR: [
              { ownerId: userId },
              { id: { in: assignments.map((a) => a.projectId) } },
            ],
          },
        ];
      }

      const and: any[] = [];
      if (where.AND) and.push(...where.AND);

      if (search) {
        and.push({
          OR: [
            { name: { contains: search as string, mode: "insensitive" } },
            { description: { contains: search as string, mode: "insensitive" } },
          ],
        });
      }

      // Fold every optional filter into one AND so a search term and a `mine`
      // restriction can both apply (two top-level keys would, but only because
      // Prisma merges them — one array is easier to reason about).
      if (and.length > 0) {
        delete where.AND;
        where.AND = and;
      }

      if (status) {
        where.status = status;
      }

      if (priority) {
        where.priority = priority;
      }

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          include: {
            owner: {
              select: { id: true, name: true, email: true },
            },
            _count: {
              select: {
                environments: true,
                services: true,
                infrastructureNodes: true,
                applications: true,
                deployments: true,
                incidents: { where: { status: { notIn: ["resolved", "closed"] }, deletedAt: null } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.project.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: projects,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Projects retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects - Create project
router.post(
  "/",
  authenticate,
  requirePermission("project.record.create"),
  validate(createProjectSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { name, description, status, priority, ownerId, repositoryUrl, documentationUrl } = req.body;
      const slug = generateSlug(name);

      // Check if slug already exists
      const existing = await prisma.project.findUnique({ where: { slug } });
      if (existing) {
        throw new AppError(400, "A project with this name already exists");
      }

      // valueWithTax is derived, never accepted from the client
      const valueWithoutTax = req.body.valueWithoutTax ?? null;
      const taxAmount = req.body.taxAmount ?? null;
      const valueWithTax =
        valueWithoutTax !== null || taxAmount !== null
          ? Number(valueWithoutTax ?? 0) + Number(taxAmount ?? 0)
          : null;

      const project = await prisma.project.create({
        data: {
          name,
          slug,
          description: description || null,
          status: status || "active",
          priority: priority || "medium",
          ownerId: ownerId || req.user!.id,
          repositoryUrl: repositoryUrl || null,
          documentationUrl: documentationUrl || null,
          valueWithoutTax,
          taxAmount,
          valueWithTax,
          hasWarranty: req.body.hasWarranty ?? false,
          warrantyMonths: req.body.hasWarranty ? req.body.warrantyMonths ?? null : null,
          isActive: true,
        },
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Log activity
      await logActivity({
        description: "Project created",
        subjectType: "App\\Models\\Project",
        subjectId: project.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: project },
      });

      res.status(201).json({
        success: true,
        data: project,
        message: "Project created successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:id - Show project
router.get(
  "/:id",
  authenticate,
  requirePermission("project.record.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const userRoles = req.user!.roles.map((r) => r.name);
      const isViewer = userRoles.includes("viewer");

      const project = await prisma.project.findUnique({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
          projectType: true,
          environments: {
            where: { deletedAt: null },
            include: {
              _count: {
                select: {
                  infrastructureNodes: true,
                  services: true,
                  applications: true,
                },
              },
            },
          },
          teamAssignments: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
              projectRole: true,
            },
          },
          // Slim scope rows for the Timeline tab and overview derivations —
          // never inline cost items here or every refetch pays for the sheet.
          scopeItems: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              parentId: true,
              wbsNumber: true,
              sortOrder: true,
              title: true,
              status: true,
              startDate: true,
              endDate: true,
              roleCodes: true,
              progress: true,
            },
          },
          budgetItems: {
            include: {
              expenditures: true,
            },
          },
          requisitionForms: {
            include: {
              budgetItem: { select: { id: true, category: true, description: true, allocatedBudget: true } },
            },
          },
          purchaseOrders: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            include: {
              vendor: { select: { id: true, name: true } },
              payments: {
                where: { isActive: true, deletedAt: null },
                select: { id: true, totalPaid: true, status: true },
              },
            },
          },
          taskColumns: {
            orderBy: { position: 'asc' }
          },
          tasks: {
            orderBy: { position: 'asc' },
            include: {
              subtasks: { select: { id: true, status: true, dueDate: true } },
              // The WBS work package each task delivers — Kanban cards show
              // it as context; no extra frontend query needed.
              scopeItem: { select: { id: true, wbsNumber: true, title: true } },
            }
          },          infrastructureNodes: {
            where: { deletedAt: null },
          },
          services: {
            where: { deletedAt: null },
          },
          applications: {
            where: { deletedAt: null },
          },
          domains: {
            where: { deletedAt: null },
          },
          deployments: {
            orderBy: { createdAt: "desc" },
          },
          incidents: {
            where: {
              deletedAt: null,
            },
            orderBy: { createdAt: "desc" },
          },
          documents: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
          securityFindings: {
            where: {
              status: { notIn: ["resolved", "closed"] },
              deletedAt: null,
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          changeManagements: {
            where: { deletedAt: null, isActive: true },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              riskLevel: true,
              priority: true,
              requestedAt: true,
              approvedAt: true,
              implementedAt: true,
              createdAt: true,
            },
          },
          credentials: true,
        },
      });

      if (!project) {
        throw new NotFoundError("Project not found");
      }

      // Per-task logged hours for the Kanban cards — one aggregate, mapped
      // onto the already-fetched rows.
      const loggedAgg = await prisma.timeEntry.groupBy({
        by: ["taskId"],
        where: { task: { projectId: project.id }, deletedAt: null },
        _sum: { hours: true },
      });
      const hoursByTask = new Map(loggedAgg.map((row) => [row.taskId, Number(row._sum.hours ?? 0)]));
      if (project.tasks) {
        project.tasks = project.tasks.map((task: any) => ({
          ...task,
          loggedHours: hoursByTask.get(task.id) ?? 0,
        }));
      }

      // Check viewer authorization
      if (isViewer) {
        const isAssigned = await prisma.teamAssignment.findFirst({
          where: {
            projectId: project.id,
            userId,
          },
        });

        if (!isAssigned) {
          throw new ForbiddenError("You are not assigned to this project");
        }
      }

      // Pass credential passwords (frontend handles visibility with eye toggle)
      if (project.credentials) {
        project.credentials = project.credentials.map((cred: any) => ({
          ...cred,
          hasPassword: !!cred.password,
        }));
      }

      res.status(200).json({
        success: true,
        data: project,
        message: "Project retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/projects/:id - Update project
router.put(
  "/:id",
  authenticate,
  requirePermission("project.record.manage"),
  validate(updateProjectSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const userRoles = req.user!.roles.map((r) => r.name);

      const project = await prisma.project.findUnique({
        where: { id: parseInt(id, 10), deletedAt: null },
      });

      if (!project) {
        throw new NotFoundError("Project not found");
      }

      // Policy check: engineers can only update assigned projects
      if (userRoles.includes("devops-engineer") && !userRoles.includes("super-admin") && !userRoles.includes("devops-admin")) {
        const assignment = await prisma.teamAssignment.findFirst({
          where: {
            projectId: project.id,
            userId,
            role: "engineer",
          },
        });

        if (!assignment) {
          throw new ForbiddenError("You are not authorized to update this project");
        }
      }

      const oldValues = { ...project };

      // Check slug uniqueness if name is being changed
      let slug = project.slug;
      if (req.body.name && req.body.name !== project.name) {
        slug = generateSlug(req.body.name);
        const existing = await prisma.project.findFirst({
          where: { slug, id: { not: project.id } },
        });
        if (existing) {
          throw new AppError(400, "A project with this name already exists");
        }
      }

      // Commercial value: valueWithTax is derived (without + tax), and the
      // warranty length only persists while the warranty flag is on.
      let valueWithTax: number | null | undefined;
      if (req.body.valueWithoutTax !== undefined || req.body.taxAmount !== undefined) {
        const withoutTax = req.body.valueWithoutTax ?? project.valueWithoutTax ?? 0;
        const tax = req.body.taxAmount ?? project.taxAmount ?? 0;
        valueWithTax = Number(withoutTax) + Number(tax);
      }

      const updatedProject = await prisma.project.update({
        where: { id: project.id },
        data: {
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.name && { slug }),
          ...(req.body.description !== undefined && { description: req.body.description }),
          ...(req.body.status && { status: req.body.status }),
          ...(req.body.priority && { priority: req.body.priority }),
          ...(req.body.ownerId && { ownerId: req.body.ownerId }),
          ...(req.body.repositoryUrl !== undefined && { repositoryUrl: req.body.repositoryUrl }),
          ...(req.body.documentationUrl !== undefined && { documentationUrl: req.body.documentationUrl }),
          ...(req.body.isActive !== undefined && { isActive: req.body.isActive }),
          ...(req.body.valueWithoutTax !== undefined && { valueWithoutTax: req.body.valueWithoutTax }),
          ...(req.body.taxAmount !== undefined && { taxAmount: req.body.taxAmount }),
          ...(valueWithTax !== undefined && { valueWithTax }),
          ...(req.body.hasWarranty !== undefined && { hasWarranty: req.body.hasWarranty }),
          ...(req.body.warrantyMonths !== undefined && { warrantyMonths: req.body.warrantyMonths }),
          ...((req.body.hasWarranty === false || req.body.hasWarranty === null) && { warrantyMonths: null }),
        },
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Log activity
      await logActivity({
        description: "Project updated",
        subjectType: "App\\Models\\Project",
        subjectId: project.id,
        event: "updated",
        causerId: userId,
        properties: { old: oldValues, attributes: updatedProject },
      });

      res.status(200).json({
        success: true,
        data: updatedProject,
        message: "Project updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/projects/:id - Soft delete project
router.delete(
  "/:id",
  authenticate,
  requirePermission("project.record.delete"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const project = await prisma.project.findUnique({
        where: { id: parseInt(id, 10), deletedAt: null },
      });

      if (!project) {
        throw new NotFoundError("Project not found");
      }

      await prisma.project.update({
        where: { id: project.id },
        data: { deletedAt: new Date() },
      });

      // Log activity
      await logActivity({
        description: "Project deleted",
        subjectType: "App\\Models\\Project",
        subjectId: project.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: project },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// --- Environment routes (nested under projects) ---

const createEnvironmentSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["development", "staging", "production", "testing"]).optional(),
  url: z.string().url().optional().nullable(),
});

// GET /api/projects/:id/environments
router.get(
  "/:id/environments",
  authenticate,
  requirePermission("project.record.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const project = await prisma.project.findUnique({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!project) throw new NotFoundError("Project not found");

      const environments = await prisma.environment.findMany({
        where: { projectId: project.id, deletedAt: null },
        include: {
          _count: {
            select: { infrastructureNodes: true, services: true, applications: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      res.status(200).json({ success: true, data: environments });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:id/environments
router.post(
  "/:id/environments",
  authenticate,
  requirePermission("project.environment.manage"),
  validate(createEnvironmentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const project = await prisma.project.findUnique({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!project) throw new NotFoundError("Project not found");

      const slug = generateSlug(req.body.name);

      const environment = await prisma.environment.create({
        data: {
          projectId: project.id,
          name: req.body.name,
          slug,
          type: req.body.type || "development",
          url: req.body.url || null,
        },
      });

      await logActivity({
        description: `Environment "${environment.name}" added to project`,
        subjectType: "App\\Models\\Environment",
        subjectId: environment.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: environment },
      });

      res.status(201).json({ success: true, data: environment, message: "Environment added" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/projects/:projectId/environments/:envId
router.delete(
  "/:id/environments/:envId",
  authenticate,
  requirePermission("project.environment.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { envId } = req.params;
      const env = await prisma.environment.findUnique({
        where: { id: parseInt(envId, 10), deletedAt: null },
      });
      if (!env) throw new NotFoundError("Environment not found");

      await prisma.environment.update({
        where: { id: env.id },
        data: { deletedAt: new Date() },
      });

      await logActivity({
        description: `Environment "${env.name}" removed`,
        subjectType: "App\\Models\\Environment",
        subjectId: env.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: env },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:id/enroll — join the project team yourself
/**
 * Self-enrollment.
 *
 * Gated on `projects.allow_self_enroll`, not on a permission: the point is that
 * a project open to volunteers does not need an administrator in the loop. A
 * project with the flag off still requires `POST /:id/members` from someone
 * with `project.team.manage`.
 *
 * The role is never taken from the client — otherwise self-enrollment would be
 * a way to grant yourself Project Manager. `project_roles` has no ordering
 * column (and the seed happens to create Project Manager first), so "lowest id"
 * is *not* "lowest privilege": it would hand out the manager role. The role is
 * chosen by name instead, and anything unrecognised ranks above the safe
 * defaults so an unknown custom role is never granted automatically.
 */
const SELF_ENROLL_ROLE_RANK = ["developer", "member", "contributor", "viewer"];

function selfEnrollRank(name: string): number {
  const index = SELF_ENROLL_ROLE_RANK.indexOf(name.trim().toLowerCase());
  // Unrecognised roles sort last so a custom "Project Manager" clone can never
  // be picked by accident.
  return index === -1 ? SELF_ENROLL_ROLE_RANK.length + 1 : index;
}

router.post(
  "/:id/enroll",
  authenticate,
  requirePermission("project.team.enroll.self"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const projectId = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: { id: true, name: true, allowSelfEnroll: true, ownerId: true },
      });
      if (!project) throw new NotFoundError("Project not found");
      if (!project.allowSelfEnroll) {
        throw new ForbiddenError("This project is not open to self-enrollment");
      }

      const already = await prisma.teamAssignment.findUnique({
        where: { projectId_userId: { projectId, userId: req.user!.id } },
      });
      if (already?.isActive) {
        throw new AppError(409, "You are already on this project");
      }

      const memberRole = (await prisma.projectRole.findMany())
        .sort((a, b) => selfEnrollRank(a.name) - selfEnrollRank(b.name))[0];
      if (!memberRole) {
        throw new AppError(500, "No project roles are configured");
      }

      // A previous removal leaves the row behind (`isActive: false`); reusing it
      // keeps the unique key intact and preserves the original assignment date.
      const assignment = already
        ? await prisma.teamAssignment.update({
            where: { id: already.id },
            data: { isActive: true, assignedAt: new Date(), projectRoleId: memberRole.id },
            include: {
              project: { select: { id: true, name: true } },
              projectRole: true,
            },
          })
        : await prisma.teamAssignment.create({
            data: {
              projectId,
              userId: req.user!.id,
              projectRoleId: memberRole.id,
              assignedAt: new Date(),
            },
            include: {
              project: { select: { id: true, name: true } },
              projectRole: true,
            },
          });

      if (project.ownerId && project.ownerId !== req.user!.id) {
        await createNotification(
          project.ownerId,
          "project",
          "Someone joined your project",
          `${req.user!.name} enrolled on ${project.name}`,
          `/projects/${projectId}?tab=team`
        );
      }

      res.status(201).json({ success: true, data: assignment, message: "Enrolled" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:id/members
router.post(
  "/:id/members",
  authenticate,
  requirePermission("project.team.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const projectId = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
      // Both ids arrive as numbers from the UI but as strings over JSON in some
      // callers; Number() here keeps a malformed body from becoming NaN.
      const userId = Number(req.body.userId);
      const projectRoleId = Number(req.body.projectRoleId);

      if (!Number.isInteger(userId) || userId <= 0) {
        throw new ValidationError({ userId: ["A valid user is required"] });
      }
      if (!Number.isInteger(projectRoleId) || projectRoleId <= 0) {
        throw new ValidationError({ projectRoleId: ["A project role is required"] });
      }

      const [project, role, targetUser] = await Promise.all([
        prisma.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true, name: true, ownerId: true },
        }),
        prisma.projectRole.findUnique({ where: { id: projectRoleId } }),
        prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
      ]);
      if (!project) throw new NotFoundError("Project not found");
      if (!role) throw new ValidationError({ projectRoleId: ["Unknown project role"] });
      if (!targetUser) throw new NotFoundError("User not found");

      const existing = await prisma.teamAssignment.findUnique({
        where: { projectId_userId: { projectId: project.id, userId } },
      });

      if (existing?.isActive) {
        // 409 rather than 400: the request is well-formed, it just collides
        // with the current state.
        throw new AppError(409, "User is already a member of this project");
      }

      // Re-adding somebody who was removed reuses their old row so the unique
      // key stays intact and prior history is not silently duplicated.
      const assignment = existing
        ? await prisma.teamAssignment.update({
            where: { id: existing.id },
            data: { isActive: true, assignedAt: new Date(), projectRoleId: role.id },
            include: {
              user: { select: { id: true, name: true, email: true } },
              projectRole: true,
            },
          })
        : await prisma.teamAssignment.create({
            data: { projectId: project.id, userId, projectRoleId: role.id, assignedAt: new Date() },
            include: {
              user: { select: { id: true, name: true, email: true } },
              projectRole: true,
            },
          });

      if (userId !== req.user!.id) {
        await createNotification(
          userId,
          "project",
          "Added to a project",
          `${req.user!.name} added you to ${project.name} as ${role.name}`,
          `/projects/${project.id}?tab=team`
        );
      }

      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/projects/:id/members/:userId — remove somebody from the team
/**
 * Removal flips `isActive` instead of deleting the row: the assignment history
 * is what a project's contribution numbers are reconciled against, and the
 * unique key also stops a second live row for the same person.
 */
router.delete(
  "/:id/members/:userId",
  authenticate,
  requirePermission("project.team.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const rawUserId = req.params.userId;
      const projectId = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
      const userId = parseInt(Array.isArray(rawUserId) ? rawUserId[0] : rawUserId, 10);

      const assignment = await prisma.teamAssignment.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      // `findUnique` ignores `isActive`, so an already-removed row lands here
      // too and is reported as "not on the team" rather than removed twice.
      if (!assignment || !assignment.isActive) {
        throw new NotFoundError("That person is not on this project's team");
      }

      // The project owner losing their seat would leave nobody accountable for
      // it, so ownership has to be transferred first.
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, ownerId: true },
      });
      if (project?.ownerId === userId) {
        throw new AppError(409, "Transfer project ownership before removing the owner");
      }

      await prisma.teamAssignment.update({
        where: { id: assignment.id },
        data: { isActive: false },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:id/contribution?from&to — team contribution to this project
/**
 * Hours in a standard working day, used to convert logged hours into "person
 * days". The platform has no per-user capacity or contracted-hours setting, so
 * this is a single documented convention rather than a per-row lookup: change
 * it here and every contribution report follows.
 *
 * Distinct from `daysWorked`, which counts the calendar dates somebody touched
 * the project. 2.5 hours on one afternoon is 1 day worked and 0.31 person-days;
 * keeping both stops the table from implying four days of effort had happened.
 */
const HOURS_PER_WORKING_DAY = 8;

/**
 * Team contribution, by member, over a date range.
 *
 * Reads the same `TimeEntry` rows the Timesheet module writes — there is no
 * second hours record — and rolls them up three ways: per member (the table),
 * per bucket (the stacked column chart) and per category (the second chart).
 *
 * Visibility is the Timesheet capability, not project membership: hours are
 * personal data, and being able to open a project does not mean being able to
 * read what each teammate logged. `timesheet.entry.read.team` (or `.all`)
 * therefore gates the whole endpoint, and the Team tab hides the panel for
 * anyone without it rather than showing an empty chart.
 *
 * Rejected entries stay in `byStatus` — an approver needs to see they exist —
 * but are excluded from `hours`, so the contribution total is not inflated by
 * time somebody refused to accept.
 */
router.get(
  "/:id/contribution",
  authenticate,
  requirePermission("timesheet.entry.read.team", "timesheet.entry.read.all"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        throw new ValidationError({ id: ["Invalid project id"] });
      }

      const project = await prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: {
          id: true,
          name: true,
          ownerId: true,
          startDate: true,
          expectedEndDate: true,
          teamAssignments: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              projectRole: { select: { id: true, name: true } },
            },
          },
        },
      });
      if (!project) throw new NotFoundError("Project not found");

      // ---- range -----------------------------------------------------------
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      const isoDay = (d: Date) => d.toISOString().substring(0, 10);
      const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
      const today = isoDay(new Date());

      const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
      const rawTo = typeof req.query.to === "string" ? req.query.to : "";
      if ((rawFrom && !dateRe.test(rawFrom)) || (rawTo && !dateRe.test(rawTo))) {
        throw new ValidationError({ range: ["Dates must be YYYY-MM-DD"] });
      }

      const to = rawTo || today;
      // Default window: the project's own start when it is recent, otherwise
      // the last 90 days. A project that began years ago still opens cleanly —
      // the 2-year guard below only rejects a range the caller typed.
      const ninetyDaysAgo = isoDay(addDays(new Date(`${today}T00:00:00.000Z`), -89));
      const projectStart = project.startDate ? isoDay(project.startDate) : null;
      const defaultFrom =
        projectStart && projectStart > ninetyDaysAgo && projectStart <= to
          ? projectStart
          : ninetyDaysAgo;
      const from = rawFrom || defaultFrom;
      if (from > to) {
        throw new ValidationError({ range: ["The start date must be on or before the end date"] });
      }
      // Guard against a runaway scan from a hand-edited URL.
      const spanDays =
        Math.floor(
          (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
        ) + 1;
      if (spanDays > 731) {
        throw new ValidationError({ range: ["Pick a range of two years or less"] });
      }

      const gte = new Date(`${from}T00:00:00.000Z`);
      const lte = new Date(`${to}T00:00:00.000Z`);

      // ---- entries ---------------------------------------------------------
      // `projectId` is denormalised on the entry; the task relation catches
      // rows written before that column was populated.
      const entries = await prisma.timeEntry.findMany({
        where: {
          deletedAt: null,
          workDate: { gte, lte },
          OR: [{ projectId }, { task: { projectId } }],
        },
        select: {
          id: true,
          userId: true,
          workDate: true,
          hours: true,
          status: true,
          categoryValue: true,
          taskId: true,
          task: { select: { id: true, title: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { workDate: "asc" },
      });

      const categories = await prisma.referenceData.findMany({
        where: { group: "timesheet_category" },
        select: { value: true, label: true },
      });
      const categoryLabel = new Map(categories.map((c) => [c.value, c.label]));

      // ---- buckets: daily ≤3 weeks, weekly up to 4 months, else monthly -----
      // The chart must stay readable: 730 daily columns is a smear, not a
      // chart, so the granularity follows the span.
      const bucketDays = spanDays <= 21 ? 1 : spanDays <= 120 ? 7 : 0; // 0 = monthly
      type Bucket = {
        key: string;
        label: string;
        start: string;
        end: string;
        totalHours: number;
        /** The part of `totalHours` already approved — the chart stacks on it. */
        approvedHours: number;
        byUser: Record<string, number>;
      };
      const buckets: Bucket[] = [];
      /** day (YYYY-MM-DD) → bucket index, computed once. */
      const dayToBucket = new Map<string, number>();
      const monthToBucket = new Map<string, number>();

      if (bucketDays > 0) {
        for (let offset = 0; offset < spanDays; offset += bucketDays) {
          const start = addDays(gte, offset);
          const end = addDays(gte, Math.min(offset + bucketDays - 1, spanDays - 1));
          const index = buckets.length;
          buckets.push({
            key: isoDay(start),
            label: start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
            start: isoDay(start),
            end: isoDay(end),
            totalHours: 0,
            approvedHours: 0,
            byUser: {},
          });
          for (let d = 0; d < bucketDays && offset + d < spanDays; d += 1) {
            dayToBucket.set(isoDay(addDays(start, d)), index);
          }
        }
      } else {
        const cursor = new Date(Date.UTC(gte.getUTCFullYear(), gte.getUTCMonth(), 1));
        while (cursor <= lte) {
          const index = buckets.length;
          const monthStart = new Date(cursor);
          const monthEnd = new Date(
            Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
          );
          // Clamp the first/last partial month to the requested range, so the
          // table's "period start → end" never claims days outside it.
          const clampStart = isoDay(monthStart) < from ? from : isoDay(monthStart);
          const clampEnd = isoDay(monthEnd) > to ? to : isoDay(monthEnd);
          buckets.push({
            key: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`,
            label: monthStart.toLocaleDateString("en-GB", {
              month: "short",
              year: "2-digit",
              timeZone: "UTC",
            }),
            start: clampStart,
            end: clampEnd,
            totalHours: 0,
            approvedHours: 0,
            byUser: {},
          });
          monthToBucket.set(
            `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`,
            index
          );
          cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }
      }

      /** Which bucket a work day falls in — the lookup the aggregation uses. */
      const bucketForDay = (day: string): Bucket | undefined => {
        if (bucketDays > 0) return buckets[dayToBucket.get(day) ?? -1];
        return buckets[monthToBucket.get(day.substring(0, 7)) ?? -1];
      };

      const hoursOf = (v: unknown) => Number(v ?? 0);
      const memberAgg = new Map<
        number,
        {
          userId: number;
          name: string;
          email: string;
          totalHours: number;
          approvedHours: number;
          days: Set<string>;
          tasks: Set<number>;
          lastDate: string | null;
          byStatus: { draft: number; submitted: number; approved: number; rejected: number };
        }
      >();
      const statusTotals = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
      const categoryAgg = new Map<string, number>();
      const taskAgg = new Map<number, { id: number; title: string; hours: number }>();

      for (const entry of entries) {
        const hours = hoursOf(entry.hours);
        const day = isoDay(entry.workDate);
        const status = (entry.status as keyof typeof statusTotals) ?? "draft";

        // Every status is counted in the breakdown, so a reviewer sees rejects.
        if (status in statusTotals) statusTotals[status] += hours;

        const member = memberAgg.get(entry.userId) ?? {
          userId: entry.userId,
          name: entry.user?.name ?? `User #${entry.userId}`,
          email: entry.user?.email ?? "",
          totalHours: 0,
          approvedHours: 0,
          days: new Set<string>(),
          tasks: new Set<number>(),
          lastDate: null as string | null,
          byStatus: { draft: 0, submitted: 0, approved: 0, rejected: 0 },
        };
        memberAgg.set(entry.userId, member);
        if (entry.user && member.name.startsWith("User #")) {
          member.name = entry.user.name;
          member.email = entry.user.email;
        }
        if (status in member.byStatus) member.byStatus[status] += hours;
        if (entry.taskId != null) member.tasks.add(entry.taskId);

        // Rejected time is not contribution.
        if (status === "rejected") continue;

        member.totalHours += hours;
        if (status === "approved") member.approvedHours += hours;
        member.days.add(day);
        if (!member.lastDate || day > member.lastDate) member.lastDate = day;

        const bucket = bucketForDay(day);
        if (bucket) {
          bucket.totalHours += hours;
          if (status === "approved") bucket.approvedHours += hours;
          bucket.byUser[String(entry.userId)] = (bucket.byUser[String(entry.userId)] ?? 0) + hours;
        }

        categoryAgg.set(
          entry.categoryValue,
          (categoryAgg.get(entry.categoryValue) ?? 0) + hours
        );

        if (entry.task) {
          const task = taskAgg.get(entry.task.id) ?? {
            id: entry.task.id,
            title: entry.task.title,
            hours: 0,
          };
          task.hours += hours;
          taskAgg.set(entry.task.id, task);
        }
      }

      // ---- rows: live assignments, plus anyone who logged but has left -----
      // A removed member earns a row only when they actually logged time here
      // in range; otherwise the roster would read "Former member" beside 0h,
      // which is noise. Active members always appear, so a zero is visible and
      // the reader can see the whole team rather than only the contributors.
      const rows = project.teamAssignments
        .filter((assignment) => {
          if (assignment.isActive) return true;
          return (memberAgg.get(assignment.userId)?.totalHours ?? 0) > 0;
        })
        .map((assignment) => {
          const agg = memberAgg.get(assignment.userId);
          return {
            userId: assignment.userId,
            name: assignment.user.name,
            email: assignment.user.email,
            role: assignment.projectRole?.name ?? "Member",
            isActive: assignment.isActive,
            isOwner: assignment.userId === project.ownerId,
            totalHours: agg?.totalHours ?? 0,
            approvedHours: agg?.approvedHours ?? 0,
            daysWorked: agg?.days.size ?? 0,
            tasksTouched: agg?.tasks.size ?? 0,
            lastLoggedDate: agg?.lastDate ?? null,
            byStatus: agg?.byStatus ?? { draft: 0, submitted: 0, approved: 0, rejected: 0 },
          };
        });

      const assigned = new Set(rows.map((row) => row.userId));
      for (const [userId, agg] of memberAgg) {
        if (assigned.has(userId)) continue;
        rows.push({
          userId,
          name: agg.name,
          email: agg.email,
          role: "Former member",
          isActive: false,
          isOwner: false,
          totalHours: agg.totalHours,
          approvedHours: agg.approvedHours,
          daysWorked: agg.days.size,
          tasksTouched: agg.tasks.size,
          lastLoggedDate: agg.lastDate,
          byStatus: agg.byStatus,
        });
      }
      rows.sort((a, b) => b.totalHours - a.totalHours || a.name.localeCompare(b.name));

      const totalHours = rows.reduce((sum, row) => sum + row.totalHours, 0);
      const approvedHours = rows.reduce((sum, row) => sum + row.approvedHours, 0);
      const round2 = (n: number) => Math.round(n * 100) / 100;
      for (const row of rows) {
        (row as any).sharePercent =
          totalHours > 0 ? Math.round((row.totalHours / totalHours) * 1000) / 10 : 0;
        // Effort in 8-hour days, so "2.5h" reads as a third of a day rather
        // than being silently rounded up to "1 day" by `daysWorked`.
        (row as any).personDays = round2(row.totalHours / HOURS_PER_WORKING_DAY);
      }

      res.status(200).json({
        success: true,
        data: {
          projectId: project.id,
          projectName: project.name,
          from,
          to,
          bucketDays,
          granularity: bucketDays === 1 ? "day" : bucketDays === 7 ? "week" : "month",
          hoursPerWorkingDay: HOURS_PER_WORKING_DAY,
          members: rows,
          buckets,
          byCategory: [...categoryAgg]
            .map(([value, hours]) => ({
              value,
              label: categoryLabel.get(value) ?? value,
              hours: Math.round(hours * 100) / 100,
            }))
            .sort((a, b) => b.hours - a.hours),
          byTask: [...taskAgg.values()]
            .map((task) => ({ ...task, hours: Math.round(task.hours * 100) / 100 }))
            .sort((a, b) => b.hours - a.hours)
            .slice(0, 10),
          totals: {
            hours: Math.round(totalHours * 100) / 100,
            approvedHours: Math.round(approvedHours * 100) / 100,
            personDays: round2(totalHours / HOURS_PER_WORKING_DAY),
            contributors: rows.filter((row) => row.totalHours > 0).length,
            entries: entries.length,
            byStatus: statusTotals,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
