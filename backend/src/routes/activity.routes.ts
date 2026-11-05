import { Router, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../rbac/authorize.js";
import { RequestWithUser } from "../types/index.js";
import prisma from "../config/database.js";

const router = Router();

/**
 * GET /api/activity-log — the full audit trail.
 *
 * The frontend route is super-admin only, but that was the *only* guard: the
 * API itself answered any signed-in caller, so the whole audit trail was one
 * `curl` away from every employee. `scope: "all"` because an audit view that
 * silently narrowed to the caller's own team would be worse than no audit view.
 */
router.get(
  "/",
  authenticate,
  authorize({ permission: "admin.activity.view", scope: "all" }),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { search, event, userId, page = "1", limit = "30" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};

      if (search) {
        where.description = { contains: search as string, mode: "insensitive" };
      }
      if (event) where.event = event;
      if (userId) where.causerId = parseInt(userId as string, 10);

      const [logs, total] = await Promise.all([
        prisma.activityLog.findMany({
          where,
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.activityLog.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: logs,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "Activity logs retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
