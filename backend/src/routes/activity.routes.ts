import { Router, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { RequestWithUser } from "../types/index.js";
import prisma from "../config/database.js";

const router = Router();

// GET /api/activity-log - List all activity logs
router.get(
  "/",
  authenticate,
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
