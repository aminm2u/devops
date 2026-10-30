import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { RequestWithUser } from "../types/index.js";
import { logActivity } from "../middleware/activity.js";
import prisma from "../config/database.js";
import { AppError, NotFoundError } from "../lib/errors.js";
import {
  getAppConfig,
  saveAppConfig,
  buildAuthorizeUrl,
  signState,
  verifyState,
  exchangeCodeAndLinkAccount,
  getValidAccessToken,
  fetchCalendarView,
  parseGraphDateTime,
  snapHours,
  callbackUrl,
} from "../services/graph.service.js";
import { getIO } from "../lib/socket.js";

const router = Router();

// ---------- helpers ----------

function parseWorkDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().substring(0, 10);
}

/**
 * Upsert Graph events into the CalendarEvent cache and, when requested,
 * create draft time entries (auto timesheet sync).
 */
async function syncUserEvents(
  userId: number,
  from: Date,
  to: Date,
  source: "manual" | "auto"
) {
  const account = await prisma.microsoftAccount.findUnique({ where: { userId } });
  if (!account) throw new NotFoundError("Microsoft account not connected");

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    throw new AppError(400, "Microsoft token is invalid or expired — reconnect your account");
  }

  const graphEvents = await fetchCalendarView(accessToken, from, to);
  const minMinutes = account.minMeetingMinutes;
  let imported = 0;
  let updated = 0;

  for (const ge of graphEvents) {
    const startAt = parseGraphDateTime(ge.start);
    const endAt = parseGraphDateTime(ge.end);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) continue;
    const joinUrl = ge.onlineMeeting?.joinUrl ?? null;
    const isOnline = ge.isOnlineMeeting || Boolean(joinUrl);

    const existing = await prisma.calendarEvent.findUnique({
      where: { userId_msEventId: { userId, msEventId: ge.id } },
    });

    const data = {
      subject: ge.subject || "(No title)",
      startAt,
      endAt,
      isOnlineMeeting: isOnline,
      joinUrl,
      organizer: ge.organizer?.emailAddress?.address ?? null,
    };

    if (existing) {
      await prisma.calendarEvent.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.calendarEvent.create({
        data: { userId, msEventId: ge.id, ...data, syncSource: source },
      });
      imported++;
    }

    // Auto timesheet mode: create a draft entry for eligible meetings
    // that do not have one yet.
    if (account.timesheetAutoSync && !existing?.timeEntryId) {
      const durationMin = (endAt.getTime() - startAt.getTime()) / 60000;
      const isPast = endAt.getTime() <= Date.now();
      if (durationMin >= minMinutes && isPast) {
        const hours = snapHours(durationMin / 60);
        const workDate = parseWorkDate(startAt.toISOString().substring(0, 10));
        const description = `Meeting (MS Teams): ${ge.subject || "(No title)"}`;
        const entry = await prisma.timeEntry.create({
          data: {
            userId,
            workDate,
            hours,
            description,
            categoryValue: account.timesheetCategory,
            startTime: startAt,
            endTime: endAt,
            status: "draft",
          },
        });
        await prisma.calendarEvent.upsert({
          where: { userId_msEventId: { userId, msEventId: ge.id } },
          update: { timeEntryId: entry.id, attended: true },
          create: {
            userId,
            msEventId: ge.id,
            ...data,
            attended: true,
            timeEntryId: entry.id,
            syncSource: source,
          },
        });
      }
    }
  }

  await prisma.microsoftAccount.update({
    where: { userId },
    data: { lastSyncedAt: new Date() },
  });

  try {
    getIO().emit("calendar-synced", { userId, imported, updated });
  } catch {}

  return { imported, updated, total: graphEvents.length };
}

// ---------- validation ----------

const appConfigSchema = z.object({
  tenantId: z.string().min(1).max(200),
  clientId: z.string().min(1).max(200),
  clientSecret: z.string().max(500).optional(),
  redirectUri: z.string().max(500).optional(),
});

const syncSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const settingsSchema = z.object({
  calendarSyncEnabled: z.boolean().optional(),
  timesheetAutoSync: z.boolean().optional(),
  minMeetingMinutes: z.number().int().min(0).max(1440).optional(),
  timesheetCategory: z.string().min(1).max(50).optional(),
});

// ---------- admin: app registration config ----------

// GET /api/microsoft/config — status of tenant-level app registration
router.get(
  "/config",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const config = await getAppConfig();
      res.status(200).json({
        success: true,
        data: config
          ? {
              configured: true,
              tenantId: config.tenantId,
              clientId: config.clientId,
              redirectUri: callbackUrl(config),
              clientSecretSet: Boolean(config.clientSecret),
            }
          : { configured: false },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/microsoft/config — save tenant app registration (admin only)
router.put(
  "/config",
  authenticate,
  requireRole("super-admin"),
  validate(appConfigSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await saveAppConfig(req.body);
      await logActivity({
        causerId: req.user!.id,
        description: "Microsoft Entra app registration updated",
        subjectType: "App\\Models\\Setting",
      });
      const config = await getAppConfig();
      res.status(200).json({
        success: true,
        data: {
          configured: true,
          tenantId: config!.tenantId,
          clientId: config!.clientId,
          redirectUri: callbackUrl(config!),
          clientSecretSet: Boolean(config!.clientSecret),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------- per-user: connect / disconnect / settings ----------

// GET /api/microsoft/me — connection status + sync settings for current user
router.get(
  "/me",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const account = await prisma.microsoftAccount.findUnique({
        where: { userId: req.user!.id },
      });
      if (!account) {
        return res.status(200).json({ success: true, data: { connected: false } });
      }
      res.status(200).json({
        success: true,
        data: {
          connected: true,
          email: account.email,
          displayName: account.displayName,
          lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
          calendarSyncEnabled: account.calendarSyncEnabled,
          timesheetAutoSync: account.timesheetAutoSync,
          minMeetingMinutes: account.minMeetingMinutes,
          timesheetCategory: account.timesheetCategory,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/microsoft/connect — start the OAuth flow (redirect to Entra ID)
router.get("/connect", authenticate, async (req: RequestWithUser, res: Response) => {
  const config = await getAppConfig();
  if (!config) {
    return res
      .status(400)
      .json({ success: false, message: "Microsoft integration is not configured. Ask an administrator to register the Entra ID app." });
  }
  const state = signState(req.user!.id);
  res.redirect(buildAuthorizeUrl(config, state));
});

// GET /api/microsoft/callback — OAuth redirect target (browser, not XHR)
router.get("/callback", async (req: Request, res: Response) => {
  const appUrl = (process.env.APP_URL || "http://localhost:8080").replace(/\/$/, "");
  const frontendBase = `${appUrl}/profile?msconnect=`;
  const error = req.query.error as string | undefined;
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  if (error || !code || !state) {
    console.error("[Microsoft] OAuth error:", error, req.query.error_description);
    return res.redirect(`${frontendBase}error`);
  }

  const payload = verifyState(state);
  if (!payload) {
    return res.redirect(`${frontendBase}invalid_state`);
  }

  try {
    await exchangeCodeAndLinkAccount(payload.userId, code);
    res.redirect(`${frontendBase}success`);
  } catch (e) {
    console.error("[Microsoft] Failed to link account:", (e as Error).message);
    res.redirect(`${frontendBase}error`);
  }
});

// POST /api/microsoft/disconnect — remove link and cached events
router.post(
  "/disconnect",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await prisma.microsoftAccount.deleteMany({ where: { userId: req.user!.id } });
      // Keep time entries; only drop the cached meeting rows for this user.
      await prisma.calendarEvent.deleteMany({ where: { userId: req.user!.id } });
      res.status(200).json({ success: true, message: "Microsoft account disconnected" });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/microsoft/me — update sync settings
router.put(
  "/me",
  authenticate,
  validate(settingsSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const account = await prisma.microsoftAccount.findUnique({
        where: { userId: req.user!.id },
      });
      if (!account) throw new NotFoundError("Microsoft account not connected");

      const updated = await prisma.microsoftAccount.update({
        where: { userId: req.user!.id },
        data: {
          ...(req.body.calendarSyncEnabled !== undefined && {
            calendarSyncEnabled: req.body.calendarSyncEnabled,
          }),
          ...(req.body.timesheetAutoSync !== undefined && {
            timesheetAutoSync: req.body.timesheetAutoSync,
          }),
          ...(req.body.minMeetingMinutes !== undefined && {
            minMeetingMinutes: req.body.minMeetingMinutes,
          }),
          ...(req.body.timesheetCategory !== undefined && {
            timesheetCategory: req.body.timesheetCategory,
          }),
        },
      });

      res.status(200).json({
        success: true,
        data: {
          connected: true,
          email: updated.email,
          calendarSyncEnabled: updated.calendarSyncEnabled,
          timesheetAutoSync: updated.timesheetAutoSync,
          minMeetingMinutes: updated.minMeetingMinutes,
          timesheetCategory: updated.timesheetCategory,
          lastSyncedAt: updated.lastSyncedAt?.toISOString() ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------- sync ----------

// POST /api/microsoft/sync — pull the calendar window into cache (+ auto entries)
router.post(
  "/sync",
  authenticate,
  validate(syncSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const from = req.body.from
        ? parseWorkDate(req.body.from)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = req.body.to
        ? new Date(`${req.body.to}T23:59:59Z`)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const account = await prisma.microsoftAccount.findUnique({
        where: { userId: req.user!.id },
      });
      if (!account) throw new NotFoundError("Microsoft account not connected");

      const result = await syncUserEvents(
        req.user!.id,
        from,
        to,
        req.body.source === "auto" ? "auto" : "manual"
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/microsoft/events?from&to — cached meetings for the calendar
router.get(
  "/events",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      const where: any = { userId: req.user!.id };
      if (from && to) {
        where.startAt = { lte: new Date(`${to}T23:59:59Z`) };
        where.endAt = { gte: parseWorkDate(from) };
      }

      const events = await prisma.calendarEvent.findMany({
        where,
        include: {
          timeEntry: {
            select: { id: true, status: true, hours: true },
          },
        },
        orderBy: { startAt: "asc" },
      });

      res.status(200).json({
        success: true,
        data: events.map((e) => ({
          id: e.id,
          msEventId: e.msEventId,
          subject: e.subject,
          startAt: e.startAt.toISOString(),
          endAt: e.endAt.toISOString(),
          isOnlineMeeting: e.isOnlineMeeting,
          joinUrl: e.joinUrl,
          organizer: e.organizer,
          attended: e.attended,
          syncSource: e.syncSource,
          timeEntryId: e.timeEntryId,
          timeEntryStatus: e.timeEntry?.status ?? null,
          timeEntryHours: e.timeEntry ? Number(e.timeEntry.hours) : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/microsoft/events/:id/log — log attendance for one meeting
// Creates a draft TimeEntry capturing the actual meeting period.
router.post(
  "/events/:id/log",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const event = await prisma.calendarEvent.findUnique({
        where: { id: parseInt(req.params.id, 10) },
      });
      if (!event || event.userId !== req.user!.id) {
        throw new NotFoundError("Meeting not found");
      }

      const hoursRaw = req.body?.hours;
      const startTime = event.startAt;
      const endTime = event.endAt;
      // Hours default to the actual meeting period but may be overridden.
      const hours = hoursRaw != null ? snapHours(Number(hoursRaw)) : snapHours((endTime.getTime() - startTime.getTime()) / 3600000);

      if (event.timeEntryId) {
        const existing = await prisma.timeEntry.findUnique({
          where: { id: event.timeEntryId },
        });
        if (existing && !existing.deletedAt) {
          return res.status(200).json({ success: true, data: existing, alreadyLogged: true });
        }
      }

      const entry = await prisma.timeEntry.create({
        data: {
          userId: req.user!.id,
          workDate: parseWorkDate(event.startAt.toISOString().substring(0, 10)),
          hours,
          description: `Meeting: ${event.subject}`,
          categoryValue: "meeting",
          startTime,
          endTime,
          msEventId: event.msEventId,
          status: "draft",
        },
      });

      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { attended: true, timeEntryId: entry.id },
      });

      res.status(201).json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/microsoft/sync-all — admin trigger: refresh every connected account
router.post(
  "/sync-all",
  authenticate,
  requireRole("super-admin"),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const accounts = await prisma.microsoftAccount.findMany();
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const results: Array<{ userId: number; ok: boolean; imported?: number; updated?: number; error?: string }> = [];

      for (const account of accounts) {
        try {
          const r = await syncUserEvents(account.userId, from, to, "auto");
          results.push({ userId: account.userId, ok: true, ...r });
        } catch (e) {
          results.push({ userId: account.userId, ok: false, error: (e as Error).message });
        }
      }
      res.status(200).json({ success: true, data: { accounts: accounts.length, results } });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
