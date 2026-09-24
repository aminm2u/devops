import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole, requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ForbiddenError, AppError } from "../lib/errors.js";
import { generateSlug } from "../lib/slug.js";
import { logActivity } from "../middleware/activity.js";
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
  requirePermission("view-projects"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const userRoles = req.user!.roles.map((r) => r.name);
      const isViewer = userRoles.includes("viewer");

      const { search, status, priority, page = "1", limit = "12" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      // Build where clause
      const where: any = {
        deletedAt: null,
      };

      if (isViewer) {
        const assignments = await prisma.teamAssignment.findMany({
          where: { userId },
          select: { projectId: true },
        });
        where.id = { in: assignments.map((a) => a.projectId) };
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
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
  requireRole("super-admin", "devops-admin"),
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
  requirePermission("view-projects"),
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
          taskColumns: {
            orderBy: { position: 'asc' }
          },
          tasks: {
            orderBy: { position: 'asc' }
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
  requirePermission("update-projects"),
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
  requireRole("super-admin", "devops-admin"),
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
  requirePermission("view-projects"),
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
  requireRole("super-admin", "devops-admin"),
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
  requireRole("super-admin", "devops-admin"),
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

// POST /api/projects/:id/members
router.post(
  "/:id/members",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { userId, projectRoleId } = req.body;

      const project = await prisma.project.findUnique({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!project) throw new NotFoundError("Project not found");

      const existing = await prisma.teamAssignment.findUnique({
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: parseInt(userId, 10)
          }
        }
      });

      if (existing) {
        return res.status(400).json({ error: "User is already a member of this project" });
      }

      const assignment = await prisma.teamAssignment.create({
        data: {
          projectId: project.id,
          userId: parseInt(userId, 10),
          projectRoleId: parseInt(projectRoleId, 10)
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          projectRole: true
        }
      });

      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
