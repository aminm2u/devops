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
              subtasks: { select: { id: true, status: true, dueDate: true } }
            }
          },
          infrastructureNodes: {
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

export default router;
