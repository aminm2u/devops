import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { RequestWithUser } from "../types/index.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../lib/errors.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import {
  portalTicketLimiter,
  portalOtpRequestLimiter,
  portalOtpConfirmLimiter,
  portalReadLimiter,
  portalCommentLimiter,
} from "../middleware/rateLimit.js";
import { requirePortalAuth } from "../middleware/portalAuth.js";
import { getPublicPortalConfig } from "../services/helpdeskPortalSettings.service.js";
import {
  requestOtp,
  confirmOtp,
  createExternalTicket,
  listTicketsForEmail,
  getExternalTicket,
  addExternalComment,
} from "../services/helpdeskPortal.service.js";

/**
 * Public (unauthenticated) helpdesk portal router, mounted at
 * `/api/helpdesk/portal`. No `authenticate` middleware anywhere in this file
 * — the only auth is the opaque portal token via `requirePortalAuth`.
 *
 * Every mutating route is captcha-protected and IP-rate-limited; see
 * `middleware/rateLimit.ts` for the caps.
 */

const router = Router();

// ── Schemas ─────────────────────────────────────────────────────────────────

const turnstileField = z.object({
  turnstileToken: z.string().min(1, "Please complete the captcha"),
});

/** Lowercase once, here — the email is the portal identity key. */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

const createTicketSchema = turnstileField.extend({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().max(10_000).optional().nullable(),
  contactName: z.string().trim().min(1, "Name is required").max(120),
  contactEmail: emailField,
  contactPhone: z.string().trim().max(40).optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

const otpRequestSchema = turnstileField.extend({
  email: emailField,
});

const otpConfirmSchema = z.object({
  email: emailField,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

const portalCommentSchema = z.object({
  content: z.string().trim().min(1, "Reply cannot be empty").max(5000),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function assertCaptcha(
  req: RequestWithUser
): Promise<void> {
  const ok = await verifyTurnstile(
    (req.body as { turnstileToken?: unknown }).turnstileToken,
    req.ip
  );
  if (!ok) throw new AppError(403, "Captcha verification failed. Please try again.");
}

async function assertPortalEnabled(): Promise<void> {
  const config = await getPublicPortalConfig();
  if (!config.enabled) {
    throw new AppError(403, "The helpdesk portal is currently unavailable");
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /config — what the portal page needs before rendering: whether it is
 * open and which Turnstile site key to load. No secret material.
 */
router.get("/config", async (_req, res, next) => {
  try {
    res.json({ data: await getPublicPortalConfig() });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tickets — anonymous ticket submission. Lands Unassigned in the
 * internal queue; the response carries the identifiers a reporter needs
 * (ticket number for correspondence, publicId for the tracking link).
 */
router.post(
  "/tickets",
  portalTicketLimiter,
  validate(createTicketSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await assertPortalEnabled();
      await assertCaptcha(req);
      const ticket = await createExternalTicket(req.body as never, req.ip);
      res.status(201).json({ data: ticket, message: "Ticket created" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /verify/request — email a tracking code. Always responds success-
 * shaped; the email is sent only when that address has at least one ticket,
 * so the response can never confirm or deny an address's existence.
 */
router.post(
  "/verify/request",
  portalOtpRequestLimiter,
  validate(otpRequestSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await assertPortalEnabled();
      await assertCaptcha(req);
      await requestOtp((req.body as { email: string }).email, req.ip);
      res.json({
        message:
          "If we have tickets for this email address, a verification code has been sent.",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /verify/confirm — exchange the emailed code for a 12-hour portal
 * session token. No captcha: the code itself is the proof here.
 */
router.post(
  "/verify/confirm",
  portalOtpConfirmLimiter,
  validate(otpConfirmSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      await assertPortalEnabled();
      const { email, code } = req.body as { email: string; code: string };
      const result = await confirmOtp(email, code);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

// Everything below requires a verified portal session.

router.get(
  "/tickets",
  requirePortalAuth,
  portalReadLimiter,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const tickets = await listTicketsForEmail(req.portal!.email);
      res.json({ data: tickets });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/tickets/:publicId",
  requirePortalAuth,
  portalReadLimiter,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const ticket = await getExternalTicket(
        req.params.publicId as string,
        req.portal!.email
      );
      if (!ticket) throw new AppError(404, "Ticket not found");
      res.json({ data: ticket });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/tickets/:publicId/comments",
  requirePortalAuth,
  portalCommentLimiter,
  validate(portalCommentSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const comment = await addExternalComment(
        req.params.publicId as string,
        req.portal!.email,
        (req.body as { content: string }).content
      );
      res.status(201).json({ data: comment, message: "Reply added" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
