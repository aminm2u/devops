import { Router, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { RequestWithUser } from "../types/index.js";
import prisma from "../config/database.js";
import {
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  sendWeeklyReport,
} from "../services/notification.service.js";
import { gatherWeeklyReportData, generateWeeklyReportPDF } from "../services/pdf.service.js";

const router = Router();

// GET /api/notifications - List user notifications
router.get(
  "/",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.notification.count({ where: { userId } }),
      ]);

      const unreadCount = await getUnreadCount(userId);

      res.status(200).json({
        success: true,
        data: notifications,
        meta: {
          currentPage: pageNum,
          lastPage: Math.ceil(total / limitNum),
          perPage: limitNum,
          total,
          unreadCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/notifications/unread-count - Get unread count
router.get(
  "/unread-count",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const count = await getUnreadCount(req.user!.id);
      // `unreadCount` matches the key `GET /notifications` puts in its meta, so
      // the bell reads the same field whichever endpoint answered. The old
      // `count` key left the client's `unreadCount` undefined, which is why the
      // badge never rendered.
      res.status(200).json({ success: true, data: { unreadCount: count } });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/notifications/:id/read - Mark as read
router.put(
  "/:id/read",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const notificationId = parseInt(req.params.id, 10);
      const success = await markAsRead(notificationId, req.user!.id);
      if (!success) {
        return res.status(404).json({ success: false, message: "Notification not found" });
      }
      res.status(200).json({ success: true, message: "Marked as read" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/notifications/read-all - Mark all as read
router.put(
  "/read-all",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await markAllAsRead(req.user!.id);
      res.status(200).json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Notification preferences, now stored in their own table.
 *
 * The old implementation read and wrote a JSON blob under
 * `settings.notification_prefs_<id>`, which no UI ever wrote and no code ever
 * read consistently — so `wantsEmail()` always returned true and the switches
 * in Digital Me changed nothing. `types` holds per-type overrides:
 * `{ incident: { email: false, sound: true } }`.
 */
const DEFAULTS = { email: true, inApp: true, sound: true };

// GET /api/notifications/preferences
router.get(
  "/preferences",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const pref = await prisma.notificationPreference.findUnique({
        where: { userId: req.user!.id },
      });

      res.status(200).json({
        success: true,
        data: {
          ...DEFAULTS,
          ...(pref
            ? { email: pref.email, inApp: pref.inApp, sound: pref.sound, types: pref.types ?? {} }
            : { types: {} }),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/notifications/preferences
router.put(
  "/preferences",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const body = req.body ?? {};

      // Only known keys are written, so a stray field cannot be smuggled into
      // the JSON column.
      const pick = (value: unknown, fallback: boolean) =>
        typeof value === "boolean" ? value : fallback;

      const types =
        body.types && typeof body.types === "object" && !Array.isArray(body.types)
          ? body.types
          : undefined;

      const existing = await prisma.notificationPreference.findUnique({ where: { userId } });

      const data = {
        email: pick(body.email, existing?.email ?? DEFAULTS.email),
        inApp: pick(body.inApp, existing?.inApp ?? DEFAULTS.inApp),
        sound: pick(body.sound, existing?.sound ?? DEFAULTS.sound),
        types: types ?? ((existing?.types ?? {}) as object),
      };

      const saved = await prisma.notificationPreference.upsert({
        where: { userId },
        update: data,
        create: { userId, ...data },
      });

      res.status(200).json({
        success: true,
        data: {
          email: saved.email,
          inApp: saved.inApp,
          sound: saved.sound,
          types: saved.types ?? {},
        },
        message: "Preferences updated",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/notifications/test-weekly-report - Send weekly report (admin only)
router.post(
  "/test-weekly-report",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const userRoles = req.user!.roles.map((r: any) => r.name);
      if (!userRoles.includes("super-admin")) {
        return res.status(403).json({ success: false, message: "Admin only" });
      }
      const result = await sendWeeklyReport();
      res.status(200).json({
        success: true,
        data: result,
        message: `Weekly report sent to ${result.sent} users (${result.skipped} skipped)`,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/notifications/weekly-report/pdf - Download weekly report as PDF
router.get(
  "/weekly-report/pdf",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const data = await gatherWeeklyReportData(req.user!.id);
      const pdfBuffer = await generateWeeklyReportPDF(data);

      const now = new Date();
      const filename = `weekly-report-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
