import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ForbiddenError, AppError } from "../lib/errors.js";
import { generateSlug } from "../lib/slug.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router({ mergeParams: true });

const createEnvironmentSchema = z.object({
  name: z.string().min(2).max(255),
  type: z.enum(["development", "staging", "production", "testing", "other"]),
  description: z.string().optional(),
  url: z.string().url().optional().nullable(),
});

const updateEnvironmentSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  type: z.enum(["development", "staging", "production", "testing", "other"]).optional(),
  description: z.string().optional(),
  url: z.string().url().optional().nullable(),
  isActive: z.boolean().optional(),
});

// Helper to check project access
async function checkProjectAccess(
  projectId: number,
  userId: number,
  userRoles: string[]
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  if (userRoles.includes("viewer")) {
    const assignment = await prisma.teamAssignment.findFirst({
      where: { projectId, userId },
    });

    if (!assignment) {
      throw new ForbiddenError("You are not assigned to this project");
    }
  }
}

// GET /api/projects/:projectId/environments
router.get(
  "/",
  authenticate,
  requirePermission("view-environments"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const userRoles = req.user!.roles.map((r) => r.name);

      await checkProjectAccess(projectId, req.user!.id, userRoles);

      const environments = await prisma.environment.findMany({
        where: { projectId, deletedAt: null },
        include: {
          _count: {
            select: {
              infrastructureNodes: true,
              services: true,
              applications: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({
        data: environments,
        message: "Environments retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/environments
router.post(
  "/",
  authenticate,
  requirePermission("create-environments"),
  validate(createEnvironmentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const userRoles = req.user!.roles.map((r) => r.name);

      await checkProjectAccess(projectId, req.user!.id, userRoles);

      const { name, type, description, url } = req.body;
      const slug = generateSlug(name);

      // Check slug uniqueness within project
      const existing = await prisma.environment.findFirst({
        where: { projectId, slug, deletedAt: null },
      });

      if (existing) {
        throw new AppError(400, "An environment with this name already exists in this project");
      }

      const environment = await prisma.environment.create({
        data: {
          projectId,
          name,
          slug,
          type,
          description: description || null,
          url: url || null,
          isActive: true,
        },
      });

      // Log activity
      await logActivity({
        description: "Environment created",
        subjectType: "App\\Models\\Environment",
        subjectId: environment.id,
        event: "created",
        causerId: req.user!.id,
        properties: { project_id: projectId, attributes: environment },
      });

      res.status(201).json({
        data: environment,
        message: "Environment created successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:projectId/environments/:id
router.get(
  "/:id",
  authenticate,
  requirePermission("view-environments"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const environmentId = parseInt(req.params.id, 10);
      const userRoles = req.user!.roles.map((r) => r.name);

      await checkProjectAccess(projectId, req.user!.id, userRoles);

      const environment = await prisma.environment.findUnique({
        where: { id: environmentId, projectId, deletedAt: null },
        include: {
          infrastructureNodes: {
            where: { deletedAt: null },
          },
          services: {
            where: { deletedAt: null },
          },
          applications: {
            where: { deletedAt: null },
          },
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      });

      if (!environment) {
        throw new NotFoundError("Environment not found");
      }

      res.status(200).json({
        data: environment,
        message: "Environment retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/projects/:projectId/environments/:id
router.put(
  "/:id",
  authenticate,
  requirePermission("update-environments"),
  validate(updateEnvironmentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const environmentId = parseInt(req.params.id, 10);
      const userRoles = req.user!.roles.map((r) => r.name);

      await checkProjectAccess(projectId, req.user!.id, userRoles);

      const environment = await prisma.environment.findUnique({
        where: { id: environmentId, projectId, deletedAt: null },
      });

      if (!environment) {
        throw new NotFoundError("Environment not found");
      }

      // Check slug uniqueness if name is being changed
      let slug = environment.slug;
      if (req.body.name && req.body.name !== environment.name) {
        slug = generateSlug(req.body.name);
        const existing = await prisma.environment.findFirst({
          where: {
            projectId,
            slug,
            id: { not: environment.id },
            deletedAt: null,
          },
        });
        if (existing) {
          throw new AppError(400, "An environment with this name already exists");
        }
      }

      const oldValues = { ...environment };

      const updatedEnvironment = await prisma.environment.update({
        where: { id: environment.id },
        data: {
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.name && { slug }),
          ...(req.body.type && { type: req.body.type }),
          ...(req.body.description !== undefined && { description: req.body.description }),
          ...(req.body.url !== undefined && { url: req.body.url }),
          ...(req.body.isActive !== undefined && { isActive: req.body.isActive }),
        },
      });

      // Log activity
      await logActivity({
        description: "Environment updated",
        subjectType: "App\\Models\\Environment",
        subjectId: environment.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { project_id: projectId, old: oldValues, attributes: updatedEnvironment },
      });

      res.status(200).json({
        data: updatedEnvironment,
        message: "Environment updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/projects/:projectId/environments/:id
router.delete(
  "/:id",
  authenticate,
  requirePermission("delete-environments"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const environmentId = parseInt(req.params.id, 10);
      const userRoles = req.user!.roles.map((r) => r.name);

      await checkProjectAccess(projectId, req.user!.id, userRoles);

      const environment = await prisma.environment.findUnique({
        where: { id: environmentId, projectId, deletedAt: null },
      });

      if (!environment) {
        throw new NotFoundError("Environment not found");
      }

      await prisma.environment.update({
        where: { id: environment.id },
        data: { deletedAt: new Date() },
      });

      // Log activity
      await logActivity({
        description: "Environment deleted",
        subjectType: "App\\Models\\Environment",
        subjectId: environment.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { project_id: projectId, attributes: environment },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
