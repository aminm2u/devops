import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

const createVendorSchema = z.object({
  name: z.string().min(1).max(255),
  registrationNo: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

const updateVendorSchema = createVendorSchema.partial();

// GET /api/vendors - List vendors
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { search, category, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { isActive: true, deletedAt: null };

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { contactPerson: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
        ];
      }
      if (category) where.category = category as string;

      const [vendors, total] = await Promise.all([
        prisma.vendor.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.vendor.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: vendors,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/vendors/:id - Get single vendor
router.get(
  "/:id",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const vendor = await prisma.vendor.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });

      if (!vendor) throw new NotFoundError("Vendor not found");

      res.status(200).json({ success: true, data: vendor });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/vendors - Create vendor
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(createVendorSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const vendor = await prisma.vendor.create({ data: req.body });

      await logActivity({
        description: `Vendor "${vendor.name}" created`,
        subjectType: "App\\Models\\Vendor",
        subjectId: vendor.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: vendor },
      });

      res.status(201).json({ success: true, data: vendor, message: "Vendor created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/vendors/:id - Update vendor
router.put(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  validate(updateVendorSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.vendor.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Vendor not found");

      const vendor = await prisma.vendor.update({
        where: { id: existing.id },
        data: req.body,
      });

      await logActivity({
        description: `Vendor "${vendor.name}" updated`,
        subjectType: "App\\Models\\Vendor",
        subjectId: vendor.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: vendor },
      });

      res.status(200).json({ success: true, data: vendor, message: "Vendor updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/vendors/:id - Soft delete vendor
router.delete(
  "/:id",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.vendor.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("Vendor not found");

      await prisma.vendor.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await logActivity({
        description: `Vendor "${existing.name}" deleted`,
        subjectType: "App\\Models\\Vendor",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "Vendor deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
