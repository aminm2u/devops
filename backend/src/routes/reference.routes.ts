import { Router, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { RequestWithUser } from "../types/index.js";
import prisma from "../config/database.js";

const router = Router();

// GET /api/references - Get all reference data
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const [
        departments,
        positions,
        employmentTypes,
        projectTypes,
        projectRoles,
      ] = await Promise.all([
        prisma.department.findMany({ orderBy: { name: "asc" } }),
        prisma.position.findMany({ orderBy: { name: "asc" } }),
        prisma.employmentType.findMany({ orderBy: { name: "asc" } }),
        prisma.projectType.findMany({ orderBy: { name: "asc" } }),
        prisma.projectRole.findMany({ orderBy: { name: "asc" } }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          departments,
          positions,
          employmentTypes,
          projectTypes,
          projectRoles,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;