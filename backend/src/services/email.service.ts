import nodemailer from "nodemailer";

console.log("[Email] SMTP Config:", {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE,
  user: process.env.SMTP_USERNAME,
  from: process.env.SMTP_FROM_ADDRESS,
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
  debug: true, // Enable debug output
  logger: true, // Log to console
});

const FROM_ADDRESS = process.env.SMTP_FROM_ADDRESS || "noreply@devops-platform.local";
const FROM_NAME = process.env.SMTP_FROM_NAME || "DevOps Platform";
const APP_URL = process.env.APP_URL || "http://localhost:8080";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    // If no SMTP host configured, just log (dev mode)
    if (!process.env.SMTP_HOST) {
      console.log(`[Email] Would send to ${options.to}: ${options.subject}`);
      console.log(`[Email] Preview: http://localhost:8025`);
      return true;
    }

    console.log(`[Email] Sending to ${options.to}...`);
    console.log(`[Email] From: "${FROM_NAME}" <${FROM_ADDRESS}>`);

    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    console.log(`[Email] ✅ Sent successfully to ${options.to}`);
    console.log(`[Email] Message ID: ${info.messageId}`);
    console.log(`[Email] Response: ${info.response}`);
    return true;
  } catch (error: any) {
    console.error(`[Email] ❌ Failed to send to ${options.to}:`);
    console.error(`[Email] Error: ${error.message}`);
    if (error.code) console.error(`[Email] Code: ${error.code}`);
    if (error.response) console.error(`[Email] SMTP Response: ${error.response}`);
    return false;
  }
}

// ── Email Templates ─────────────────────────────────────────────────────────

export function welcomeEmail(userName: string, userEmail: string): { subject: string; html: string } {
  const loginUrl = `${APP_URL}/login`;
  return {
    subject: `Welcome to DevOps Platform, ${userName}!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🚀 Welcome to DevOps Platform</h1>
        </div>
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hi <strong>${userName}</strong>,</p>
          <p>Your account has been created successfully. You can now access the DevOps Central Platform.</p>
          <p><strong>Email:</strong> ${userEmail}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to Platform</a>
          </div>
          <p style="color: #64748b; font-size: 12px;">If you did not expect this email, please contact your administrator.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function incidentEmail(
  incidentTitle: string,
  severity: string,
  status: string,
  projectName: string,
  description: string | null,
  incidentId: number
): { subject: string; html: string } {
  const incidentUrl = `${APP_URL}/projects`;
  const severityColors: Record<string, string> = {
    low: "#22c55e",
    medium: "#f59e0b",
    high: "#f97316",
    critical: "#ef4444",
  };
  const color = severityColors[severity] || "#6b7280";

  return {
    subject: `[Incident][${severity.toUpperCase()}] ${incidentTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">⚠️ New Incident Reported</h1>
        </div>
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; font-weight: bold; width: 120px;">Title:</td><td style="padding: 8px 0;">${incidentTitle}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Severity:</td><td style="padding: 8px 0;"><span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${severity.toUpperCase()}</span></td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Status:</td><td style="padding: 8px 0;">${status}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Project:</td><td style="padding: 8px 0;">${projectName}</td></tr>
            ${description ? `<tr><td style="padding: 8px 0; font-weight: bold;">Description:</td><td style="padding: 8px 0;">${description}</td></tr>` : ""}
          </table>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${incidentUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Incident</a>
          </div>
        </div>
      </body>
      </html>
    `,
  };
}

export function deploymentEmail(
  deploymentName: string,
  status: string,
  projectName: string,
  version: string | null,
  branch: string | null,
  deploymentId: number
): { subject: string; html: string } {
  const deploymentUrl = `${APP_URL}/projects`;
  const statusColors: Record<string, string> = {
    completed: "#22c55e",
    failed: "#ef4444",
    running: "#3b82f6",
    pending: "#f59e0b",
    cancelled: "#6b7280",
  };
  const color = statusColors[status] || "#6b7280";
  const icon = status === "completed" ? "✅" : status === "failed" ? "❌" : "🚀";

  return {
    subject: `[Deployment][${status.toUpperCase()}] ${deploymentName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">${icon} Deployment ${status.charAt(0).toUpperCase() + status.slice(1)}</h1>
        </div>
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; font-weight: bold; width: 120px;">Name:</td><td style="padding: 8px 0;">${deploymentName}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Status:</td><td style="padding: 8px 0;"><span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${status.toUpperCase()}</span></td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Project:</td><td style="padding: 8px 0;">${projectName}</td></tr>
            ${version ? `<tr><td style="padding: 8px 0; font-weight: bold;">Version:</td><td style="padding: 8px 0;">${version}</td></tr>` : ""}
            ${branch ? `<tr><td style="padding: 8px 0; font-weight: bold;">Branch:</td><td style="padding: 8px 0;">${branch}</td></tr>` : ""}
          </table>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${deploymentUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Deployment</a>
          </div>
        </div>
      </body>
      </html>
    `,
  };
}

export function passwordResetEmail(userName: string, resetToken: string): { subject: string; html: string } {
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
  return {
    subject: `Password Reset Request - DevOps Platform`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #7c3aed; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🔐 Password Reset</h1>
        </div>
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hi <strong>${userName}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
          </div>
          <p style="color: #64748b; font-size: 12px;">This link expires in 1 hour. If you did not request this, please ignore this email.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function weeklyReportEmail(
  userName: string,
  stats: {
    totalProjects: number;
    activeProjects: number;
    openIncidents: number;
    deploymentsThisWeek: number;
    sslExpiringCount: number;
  }
): { subject: string; html: string } {
  const dashboardUrl = `${APP_URL}`;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return {
    subject: `Weekly Report - DevOps Platform (${today})`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #0f172a; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">📊 Weekly Report</h1>
          <p style="margin: 8px 0 0; opacity: 0.8; font-size: 14px;">${today}</p>
        </div>
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hi <strong>${userName}</strong>,</p>
          <p>Here's your weekly summary of the DevOps Platform:</p>

          <div style="margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">📁 Total Projects</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 18px; font-weight: bold; color: #1e40af;">${stats.totalProjects}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">✅ Active Projects</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 18px; font-weight: bold; color: #22c55e;">${stats.activeProjects}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">🚨 Open Incidents</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 18px; font-weight: bold; color: ${stats.openIncidents > 0 ? '#ef4444' : '#22c55e'};">${stats.openIncidents}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">🚀 Deployments This Week</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 18px; font-weight: bold; color: #3b82f6;">${stats.deploymentsThisWeek}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; font-weight: bold;">🔒 SSL Expiring Soon</td>
                <td style="padding: 12px 16px; text-align: right; font-size: 18px; font-weight: bold; color: ${stats.sslExpiringCount > 0 ? '#f59e0b' : '#22c55e'};">${stats.sslExpiringCount}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Dashboard</a>
          </div>

          <p style="color: #64748b; font-size: 12px;">You can disable weekly reports in Settings → Notifications.</p>
        </div>
      </body>
      </html>
    `,
  };
}

export function otpEmail(userName: string, otp: string): { subject: string; html: string } {
  return {
    subject: `Your Verification Code - DevOps Platform`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">📧 Email Verification</h1>
        </div>
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Hi <strong>${userName}</strong>,</p>
          <p>Thank you for registering with DevOps Platform. Please use the following verification code to complete your registration:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #1e40af; color: white; padding: 20px 40px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; display: inline-block;">
              ${otp}
            </div>
          </div>
          <p style="color: #64748b; font-size: 14px;">This code expires in <strong>10 minutes</strong>.</p>
          <p style="color: #64748b; font-size: 12px;">If you did not request this verification, please ignore this email.</p>
        </div>
      </body>
      </html>
    `,
  };
}
