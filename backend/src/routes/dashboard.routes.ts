import { Router, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { RequestWithUser } from "../types/index.js";
import prisma from "../config/database.js";

const router = Router();

// GET /api/dashboard/stats
router.get(
  "/stats",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const userRoles = req.user!.roles.map((r) => r.name);
      const isViewer = userRoles.includes("viewer");

      // Get assigned project IDs for viewers
      let assignedProjectIds: number[] = [];
      if (isViewer) {
        const assignments = await prisma.teamAssignment.findMany({
          where: { userId },
          select: { projectId: true },
        });
        assignedProjectIds = assignments.map((a) => a.projectId);
      }

      const projectFilter = isViewer
        ? { id: { in: assignedProjectIds }, deletedAt: null }
        : { deletedAt: null };

      // Total projects
      const totalProjects = await prisma.project.count({
        where: projectFilter,
      });

      // Active projects
      const activeProjects = await prisma.project.count({
        where: { ...projectFilter, status: "active" },
      });

      // Total infrastructure nodes
      const totalInfrastructureNodes = await prisma.infrastructureNode.count({
        where: {
          ...(isViewer ? { projectId: { in: assignedProjectIds } } : {}),
          deletedAt: null,
        },
      });

      // Open incidents
      const openIncidents = await prisma.incident.count({
        where: {
          status: { notIn: ["resolved", "closed"] },
          ...(isViewer ? { projectId: { in: assignedProjectIds } } : {}),
          deletedAt: null,
        },
      });

      // Critical incidents count
      const criticalIncidentsCount = await prisma.incident.count({
        where: {
          severity: "critical",
          status: { notIn: ["resolved", "closed"] },
          ...(isViewer ? { projectId: { in: assignedProjectIds } } : {}),
          deletedAt: null,
        },
      });

      // SSL expiring soon (within 30 days)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      // Infrastructure health counts
      const healthyNodes = await prisma.infrastructureNode.count({
        where: {
          status: "healthy",
          ...(isViewer ? { projectId: { in: assignedProjectIds } } : {}),
          deletedAt: null,
        },
      });

      const warningNodes = await prisma.infrastructureNode.count({
        where: {
          status: "warning",
          ...(isViewer ? { projectId: { in: assignedProjectIds } } : {}),
          deletedAt: null,
        },
      });

      const criticalNodes = await prisma.infrastructureNode.count({
        where: {
          status: "critical",
          ...(isViewer ? { projectId: { in: assignedProjectIds } } : {}),
          deletedAt: null,
        },
      });

      // Recent activity (last 10)
      const recentActivities = await prisma.activityLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Recent deployments (last 5)
      const recentDeployments = await prisma.deployment.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        where: isViewer
          ? { projectId: { in: assignedProjectIds } }
          : {},
        include: {
          project: {
            select: { id: true, name: true, slug: true },
          },
          environment: {
            select: { id: true, name: true, type: true },
          },
          application: {
            select: { id: true, name: true, slug: true },
          },
          deployedByUser: {
            select: { id: true, name: true },
          },
        },
      });

      // Expiring SSL certificates
      const expiringSSLCertificates = await prisma.sslCertificate.findMany({
        take: 5,
        where: {
          notAfter: { lte: thirtyDaysFromNow },
          isActive: true,
          ...(isViewer ? { projectId: { in: assignedProjectIds } } : {}),
          deletedAt: null,
        },
        orderBy: { notAfter: "asc" },
      });

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
          resourceHealth: {
            healthy: healthyNodes,
            warning: warningNodes,
            critical: criticalNodes,
          },
        },
        message: "Dashboard data retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
