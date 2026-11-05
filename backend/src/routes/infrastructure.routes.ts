import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { scopeFilter, withScope } from "../rbac/authorize.js";
import { resolveTeamId, assertRecordInScope } from "../lib/teamScope.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

// GET /api/infrastructure - List all infrastructure nodes across projects
router.get(
  "/",
  authenticate,
  requirePermission("devops.infrastructure.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { search, type, status, projectId, teamId, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      // Build where clause
      const where: any = {
        deletedAt: null,
      };

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { hostname: { contains: search as string, mode: "insensitive" } },
          { ipAddress: { contains: search as string, mode: "insensitive" } },
          { project: { name: { contains: search as string, mode: "insensitive" } } },
        ];
      }

      if (type) {
        where.type = type;
      }

      if (status) {
        where.status = status;
      }

      if (projectId) {
        where.projectId = parseInt(projectId as string, 10);
      }

      // An explicit team filter narrows further; it can never widen the scope
      // the server already decided on, because both land in the same `where`.
      if (teamId && teamId !== "all") where.teamId = parseInt(teamId as string, 10);

      const scoped = withScope(where, scopeFilter(req.access!, "devops.infrastructure.view"));

      const [nodes, total] = await Promise.all([
        prisma.infrastructureNode.findMany({
          where: scoped,
          include: {
            project: {
              select: { id: true, name: true, slug: true },
            },
            createdByUser: {
              select: { id: true, name: true, email: true },
            },
            team: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.infrastructureNode.count({ where: scoped }),
      ]);

      res.status(200).json({
        success: true,
        data: nodes,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Infrastructure nodes retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

const createNodeSchema = z.object({
  projectId: z.number().int().positive(),
  teamId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1).max(255),
  type: z.enum(["server", "database", "load-balancer", "cache", "queue", "storage", "network", "container", "kubernetes"]).optional(),
  hostname: z.string().max(255).optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  status: z.enum(["active", "healthy", "warning", "critical", "offline", "maintenance"]).optional(),
  cpuCores: z.number().int().positive().optional().nullable(),
  memoryGb: z.number().positive().optional().nullable(),
  storageGb: z.number().positive().optional().nullable(),
  operatingSystem: z.string().optional().nullable(),
  provider: z.string().optional().nullable(),
  providerRegion: z.string().optional().nullable(),
  environmentId: z.number().int().positive().optional().nullable(),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
});

const updateNodeSchema = createNodeSchema.partial();

// POST /api/infrastructure - Create node
router.post(
  "/",
  authenticate,
  requirePermission("devops.infrastructure.manage"),
  validate(createNodeSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const node = await prisma.infrastructureNode.create({
        data: {
          projectId: req.body.projectId,
          teamId: await resolveTeamId(req.access!, req.body.teamId),
          name: req.body.name,
          type: req.body.type || "server",
          hostname: req.body.hostname,
          ipAddress: req.body.ipAddress || null,
          status: req.body.status || "healthy",
          cpuCores: req.body.cpuCores ?? null,
          memoryGb: req.body.memoryGb ?? null,
          storageGb: req.body.storageGb ?? null,
          operatingSystem: req.body.operatingSystem || null,
          provider: req.body.provider || null,
          providerRegion: req.body.providerRegion || null,
          environmentId: req.body.environmentId || null,
          username: req.body.username || null,
          password: req.body.password || null,
          createdBy: req.user!.id,
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          createdByUser: { select: { id: true, name: true, email: true } },
        },
      });

      await logActivity({
        description: `Infrastructure node "${node.name}" created`,
        subjectType: "App\\Models\\InfrastructureNode",
        subjectId: node.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: node },
      });

      res.status(201).json({ success: true, data: node, message: "Node created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/infrastructure/:id - Update node
router.put(
  "/:id",
  authenticate,
  requirePermission("devops.infrastructure.manage"),
  validate(updateNodeSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.infrastructureNode.findFirst({
        where: { id: parseInt(id as string, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Node not found");

      assertRecordInScope(req.access!, existing.teamId);

      const node = await prisma.infrastructureNode.update({
        where: { id: existing.id },
        data: {
          ...(req.body.projectId !== undefined && { projectId: req.body.projectId }),
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.type && { type: req.body.type }),
          ...(req.body.hostname && { hostname: req.body.hostname }),
          ...(req.body.ipAddress !== undefined && { ipAddress: req.body.ipAddress }),
          ...(req.body.status && { status: req.body.status }),
          ...(req.body.cpuCores !== undefined && { cpuCores: req.body.cpuCores }),
          ...(req.body.memoryGb !== undefined && { memoryGb: req.body.memoryGb }),
          ...(req.body.storageGb !== undefined && { storageGb: req.body.storageGb }),
          ...(req.body.operatingSystem !== undefined && { operatingSystem: req.body.operatingSystem }),
          ...(req.body.provider !== undefined && { provider: req.body.provider }),
          ...(req.body.providerRegion !== undefined && { providerRegion: req.body.providerRegion }),
          ...(req.body.environmentId !== undefined && { environmentId: req.body.environmentId }),
          ...(req.body.username !== undefined && { username: req.body.username }),
          ...(req.body.password !== undefined && { password: req.body.password }),
        },
        include: { project: { select: { id: true, name: true, slug: true } } },
      });

      await logActivity({
        description: `Infrastructure node "${node.name}" updated`,
        subjectType: "App\\Models\\InfrastructureNode",
        subjectId: node.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: node },
      });

      res.status(200).json({ success: true, data: node, message: "Node updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/infrastructure/:id - Soft delete node
router.delete(
  "/:id",
  authenticate,
  requirePermission("devops.infrastructure.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.infrastructureNode.findFirst({
        where: { id: parseInt(id as string, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Node not found");

      assertRecordInScope(req.access!, existing.teamId);

      await prisma.infrastructureNode.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await logActivity({
        description: `Infrastructure node "${existing.name}" deleted`,
        subjectType: "App\\Models\\InfrastructureNode",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
