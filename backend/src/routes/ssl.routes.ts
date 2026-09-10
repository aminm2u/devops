import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

const createSslSchema = z.object({
  projectId: z.number().int().positive(),
  domainId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1).max(255),
  type: z.enum(["letsencrypt", "self-signed", "commercial", "internal"]).optional(),
  issuer: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  fingerprint: z.string().optional().nullable(),
  notBefore: z.string().datetime().optional().nullable(),
  notAfter: z.string().datetime().optional().nullable(),
  autoRenew: z.boolean().optional(),
  certificatePath: z.string().optional().nullable(),
  privateKeyPath: z.string().optional().nullable(),
});

const updateSslSchema = createSslSchema.partial().omit({ projectId: true });

// GET /api/ssl - List all SSL certificates
router.get(
  "/",
  authenticate,
  requirePermission("view-ssl-certificates"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { projectId, status, expiringSoon, page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { deletedAt: null, isActive: true };

      if (projectId) where.projectId = parseInt(projectId as string, 10);

      // Handle computed statuses (Expired, Valid) based on notAfter dates
      if (status === "expired") {
        // Expired = notAfter is in the past
        where.notAfter = { lt: new Date() };
      } else if (status === "valid") {
        // Valid = status is 'valid' AND notAfter is either null (unknown) or more than 30 days away
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        where.AND = [
          { status: "valid" },
          {
            OR: [
              { notAfter: null },
              { notAfter: { gt: thirtyDaysFromNow } },
            ],
          },
        ];
      } else if (status) {
        // For other statuses (pending, renewing, revoked), filter by stored status
        where.status = status;
      }

      if (expiringSoon === "true") {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        where.notAfter = { lte: thirtyDaysFromNow, gte: new Date() };
      }

      const [certificates, total] = await Promise.all([
        prisma.sslCertificate.findMany({
          where,
          include: {
            project: { select: { id: true, name: true, slug: true } },
            domain: { select: { id: true, name: true } },
          },
          orderBy: { notAfter: "asc" },
          skip,
          take: limitNum,
        }),
        prisma.sslCertificate.count({ where }),
      ]);

      // Calculate days until expiry for each certificate
      const certificatesWithDays = certificates.map((cert) => {
        const now = new Date();
        const daysUntilExpiry = cert.notAfter
          ? Math.ceil((new Date(cert.notAfter).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return { ...cert, daysUntilExpiry };
      });

      res.status(200).json({
        success: true,
        data: certificatesWithDays,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
        },
        message: "SSL certificates retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/ssl/:id - Get single SSL certificate
router.get(
  "/:id",
  authenticate,
  requirePermission("view-ssl-certificates"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const certificate = await prisma.sslCertificate.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          domain: { select: { id: true, name: true } },
        },
      });

      if (!certificate) throw new NotFoundError("SSL certificate not found");

      const now = new Date();
      const daysUntilExpiry = certificate.notAfter
        ? Math.ceil((new Date(certificate.notAfter).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      res.status(200).json({
        success: true,
        data: { ...certificate, daysUntilExpiry },
        message: "SSL certificate retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/ssl - Create SSL certificate
router.post(
  "/",
  authenticate,
  requirePermission("create-ssl-certificates"),
  validate(createSslSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const certificate = await prisma.sslCertificate.create({
        data: {
          projectId: req.body.projectId,
          domainId: req.body.domainId,
          name: req.body.name,
          type: req.body.type || "letsencrypt",
          issuer: req.body.issuer || null,
          subject: req.body.subject || null,
          serialNumber: req.body.serialNumber || null,
          fingerprint: req.body.fingerprint || null,
          notBefore: req.body.notBefore ? new Date(req.body.notBefore) : null,
          notAfter: req.body.notAfter ? new Date(req.body.notAfter) : null,
          autoRenew: req.body.autoRenew ?? true,
          certificatePath: req.body.certificatePath || null,
          privateKeyPath: req.body.privateKeyPath || null,
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          domain: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `SSL certificate "${certificate.name}" created`,
        subjectType: "App\\Models\\SslCertificate",
        subjectId: certificate.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: certificate },
      });

      res.status(201).json({ success: true, data: certificate, message: "SSL certificate created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/ssl/:id - Update SSL certificate
router.put(
  "/:id",
  authenticate,
  requirePermission("update-ssl-certificates"),
  validate(updateSslSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.sslCertificate.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("SSL certificate not found");

      const certificate = await prisma.sslCertificate.update({
        where: { id: existing.id },
        data: {
          ...(req.body.domainId !== undefined && { domainId: req.body.domainId }),
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.type && { type: req.body.type }),
          ...(req.body.issuer !== undefined && { issuer: req.body.issuer }),
          ...(req.body.subject !== undefined && { subject: req.body.subject }),
          ...(req.body.serialNumber !== undefined && { serialNumber: req.body.serialNumber }),
          ...(req.body.fingerprint !== undefined && { fingerprint: req.body.fingerprint }),
          ...(req.body.notBefore !== undefined && {
            notBefore: req.body.notBefore ? new Date(req.body.notBefore) : null,
          }),
          ...(req.body.notAfter !== undefined && {
            notAfter: req.body.notAfter ? new Date(req.body.notAfter) : null,
          }),
          ...(req.body.autoRenew !== undefined && { autoRenew: req.body.autoRenew }),
          ...(req.body.certificatePath !== undefined && { certificatePath: req.body.certificatePath }),
          ...(req.body.privateKeyPath !== undefined && { privateKeyPath: req.body.privateKeyPath }),
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          domain: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `SSL certificate "${certificate.name}" updated`,
        subjectType: "App\\Models\\SslCertificate",
        subjectId: certificate.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: certificate },
      });

      res.status(200).json({ success: true, data: certificate, message: "SSL certificate updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/ssl/:id - Soft delete SSL certificate
router.delete(
  "/:id",
  authenticate,
  requirePermission("delete-ssl-certificates"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.sslCertificate.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("SSL certificate not found");

      await prisma.sslCertificate.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await logActivity({
        description: `SSL certificate "${existing.name}" deleted`,
        subjectType: "App\\Models\\SslCertificate",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "SSL certificate deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/ssl/:id/renew - Trigger certificate renewal
router.post(
  "/:id/renew",
  authenticate,
  requirePermission("update-ssl-certificates"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const existing = await prisma.sslCertificate.findFirst({
        where: { id: parseInt(id, 10), deletedAt: null },
      });
      if (!existing) throw new NotFoundError("SSL certificate not found");

      // In a real implementation, this would trigger the renewal process
      // For now, we'll just update the status to indicate renewal is pending
      const certificate = await prisma.sslCertificate.update({
        where: { id: existing.id },
        data: { status: "renewing" },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          domain: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        description: `SSL certificate "${certificate.name}" renewal triggered`,
        subjectType: "App\\Models\\SslCertificate",
        subjectId: certificate.id,
        event: "renewed",
        causerId: req.user!.id,
        properties: { attributes: certificate },
      });

      res.status(200).json({ success: true, data: certificate, message: "Certificate renewal initiated" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
