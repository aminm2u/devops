import prisma from "../config/database.js";
import {
  sendEmail,
  welcomeEmail,
  incidentEmail,
  deploymentEmail,
  passwordResetEmail,
  weeklyReportEmail,
} from "./email.service.js";
import { gatherWeeklyReportData } from "./pdf.service.js";

// ── Create Notification ─────────────────────────────────────────────────────

export async function createNotification(
  userId: number,
  type: string,
  title: string,
  message: string,
  link?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        link: link || null,
      },
    });
  } catch (error) {
    console.error("[Notification] Failed to create notification:", error);
  }
}

// ── Check if user wants email for this type ─────────────────────────────────

async function wantsEmail(userId: number, type: string): Promise<boolean> {
  try {
    const pref = await prisma.setting.findUnique({
      where: { key: `notification_prefs_${userId}` },
    });
    if (!pref) return true; // default: enabled

    const prefs = JSON.parse(pref.value as string);
    if (prefs.email === false) return false;

    const typeMap: Record<string, string> = {
      incident: "incidentAlerts",
      deployment: "deploymentUpdates",
    };
    const prefKey = typeMap[type];
    if (prefKey && prefs[prefKey] === false) return false;

    return true;
  } catch {
    return true;
  }
}

// ── Get project team member IDs ─────────────────────────────────────────────

async function getProjectTeamUserIds(projectId: number): Promise<number[]> {
  const assignments = await prisma.teamAssignment.findMany({
    where: { projectId, isActive: true },
    select: { userId: true },
  });
  return assignments.map((a) => a.userId);
}

// ── Welcome Email ───────────────────────────────────────────────────────────

export async function sendWelcomeEmail(user: {
  id: number;
  name: string;
  email: string;
}): Promise<void> {
  const template = welcomeEmail(user.name, user.email);

  // Create in-app notification
  await createNotification(
    user.id,
    "welcome",
    "Welcome to DevOps Platform",
    `Your account has been created. You can now access the platform.`,
    "/settings"
  );

  // Send email
  if (await wantsEmail(user.id, "welcome")) {
    await sendEmail({
      to: user.email,
      subject: template.subject,
      html: template.html,
    });
  }
}

// ── Incident Notification ───────────────────────────────────────────────────

export async function sendIncidentNotification(
  incident: {
    id: number;
    title: string;
    severity: string;
    status: string;
    description: string | null;
    projectId: number;
  },
  event: "created" | "updated" | "resolved"
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: incident.projectId },
    select: { name: true },
  });
  const projectName = project?.name || "Unknown Project";

  const template = incidentEmail(
    incident.title,
    incident.severity,
    incident.status,
    projectName,
    incident.description,
    incident.id
  );

  const userIds = await getProjectTeamUserIds(incident.projectId);

  const eventMessages: Record<string, string> = {
    created: `New ${incident.severity} incident reported: ${incident.title}`,
    updated: `Incident updated: ${incident.title} is now ${incident.status}`,
    resolved: `Incident resolved: ${incident.title}`,
  };

  for (const userId of userIds) {
    // Create in-app notification
    await createNotification(
      userId,
      "incident",
      `Incident ${event}: ${incident.title}`,
      eventMessages[event],
      "/projects"
    );

    // Send email
    if (await wantsEmail(userId, "incident")) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user) {
        await sendEmail({
          to: user.email,
          subject: template.subject,
          html: template.html,
        });
      }
    }
  }
}

// ── Deployment Notification ─────────────────────────────────────────────────

export async function sendDeploymentNotification(
  deployment: {
    id: number;
    name: string;
    status: string;
    projectId: number;
    version: string | null;
    branch: string | null;
  },
  event: "created" | "completed" | "failed"
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: deployment.projectId },
    select: { name: true },
  });
  const projectName = project?.name || "Unknown Project";

  const template = deploymentEmail(
    deployment.name,
    deployment.status,
    projectName,
    deployment.version,
    deployment.branch,
    deployment.id
  );

  const userIds = await getProjectTeamUserIds(deployment.projectId);

  const eventMessages: Record<string, string> = {
    created: `Deployment started: ${deployment.name}`,
    completed: `Deployment completed successfully: ${deployment.name}`,
    failed: `Deployment failed: ${deployment.name}`,
  };

  for (const userId of userIds) {
    // Create in-app notification
    await createNotification(
      userId,
      "deployment",
      `Deployment ${event}: ${deployment.name}`,
      eventMessages[event],
      "/projects"
    );

    // Send email
    if (await wantsEmail(userId, "deployment")) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user) {
        await sendEmail({
          to: user.email,
          subject: template.subject,
          html: template.html,
        });
      }
    }
  }
}

// ── Password Reset Email ────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  user: { id: number; name: string; email: string },
  token: string
): Promise<void> {
  const template = passwordResetEmail(user.name, token);
  await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
  });
}

// ── Weekly Report ───────────────────────────────────────────────────────────

export async function sendWeeklyReport(): Promise<{ sent: number; skipped: number }> {
  // Find all users with weekly report enabled
  const allSettings = await prisma.setting.findMany({
    where: { key: { startsWith: "notification_prefs_" } },
  });

  let sent = 0;
  let skipped = 0;

  for (const setting of allSettings) {
    try {
      const prefs = JSON.parse(setting.value as string);
      if (prefs.email === false || prefs.weeklyReport === false) {
        skipped++;
        continue;
      }

      const userId = parseInt(setting.key.replace("notification_prefs_", ""));
      if (isNaN(userId)) continue;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });
      if (!user) continue;

      // Gather per-user stats based on their assigned projects
      const reportData = await gatherWeeklyReportData(userId);
      const stats = {
        totalProjects: reportData.totalProjects,
        activeProjects: reportData.activeProjects,
        openIncidents: reportData.openIncidents,
        deploymentsThisWeek: reportData.deploymentsThisWeek,
        sslExpiringCount: reportData.sslExpiringCount,
      };

      const template = weeklyReportEmail(user.name, stats);

      // Create in-app notification
      await createNotification(
        user.id,
        "system",
        "Weekly Report",
        `Projects: ${stats.totalProjects} | Incidents: ${stats.openIncidents} | Deployments: ${stats.deploymentsThisWeek} | SSL Expiring: ${stats.sslExpiringCount}`,
        "/"
      );

      // Send email
      await sendEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
      });
      sent++;
    } catch (err) {
      console.error("[WeeklyReport] Failed for user:", err);
      skipped++;
    }
  }

  console.log(`[WeeklyReport] Done: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}

// ── Mark Notification as Read ───────────────────────────────────────────────

export async function markAsRead(
  notificationId: number,
  userId: number
): Promise<boolean> {
  try {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return true;
  } catch {
    return false;
  }
}

// ── Mark All as Read ────────────────────────────────────────────────────────

export async function markAllAsRead(userId: number): Promise<boolean> {
  try {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return true;
  } catch {
    return false;
  }
}

// ── Get Unread Count ────────────────────────────────────────────────────────

export async function getUnreadCount(userId: number): Promise<number> {
  try {
    return await prisma.notification.count({
      where: { userId, isRead: false },
    });
  } catch {
    return 0;
  }
}
