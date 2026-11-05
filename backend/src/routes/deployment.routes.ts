import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { scopeFilter, withScope } from "../rbac/authorize.js";
import { resolveTeamId, assertRecordInScope } from "../lib/teamScope.js";
import { openRequest, settleSubject } from "../services/approvalRequest.service.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { sendDeploymentNotification } from "../services/notification.service.js";

const router = Router();

const createDeploymentSchema = z.object({
  projectId: z.number().int().positive(),
  environmentId: z.number().int().positive().optional().nullable(),
  applicationId: z.number().int().positive().optional().nullable(),
  /** Omit to file under your only team. Required when you belong to several. */
  teamId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1).max(255),
  version: z.string().min(1).max(50),
  status: z.enum(["pending", "in_progress", "completed", "failed", "rolled_back"]).optional(),
  branch: z.string().optional().nullable(),
  commitHash: z.string().optional().nullable(),
  commitMessage: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isRollback: z.boolean().optional(),
  rollbackFromId: z.number().int().positive().optional().nullable(),
});

const updateDeploymentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  version: z.string().min(1).max(50).optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed", "rolled_back"]).optional(),
  branch: z.string().optional().nullable(),
  commitHash: z.string().optional().nullable(),
  commitMessage: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  environmentId: z.number().int().positive().optional().nullable(),
  applicationId: z.number().int().positive().optional().nullable(),
});

// GET /api/deployments - List all deployments
router.get(
  "/",
  authenticate,
  requirePermission("devops.deployment.view"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { search, status, projectId, teamId, page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};

      if (projectId) where.projectId = parseInt(projectId as string, 10);

      if (search) {
        where.OR = [
          { version: { contains: search as string, mode: "insensitive" } },
          { name: { contains: search as string, mode: "insensitive" } },
          { notes: { contains: search as string, mode: "insensitive" } },
        ];
      }
      if (status) where.status = status;

      // Team scope last, so the filter always applies to the finished clause.
      // An explicit team filter narrows further; it can never widen the scope
      // the server already decided on, because both land in the same `where`.
      if (teamId && teamId !== "all") where.teamId = parseInt(teamId as string, 10);

      const scoped = withScope(where, scopeFilter(req.access!, "devops.deployment.view"));

      const [deployments, total] = await Promise.all([
        prisma.deployment.findMany({
          where: scoped,
          include: {
            project: { select: { id: true, name: true, slug: true } },
            deployedByUser: { select: { id: true, name: true, email: true } },
            team: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.deployment.count({ where: scoped }),
      ]);

      res.status(200).json({
        success: true,
        data: deployments,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Deployments retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/deployments - Create deployment
router.post(
  "/",
  authenticate,
  requirePermission("devops.deployment.create"),
  validate(createDeploymentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const isCompleted = req.body.status === "completed";

      const teamId = await resolveTeamId(req.access!, req.body.teamId);

      // A production environment answers the question "does this need
      // sign-off", so it is read from the environment rather than trusted from
      // the request body.
      const environment = req.body.environmentId
        ? await prisma.environment.findUnique({
            where: { id: req.body.environmentId },
            select: { type: true },
          })
        : null;
      const needsApproval = environment?.type === "production";

      // Nobody deploys to production and signs it off themselves: if the
      // approver chain resolves back to the requester, the delivery is filed as
      // pending and waits for someone else.
      const approval = needsApproval
        ? await openRequest({
            module: "deployment",
            subjectType: "Deployment",
            subjectId: 0, // replaced below once the row exists
            title: `Deploy ${req.body.name} v${req.body.version} to production`,
            requesterId: req.user!.id,
            teamId,
            approvalPermission: "devops.deployment.approve",
            link: "/deployments",
            metadata: { projectId: req.body.projectId, environmentId: req.body.environmentId },
          })
        : null;

      const deployment = await prisma.deployment.create({
        data: {
          projectId: req.body.projectId,
          teamId,
          environmentId: req.body.environmentId || null,
          applicationId: req.body.applicationId || null,
          name: req.body.name,
          version: req.body.version,
          status: approval ? "pending" : req.body.status || "pending",
          branch: req.body.branch || null,
          commitHash: req.body.commitHash || null,
          commitMessage: req.body.commitMessage || null,
          notes: req.body.notes || null,
          isRollback: req.body.isRollback || false,
          rollbackFromId: req.body.rollbackFromId || null,
          deployedBy: req.user!.id,
          deployedAt: !approval && isCompleted ? now : null,
          completedAt: !approval && isCompleted ? now : null,
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          deployedByUser: { select: { id: true, name: true, email: true } },
          team: { select: { id: true, name: true } },
        },
      });

      // The ledger key needs the real id, so the placeholder row is repointed
      // rather than creating the request twice.
      if (approval) {
        await prisma.approvalRequest.update({
          where: { id: approval.id },
          data: { subjectId: deployment.id },
        });
      }

      await logActivity({
        description: `Deployment "${deployment.name}" v${deployment.version} created`,
        subjectType: "App\\Models\\Deployment",
        subjectId: deployment.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: deployment },
      });

      // Send deployment notification
      sendDeploymentNotification(deployment, "created").catch((err) =>
        console.error("[Notification] Deployment notification failed:", err)
      );

      res.status(201).json({ success: true, data: deployment, message: "Deployment created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/deployments/:id - Update deployment
router.put(
  "/:id",
  authenticate,
  requirePermission("devops.deployment.update"),
  validate(updateDeploymentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.deployment.findUnique({
        where: { id: parseInt(id as string, 10) },
      });
      if (!existing) throw new NotFoundError("Deployment not found");

      // Team scope is a record-level rule, so it has to be checked here — the
      // listing filter does not run on a single-record route.
      assertRecordInScope(req.access!, existing.teamId);

      const now = new Date();
      const newStatus = req.body.status;
      const justCompleted = newStatus === "completed" && existing.status !== "completed";

      // Calculate duration if completing
      let durationSeconds: number | undefined;
      if (justCompleted && existing.deployedAt) {
        durationSeconds = Math.floor((now.getTime() - existing.deployedAt.getTime()) / 1000);
      }

      const deployment = await prisma.deployment.update({
        where: { id: existing.id },
        data: {
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.version && { version: req.body.version }),
          ...(req.body.status && { status: req.body.status }),
          ...(req.body.branch !== undefined && { branch: req.body.branch }),
          ...(req.body.commitHash !== undefined && { commitHash: req.body.commitHash }),
          ...(req.body.commitMessage !== undefined && { commitMessage: req.body.commitMessage }),
          ...(req.body.notes !== undefined && { notes: req.body.notes }),
          ...(req.body.environmentId !== undefined && { environmentId: req.body.environmentId }),
          ...(req.body.applicationId !== undefined && { applicationId: req.body.applicationId }),
          ...(justCompleted && { completedAt: now }),
          ...(durationSeconds !== undefined && { durationSeconds }),
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          deployedByUser: { select: { id: true, name: true, email: true } },
        },
      });

      await logActivity({
        description: `Deployment "${deployment.name}" updated to ${deployment.status}`,
        subjectType: "App\\Models\\Deployment",
        subjectId: deployment.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: deployment },
      });

      // A deployment that leaves `pending` has been decided somewhere else.
      // Mirror that into the ledger so the inbox does not keep asking.
      if (existing.status === "pending" && deployment.status !== "pending") {
        const settled =
          deployment.status === "rolled_back" || deployment.status === "failed"
            ? "rejected"
            : "approved";
        await settleSubject({
          subjectType: "Deployment",
          subjectId: deployment.id,
          status: settled,
          comment: `Marked ${deployment.status}`,
        });
      }

      // Send deployment status notification
      const deployEvent = deployment.status === "completed" ? "completed" : deployment.status === "failed" ? "failed" : "created";
      sendDeploymentNotification(deployment, deployEvent).catch((err) =>
        console.error("[Notification] Deployment notification failed:", err)
      );

      res.status(200).json({ success: true, data: deployment, message: "Deployment updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/deployments/:id - Delete deployment
router.delete(
  "/:id",
  authenticate,
  requirePermission("devops.deployment.delete"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.deployment.findUnique({
        where: { id: parseInt(id as string, 10) },
      });
      if (!existing) throw new NotFoundError("Deployment not found");

      assertRecordInScope(req.access!, existing.teamId);

      await prisma.deployment.delete({
        where: { id: existing.id },
      });

      await logActivity({
        description: `Deployment "${existing.name}" v${existing.version} deleted`,
        subjectType: "App\\Models\\Deployment",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, data: null, message: "Deployment deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
