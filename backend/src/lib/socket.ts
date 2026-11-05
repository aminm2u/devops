import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { authConfig } from "../config/auth.js";
import prisma from "../config/database.js";

/**
 * Realtime channel.
 *
 * The socket used to accept any connection and let the client name the room it
 * wanted (`join-notifications`, any userId). That meant a signed-out visitor —
 * or any employee — could subscribe to another person's notification stream by
 * sending a number. Authentication now happens during the handshake and the
 * room is derived from the verified token, never from client input.
 *
 * Rooms:
 *   user-<id>      notifications and anything addressed to one person
 *   ticket-<id>    helpdesk thread live updates
 *   project-<id>   task board changes within one project
 */

let io: SocketIOServer;

interface SocketUser {
  userId: number;
  name: string;
}

/** Verify the handshake token; returns null for anything we would not trust. */
async function authenticateSocket(rawToken: unknown): Promise<SocketUser | null> {
  if (typeof rawToken !== "string" || rawToken.length === 0) return null;

  try {
    const decoded = jwt.verify(rawToken, authConfig.jwtSecret) as { userId: number };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, isActive: true },
    });
    if (!user || !user.isActive) return null;
    return { userId: user.id, name: user.name };
  } catch {
    // Expired or forged tokens both land here; neither should open a socket.
    return null;
  }
}

export const initSocket = (httpServer: HttpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? process.env.FRONTEND_URL : "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // The SPA can also send the token as a cookie, matching the HTTP path.
  io.use(async (socket, next) => {
    const fromAuth = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
    const fromHeader = socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");
    const fromCookie = parseCookieToken(socket.handshake.headers?.cookie);

    const user = await authenticateSocket(fromAuth ?? fromHeader ?? fromCookie);
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }

    socket.data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as SocketUser;

    // Personal room is joined server-side. The old client-driven
    // `join-notifications` handler is gone with it.
    socket.join(`user-${user.userId}`);

    // Project and ticket rooms are harmless to join — they carry updates for
    // records the UI is already displaying — but they are still validated as
    // positive integers rather than trusted strings.
    const joinRoom = (prefix: string) => (rawId: unknown) => {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) return;
      socket.join(`${prefix}-${id}`);
    };

    socket.on("join-ticket", joinRoom("ticket"));
    socket.on("leave-ticket", (rawId: unknown) => {
      const id = Number(rawId);
      if (Number.isInteger(id) && id > 0) socket.leave(`ticket-${id}`);
    });

    socket.on("join-project", joinRoom("project"));
    socket.on("leave-project", (rawId: unknown) => {
      const id = Number(rawId);
      if (Number.isInteger(id) && id > 0) socket.leave(`project-${id}`);
    });

    socket.on("disconnect", () => {
      // No logging of the connection identity: user ids in stdout are noise
      // here and the audit trail belongs in ActivityLog.
    });
  });

  return io;
};

/** Minimal cookie parse — `cookie` package is not a direct dependency. */
function parseCookieToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "token") return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized!");
  }
  return io;
};

/** Emit to one person. Safe to call before the server has a socket layer. */
export function emitToUser(userId: number, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user-${userId}`).emit(event, payload);
}
