import prisma from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { generateSlug } from "../lib/slug.js";
import {
  generateReferenceNumber,
  TICKET_REF_TYPE,
} from "../lib/numberGenerator.js";
import { computeSlaTimestamps, generateOtp, generatePortalToken, sha256 } from "../lib/sla.js";
import { sendEmail, portalOtpEmail, portalTicketAckEmail } from "./email.service.js";
import { HelpdeskPortalConfig, getPortalConfig } from "./helpdeskPortalSettings.service.js";
import { getIO } from "../lib/socket.js";

// ── Constants ───────────────────────────────────────────────────────────────

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_THROTTLE_MS = 60 * 1000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export interface ExternalTicketInput {
  title: string;
  description?: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  categoryId?: number | null;
  priority?: string;
}

// ── OTP flow ────────────────────────────────────────────────────────────────

/**
 * Issue (or rotate) the OTP for a portal identity.
 *
 * Enumeration-safe by contract with the route: the response is identical
 * whether or not this email has tickets — the email only goes out when at
 * least one active ticket carries the address as its contact email. A new
 * request also rotates the code AND clears any issued portal token, so an
 * emailed code is always the single live credential for the address.
 */
export async function requestOtp(
  email: string,
  ip?: string
): Promise<{ sent: boolean }> {
  const now = new Date();
  const normalized = email.trim().toLowerCase();

  const existing = await prisma.helpdeskPortalSession.findUnique({
    where: { email: normalized },
  });

  if (
    existing?.lastSentAt &&
    now.getTime() - existing.lastSentAt.getTime() < OTP_RESEND_THROTTLE_MS
  ) {
    throw new AppError(429, "A code was just sent — wait a minute before requesting another");
  }

  const code = generateOtp();
  const codeHash = sha256(code);
  const codeExpiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await prisma.helpdeskPortalSession.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      codeHash,
      codeExpiresAt,
      lastSentAt: now,
      requestIp: ip ?? null,
    },
    update: {
      codeHash,
      codeExpiresAt,
      attempts: 0,
      consumedAt: null,
      // Rotating the code invalidates any portal token issued earlier —
      // it no longer corresponds to a verifiable credential.
      tokenHash: null,
      tokenExpiresAt: null,
      lastSentAt: now,
      requestIp: ip ?? existing?.requestIp ?? null,
    },
  });

  const ticketCount = await prisma.helpdeskTicket.count({
    where: { contactEmail: normalized, isActive: true, deletedAt: null },
  });

  if (ticketCount === 0) {
    // Success-shaped silence: no tickets, no email, no hint in the response.
    return { sent: false };
  }

  const result = await sendEmail({
    to: normalized,
    ...portalOtpEmail(code),
  });

  if (!process.env.SMTP_HOST) {
    // sendEmail no-ops (logs only) without SMTP_HOST — surface the code so
    // the dev flow is completable end to end.
    console.log(`[Portal] Dev OTP for ${normalized}: ${code}`);
  }

  return { sent: result };
}

/**
 * Exchange an emailed code for an opaque portal session token.
 *
 * All failure paths return the same generic message — wrong code, expired
 * code and exhausted attempts are indistinguishable from the outside. Each
 * wrong guess burns one of the 5 attempts; a dead code can only be replaced
 * by requesting a new one.
 */
export async function confirmOtp(
  email: string,
  code: string
): Promise<{ token: string; expiresIn: number }> {
  const normalized = email.trim().toLowerCase();
  const now = new Date();

  const session = await prisma.helpdeskPortalSession.findUnique({
    where: { email: normalized },
  });

  const dead =
    !session ||
    session.consumedAt !== null ||
    session.attempts >= OTP_MAX_ATTEMPTS ||
    session.codeExpiresAt.getTime() <= now.getTime() ||
    session.codeHash !== sha256(code.trim());

  if (dead) {
    if (session && session.consumedAt === null && session.codeHash !== sha256(code.trim())) {
      await prisma.helpdeskPortalSession.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } },
      });
    }
    throw new AppError(400, "Invalid or expired code. Request a new one.");
  }

  const token = generatePortalToken();
  await prisma.helpdeskPortalSession.update({
    where: { id: session.id },
    data: {
      tokenHash: sha256(token),
      tokenExpiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      consumedAt: now,
      attempts: 0,
    },
  });

  return { token, expiresIn: TOKEN_TTL_MS / 1000 };
}

// ── External ticket creation ────────────────────────────────────────────────

/**
 * Build the auto-reply email a reporter receives the moment their ticket
 * lands. A superadmin-configured template wins; `{placeholders}` in it are
 * substituted and the text is wrapped in the standard branded shell. Empty
 * template falls back to the built-in default. (Exported for the render check
 * in scripts/.)
 */
export function buildAutoReplyEmail(
  config: HelpdeskPortalConfig,
  ticket: { ticketNumber: string | null; id: number; title: string },
  input: ExternalTicketInput,
  portalBaseUrl: string
): { subject: string; html: string } {
  const ticketNumber = ticket.ticketNumber ?? `HD-${ticket.id}`;
  const portalUrl = portalBaseUrl ? `${portalBaseUrl}/portal/track` : "";

  if (config.autoReplyTemplate.trim()) {
    const substitute = (text: string): string =>
      text
        .replaceAll("{name}", input.contactName || "there")
        .replaceAll("{ticketNumber}", ticketNumber)
        .replaceAll("{title}", ticket.title)
        .replaceAll("{email}", input.contactEmail)
        .replaceAll("{portalUrl}", portalUrl);

    const subject = substitute(
      "{ticketNumber} — We received your support ticket"
    );
    // Paragraphs come from the template; whitespace-pre-wrap keeps the
    // admin's line breaks intact inside the branded shell.
    const bodyHtml = substitute(config.autoReplyTemplate)
      .split(/\n{2,}/)
      .map((p) => `<p style="margin: 0 0 12px;">${p}</p>`)
      .join("");
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">✅ Ticket Received</h1>
        </div>
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          ${bodyHtml}
        </div>
      </body>
      </html>
    `;
    return { subject, html };
  }

  return portalTicketAckEmail(
    input.contactName,
    ticketNumber,
    ticket.title,
    portalBaseUrl
  );
}

/**
 * Create a ticket on behalf of an anonymous external reporter.
 *
 * Everything that makes a ticket "external" is forced here, not trusted
 * from the payload: no reporter user, no project/team (which also means the
 * internal auto-assign load-balancer can never fire — external tickets land
 * Unassigned for staff pickup), source pinned to `portal`.
 */
export async function createExternalTicket(
  input: ExternalTicketInput,
  ip?: string
): Promise<{ id: number; publicId: string | null; ticketNumber: string | null; title: string }> {
  const priority = input.priority || "medium";
  const now = new Date();

  let slug = await generateSlug(input.title);
  // Slug uniqueness is scoped to (projectId, slug); portal tickets have no
  // project, so collide only against other project-less tickets.
  let counter = 1;
  while (
    await prisma.helpdeskTicket.findFirst({ where: { slug, projectId: null } })
  ) {
    slug = `${await generateSlug(input.title)}-${counter}`;
    counter++;
  }

  const { slaResponseAt, slaResolutionAt } = computeSlaTimestamps(priority, now);

  const ticket = await prisma.helpdeskTicket.create({
    data: {
      projectId: null,
      teamId: null,
      title: input.title,
      slug,
      ticketNumber: await generateReferenceNumber(TICKET_REF_TYPE),
      description: input.description || null,
      priority,
      categoryId: input.categoryId || null,
      source: "portal",
      assignedTo: null,
      reportedBy: null,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone || null,
      slaResponseAt,
      slaResolutionAt,
      metadata: { portalRequestIp: ip ?? null },
    },
    include: {
      category: { select: { id: true, name: true, color: true } },
      assignee: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
    },
  });

  // Acknowledge to the reporter and alert the queue.
  const config = await getPortalConfig();
  const portalBaseUrl = config.subdomain ? `https://${config.subdomain}` : process.env.APP_URL || "";

  await sendEmail({
    to: input.contactEmail,
    ...buildAutoReplyEmail(config, ticket, input, portalBaseUrl),
  });

  if (config.staffNotifyEmail) {
    const addresses = config.staffNotifyEmail
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    for (const address of addresses) {
      await sendEmail({
        to: address,
        subject: `[Helpdesk] New portal ticket ${ticket.ticketNumber ?? ticket.id}`,
        html: `<p>New external ticket via the portal:</p>
               <p><strong>${ticket.ticketNumber ?? ticket.id}</strong> — ${ticket.title}<br/>
               From: ${input.contactName} &lt;${input.contactEmail}&gt;<br/>
               Priority: ${priority}</p>`,
      });
    }
  }

  // In-DB notification for staff — same fan-out the internal create route
  // uses so the bell icon behaves identically for portal tickets.
  const adminRoles = await prisma.modelHasRole.findMany({
    where: {
      modelType: "App\\Models\\User",
      role: { name: { in: ["super-admin", "devops-admin"] } },
    },
    select: { modelId: true },
  });
  const adminIds = [...new Set(adminRoles.map((mr) => mr.modelId))];
  const admins = await prisma.user.findMany({
    where: { id: { in: adminIds }, isActive: true },
    select: { id: true },
  });
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title: "New Portal Ticket",
        message: `External ticket "${ticket.title}" from ${input.contactName} (${input.contactEmail}) awaits pickup.`,
        type: "info",
        link: `/helpdesk/${ticket.publicId ?? ticket.id}`,
      })),
    });
  }

  try {
    const io = getIO();
    io.emit("new-ticket", { ticket });
  } catch (err) {
    console.error("Socket emit failed:", err);
  }

  return {
    id: ticket.id,
    publicId: ticket.publicId,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
  };
}

// ── External reads and replies ──────────────────────────────────────────────

/**
 * List the tickets an email has reported through the portal. Ownership is
 * the contact email — there is no user account to check.
 */
export async function listTicketsForEmail(email: string) {
  return prisma.helpdeskTicket.findMany({
    where: { contactEmail: email, isActive: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      publicId: true,
      ticketNumber: true,
      title: true,
      slug: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      closedAt: true,
      _count: { select: { comments: true } },
    },
  });
}

/**
 * One ticket's detail for its external reporter. Access control is the
 * contactEmail match — a uuid that belongs to someone else's email simply
 * does not resolve. Internal notes are filtered server-side; the portal
 * response never contains them, regardless of what the client asks for.
 */
export async function getExternalTicket(publicId: string, email: string) {
  const ticket = await prisma.helpdeskTicket.findFirst({
    where: {
      OR: [{ publicId }, { id: Number.isFinite(Number(publicId)) ? Number(publicId) : -1 }],
      contactEmail: email,
      isActive: true,
      deletedAt: null,
    },
    include: {
      category: { select: { id: true, name: true, color: true } },
      assignee: { select: { id: true, name: true } },
      comments: {
        where: { isInternal: false, isActive: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          content: true,
          authorName: true,
          userId: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  return ticket;
}

/**
 * Add an external reporter's public reply.
 *
 * `isInternal` is not an input — an external comment can never be internal.
 * Like the internal comment route, a public reply wakes an
 * awaiting_response ticket back up. The assignee is notified in-DB.
 */
export async function addExternalComment(
  publicId: string,
  email: string,
  content: string
) {
  const ticket = await prisma.helpdeskTicket.findFirst({
    where: {
      OR: [{ publicId }, { id: Number.isFinite(Number(publicId)) ? Number(publicId) : -1 }],
      contactEmail: email,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, title: true, status: true, assignedTo: true, contactName: true },
  });
  if (!ticket) throw new AppError(404, "Ticket not found");

  const comment = await prisma.helpdeskComment.create({
    data: {
      ticketId: ticket.id,
      userId: null,
      authorName: ticket.contactName || "External user",
      content,
      isInternal: false,
    },
  });

  if (ticket.status === "awaiting_response") {
    await prisma.helpdeskTicket.update({
      where: { id: ticket.id },
      data: { status: "in_progress" },
    });
  }

  if (ticket.assignedTo) {
    await prisma.notification.create({
      data: {
        userId: ticket.assignedTo,
        title: "New Reply on Your Ticket",
        message: `${ticket.contactName || "The reporter"} replied to "${ticket.title}".`,
        type: "info",
        link: `/helpdesk/${publicId}`,
      },
    });
  }

  return comment;
}
