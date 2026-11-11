import { Router, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { RequestWithUser } from "../types/index.js";
import { NotFoundError, AppError } from "../lib/errors.js";
import prisma from "../config/database.js";

/**
 * Company branding: public identity for the external portal (name + logo)
 * and the document-generation field set, stored as `Setting` rows under the
 * `company` group.
 *
 * File serving here is deliberately unauthenticated — the logo appears on
 * the anonymous portal, and every other file route in the app is JWT-gated,
 * which would 401 the very visitors this exists for. That makes the GET the
 * one public window into `uploads/`, so it triple-guards: path rooted at
 * `uploads/branding/`, extension allowlist, strict MIME map.
 */

const router = Router();

const brandingDir = path.resolve(process.cwd(), "uploads", "branding");
if (!fs.existsSync(brandingDir)) {
  fs.mkdirSync(brandingDir, { recursive: true });
}

const LOGO_URL_SETTING = "company.logoUrl";
const NAME_SETTING = "company.name";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, brandingDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(
        file.mimetype
      ) && ALLOWED_EXTENSIONS.has(path.extname(file.originalname).toLowerCase());
    if (!ok) {
      cb(new AppError(400, "Logo must be a PNG, JPG, WebP or SVG image"));
      return;
    }
    cb(null, true);
  },
});

/**
 * Resolve a stored logo path for public serving. Returns null unless the
 * path sits inside `uploads/branding/` with an allowed extension — a
 * tampered or legacy setting pointing anywhere else is refused, not served.
 */
/** The one image currently stored for branding — there is at most one. */
function currentLogoFile(): { file: string; ext: string } | null {
  const files = fs.existsSync(brandingDir)
    ? fs.readdirSync(brandingDir).filter((f) => ALLOWED_EXTENSIONS.has(path.extname(f).toLowerCase()))
    : [];
  if (files.length === 0) return null;
  // Newest upload wins — uploads are timestamp-prefixed, so sort handles a
  // stray leftover the cleanup step missed.
  files.sort().reverse();
  return { file: files[0], ext: path.extname(files[0]).toLowerCase() };
}

// ── Public: what the portal needs ───────────────────────────────────────────

/**
 * GET /api/branding — public company identity. Only the whitelisted subset;
 * address/tax/contact details stay behind authenticated settings reads.
 */
router.get("/", async (_req, res) => {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [NAME_SETTING, LOGO_URL_SETTING] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  res.json({
    success: true,
    data: {
      name: typeof map.get(NAME_SETTING) === "string" ? map.get(NAME_SETTING) : "",
      logoUrl: map.get(LOGO_URL_SETTING) ? "/api/branding/logo" : "",
    },
  });
});

/**
 * GET /api/branding/logo — stream the stored logo to anyone (portal visitors
 * are anonymous). no-cache so a re-upload is visible immediately; CSP sandbox
 * so a malicious SVG can never run scripts on our origin.
 */
router.get("/logo", async (_req, res, next) => {
  try {
    const logo = currentLogoFile();
    if (!logo) throw new NotFoundError("No logo uploaded");

    const filePath = path.join(brandingDir, logo.file);
    // Defense in depth: even though `logo.file` came from our own readdir,
    // never serve a path that escapes the branding directory.
    if (!path.resolve(filePath).startsWith(brandingDir + path.sep)) {
      throw new AppError(400, "Invalid logo path");
    }

    res.setHeader("Content-Type", MIME_BY_EXTENSION[logo.ext] ?? "application/octet-stream");
    res.setHeader("Content-Disposition", 'inline; filename="company-logo"');
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Security-Policy", "sandbox");
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

// ── Admin: upload ───────────────────────────────────────────────────────────

/**
 * POST /api/branding/logo — replace the company logo (multipart, field
 * `logo`). Deletes the previous image file so orphan logos do not pile up
 * in the volume. Responds with the stable public URL; the `company.logoUrl`
 * setting only marks that a logo exists (the file itself is whichever
 * newest image sits in uploads/branding/).
 */
router.post(
  "/logo",
  authenticate,
  requirePermission("admin.settings.manage"),
  logoUpload.single("logo"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file) throw new AppError(400, "No logo file provided");

      // Clean up every OTHER image in the directory — by the time this runs,
      // multer has already written the new file, so "current newest" would
      // resolve to the upload we just saved and nothing would ever be deleted.
      const stale = fs
        .readdirSync(brandingDir)
        .filter(
          (f) =>
            f !== file.filename &&
            ALLOWED_EXTENSIONS.has(path.extname(f).toLowerCase())
        );
      for (const name of stale) {
        const stalePath = path.join(brandingDir, name);
        if (path.resolve(stalePath).startsWith(brandingDir + path.sep)) {
          try {
            fs.unlinkSync(stalePath);
          } catch {
            // A stuck file must not fail the upload — it simply becomes a
            // leftover that the next replace sweeps up.
          }
        }
      }

      await prisma.setting.upsert({
        where: { key: LOGO_URL_SETTING },
        update: { value: "/api/branding/logo", group: "company" },
        create: { key: LOGO_URL_SETTING, value: "/api/branding/logo", group: "company" },
      });

      res.status(201).json({
        success: true,
        data: { logoUrl: "/api/branding/logo" },
        message: "Logo uploaded",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
