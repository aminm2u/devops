import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, AppError } from "../lib/errors.js";

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.resolve(process.cwd(), "uploads");

// Helper to prevent path traversal
function safePath(userPath: string): string {
  const resolved = path.resolve(uploadsDir, userPath);
  if (!resolved.startsWith(uploadsDir + path.sep) && resolved !== uploadsDir) {
    throw new AppError(400, "Invalid file path");
  }
  return resolved;
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create project-specific directory
    const projectId = req.body.projectId || "general";
    const projectDir = path.join(uploadsDir, `project-${projectId}`);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    cb(null, projectDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// File filter - accept all files
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// POST /api/upload - Upload files
router.post(
  "/",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  upload.array("files", 10), // Max 10 files at once
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      const projectId = req.body.projectId;

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        });
      }

      const uploadedFiles = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalName: file.originalname,
        fileName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
        url: `/api/upload/file/project-${projectId}/${file.filename}`,
      }));

      res.status(201).json({
        success: true,
        data: uploadedFiles,
        message: `${files.length} file(s) uploaded successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/upload/file/:projectPath/:filename - Serve uploaded file
router.get(
  "/file/:projectPath/:filename",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { projectPath, filename } = req.params;
      const filePath = safePath(path.join(projectPath, filename));

      if (!fs.existsSync(filePath)) {
        throw new NotFoundError("File not found");
      }

      // Get file stats for content type
      const stat = fs.statSync(filePath);
      const ext = path.extname(filename).toLowerCase();

      // Map common extensions to MIME types
      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.csv': 'text/csv',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filename)}"`);

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/upload/file/:projectPath/:filename - Delete uploaded file
router.delete(
  "/file/:projectPath/:filename",
  authenticate,
  requireRole("super-admin", "devops-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { projectPath, filename } = req.params;
      const filePath = safePath(path.join(projectPath, filename));

      if (!fs.existsSync(filePath)) {
        throw new NotFoundError("File not found");
      }

      fs.unlinkSync(filePath);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
