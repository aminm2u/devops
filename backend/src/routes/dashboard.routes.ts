import { Router, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../rbac/authorize.js";
import { RequestWithUser } from "../types/index.js";
import prisma from "../config/database.js";
import {
  approvalsBlock,
  buildAttention,
  orgBlock,
  personalBlock,
  teamBlock,
  visibleBlocks,
} from "../services/dashboardOverview.service.js";

const router = Router();

// GET /api/dashboard/stats — legacy org-wide summary, still consumed by
// anything that only needs the flat counters.
router.get(
  "/stats",
  authenticate,
  authorize({ permission: "dashboard.view" }),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const [
        totalProjects,
        activeProjects,
        totalInfrastructureNodes,
        openIncidents,
        criticalIncidentsCount,
        healthyNodes,
        warningNodes,
        criticalNodes,
        recentActivities,
        recentDeployments,
        expiringSSLCertificates,
      ] = await Promise.all([
        prisma.project.count({ where: { deletedAt: null } }),
        prisma.project.count({ where: { deletedAt: null, status: "active" } }),
        prisma.infrastructureNode.count({ where: { deletedAt: null } }),
        prisma.incident.count({
          where: { status: { notIn: ["resolved", "closed"] }, deletedAt: null },
        }),
        prisma.incident.count({
          where: {
            severity: "critical",
            status: { notIn: ["resolved", "closed"] },
            deletedAt: null,
          },
        }),
        prisma.infrastructureNode.count({ where: { status: "healthy", deletedAt: null } }),
        prisma.infrastructureNode.count({ where: { status: "warning", deletedAt: null } }),
        prisma.infrastructureNode.count({ where: { status: "critical", deletedAt: null } }),
        prisma.activityLog.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
        prisma.deployment.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            project: { select: { id: true, name: true, slug: true } },
            environment: { select: { id: true, name: true, type: true } },
            application: { select: { id: true, name: true, slug: true } },
            deployedByUser: { select: { id: true, name: true } },
          },
        }),
        prisma.sslCertificate.findMany({
          take: 5,
          where: { notAfter: { lte: thirtyDaysFromNow }, isActive: true, deletedAt: null },
          orderBy: { notAfter: "asc" },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalProjects,
          activeProjects,
          totalInfrastructureNodes,
          healthyNodes,
          warningNodes,
          criticalNodes,
          openIncidents,
          criticalIncidents: criticalIncidentsCount,
          recentDeployments,
          recentActivities: recentActivities.map((activity) => ({
            id: activity.id,
            action: activity.description,
            createdAt: activity.createdAt,
          })),
          expiringSSLCertificates: expiringSSLCertificates.map((ssl) => ({
            id: ssl.id,
            name: ssl.name,
            notAfter: ssl.notAfter,
          })),
          resourceHealth: { healthy: healthyNodes, warning: warningNodes, critical: criticalNodes },
        },
        message: "Dashboard data retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/dashboard/overview
 *
 * One request for the whole home page. Each block is computed only when the
 * caller's capabilities allow it, and `visible` tells the UI which sections to
 * render — so the page adapts by *permission*, not by hard-coded role name.
 */
router.get(
  "/overview",
  authenticate,
  authorize({ permission: "dashboard.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const access = req.access!;
      const visible = visibleBlocks(access);

      const [personal, approvals, team, org] = await Promise.all([
        personalBlock(userId),
        visible.approvals ? approvalsBlock(userId) : Promise.resolve(null),
        visible.team ? teamBlock(userId, access) : Promise.resolve(null),
        visible.org ? orgBlock() : Promise.resolve(null),
      ]);

      res.status(200).json({
        success: true,
        data: {
          // `team` can come back null for someone who holds the team-hours
          // permission but leads no team; report the tier as unavailable so the
          // page does not promise a section it will not render.
          visible: { ...visible, team: visible.team && team !== null },
          personal,
          approvals,
          team,
          org,
          attention: buildAttention({ personal, approvals, team, org }),
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
