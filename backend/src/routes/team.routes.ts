import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../rbac/authorize.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { AppError, NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

/**
 * Teams.
 *
 * A team is the unit of **scope**, not of capability: it decides which records
 * a grant applies to, and who approves work on them. Membership carries one of
 * three roles — `lead`, `assistant_lead`, `member` — which is what the approval
 * chain in `lib/teamScope.ts` walks.
 *
 * Exactly one lead per team is enforced here rather than in the schema: a
 * partial unique index is not expressible in Prisma, and promoting a new lead
 * has to demote the old one in the same transaction anyway.
 */

const router = Router();

const TEAM_TYPES = ["devops", "support", "project", "ops"] as const;
const TEAM_ROLES = ["lead", "assistant_lead", "member"] as const;

const teamSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(TEAM_TYPES).default("devops"),
  description: z.string().max(1000).nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

const memberSchema = z.object({
  userId: z.number().int().positive(),
  teamRole: z.enum(TEAM_ROLES).default("member"),
});

function slugifyTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** GET /api/teams — every team with its headcount and leadership. */
router.get(
  "/",
  authenticate,
  authorize({ permission: "hr.team.view" }),
  async (_req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const teams = await prisma.team.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        include: {
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true } },
          members: {
            where: { isActive: true },
            select: {
              teamRole: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        data: teams.map((team) => ({
          id: team.id,
          name: team.name,
          slug: team.slug,
          type: team.type,
          description: team.description,
          isActive: team.isActive,
          department: team.department,
          project: team.project,
          memberCount: team.members.length,
          lead: team.members.find((m) => m.teamRole === "lead")?.user ?? null,
          assistantLead:
            team.members.find((m) => m.teamRole === "assistant_lead")?.user ?? null,
          members: team.members
            .map((m) => ({ ...m.user, teamRole: m.teamRole }))
            .sort((a, b) => a.teamRole.localeCompare(b.teamRole)),
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/teams/mine — the caller's own memberships.
 *
 * Deliberately unguarded beyond authentication: every picker that files a
 * record into a team needs this, and it only ever returns the caller's rows.
 */
router.get(
  "/mine",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const memberships = await prisma.teamMember.findMany({
        where: { userId: req.user!.id, isActive: true, team: { isActive: true } },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { team: { name: "asc" } },
      });

      res.status(200).json({
        success: true,
        data: memberships.map((m) => ({ ...m.team, teamRole: m.teamRole })),
      });
    } catch (error) {
      next(error);
    }
  }
);

/** GET /api/teams/:id — one team with full membership. */
router.get(
  "/:id",
  authenticate,
  authorize({ permission: "hr.team.view" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const teamId = Number(req.params.id);
      if (!Number.isFinite(teamId)) throw new AppError(400, "Invalid team id");

      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          department: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true } },
          members: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  isActive: true,
                  position: { select: { name: true } },
                  department: { select: { name: true } },
                },
              },
            },
            orderBy: { joinedAt: "asc" },
          },
        },
      });
      if (!team) throw new NotFoundError("Team not found");

      res.status(200).json({
        success: true,
        data: {
          ...team,
          members: team.members.map((m) => ({ ...m.user, teamRole: m.teamRole })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── Writes ──────────────────────────────────────────────────────────────────

/** POST /api/teams */
router.post(
  "/",
  authenticate,
  authorize({ permission: "hr.team.manage" }),
  validate(teamSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const body = req.body as z.infer<typeof teamSchema>;

      const base = slugifyTeam(body.name);
      let slug = base;
      let suffix = 1;
      while (await prisma.team.findUnique({ where: { slug } })) {
        slug = `${base}-${suffix++}`;
      }

      if (body.departmentId) {
        const department = await prisma.department.findUnique({ where: { id: body.departmentId } });
        if (!department) throw new NotFoundError("Department not found");
      }

      const team = await prisma.team.create({
        data: {
          name: body.name,
          slug,
          type: body.type,
          description: body.description ?? null,
          departmentId: body.departmentId ?? null,
          projectId: body.projectId ?? null,
        },
      });

      await logActivity({
        description: `Team "${team.name}" created`,
        subjectType: "Team",
        subjectId: team.id,
        event: "created",
        causerId: req.user!.id,
      });

      res.status(201).json({ success: true, data: team, message: "Team created" });
    } catch (error) {
      next(error);
    }
  }
);

/** PUT /api/teams/:id */
router.put(
  "/:id",
  authenticate,
  authorize({ permission: "hr.team.manage" }),
  validate(teamSchema.partial()),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const teamId = Number(req.params.id);
      const body = req.body as Partial<z.infer<typeof teamSchema>>;

      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team) throw new NotFoundError("Team not found");

      if (body.departmentId) {
        const department = await prisma.department.findUnique({ where: { id: body.departmentId } });
        if (!department) throw new NotFoundError("Department not found");
      }

      const updated = await prisma.team.update({
        where: { id: teamId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.departmentId !== undefined ? { departmentId: body.departmentId } : {}),
          ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });

      await logActivity({
        description: `Team "${updated.name}" updated`,
        subjectType: "Team",
        subjectId: teamId,
        event: "updated",
        causerId: req.user!.id,
        properties: { changed: Object.keys(body) },
      });

      res.status(200).json({ success: true, data: updated, message: "Team updated" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/teams/:id
 *
 * Refused while records still point at the team: deleting it would silently
 * widen those records to "visible to everyone", which is the opposite of what
 * a scope is for.
 */
router.delete(
  "/:id",
  authenticate,
  authorize({ permission: "hr.team.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const teamId = Number(req.params.id);
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team) throw new NotFoundError("Team not found");

      const [nodes, deployments, incidents, domains, certificates, tickets, services, apps] =
        await Promise.all([
          prisma.infrastructureNode.count({ where: { teamId, deletedAt: null } }),
          prisma.deployment.count({ where: { teamId } }),
          prisma.incident.count({ where: { teamId, deletedAt: null } }),
          prisma.domain.count({ where: { teamId, deletedAt: null } }),
          prisma.sslCertificate.count({ where: { teamId, deletedAt: null } }),
          prisma.helpdeskTicket.count({ where: { teamId, deletedAt: null } }),
          prisma.service.count({ where: { teamId, deletedAt: null } }),
          prisma.application.count({ where: { teamId, deletedAt: null } }),
        ]);

      const total = nodes + deployments + incidents + domains + certificates + tickets + services + apps;
      if (total > 0) {
        throw new AppError(
          409,
          `${total} record(s) still belong to this team. Reassign or archive them first.`
        );
      }

      await prisma.team.delete({ where: { id: teamId } });

      await logActivity({
        description: `Team "${team.name}" deleted`,
        subjectType: "Team",
        subjectId: teamId,
        event: "deleted",
        causerId: req.user!.id,
      });

      res.status(200).json({ success: true, message: "Team deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// ── Membership ──────────────────────────────────────────────────────────────

/** POST /api/teams/:id/members — add someone, or change their team role. */
router.post(
  "/:id/members",
  authenticate,
  authorize({ permission: "hr.team.manage" }),
  validate(memberSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const teamId = Number(req.params.id);
      const { userId, teamRole } = req.body as z.infer<typeof memberSchema>;

      const [team, user] = await Promise.all([
        prisma.team.findUnique({ where: { id: teamId } }),
        prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
      ]);
      if (!team) throw new NotFoundError("Team not found");
      if (!user) throw new NotFoundError("User not found");

      // One lead per team. Promoting a new lead demotes the incumbent in the
      // same transaction so the chart never shows two.
      await prisma.$transaction(async (tx) => {
        if (teamRole === "lead") {
          await tx.teamMember.updateMany({
            where: { teamId, teamRole: "lead", NOT: { userId } },
            data: { teamRole: "assistant_lead" },
          });
        }
        await tx.teamMember.upsert({
          where: { teamId_userId: { teamId, userId } },
          create: { teamId, userId, teamRole },
          update: { teamRole, isActive: true },
        });
      });

      await logActivity({
        description: `"${user.name}" is now ${teamRole.replace("_", " ")} of "${team.name}"`,
        subjectType: "Team",
        subjectId: teamId,
        event: "updated",
        causerId: req.user!.id,
        properties: { userId, teamRole },
      });

      res.status(200).json({ success: true, message: "Team membership updated" });
    } catch (error) {
      next(error);
    }
  }
);

/** DELETE /api/teams/:id/members/:userId */
router.delete(
  "/:id/members/:userId",
  authenticate,
  authorize({ permission: "hr.team.manage" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const teamId = Number(req.params.id);
      const userId = Number(req.params.userId);

      const membership = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
        include: { user: { select: { name: true } }, team: { select: { name: true } } },
      });
      if (!membership) throw new NotFoundError("This person is not in the team");

      // Deactivate rather than delete: the history of who approved what while
      // in the team stays attached to a real membership row.
      await prisma.teamMember.update({
        where: { teamId_userId: { teamId, userId } },
        data: { isActive: false },
      });

      await logActivity({
        description: `"${membership.user.name}" left "${membership.team.name}"`,
        subjectType: "Team",
        subjectId: teamId,
        event: "updated",
        causerId: req.user!.id,
        properties: { userId },
      });

      res.status(200).json({ success: true, message: "Member removed" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
