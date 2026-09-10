import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/database.js";
import { authConfig } from "../config/auth.js";
import { AppError, UnauthorizedError, NotFoundError } from "../lib/errors.js";
import { sendWelcomeEmail } from "./notification.service.js";
import { sendEmail, otpEmail } from "./email.service.js";
import { getRedis } from "../config/redis.js";

const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_DURATION = 20 * 60; // 20 minutes in seconds

export interface AuthTokens {
  accessToken: string;
  user: {
    id: number;
    name: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
}

function generateAccessToken(userId: number): string {
  return jwt.sign({ userId }, authConfig.jwtSecret, {
    expiresIn: authConfig.jwtExpiresIn,
  } as jwt.SignOptions);
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<AuthTokens> {
  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(400, "User with this email already exists");
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Assign viewer role
  const viewerRole = await prisma.role.findFirst({
    where: { name: "viewer" },
  });

  if (viewerRole) {
    await prisma.modelHasRole.create({
      data: {
        roleId: viewerRole.id,
        modelType: "App\\Models\\User",
        modelId: user.id,
      },
    });
  }

  // Get user with roles and permissions
  const modelRoles = await prisma.modelHasRole.findMany({
    where: { modelId: user.id, modelType: "App\\Models\\User" },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const roles = modelRoles.map((mhr) => mhr.role.name);
  const permissions = [
    ...new Set(
      modelRoles.flatMap((mhr) =>
        mhr.role.permissions.map((rhp) => rhp.permission.name)
      )
    ),
  ];

  const accessToken = generateAccessToken(user.id);

  // Send welcome email (async, don't block registration)
  sendWelcomeEmail({ id: user.id, name: user.name, email: user.email }).catch((err) =>
    console.error("[Email] Welcome email failed:", err)
  );

  return {
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      permissions,
    },
  };
}

// ── OTP Verification ─────────────────────────────────────────────────────────

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function registerWithOTP(
  name: string,
  email: string,
  password: string
): Promise<{ message: string }> {
  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(400, "User with this email already exists");
  }

  // Check if there's a pending verification
  const existingVerification = await prisma.emailVerification.findFirst({
    where: { email },
  });

  if (existingVerification) {
    // Delete old verification
    await prisma.emailVerification.delete({
      where: { id: existingVerification.id },
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Generate OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Save verification
  await prisma.emailVerification.create({
    data: {
      email,
      code: otp,
      name,
      password: hashedPassword,
      expiresAt,
    },
  });

  // Send OTP email
  const template = otpEmail(name, otp);
  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });

  console.log(`[Auth] OTP sent to ${email}: ${otp}`);

  return { message: "Verification code sent to your email" };
}

export async function verifyEmail(
  email: string,
  code: string
): Promise<AuthTokens> {
  // Find verification
  const verification = await prisma.emailVerification.findFirst({
    where: { email },
  });

  if (!verification) {
    throw new AppError(400, "No verification request found. Please register again.");
  }

  // Check expiration
  if (new Date() > verification.expiresAt) {
    await prisma.emailVerification.delete({
      where: { id: verification.id },
    });
    throw new AppError(400, "Verification code expired. Please register again.");
  }

  // Check code
  if (verification.code !== code) {
    throw new AppError(400, "Invalid verification code");
  }

  // Create user
  const user = await prisma.user.create({
    data: {
      name: verification.name,
      email: verification.email,
      password: verification.password,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Delete verification
  await prisma.emailVerification.delete({
    where: { id: verification.id },
  });

  // Assign viewer role
  const viewerRole = await prisma.role.findFirst({
    where: { name: "viewer" },
  });

  if (viewerRole) {
    await prisma.modelHasRole.create({
      data: {
        roleId: viewerRole.id,
        modelType: "App\\Models\\User",
        modelId: user.id,
      },
    });
  }

  // Get user with roles and permissions
  const modelRoles = await prisma.modelHasRole.findMany({
    where: { modelId: user.id, modelType: "App\\Models\\User" },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const roles = modelRoles.map((mhr) => mhr.role.name);
  const permissions = [
    ...new Set(
      modelRoles.flatMap((mhr) =>
        mhr.role.permissions.map((rhp) => rhp.permission.name)
      )
    ),
  ];

  const accessToken = generateAccessToken(user.id);

  // Send welcome email
  sendWelcomeEmail({ id: user.id, name: user.name, email: user.email }).catch((err) =>
    console.error("[Email] Welcome email failed:", err)
  );

  return {
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      permissions,
    },
  };
}

export async function login(
  email: string,
  password: string
): Promise<AuthTokens> {
  const redis = getRedis();
  const lockKey = `login_lock:${email}`;
  const attemptsKey = `login_attempts:${email}`;

  // Check if account is locked (only if Redis is available)
  if (redis) {
    const lockTTL = await redis.ttl(lockKey);
    if (lockTTL > 0) {
      const minutes = Math.ceil(lockTTL / 60);
      throw new AppError(
        429,
        `Account locked due to too many failed attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`
      );
    }
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!user.isActive) {
    throw new UnauthorizedError("User account is deactivated");
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    // Increment failed attempts (only if Redis is available)
    if (redis) {
      const attempts = await redis.incr(attemptsKey);
      await redis.expire(attemptsKey, LOCKOUT_DURATION);

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        // Lock the account
        await redis.set(lockKey, "1", "EX", LOCKOUT_DURATION);
        await redis.del(attemptsKey);
        console.log(`[Auth] Account locked for 20 minutes: ${email}`);
        throw new AppError(
          429,
          "Too many failed login attempts. Account locked for 20 minutes."
        );
      }

      const remaining = MAX_LOGIN_ATTEMPTS - attempts;
      throw new AppError(
        401,
        `Invalid email or password. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`
      );
    }

    throw new UnauthorizedError("Invalid email or password");
  }

  // Success - clear attempts (only if Redis is available)
  if (redis) {
    await redis.del(attemptsKey);
    await redis.del(lockKey);
  }

  // Get user with roles and permissions
  const modelRoles = await prisma.modelHasRole.findMany({
    where: { modelId: user.id, modelType: "App\\Models\\User" },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const roles = modelRoles.map((mhr) => mhr.role.name);
  const permissions = [
    ...new Set(
      modelRoles.flatMap((mhr) =>
        mhr.role.permissions.map((rhp) => rhp.permission.name)
      )
    ),
  ];

  const accessToken = generateAccessToken(user.id);

  return {
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      permissions,
    },
  };
}

export async function getMe(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  const modelRoles = await prisma.modelHasRole.findMany({
    where: { modelId: userId, modelType: "App\\Models\\User" },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const roles = modelRoles.map((mhr) => ({
    id: mhr.role.id,
    name: mhr.role.name,
    description: mhr.role.description,
  }));

  const permissions = [
    ...new Set(
      modelRoles.flatMap((mhr) =>
        mhr.role.permissions.map((rhp) => rhp.permission.name)
      )
    ),
  ];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles,
    permissions,
  };
}
