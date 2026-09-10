import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import { generateSlug } from "../lib/slug.js";
import prisma from "../config/database.js";
import { sendIncidentNotification } from "../services/notification.service.js";

const router = Router();

const createIncidentSchema = z.object({
  projectId: z.number().int().positive(),
  title: z.string().min(2).max(255),
  description: z.string().nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "investigating", "identified", "monitoring", "resolved", "closed"]).optional(),
  affectedServices: z.string().nullable().optional(),
});

const updateIncidentSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().nullable().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "investigating", "identified", "monitoring", "resolved", "closed"]).optional(),
  affectedServices: z.string().nullable().optional(),
  rootCause: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
});

// GET /api/incidents - List all incidents
router.get(
  "/",
  authenticate,
  requirePermission("view-incidents"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const userRoles = req.user!.roles.map((r) => r.name);
      const isViewer = userRoles.includes("viewer");

      const { search, severity, status, projectId, page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { deletedAt: null };

      if (isViewer) {
        const assignments = await prisma.teamAssignment.findMany({
          where: { userId },
          select: { projectId: true },
        });
        const allowedProjectIds = assignments.map((a) => a.projectId);

        if (projectId) {
          const requestedId = parseInt(projectId as string, 10);
          if (!allowedProjectIds.includes(requestedId)) {
            return res.status(200).json({ success: true, data: [], meta: { currentPage: 1, lastPage: 0, perPage: limitNum, total: 0 } });
          }
          where.projectId = requestedId;
        } else {
          where.projectId = { in: allowedProjectIds };
        }
      } else {
        if (projectId) where.projectId = parseInt(projectId as string, 10);
      }

      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
        ];
      }
      if (severity) where.severity = severity;
      if (status) where.status = status;

      const [incidents, total] = await Promise.all([
        prisma.incident.findMany({
          where,
          include: {
            project: { select: { id: true, name: true, slug: true } },
            reportedUser: { select: { id: true, name: true, email: true } },
            assignedUser: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.incident.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: incidents,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Incidents retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/incidents - Create incident
router.post(
  "/",
  authenticate,
  requirePermission("create-incidents"),
  validate(createIncidentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const baseSlug = generateSlug(req.body.title);

      // Ensure slug uniqueness within the project
      let slug = baseSlug;
      let counter = 1;
      const maxAttempts = 100;
      while (counter <= maxAttempts) {
        const existing = await prisma.incident.findFirst({
          where: { projectId: req.body.projectId, slug },
        });
        if (!existing) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const incident = await prisma.incident.create({
        data: {
          projectId: req.body.projectId,
          title: req.body.title,
          slug,
          description: req.body.description || null,
          severity: req.body.severity,
          status: req.body.status || "open",
          reportedBy: req.user!.id,
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          reportedUser: { select: { id: true, name: true, email: true } },
        },
      });

      await logActivity({
        description: `Incident "${incident.title}" reported`,
        subjectType: "App\\Models\\Incident",
        subjectId: incident.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: incident },
      });

      // Send incident notification
      sendIncidentNotification(incident, "created").catch((err) =>
        console.error("[Notification] Incident notification failed:", err)
      );

      res.status(201).json({ success: true, data: incident, message: "Incident created" });
    } catch (error) {
      console.error("[Incident Create] Error:", error);
      next(error);
    }
  }
);

// PUT /api/incidents/:id - Update incident
router.put(
  "/:id",
  authenticate,
  requirePermission("update-incidents"),
  validate(updateIncidentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      console.log("[Incident Update] Request for ID:", id, "Body:", req.body);
      const existing = await prisma.incident.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Incident not found");

      // Handle slug update if title changes
      let slugUpdate: any = {};
      if (req.body.title && req.body.title !== existing.title) {
        const baseSlug = generateSlug(req.body.title);
        let slug = baseSlug;
        let counter = 1;
        const maxAttempts = 100;
        while (counter <= maxAttempts) {
          const duplicate = await prisma.incident.findFirst({
            where: { projectId: existing.projectId, slug, id: { not: existing.id } },
          });
          if (!duplicate) break;
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        slugUpdate = { slug };
      }

      const incident = await prisma.incident.update({
        where: { id: existing.id },
        data: {
          ...(req.body.title && { title: req.body.title }),
          ...slugUpdate,
          ...(req.body.description !== undefined && { description: req.body.description }),
          ...(req.body.severity && { severity: req.body.severity }),
          ...(req.body.status && { status: req.body.status }),
          ...(req.body.rootCause !== undefined && { rootCause: req.body.rootCause }),
          ...(req.body.resolution !== undefined && { resolution: req.body.resolution }),
          ...((req.body.status === "resolved" || req.body.status === "closed") && { resolvedAt: new Date() }),
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          reportedUser: { select: { id: true, name: true, email: true } },
          assignedUser: { select: { id: true, name: true, email: true } },
        },
      });

      await logActivity({
        description: `Incident "${incident.title}" updated`,
        subjectType: "App\\Models\\Incident",
        subjectId: incident.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: incident },
      });

      // Send incident update notification
      const updateEvent = incident.status === "resolved" || incident.status === "closed" ? "resolved" : "updated";
      sendIncidentNotification(incident, updateEvent).catch((err) =>
        console.error("[Notification] Incident notification failed:", err)
      );

      res.status(200).json({ success: true, data: incident, message: "Incident updated" });
    } catch (error) {
      console.error("[Incident Update] Error:", error);
      next(error);
    }
  }
);

export default router;
