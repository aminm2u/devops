import { NextFunction, Response } from "express";
import prisma from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { sha256 } from "../lib/sla.js";
import { getPortalConfig } from "../services/helpdeskPortalSettings.service.js";
import { RequestWithUser } from "../types/index.js";

function readBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

/**
 * Guard for authenticated portal endpoints.
 *
 * The browser holds an opaque random token; its SHA-256 hash lives in
 * `helpdesk_portal_sessions`. Server-side storage buys instant revocation —
 * flipping the portal off (checked here on every request) or re-requesting
 * an OTP kills outstanding tokens immediately, which a stateless JWT cannot.
 */
export async function requirePortalAuth(
  req: RequestWithUser,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = readBearerToken(req.headers.authorization);
    if (!token) throw new AppError(401, "Portal session required");

    const config = await getPortalConfig();
    if (!config.enabled) {
      throw new AppError(403, "The helpdesk portal is currently unavailable");
    }

    const session = await prisma.helpdeskPortalSession.findFirst({
      where: {
        tokenHash: sha256(token),
        consumedAt: { not: null },
        tokenExpiresAt: { gt: new Date() },
      },
    });
    if (!session) throw new AppError(401, "Portal session expired. Verify again.");

    req.portal = { email: session.email, sessionId: session.id };
    next();
  } catch (error) {
    next(error);
  }
}
