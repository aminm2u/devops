import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { RequestWithUser } from "../types/index.js";
import { logActivity } from "../middleware/activity.js";
import { generateSlug } from "../lib/slug.js";
import prisma from "../config/database.js";

const router = Router();

// ==================== Validation Schemas ====================

const createTicketSchema = z.object({
  projectId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  categoryId: z.number().int().positive().optional().nullable(),
  source: z.enum(["web", "email", "phone", "walk-in"]).optional(),
  assignedTo: z.number().int().positive().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const updateTicketSchema = createTicketSchema.partial();

const updateStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "awaiting_response", "resolved", "closed", "reopened"]),
  resolutionNotes: z.string().optional().nullable(),
});

const assignTicketSchema = z.object({
  assignedTo: z.number().int().positive().nullable(),
});

const satisfactionSchema = z.object({
  satisfaction: z.number().int().min(1).max(5),
  feedback: z.string().optional().nullable(),
});

const createCommentSchema = z.object({
  content: z.string().min(1, "Content is required"),
  isInternal: z.boolean().optional(),
});

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

// ==================== Stats ====================

router.get(
  "/stats",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const userRoles = req.user?.roles?.map((r: any) => r.name) || [];
      const isAdmin = userRoles.some((r: string) => ["super-admin", "devops-admin"].includes(r));
      const isEngineer = userRoles.some((r: string) => r === "devops-engineer");

      // Build role-based filter
      let roleFilter: any = {};
      if (!isAdmin && !isEngineer) {
        // Viewer: only own tickets
        roleFilter = { reportedBy: userId };
      } else if (isEngineer) {
        // Engineer: assigned tickets + viewer-reported tickets (not admin tickets)
        roleFilter = {
          OR: [
            { assignedTo: userId },
            { reporter: { roles: { some: { role: { name: "viewer" } } } } },
          ],
        };
      }
      // Admin: no additional filter

      const baseWhere = { isActive: true, deletedAt: null, ...roleFilter };

      // Get counts by status
      const [total, open, inProgress, awaitingResponse, resolvedToday, closedToday] =
        await Promise.all([
          prisma.helpdeskTicket.count({ where: baseWhere }),
          prisma.helpdeskTicket.count({ where: { ...baseWhere, status: "open" } }),
          prisma.helpdeskTicket.count({ where: { ...baseWhere, status: "in_progress" } }),
          prisma.helpdeskTicket.count({ where: { ...baseWhere, status: "awaiting_response" } }),
          prisma.helpdeskTicket.count({
            where: {
              ...baseWhere,
              status: "resolved",
              resolvedAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          }),
          prisma.helpdeskTicket.count({
            where: {
              ...baseWhere,
              status: "closed",
              closedAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          }),
        ]);

      // Get counts by priority
      const [urgent, high, medium, low] = await Promise.all([
        prisma.helpdeskTicket.count({ where: { ...baseWhere, priority: "urgent" } }),
        prisma.helpdeskTicket.count({ where: { ...baseWhere, priority: "high" } }),
        prisma.helpdeskTicket.count({ where: { ...baseWhere, priority: "medium" } }),
        prisma.helpdeskTicket.count({ where: { ...baseWhere, priority: "low" } }),
      ]);

      // My tickets (for engineers)
      let myOpenTickets = 0;
      if (isEngineer && userId) {
        myOpenTickets = await prisma.helpdeskTicket.count({
          where: {
            isActive: true,
            deletedAt: null,
            assignedTo: userId,
            status: { in: ["open", "in_progress", "awaiting_response"] },
          },
        });
      }

      // Average satisfaction
      const satisfactionResult = await prisma.helpdeskTicket.aggregate({
        where: { ...baseWhere, satisfaction: { not: null } },
        _avg: { satisfaction: true },
        _count: { satisfaction: true },
      });

      res.json({
        data: {
          total,
          open,
          inProgress,
          awaitingResponse,
          resolvedToday,
          closedToday,
          myOpenTickets,
          priority: { urgent, high, medium, low },
          avgSatisfaction: satisfactionResult._avg.satisfaction || 0,
          totalRated: satisfactionResult._count.satisfaction || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching helpdesk stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Reports ====================

router.get(
  "/reports/monthly",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const userRoles = req.user?.roles?.map((r: any) => r.name) || [];
      const isAdmin = userRoles.some((r: string) => ["super-admin", "devops-admin"].includes(r));
      const isEngineer = userRoles.some((r: string) => r === "devops-engineer");

      const { month, year } = req.query;
      const now = new Date();
      const targetMonth = month ? parseInt(month as string) - 1 : now.getMonth();
      const targetYear = year ? parseInt(year as string) : now.getFullYear();

      const startDate = new Date(targetYear, targetMonth, 1);
      const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

      const baseWhere: any = {
        isActive: true,
        deletedAt: null,
        createdAt: { gte: startDate, lte: endDate },
      };

      // Role-based filtering
      if (!isAdmin && !isEngineer) {
        // Viewer: only own tickets
        baseWhere.reportedBy = userId;
      } else if (isEngineer) {
        // Engineer: assigned tickets + viewer-reported tickets
        baseWhere.OR = [
          { assignedTo: userId },
          { reporter: { roles: { some: { role: { name: "viewer" } } } } },
        ];
      }
      // Admin: no additional filter

      // Get all tickets for the month
      const tickets = await prisma.helpdeskTicket.findMany({
        where: baseWhere,
        include: {
          category: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
          reporter: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Calculate stats
      const totalCreated = tickets.length;
      const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed");
      const totalResolved = resolved.length;
      const avgResolutionTime =
        resolved.length > 0
          ? Math.round(
              resolved.reduce((sum, t) => {
                const created = new Date(t.createdAt).getTime();
                const resolvedAt = t.resolvedAt ? new Date(t.resolvedAt).getTime() : created;
                return sum + (resolvedAt - created);
              }, 0) / resolved.length / (1000 * 60)
            )
          : 0;

      // SLA compliance
      const slaBreached = tickets.filter((t) => {
        if (!t.slaResolutionAt || t.status === "open" || t.status === "in_progress") return false;
        const resolvedAt = t.resolvedAt ? new Date(t.resolvedAt) : new Date();
        return resolvedAt > new Date(t.slaResolutionAt);
      }).length;

      const slaComplianceRate = totalResolved > 0 ? Math.round(((totalResolved - slaBreached) / totalResolved) * 100) : 100;

      // By category
      const byCategory = tickets.reduce((acc, t) => {
        const cat = t.category?.name || "Uncategorized";
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // By priority
      const byPriority = tickets.reduce((acc, t) => {
        acc[t.priority] = (acc[t.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // By assignee
      const byAssignee = tickets.reduce((acc, t) => {
        const name = t.assignee?.name || "Unassigned";
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // By day
      const byDay = tickets.reduce((acc, t) => {
        const day = new Date(t.createdAt).getDate();
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      // Satisfaction
      const ratedTickets = tickets.filter((t) => t.satisfaction !== null);
      const avgSatisfaction =
        ratedTickets.length > 0
          ? ratedTickets.reduce((sum, t) => sum + (t.satisfaction || 0), 0) / ratedTickets.length
          : 0;

      res.json({
        data: {
          period: {
            month: targetMonth + 1,
            year: targetYear,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
          summary: {
            totalCreated,
            totalResolved,
            totalOpen: totalCreated - totalResolved,
            avgResolutionTime,
            slaBreached,
            slaComplianceRate,
            avgSatisfaction: Math.round(avgSatisfaction * 10) / 10,
            totalRated: ratedTickets.length,
          },
          byCategory,
          byPriority,
          byAssignee,
          byDay,
          tickets: tickets.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            category: t.category?.name,
            assignee: t.assignee?.name,
            createdAt: t.createdAt,
            resolvedAt: t.resolvedAt,
            satisfaction: t.satisfaction,
          })),
        },
      });
    } catch (error) {
      console.error("Error generating monthly report:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Categories ====================

router.get(
  "/categories",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const categories = await prisma.helpdeskCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { tickets: true } } },
      });
      res.json({ data: categories });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Projects ====================

router.get(
  "/projects",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projects = await prisma.project.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          _count: { select: { teamAssignments: true, helpdeskTickets: true } },
        },
        orderBy: { name: "asc" },
      });
      res.json({ data: projects });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/categories",
  authenticate,
  requireRole(["super-admin", "devops-admin"]),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const data = createCategorySchema.parse(req.body);
      const category = await prisma.helpdeskCategory.create({ data });
      res.status(201).json({ data: category, message: "Category created" });
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Tickets ====================

router.get(
  "/tickets",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const userRoles = req.user?.roles?.map((r: any) => r.name) || [];
      const isAdmin = userRoles.some((r: string) => ["super-admin", "devops-admin"].includes(r));
      const isEngineer = userRoles.some((r: string) => r === "devops-engineer");

      const {
        status,
        priority,
        categoryId,
        assignedTo,
        search,
        page = "1",
        limit = "20",
      } = req.query;

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        isActive: true,
        deletedAt: null,
      };

      // Role-based filtering
      if (!isAdmin && !isEngineer) {
        // Viewer: only own tickets
        where.reportedBy = userId;
      } else if (isEngineer) {
        // Engineer: assigned tickets + viewer-reported tickets
        where.OR = [
          { assignedTo: userId },
          { reporter: { roles: { some: { role: { name: "viewer" } } } } },
        ];
      }
      // Admin: no additional filter

      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (categoryId) where.categoryId = parseInt(categoryId as string, 10);
      if (assignedTo) where.assignedTo = parseInt(assignedTo as string, 10);

      if (search) {
        const searchCondition = [
          { title: { contains: search as string, mode: "insensitive" } },
          { slug: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
          { contactName: { contains: search as string, mode: "insensitive" } },
          { contactEmail: { contains: search as string, mode: "insensitive" } },
        ];
        // Merge OR conditions if role filter already uses OR
        if (where.OR) {
          where.AND = [{ OR: searchCondition }, { OR: where.OR }];
          delete where.OR;
        } else {
          where.OR = searchCondition;
        }
      }

      const [tickets, total] = await Promise.all([
        prisma.helpdeskTicket.findMany({
          where,
          include: {
            category: { select: { id: true, name: true, color: true } },
            assignee: { select: { id: true, name: true, email: true } },
            reporter: { select: { id: true, name: true, email: true } },
            _count: { select: { comments: true, attachments: true } },
          },
          orderBy: [
            { priority: "asc" },
            { createdAt: "desc" },
          ],
          skip,
          take: limitNum,
        }),
        prisma.helpdeskTicket.count({ where }),
      ]);

      const lastPage = Math.ceil(total / limitNum);

      res.json({
        data: tickets,
        meta: {
          currentPage: pageNum,
          lastPage,
          perPage: limitNum,
          total,
        },
      });
    } catch (error) {
      console.error("Error fetching tickets:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/tickets/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const ticket = await prisma.helpdeskTicket.findFirst({
        where: { id, isActive: true, deletedAt: null },
        include: {
          category: { select: { id: true, name: true, color: true, icon: true } },
          assignee: { select: { id: true, name: true, email: true } },
          reporter: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true, slug: true } },
          comments: {
            where: { isActive: true, deletedAt: null },
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
          },
          attachments: {
            where: { isActive: true },
            include: { uploader: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      res.json({ data: ticket });
    } catch (error) {
      console.error("Error fetching ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/tickets",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const data = createTicketSchema.parse(req.body);
      const user = req.user;

      // Generate slug
      let slug = await generateSlug(data.title);
      let slugExists = await prisma.helpdeskTicket.findFirst({
        where: { slug, projectId: data.projectId || null },
      });
      let counter = 1;
      while (slugExists) {
        slug = `${await generateSlug(data.title)}-${counter}`;
        slugExists = await prisma.helpdeskTicket.findFirst({
          where: { slug, projectId: data.projectId || null },
        });
        counter++;
      }

      // Calculate SLA times based on priority
      const now = new Date();
      let slaResponseHours = 4;
      let slaResolutionHours = 24;

      switch (data.priority) {
        case "urgent":
          slaResponseHours = 1;
          slaResolutionHours = 4;
          break;
        case "high":
          slaResponseHours = 2;
          slaResolutionHours = 8;
          break;
        case "medium":
          slaResponseHours = 4;
          slaResolutionHours = 24;
          break;
        case "low":
          slaResponseHours = 8;
          slaResolutionHours = 48;
          break;
      }

      const slaResponseAt = new Date(now.getTime() + slaResponseHours * 60 * 60 * 1000);
      const slaResolutionAt = new Date(now.getTime() + slaResolutionHours * 60 * 60 * 1000);

      // Auto-assign engineer from project team if no assignee specified
      let autoAssignedTo = data.assignedTo || null;
      if (!autoAssignedTo && data.projectId) {
        // Find team members assigned to this project
        const projectTeam = await prisma.teamAssignment.findMany({
          where: {
            projectId: data.projectId,
            isActive: true,
          },
          include: {
            user: {
              select: { id: true, name: true, isActive: true },
            },
          },
          orderBy: { assignedAt: "asc" },
        });

        // Filter to active users who have devops-engineer or devops-admin role
        const engineerRoleIds = await prisma.role.findMany({
          where: { name: { in: ["devops-engineer", "devops-admin"] } },
          select: { id: true },
        });
        const roleIdSet = new Set(engineerRoleIds.map((r) => r.id));

        const modelRoles = await prisma.modelHasRole.findMany({
          where: {
            modelType: "App\\Models\\User",
            roleId: { in: Array.from(roleIdSet) },
          },
          select: { modelId: true },
        });
        const engineerUserIds = new Set(modelRoles.map((mr) => mr.modelId));

        const engineers = projectTeam.filter(
          (m) => m.user.isActive && engineerUserIds.has(m.user.id)
        );

        if (engineers.length > 0) {
          // Pick the engineer with the fewest open tickets (load balancing)
          let bestEngineer = engineers[0].user.id;
          let minOpenTickets = Infinity;

          for (const member of engineers) {
            const openCount = await prisma.helpdeskTicket.count({
              where: {
                assignedTo: member.user.id,
                status: { in: ["open", "in_progress", "awaiting_response"] },
                isActive: true,
                deletedAt: null,
              },
            });
            if (openCount < minOpenTickets) {
              minOpenTickets = openCount;
              bestEngineer = member.user.id;
            }
          }

          autoAssignedTo = bestEngineer;
        }
      }

      const ticket = await prisma.helpdeskTicket.create({
        data: {
          projectId: data.projectId || null,
          title: data.title,
          slug,
          description: data.description,
          priority: data.priority || "medium",
          categoryId: data.categoryId || null,
          source: data.source || "web",
          assignedTo: autoAssignedTo,
          reportedBy: user?.id || null,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          slaResponseAt,
          slaResolutionAt,
          metadata: data.metadata,
        },
        include: {
          category: { select: { id: true, name: true, color: true } },
          assignee: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        subjectType: "App\\Models\\HelpdeskTicket",
        subjectId: ticket.id,
        userId: user?.id,
        action: "created",
        description: `Created ticket: ${ticket.title}`,
      });

      // Notify admin about new ticket
      const adminRoles = await prisma.modelHasRole.findMany({
        where: {
          modelType: "App\\Models\\User",
          role: { name: { in: ["super-admin", "devops-admin"] } },
        },
        include: { role: true },
      });
      const adminIds = [...new Set(adminRoles.map((mr) => mr.modelId))];
      const admins = await prisma.user.findMany({
        where: { id: { in: adminIds }, isActive: true },
      });

      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            title: "New Helpdesk Ticket",
            message: `New ticket "${ticket.title}" has been created by ${user?.name || "a user"}${ticket.assignee ? ` and assigned to ${ticket.assignee.name}` : ""}`,
            type: "info",
            metadata: { ticketId: ticket.id, ticketTitle: ticket.title },
          },
        });
      }

      // Notify auto-assigned engineer
      if (autoAssignedTo && autoAssignedTo !== user?.id) {
        await prisma.notification.create({
          data: {
            userId: autoAssignedTo,
            title: "Ticket Assigned to You",
            message: `Ticket "${ticket.title}" has been auto-assigned to you based on project "${ticket.project?.name || "N/A"}".`,
            type: "info",
            metadata: { ticketId: ticket.id, ticketTitle: ticket.title, projectId: data.projectId },
          },
        });
      }

      res.status(201).json({ data: ticket, message: "Ticket created" });
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.put(
  "/tickets/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const data = updateTicketSchema.parse(req.body);

      const existing = await prisma.helpdeskTicket.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticket = await prisma.helpdeskTicket.update({
        where: { id },
        data: {
          ...(data.projectId !== undefined && { projectId: data.projectId }),
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.priority !== undefined && { priority: data.priority }),
          ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
          ...(data.source !== undefined && { source: data.source }),
          ...(data.assignedTo !== undefined && { assignedTo: data.assignedTo }),
          ...(data.contactName !== undefined && { contactName: data.contactName }),
          ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
          ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone }),
          ...(data.metadata !== undefined && { metadata: data.metadata }),
        },
        include: {
          category: { select: { id: true, name: true, color: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      await logActivity({
        subjectType: "App\\Models\\HelpdeskTicket",
        subjectId: ticket.id,
        userId: req.user?.id,
        action: "updated",
        description: `Updated ticket: ${ticket.title}`,
      });

      res.json({ data: ticket, message: "Ticket updated" });
    } catch (error) {
      console.error("Error updating ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.delete(
  "/tickets/:id",
  authenticate,
  requireRole(["super-admin", "devops-admin"]),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);

      const existing = await prisma.helpdeskTicket.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      await prisma.helpdeskTicket.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await logActivity({
        subjectType: "App\\Models\\HelpdeskTicket",
        subjectId: id,
        userId: req.user?.id,
        action: "deleted",
        description: `Deleted ticket: ${existing.title}`,
      });

      res.json({ message: "Ticket deleted" });
    } catch (error) {
      console.error("Error deleting ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Status & Assignment ====================

router.put(
  "/tickets/:id/status",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const data = updateStatusSchema.parse(req.body);
      const userId = req.user?.id;
      const userRoles = req.user?.roles?.map((r: any) => r.name) || [];
      const isAdmin = userRoles.some((r: string) => ["super-admin", "devops-admin"].includes(r));
      const isEngineer = userRoles.some((r: string) => r === "devops-engineer");

      const existing = await prisma.helpdeskTicket.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Role-based status change restrictions
      if (!isAdmin && !isEngineer) {
        // Viewer: can only reopen their own tickets
        if (existing.reportedBy !== userId) {
          return res.status(403).json({ error: "You can only change status of your own tickets" });
        }
        if (data.status !== "reopened") {
          return res.status(403).json({ error: "You can only reopen tickets" });
        }
      } else if (isEngineer) {
        // Engineer: can change status on assigned tickets or viewer-reported tickets
        const isAssigned = existing.assignedTo === userId;
        const isViewerTicket = existing.reportedBy === userId; // engineers can also report
        if (!isAssigned && !isViewerTicket) {
          return res.status(403).json({ error: "You can only manage tickets assigned to you" });
        }
      }
      // Admin: no restrictions

      const updateData: any = { status: data.status };

      // Auto-set timestamps based on status
      if (data.status === "resolved") {
        updateData.resolvedAt = new Date();
        if (data.resolutionNotes) {
          updateData.resolutionNotes = data.resolutionNotes;
        }
      } else if (data.status === "closed") {
        updateData.closedAt = new Date();
      } else if (data.status === "reopened") {
        updateData.resolvedAt = null;
        updateData.closedAt = null;
        updateData.satisfaction = null;
      }

      const ticket = await prisma.helpdeskTicket.update({
        where: { id },
        data: updateData,
        include: {
          category: { select: { id: true, name: true, color: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      await logActivity({
        subjectType: "App\\Models\\HelpdeskTicket",
        subjectId: id,
        userId: req.user?.id,
        action: "status_changed",
        description: `Ticket status changed to ${data.status}`,
      });

      // Notify requester when resolved
      if (data.status === "resolved" && existing.reportedBy) {
        const resolutionTime = existing.resolvedAt
          ? Math.round((existing.resolvedAt.getTime() - existing.createdAt.getTime()) / (1000 * 60))
          : null;

        await prisma.notification.create({
          data: {
            userId: existing.reportedBy,
            title: "Your Ticket Has Been Resolved",
            message: `Your ticket "${existing.title}" has been resolved. ${resolutionTime ? `Resolution time: ${resolutionTime} minutes.` : ""} Please rate the resolution.`,
            type: "success",
            metadata: {
              ticketId: id,
              resolutionTime,
              satisfactionUrl: `/helpdesk/${id}`,
            },
          },
        });
      }

      // Notify about reopening
      if (data.status === "reopened" && existing.assignedTo) {
        await prisma.notification.create({
          data: {
            userId: existing.assignedTo,
            title: "Ticket Reopened",
            message: `Ticket "${existing.title}" has been reopened and needs attention.`,
            type: "warning",
            metadata: { ticketId: id },
          },
        });
      }

      res.json({ data: ticket, message: "Status updated" });
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.put(
  "/tickets/:id/assign",
  authenticate,
  requireRole(["super-admin", "devops-admin"]),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const data = assignTicketSchema.parse(req.body);

      const existing = await prisma.helpdeskTicket.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticket = await prisma.helpdeskTicket.update({
        where: { id },
        data: { assignedTo: data.assignedTo },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      if (data.assignedTo && existing.status === "open") {
        await prisma.helpdeskTicket.update({
          where: { id },
          data: { status: "in_progress" },
        });
        ticket.status = "in_progress";
      }

      await logActivity({
        subjectType: "App\\Models\\HelpdeskTicket",
        subjectId: id,
        userId: req.user?.id,
        action: "assigned",
        description: `Ticket assigned to user ${data.assignedTo}`,
      });

      // Notify assigned engineer
      if (data.assignedTo) {
        const assignee = await prisma.user.findUnique({
          where: { id: data.assignedTo },
        });
        if (assignee) {
          await prisma.notification.create({
            data: {
              userId: data.assignedTo,
              title: "Ticket Assigned to You",
              message: `Ticket "HD-${String(id).padStart(4, '0')}" has been assigned to you. Priority: ${existing.priority}`,
              type: "info",
              metadata: { ticketId: id, ticketTitle: existing.title, priority: existing.priority },
            },
          });
        }
      }

      // Notify requester about assignment
      if (existing.reportedBy) {
        await prisma.notification.create({
          data: {
            userId: existing.reportedBy,
            title: "Your Ticket Has Been Assigned",
            message: `Your ticket "${existing.title}" has been assigned to ${ticket.assignee?.name || "a technician"}`,
            type: "success",
            metadata: { ticketId: id },
          },
        });
      }

      res.json({ data: ticket, message: "Ticket assigned" });
    } catch (error) {
      console.error("Error assigning ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.put(
  "/tickets/:id/satisfaction",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const data = satisfactionSchema.parse(req.body);

      const existing = await prisma.helpdeskTicket.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      if (existing.status !== "resolved" && existing.status !== "closed") {
        return res.status(400).json({ error: "Can only rate resolved or closed tickets" });
      }

      const ticket = await prisma.helpdeskTicket.update({
        where: { id },
        data: {
          satisfaction: data.satisfaction,
          metadata: {
            ...(existing.metadata as any),
            satisfactionFeedback: data.feedback,
          },
        },
      });

      res.json({ data: ticket, message: "Thank you for your feedback" });
    } catch (error) {
      console.error("Error submitting satisfaction:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Comments ====================

router.get(
  "/tickets/:id/comments",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const ticketId = parseInt(req.params.id);
      const isAdmin = req.user?.roles?.some((r: any) =>
        ["super-admin", "devops-admin"].includes(r.name)
      );

      const where: any = {
        ticketId,
        isActive: true,
        deletedAt: null,
      };

      // Non-admins can't see internal notes
      if (!isAdmin) {
        where.isInternal = false;
      }

      const comments = await prisma.helpdeskComment.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });

      res.json({ data: comments });
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/tickets/:id/comments",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const ticketId = parseInt(req.params.id);
      const data = createCommentSchema.parse(req.body);
      const user = req.user;

      const ticket = await prisma.helpdeskTicket.findFirst({
        where: { id: ticketId, isActive: true, deletedAt: null },
      });

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const comment = await prisma.helpdeskComment.create({
        data: {
          ticketId,
          userId: user?.id,
          content: data.content,
          isInternal: data.isInternal || false,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      // If ticket was awaiting_response, move back to in_progress
      if (ticket.status === "awaiting_response" && !data.isInternal) {
        await prisma.helpdeskTicket.update({
          where: { id: ticketId },
          data: { status: "in_progress" },
        });
      }

      await logActivity({
        subjectType: "App\\Models\\HelpdeskComment",
        subjectId: comment.id,
        userId: user?.id,
        action: "created",
        description: `Added comment to ticket: ${ticket.title}`,
      });

      res.status(201).json({ data: comment, message: "Comment added" });
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.delete(
  "/comments/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);

      const existing = await prisma.helpdeskComment.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Comment not found" });
      }

      // Only author or admin can delete
      const isAdmin = req.user?.roles?.some((r: any) =>
        ["super-admin", "devops-admin"].includes(r.name)
      );
      if (existing.userId !== req.user?.id && !isAdmin) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await prisma.helpdeskComment.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });

      res.json({ message: "Comment deleted" });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ==================== Users (for assignment dropdown) ====================

router.get(
  "/users",
  authenticate,
  requireRole(["super-admin", "devops-admin"]),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      });
      res.json({ data: users });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
