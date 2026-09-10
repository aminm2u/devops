import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { RequestWithUser } from "../types/index.js";
import * as authService from "../services/auth.service.js";
import prisma from "../config/database.js";

const registerWithOTPSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(255),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post(
  "/register",
  validate(registerSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body;
      const result = await authService.register(name, email, password);

      res.cookie("token", result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(201).json({
        success: true,
        data: result,
        message: "User registered successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/register-otp - Send OTP for registration
router.post(
  "/register-otp",
  validate(registerWithOTPSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { name, email, password } = req.body;
      const result = await authService.registerWithOTP(name, email, password);

      res.status(200).json({
        success: true,
        data: null,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/verify-email - Verify OTP and complete registration
router.post(
  "/verify-email",
  validate(verifyEmailSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { email, code } = req.body;
      const result = await authService.verifyEmail(email, code);

      res.cookie("token", result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(201).json({
        success: true,
        data: result,
        message: "Email verified successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/login
router.post(
  "/login",
  validate(loginSchema),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      res.cookie("token", result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(200).json({
        success: true,
        data: result,
        message: "Login successful",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/logout
router.post(
  "/logout",
  (_req: RequestWithUser, res: Response) => {
    res.clearCookie("token");
    res.status(200).json({
      success: true,
      data: null,
      message: "Logged out successfully",
    });
  }
);

// GET /api/auth/me
router.get(
  "/me",
  authenticate,
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getMe(req.user!.id);
      res.status(200).json({
        success: true,
        data: user,
        message: "User retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  validate(z.object({ email: z.string().email() })),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      // Check if user exists (but don't reveal if they don't)
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        // In production, send email with reset token
        // For now, just create a token record
        const token = Math.random().toString(36).substring(2, 15);
        await prisma.passwordResetToken.create({
          data: {
            email,
            token,
            createdAt: new Date(),
          },
        });
      }

      res.status(200).json({
        data: null,
        message: "If the email exists, a password reset link has been sent",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  validate(
    z.object({
      token: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8).max(255),
    })
  ),
  async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const { token, email, password } = req.body;

      // Find the reset token
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { email },
      });

      if (!resetToken || resetToken.token !== token) {
        return res.status(400).json({
          error: "Invalid or expired reset token",
        });
      }

      // Hash new password
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash(password, 12);

      // Update user password
      await prisma.user.update({
        where: { email },
        data: { password: hashedPassword },
      });

      // Delete the reset token
      await prisma.passwordResetToken.delete({
        where: { email },
      });

      res.status(200).json({
        data: null,
        message: "Password reset successful",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
