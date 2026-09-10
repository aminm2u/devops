import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";

const router = Router();

// Simple AES encryption for passwords
const ENCRYPTION_KEY = process.env.JWT_SECRET || process.env.SESSION_SECRET || "default-devops-platform-key-change-in-production";
const ALGORITHM = "aes-256-cbc";

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "salt-devops-credentials", 32);
}

function encrypt(text: string): string {
  const key = deriveKey(ENCRYPTION_KEY);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  // Check if the value looks like encrypted data (hex:hex format)
  const parts = encryptedText.split(":");
  if (parts.length !== 2 || !/^[0-9a-f]+$/.test(parts[0]) || !/^[0-9a-f]+$/.test(parts[1])) {
    // Not encrypted - return as-is (legacy plaintext password)
    return encryptedText;
  }
  const key = deriveKey(ENCRYPTION_KEY);
  const iv = Buffer.from(parts[0], "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(parts[1], "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function maskPassword(password: string | null): string | null {
  if (!password) return null;
  return "••••••••";
}

const createCredentialSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["server", "database", "ssh", "api", "other"]),
  host: z.string().min(1),
  port: z.number().int().positive().nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const updateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["server", "database", "ssh", "api", "other"]).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().positive().nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/projects/:projectId/credentials - List credentials for a project
router.get(
  "/:projectId/credentials",
  authenticate,
  requirePermission("view-projects"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) throw new NotFoundError("Project not found");

      const credentials = await prisma.credential.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          projectId: true,
          name: true,
          type: true,
          host: true,
          port: true,
          username: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          // Password is masked in list view
        },
      });

      // Mask passwords in response
      const masked = credentials.map((c) => ({
        ...c,
        password: "••••••••",
        hasPassword: true,
      }));

      res.status(200).json({ success: true, data: masked, message: "Credentials retrieved" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/credentials - Create credential
router.post(
  "/:projectId/credentials",
  authenticate,
  requirePermission("update-projects"),
  validate(createCredentialSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true },
      });
      if (!project) throw new NotFoundError("Project not found");

      // Encrypt password if provided
      let encryptedPassword: string | null = null;
      if (req.body.password) {
        encryptedPassword = encrypt(req.body.password);
      }

      const credential = await prisma.credential.create({
        data: {
          projectId,
          name: req.body.name,
          type: req.body.type,
          host: req.body.host,
          port: req.body.port || null,
          username: req.body.username || null,
          password: encryptedPassword,
          description: req.body.description || null,
        },
        select: {
          id: true,
          projectId: true,
          name: true,
          type: true,
          host: true,
          port: true,
          username: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await logActivity({
        description: `Credential "${credential.name}" added to project "${project.name}"`,
        subjectType: "App\\Models\\Credential",
        subjectId: credential.id,
        event: "created",
        causerId: req.user!.id,
        properties: { attributes: { ...credential, password: "***" } },
      });

      res.status(201).json({ success: true, data: credential, message: "Credential created" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/projects/:projectId/credentials/:credentialId - Update credential
router.put(
  "/:projectId/credentials/:credentialId",
  authenticate,
  requirePermission("update-projects"),
  validate(updateCredentialSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const credentialId = parseInt(req.params.credentialId, 10);

      const existing = await prisma.credential.findUnique({
        where: { id: credentialId },
        select: { id: true, projectId: true, name: true },
      });
      if (!existing) throw new NotFoundError("Credential not found");
      if (existing.projectId !== projectId) throw new ForbiddenError("Credential does not belong to this project");

      const updateData: any = {};
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.type !== undefined) updateData.type = req.body.type;
      if (req.body.host !== undefined) updateData.host = req.body.host;
      if (req.body.port !== undefined) updateData.port = req.body.port;
      if (req.body.username !== undefined) updateData.username = req.body.username;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;

      // Encrypt password if provided
      if (req.body.password !== undefined) {
        updateData.password = req.body.password ? encrypt(req.body.password) : null;
      }

      const credential = await prisma.credential.update({
        where: { id: credentialId },
        data: updateData,
        select: {
          id: true,
          projectId: true,
          name: true,
          type: true,
          host: true,
          port: true,
          username: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await logActivity({
        description: `Credential "${credential.name}" updated`,
        subjectType: "App\\Models\\Credential",
        subjectId: credential.id,
        event: "updated",
        causerId: req.user!.id,
        properties: { attributes: { ...credential, password: "***" } },
      });

      res.status(200).json({ success: true, data: credential, message: "Credential updated" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/projects/:projectId/credentials/:credentialId - Delete credential
router.delete(
  "/:projectId/credentials/:credentialId",
  authenticate,
  requirePermission("update-projects"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const credentialId = parseInt(req.params.credentialId, 10);

      const existing = await prisma.credential.findUnique({
        where: { id: credentialId },
        select: { id: true, projectId: true, name: true },
      });
      if (!existing) throw new NotFoundError("Credential not found");
      if (existing.projectId !== projectId) throw new ForbiddenError("Credential does not belong to this project");

      await prisma.credential.delete({ where: { id: credentialId } });

      await logActivity({
        description: `Credential "${existing.name}" deleted`,
        subjectType: "App\\Models\\Credential",
        subjectId: existing.id,
        event: "deleted",
        causerId: req.user!.id,
        properties: { attributes: existing },
      });

      res.status(200).json({ success: true, message: "Credential deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:projectId/credentials/:credentialId/raw - Get decrypted password
router.get(
  "/:projectId/credentials/:credentialId/raw",
  authenticate,
  requirePermission("update-projects"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const credentialId = parseInt(req.params.credentialId, 10);

      const credential = await prisma.credential.findUnique({
        where: { id: credentialId },
      });
      if (!credential) throw new NotFoundError("Credential not found");
      if (credential.projectId !== projectId) throw new ForbiddenError("Credential does not belong to this project");

      const decryptedPassword = credential.password ? decrypt(credential.password) : null;

      res.status(200).json({
        success: true,
        data: {
          id: credential.id,
          password: decryptedPassword,
        },
        message: "Credential password retrieved",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
