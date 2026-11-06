import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../rbac/authorize.js";
import { can } from "../rbac/effective.js";
import { scopeFilter, withScope } from "../rbac/authorize.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { logActivity } from "../middleware/activity.js";
import { AppError, NotFoundError } from "../lib/errors.js";
import { resolveTeamId } from "../lib/teamScope.js";
import { generateSlug } from "../lib/slug.js";
import { availablePeriods, monthlyReport } from "../services/helpdeskReport.service.js";
import prisma from "../config/database.js";
import { getIO } from "../lib/socket.js";

const router = Router();

// ==================== Validation Schemas ====================

/**
 * An empty text input means "not given", not "invalid".
 *
 * The create dialog pre-fills the contact fields from the reporter's own
 * profile and lets them clear them, so `""` reaches the API as a normal case.
 * `z.string().email()` rejected it, and because the parse sat inside the
 * route's 500 catch the user saw "Internal server error" for clearing a field.
 */
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), schema);

const createTicketSchema = z.object({
  projectId: z.number().int().positive().optional().nullable(),
  /** Which team owns the ticket. Defaults to the reporter's only team. */
  teamId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  categoryId: z.number().int().positive().optional().nullable(),
  /** Must match the seeded `ticket_source` reference group, or the form can
   *  offer a value this schema rejects. */
  source: z.enum(["web", "email", "phone", "chat", "walk-in"]).optional(),
  assignedTo: z.number().int().positive().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: blankToNull(z.string().email().nullable()).optional(),
  contactPhone: blankToNull(z.string().nullable()).optional(),
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

/** `isActive` is how a category is retired and restored, so it is writable. */
const updateCategorySchema = createCategorySchema
  .extend({ isActive: z.boolean().optional() })
  .partial();

// ==================== Visibility scope ====================

/**
 * Which tickets a caller may see, decided by capability rather than by role
 * name.
 *
 *   helpdesk.ticket.read.all   every ticket
 *   helpdesk.ticket.manage     the tickets they are working on, within their
 *                              team scope, plus their own reports
 *   otherwise                  only what they reported
 *
 * The previous implementation branched on `super-admin` / `devops-engineer` /
 * `viewer`; `viewer` is not a catalog role, so that branch was dead and the
 * engineer branch matched nobody either. Scope now follows the same resolver
 * the rest of the API uses.
 */
function ticketScope(req: RequestWithUser): Record<string, unknown> {
  const access = req.access;
  const userId = req.user!.id;
  if (!access) return { reportedBy: userId };

  if (can(access, "helpdesk.ticket.read.all", "all")) return {};

  // A manager sees their team's queue (narrowed by `scopeFilter`) plus anything
  // they raised themselves. Both conditions go through `withScope` so a caller
  // that already filtered on `OR` is not silently overwritten.
  if (can(access, "helpdesk.ticket.manage", "self")) {
    return withScope({ reportedBy: userId }, scopeFilter(access, "helpdesk.ticket.manage"));
  }

  return { reportedBy: userId };
}

// ==================== Stats ====================

router.get(
  "/stats",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const baseWhere = { isActive: true, deletedAt: null, ...ticketScope(req) };

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

      // My own open queue — meaningful for anyone who works tickets, not just
      // one role name.
      const myOpenTickets = userId
        ? await prisma.helpdeskTicket.count({
            where: {
              isActive: true,
              deletedAt: null,
              assignedTo: userId,
              status: { in: ["open", "in_progress", "awaiting_response"] },
            },
          })
        : 0;

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

/**
 * Month picker options — only periods that actually contain visible tickets,
 * so the report never opens on an empty month with no explanation.
 */
router.get(
  "/reports/periods",
  authenticate,
  authorize({ permission: "helpdesk.report.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const periods = await availablePeriods(ticketScope(req));
      res.json({ data: periods });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/reports/monthly",
  authenticate,
  authorize({ permission: "helpdesk.report.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const month = Math.min(
        12,
        Math.max(1, parseInt(String(req.query.month ?? ""), 10) || now.getMonth() + 1)
      );
      const year = parseInt(String(req.query.year ?? ""), 10) || now.getFullYear();

      const report = await monthlyReport({
        month,
        year,
        scope: ticketScope(req),
      });

      res.json({ data: report });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== Categories ====================

/**
 * `?includeInactive=true` is for the admin screen only — the pickers that fill
 * a ticket form must never offer a retired category, but the person who
 * retired it needs to see it to bring it back.
 */
router.get(
  "/categories",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const categories = await prisma.helpdeskCategory.findMany({
        where: includeInactive ? {} : { isActive: true },
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

router.post(
  "/categories",
  authenticate,
  requirePermission("helpdesk.ticket.manage"),
  validate(createCategorySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const data = req.body as z.infer<typeof createCategorySchema>;
      const name = data.name.trim();

      // `name` is @unique, but the index is case-SENSITIVE, so "Hardware Issue"
      // and "hardware issue" would both be created. Two categories that differ
      // only in case are indistinguishable in the picker, so refuse here.
      // A retired match still counts: restoring it is the intended path.
      const clash = await prisma.helpdeskCategory.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (clash) {
        throw new AppError(
          409,
          clash.isActive
            ? `A category named "${clash.name}" already exists`
            : `"${clash.name}" exists but is retired — restore it instead of creating a duplicate`
        );
      }

      const category = await prisma.helpdeskCategory.create({ data: { ...data, name } });

      await logActivity({
        description: `Helpdesk category "${category.name}" created`,
        subjectType: "HelpdeskCategory",
        subjectId: category.id,
        event: "created",
        causerId: req.user!.id,
      });

      res.status(201).json({ data: category, message: "Category created" });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/categories/:id",
  authenticate,
  requirePermission("helpdesk.ticket.manage"),
  validate(updateCategorySchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) throw new AppError(400, "Invalid category id");

      const existing = await prisma.helpdeskCategory.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Category not found");

      const body = req.body as z.infer<typeof updateCategorySchema>;
      if (body.name && body.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        const clash = await prisma.helpdeskCategory.findFirst({
          where: { name: { equals: body.name.trim(), mode: "insensitive" } },
        });
        if (clash) throw new AppError(409, `A category named "${clash.name}" already exists`);
      }

      const category = await prisma.helpdeskCategory.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.icon !== undefined ? { icon: body.icon } : {}),
          ...(body.color !== undefined ? { color: body.color } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });

      await logActivity({
        description: `Helpdesk category "${existing.name}" updated`,
        subjectType: "HelpdeskCategory",
        subjectId: category.id,
        event: "updated",
        causerId: req.user!.id,
      });

      res.json({ data: category, message: "Category updated" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Deleting a category is a retire, not a row removal.
 *
 * Tickets keep pointing at their category forever, so a real delete would
 * either fail on the foreign key or rewrite history. Flipping `is_active`
 * takes it out of every picker while leaving the tickets that used it fully
 * readable — and `PUT` can bring it back if it was retired by mistake.
 */
router.delete(
  "/categories/:id",
  authenticate,
  requirePermission("helpdesk.ticket.manage"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) throw new AppError(400, "Invalid category id");

      const existing = await prisma.helpdeskCategory.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Category not found");

      const category = await prisma.helpdeskCategory.update({
        where: { id },
        data: { isActive: false },
      });

      await logActivity({
        description: `Helpdesk category "${existing.name}" retired`,
        subjectType: "HelpdeskCategory",
        subjectId: category.id,
        event: "deleted",
        causerId: req.user!.id,
      });

      res.json({ data: category, message: "Category retired" });
    } catch (error) {
      next(error);
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

// ==================== Tickets ====================

router.get(
  "/tickets",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
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

      const filters: any = {};
      if (status) filters.status = status;
      if (priority) filters.priority = priority;
      if (categoryId) filters.categoryId = parseInt(categoryId as string, 10);
      if (assignedTo) filters.assignedTo = parseInt(assignedTo as string, 10);

      if (search) {
        filters.OR = [
          { title: { contains: search as string, mode: "insensitive" } },
          { slug: { contains: search as string, mode: "insensitive" } },
          { description: { contains: search as string, mode: "insensitive" } },
          { contactName: { contains: search as string, mode: "insensitive" } },
          { contactEmail: { contains: search as string, mode: "insensitive" } },
        ];
      }

      // `withScope` folds the visibility clause and the filter clause into one
      // AND so neither overwrites the other's OR.
      const where = withScope(
        { isActive: true, deletedAt: null, ...filters },
        ticketScope(req)
      );

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
      const id = parseInt(req.params.id as string, 10);
      const ticket = await prisma.helpdeskTicket.findFirst({
        // Id alone is not an access check — apply the same visibility rule the
        // list uses so a guessed id cannot read someone else's ticket.
        where: { id, isActive: true, deletedAt: null, ...ticketScope(req) },
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
  requirePermission("helpdesk.ticket.create"),
  validate(createTicketSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const data = req.body as z.infer<typeof createTicketSchema>;
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
          teamId: await resolveTeamId(req.access!, data.teamId),
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
            link: `/helpdesk/${ticket.id}`,
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
            link: `/helpdesk/${ticket.id}`,
          },
        });
      }

      // Emit socket event for new ticket to all helpdesk staff
      try {
        const io = getIO();
        io.emit("new-ticket", { ticket });
      } catch (err) {
        console.error("Socket emit failed:", err);
      }

      res.status(201).json({ data: ticket, message: "Ticket created" });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/tickets/:id",
  authenticate,
  requirePermission("helpdesk.ticket.manage"),
  validate(updateTicketSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const data = req.body as z.infer<typeof updateTicketSchema>;

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
      next(error);
    }
  }
);

router.delete(
  "/tickets/:id",
  authenticate,
  requirePermission("helpdesk.ticket.manage"),
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
  validate(updateStatusSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const data = req.body as z.infer<typeof updateStatusSchema>;
      const userId = req.user?.id;

      const existing = await prisma.helpdeskTicket.findFirst({
        where: { id, isActive: true, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Who may move a ticket, decided on capability rather than role name:
      //   • helpdesk.ticket.manage — the support queue, no restriction.
      //   • everyone else — only their own ticket, and only to reopen it, so a
      //     requester can push back but cannot close their own work as done.
      const access = req.access!;
      const managesQueue = can(access, "helpdesk.ticket.manage", "self");
      const isReporter = existing.reportedBy === userId;

      if (!managesQueue) {
        if (!isReporter) {
          return res.status(403).json({ error: "You can only change status of your own tickets" });
        }
        if (data.status !== "reopened") {
          return res.status(403).json({ error: "You can only reopen tickets" });
        }
      }

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
            link: `/helpdesk/${id}`,
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
            link: `/helpdesk/${id}`,
          },
        });
      }

      try {
        const io = getIO();
        io.to(`ticket-${id}`).emit("ticket-updated", { ticket });
      } catch (err) {
        console.error("Socket emit failed:", err);
      }

      res.json({ data: ticket, message: "Status updated" });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/tickets/:id/assign",
  authenticate,
  requirePermission("helpdesk.ticket.manage"),
  validate(assignTicketSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const data = req.body as z.infer<typeof assignTicketSchema>;

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
              link: `/helpdesk/${id}`,
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
            link: `/helpdesk/${id}`,
          },
        });
      }

      res.json({ data: ticket, message: "Ticket assigned" });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/tickets/:id/satisfaction",
  authenticate,
  validate(satisfactionSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id);
      const data = req.body as z.infer<typeof satisfactionSchema>;

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
      next(error);
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
  validate(createCommentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const ticketId = parseInt(req.params.id);
      const data = req.body as z.infer<typeof createCommentSchema>;
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

      // Emit socket event to clients listening in the ticket room
      try {
        const io = getIO();
        io.to(`ticket-${ticketId}`).emit("new-comment", {
          ticketId,
          comment
        });
      } catch (err) {
        console.error("Socket emit failed:", err);
      }

      res.status(201).json({ data: comment, message: "Comment added" });
    } catch (error) {
      next(error);
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
  requirePermission("helpdesk.ticket.manage"),
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
