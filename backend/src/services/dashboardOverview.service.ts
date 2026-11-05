import prisma from "../config/database.js";
import { can, type ResolvedAccess } from "../rbac/effective.js";

/**
 * Role-aware home dashboard.
 *
 * The page is built in four blocks that appear as the viewer's *capabilities*
 * grow — never from a role name:
 *
 *   personal   always          my hours, my tasks, my tickets
 *   approvals  can decide      what is waiting on me
 *   team       leads a team    the team's movement and load
 *   org        dashboard.view.org   portfolio-level picture
 *
 * `attention` is the cross-block "what should I do next" list, assembled from
 * whichever blocks the viewer has.
 */

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Chart tick labels are built by hand rather than from `toLocaleDateString`,
 * whose ordering depends on the container's ICU locale ("22 Thu" reads wrong in
 * an en-MY UI). Same output on every host.
 */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function dayLabel(date: Date, includeDay: boolean): string {
  const weekday = WEEKDAYS[date.getDay()];
  return includeDay ? `${weekday} ${date.getDate()}` : weekday;
}

export interface AttentionItem {
  kind: "approval" | "task" | "ticket" | "incident" | "ssl" | "timesheet" | "budget";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  href: string;
}

// ── Personal ────────────────────────────────────────────────────────────────

export async function personalBlock(userId: number) {
  const today = startOfDay(new Date());
  const weekStart = startOfDay(new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY_MS));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [recentEntries, draftCount, pendingCount, myTasks, mySubtasks, tickets] =
    await Promise.all([
      prisma.timeEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          workDate: { gte: new Date(today.getTime() - 29 * DAY_MS) },
        },
        select: { workDate: true, hours: true, status: true },
      }),
      prisma.timeEntry.count({ where: { userId, deletedAt: null, status: "draft" } }),
      prisma.timeEntry.count({ where: { userId, deletedAt: null, status: "submitted" } }),
      prisma.projectTask.findMany({
        where: { assignees: { array_contains: [userId] }, dueDate: { not: null } },
        select: {
          id: true,
          title: true,
          priority: true,
          dueDate: true,
          projectId: true,
          project: { select: { name: true } },
          column: { select: { name: true } },
          subtasks: { select: { status: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 40,
      }),
      prisma.taskSubtask.findMany({
        where: { assigneeId: userId, status: { not: "done" }, dueDate: { not: null } },
        select: { id: true, title: true, dueDate: true, taskId: true },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
      prisma.helpdeskTicket.findMany({
        where: {
          OR: [{ reportedBy: userId }, { assignedTo: userId }],
          deletedAt: null,
          isActive: true,
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          reportedBy: true,
          assignedTo: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

  const isClosedTicket = (status: string) => ["resolved", "closed"].includes(status);

  let hoursToday = 0;
  let hoursThisWeek = 0;
  let hoursThisMonth = 0;
  const byDay = new Map<string, number>();

  for (const entry of recentEntries) {
    const date = new Date(entry.workDate);
    const hours = num(entry.hours);
    const key = isoDate(date);
    byDay.set(key, round1((byDay.get(key) ?? 0) + hours));

    if (date >= today) hoursToday += hours;
    if (date >= weekStart) hoursThisWeek += hours;
    if (date >= monthStart) hoursThisMonth += hours;
  }

  // 14-day series, zero-filled — a sparkline with holes lies about the shape.
  const dailyHours: { date: string; label: string; hours: number }[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    dailyHours.push({
      date: isoDate(day),
      label: dayLabel(day, true),
      hours: byDay.get(isoDate(day)) ?? 0,
    });
  }

  const isDoneColumn = (name?: string) => /^(done|complete|completed|closed)$/i.test((name ?? "").trim());
  const taskRows = myTasks
    .filter((task) => !isDoneColumn(task.column?.name))
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      projectName: task.project?.name ?? null,
      column: task.column?.name ?? null,
      subtaskDone: task.subtasks.filter((sub) => sub.status === "done").length,
      subtaskTotal: task.subtasks.length,
      isOverdue: task.dueDate != null && new Date(task.dueDate) < today,
    }));

  const todayIso = isoDate(today);
  const weekEndIso = isoDate(new Date(today.getTime() + 7 * DAY_MS));
  const dueThisWeek = taskRows.filter((task) => {
    if (!task.dueDate) return false;
    const due = isoDate(new Date(task.dueDate));
    return due >= todayIso && due <= weekEndIso;
  });

  return {
    hours: {
      today: round1(hoursToday),
      thisWeek: round1(hoursThisWeek),
      thisMonth: round1(hoursThisMonth),
      daily: dailyHours,
    },
    timesheet: { drafts: draftCount, submitted: pendingCount },
    tasks: {
      open: taskRows.length,
      overdue: taskRows.filter((task) => task.isOverdue).length,
      dueThisWeek: dueThisWeek.length,
      next: taskRows.slice(0, 6),
    },
    subtasks: mySubtasks.map((sub) => ({
      id: sub.id,
      title: sub.title,
      dueDate: sub.dueDate,
      taskId: sub.taskId,
      isOverdue: sub.dueDate != null && new Date(sub.dueDate) < today,
    })),
    tickets: {
      reportedOpen: tickets.filter(
        (ticket) => ticket.reportedBy === userId && !isClosedTicket(ticket.status)
      ).length,
      assignedOpen: tickets.filter(
        (ticket) => ticket.assignedTo === userId && !isClosedTicket(ticket.status)
      ).length,
      total: tickets.length,
    },
  };
}

// ── Approvals ───────────────────────────────────────────────────────────────

export async function approvalsBlock(userId: number) {
  const [rows, byModule] = await Promise.all([
    prisma.approvalRequest.findMany({
      where: { approverId: userId, status: "pending" },
      include: { requester: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
    prisma.approvalRequest.groupBy({
      by: ["module"],
      where: { approverId: userId, status: "pending" },
      _count: { _all: true },
    }),
  ]);

  const now = Date.now();
  const aged = rows.map((row) => ({
    id: row.id,
    module: row.module,
    title: row.title,
    requesterName: row.requester?.name ?? null,
    createdAt: row.createdAt,
    ageDays: Math.floor((now - new Date(row.createdAt).getTime()) / DAY_MS),
  }));

  return {
    pending: rows.length,
    oldestDays: aged.reduce((max, row) => Math.max(max, row.ageDays), 0),
    byModule: byModule.map((row) => ({ module: row.module, count: row._count._all })),
    items: aged.slice(0, 6),
  };
}

// ── Team ────────────────────────────────────────────────────────────────────

export async function teamBlock(userId: number, access: ResolvedAccess) {
  let memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      isActive: true,
      teamRole: { in: ["lead", "assistant_lead"] },
      team: { isActive: true },
    },
    select: { teamId: true, teamRole: true, team: { select: { id: true, name: true, type: true } } },
  });

  // A department head runs people without leading a squad, so looking only at
  // TeamMember returned null for them and the page dropped the whole section.
  // Widen to the teams owned by the departments they manage — still bounded by
  // their own department, never the whole company.
  if (memberships.length === 0) {
    const managedDepartments = await prisma.department.findMany({
      where: { managerId: userId },
      select: { id: true, name: true },
    });

    if (managedDepartments.length > 0) {
      const departmentIds = managedDepartments.map((department) => department.id);
      const teams = await prisma.team.findMany({
        where: { departmentId: { in: departmentIds }, isActive: true },
        select: { id: true, name: true, type: true },
      });

      // Reported as `head` rather than `lead`: the UI labels the section
      // differently, and pretending to be a team lead would misstate the role.
      memberships = teams.map((team) => ({
        teamId: team.id,
        teamRole: "head",
        team: { id: team.id, name: team.name, type: team.type },
      }));
    }
  }

  if (memberships.length === 0) return null;

  const teamIds = memberships.map((member) => member.teamId);
  const today = startOfDay(new Date());
  const weekStart = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY_MS);

  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: teamIds }, isActive: true },
    select: {
      userId: true,
      teamRole: true,
      teamId: true,
      user: { select: { id: true, name: true, isActive: true } },
    },
  });

  const memberIds = [...new Set(members.map((member) => member.userId))];

  const [weekEntries, openIncidents, openTickets, memberTasks] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId: { in: memberIds }, deletedAt: null, workDate: { gte: weekStart } },
      select: { userId: true, hours: true, workDate: true, status: true },
    }),
    prisma.incident.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ["resolved", "closed"] },
        OR: [{ teamId: { in: teamIds } }, { project: { teams: { some: { id: { in: teamIds } } } } }],
      },
      select: { id: true, title: true, severity: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.helpdeskTicket.findMany({
      where: {
        teamId: { in: teamIds },
        deletedAt: null,
        isActive: true,
        status: { notIn: ["resolved", "closed"] },
      },
      select: { id: true, title: true, priority: true, status: true, slaResolutionAt: true },
      take: 50,
    }),
    prisma.projectTask.findMany({
      where: {
        dueDate: { not: null },
        OR: [
          { project: { teams: { some: { id: { in: teamIds } } } } },
          ...memberIds.map((id) => ({ assignees: { array_contains: id } })),
        ],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        assignees: true,
        column: { select: { name: true } },
      },
      take: 300,
    }),
  ]);

  const hoursByUser = new Map<number, number>();
  const activeUsers = new Set<number>();
  const todayIso = isoDate(today);

  for (const entry of weekEntries) {
    const hours = num(entry.hours);
    hoursByUser.set(entry.userId, round1((hoursByUser.get(entry.userId) ?? 0) + hours));
    if (isoDate(new Date(entry.workDate)) === todayIso) activeUsers.add(entry.userId);
  }

  const totalWeekHours = round1([...hoursByUser.values()].reduce((sum, value) => sum + value, 0));

  const leaderboard = members
    .map((member) => ({
      userId: member.userId,
      name: member.user?.name ?? `User ${member.userId}`,
      teamRole: member.teamRole,
      hours: hoursByUser.get(member.userId) ?? 0,
      loggedToday: activeUsers.has(member.userId),
    }))
    .sort((a, b) => b.hours - a.hours);

  const isDoneColumn = (name?: string | null) =>
    /^(done|complete|completed|closed)$/i.test((name ?? "").trim());

  // Task load for the team: assigned to any member, still open.
  const memberTaskRows = memberTasks
    .filter((task) => !isDoneColumn(task.column?.name))
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate,
      isOverdue: task.dueDate != null && new Date(task.dueDate) < today,
    }));

  // Seven-day team hours, zero-filled to today.
  const series: { date: string; label: string; hours: number }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today.getTime() - offset * DAY_MS);
    const key = isoDate(day);
    const hours = weekEntries
      .filter((entry) => isoDate(new Date(entry.workDate)) === key)
      .reduce((sum, entry) => sum + num(entry.hours), 0);
    series.push({
      date: key,
      label: dayLabel(day, false),
      hours: round1(hours),
    });
  }

  const canSeeHours = can(access, "timesheet.entry.read.team");

  const now = Date.now();
  const slaAtRisk = openTickets.filter(
    (ticket) =>
      ticket.slaResolutionAt != null &&
      new Date(ticket.slaResolutionAt).getTime() - now < 4 * 3_600_000
  ).length;

  return {
    teams: memberships.map((member) => ({
      id: member.team.id,
      name: member.team.name,
      type: member.team.type,
      role: member.teamRole,
    })),
    headcount: memberIds.length,
    canSeeHours,
    activeToday: canSeeHours ? activeUsers.size : null,
    hoursThisWeek: canSeeHours ? totalWeekHours : null,
    avgHoursPerMember: canSeeHours && memberIds.length ? round1(totalWeekHours / memberIds.length) : null,
    daily: canSeeHours ? series : [],
    leaderboard: canSeeHours ? leaderboard.slice(0, 8) : [],
    tasks: {
      open: memberTaskRows.length,
      overdue: memberTaskRows.filter((task) => task.isOverdue).length,
      items: memberTaskRows
        .filter((task) => task.isOverdue)
        .slice(0, 5),
    },
    incidents: {
      open: openIncidents.length,
      critical: openIncidents.filter((incident) => incident.severity === "critical").length,
      items: openIncidents.slice(0, 5).map((incident) => ({
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
      })),
    },
    tickets: { open: openTickets.length, slaAtRisk },
    /** `false` when the team has no records to plot — the UI hides the chart. */
    hasActivity: weekEntries.length > 0 || memberTaskRows.length > 0,
    _canReadTeamHours: can(access, "timesheet.entry.read.team"),
  };
}

// ── Organisation ────────────────────────────────────────────────────────────

export async function orgBlock() {
  const today = startOfDay(new Date());
  const thirtyDays = new Date(today.getTime() + 30 * DAY_MS);
  const weekAgo = new Date(today.getTime() - 7 * DAY_MS);

  const [
    projectCounts,
    projects,
    budget,
    incidents,
    deployments,
    nodes,
    sslExpiring,
    ticketCounts,
    headcount,
  ] = await Promise.all([
    prisma.project.groupBy({
      by: ["status"],
      where: { deletedAt: null, isActive: true },
      _count: { _all: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, healthStatus: true, status: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.budgetItem.aggregate({
      where: { deletedAt: null },
      _sum: { allocatedBudget: true, utilizedBudget: true },
    }),
    prisma.incident.findMany({
      where: { deletedAt: null, status: { notIn: ["resolved", "closed"] } },
      select: { id: true, title: true, severity: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.deployment.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { id: true, status: true, createdAt: true },
      take: 500,
    }),
    prisma.infrastructureNode.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.sslCertificate.findMany({
      where: { deletedAt: null, isActive: true, notAfter: { lte: thirtyDays } },
      select: { id: true, name: true, notAfter: true },
      orderBy: { notAfter: "asc" },
      take: 50,
    }),
    prisma.helpdeskTicket.groupBy({
      by: ["status"],
      where: { deletedAt: null, isActive: true },
      _count: { _all: true },
    }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  const allocated = num(budget._sum.allocatedBudget);
  const utilized = num(budget._sum.utilizedBudget);
  const failedDeployments = deployments.filter((row) =>
    ["failed", "rolled_back", "rollback"].includes(row.status)
  ).length;

  return {
    projects: {
      total: projectCounts.reduce((sum, row) => sum + row._count._all, 0),
      byStatus: projectCounts.map((row) => ({ status: row.status, count: row._count._all })),
      byHealth: countBy(projects.map((project) => project.healthStatus || "On Track")),
      atRisk: projects.filter((project) => isAtRisk(project.healthStatus)).length,
    },
    budget: {
      allocated: round1(allocated),
      utilized: round1(utilized),
      remaining: round1(allocated - utilized),
      utilizationPercent: allocated > 0 ? Math.round((utilized / allocated) * 100) : 0,
    },
    incidents: {
      open: incidents.length,
      bySeverity: countBy(incidents.map((incident) => incident.severity)),
      critical: incidents.filter((incident) => incident.severity === "critical").length,
      oldest: incidents
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, 3)
        .map((incident) => ({
          id: incident.id,
          title: incident.title,
          ageDays: Math.floor((Date.now() - new Date(incident.createdAt).getTime()) / DAY_MS),
        })),
    },
    deployments: {
      thisWeek: deployments.length,
      failed: failedDeployments,
      successRate:
        deployments.length > 0
          ? Math.round(((deployments.length - failedDeployments) / deployments.length) * 100)
          : null,
    },
    infrastructure: {
      total: nodes.reduce((sum, row) => sum + row._count._all, 0),
      byStatus: nodes.map((row) => ({ status: row.status, count: row._count._all })),
    },
    ssl: {
      expiring: sslExpiring.length,
      items: sslExpiring
        .filter((cert) => cert.notAfter != null)
        .slice(0, 5)
        .map((cert) => ({
          id: cert.id,
          name: cert.name,
          notAfter: cert.notAfter,
          daysLeft: Math.ceil((new Date(cert.notAfter!).getTime() - Date.now()) / DAY_MS),
        })),
    },
    helpdesk: {
      open: ticketCounts
        .filter((row) => !["resolved", "closed"].includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0),
      byStatus: ticketCounts.map((row) => ({ status: row.status, count: row._count._all })),
    },
    headcount,
  };
}

/** Health labels are free-text today ("On Track", "Delayed", "At Risk"), so match loosely. */
function isAtRisk(healthStatus?: string | null): boolean {
  const value = (healthStatus ?? "").toLowerCase();
  return value.includes("risk") || value.includes("critical") || value.includes("off track") || value.includes("delay");
}

function countBy(values: string[]): { key: string; count: number }[] {  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

// ── "What needs me next" ────────────────────────────────────────────────────

export function buildAttention(params: {
  personal: Awaited<ReturnType<typeof personalBlock>>;
  approvals: Awaited<ReturnType<typeof approvalsBlock>> | null;
  team: Awaited<ReturnType<typeof teamBlock>> | null;
  org: Awaited<ReturnType<typeof orgBlock>> | null;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { personal, approvals, team, org } = params;

  if (approvals && approvals.pending > 0) {
    items.push({
      kind: "approval",
      severity: approvals.oldestDays >= 3 ? "high" : "medium",
      title: `${approvals.pending} approval${approvals.pending === 1 ? "" : "s"} waiting on you`,
      detail:
        approvals.oldestDays > 0
          ? `Oldest has been waiting ${approvals.oldestDays} day${approvals.oldestDays === 1 ? "" : "s"}.`
          : "Submitted today.",
      href: "/approvals",
    });
  }

  if (personal.tasks.overdue > 0) {
    items.push({
      kind: "task",
      severity: "high",
      title: `${personal.tasks.overdue} of your tasks are overdue`,
      detail: "Reschedule or close them so the project board stays honest.",
      href: "/projects",
    });
  }

  if (personal.timesheet.drafts > 0) {
    items.push({
      kind: "timesheet",
      severity: "low",
      title: `${personal.timesheet.drafts} timesheet entr${personal.timesheet.drafts === 1 ? "y is" : "ies are"} still draft`,
      detail: "Submit them so your week is counted.",
      href: "/my-work/timesheet",
    });
  }

  if (team) {
    if (team.incidents.critical > 0) {
      items.push({
        kind: "incident",
        severity: "critical",
        title: `${team.incidents.critical} critical incident${team.incidents.critical === 1 ? "" : "s"} on your team`,
        detail: "Unresolved and marked critical.",
        href: "/devops/incidents",
      });
    } else if (team.tickets.slaAtRisk > 0) {
      items.push({
        kind: "ticket",
        severity: "high",
        title: `${team.tickets.slaAtRisk} ticket${team.tickets.slaAtRisk === 1 ? "" : "s"} nearing SLA`,
        detail: "Resolution deadline is within four hours.",
        href: "/helpdesk/manage",
      });
    }
    if (team.tasks.overdue > 0) {
      items.push({
        kind: "task",
        severity: "medium",
        title: `${team.tasks.overdue} team task${team.tasks.overdue === 1 ? "" : "s"} overdue`,
        detail: "Someone on your team is behind on a dated task.",
        href: "/projects",
      });
    }
  }

  if (org) {
    if (org.ssl.expiring > 0) {
      items.push({
        kind: "ssl",
        severity: "high",
        title: `${org.ssl.expiring} certificate${org.ssl.expiring === 1 ? "" : "s"} expiring within 30 days`,
        detail:
          org.ssl.items[0] != null
            ? `Soonest: ${org.ssl.items[0].name} in ${org.ssl.items[0].daysLeft} day(s).`
            : "Renew them to avoid an outage.",
        href: "/devops/ssl",
      });
    }
    if (org.incidents.critical > 0) {
      items.push({
        kind: "incident",
        severity: "critical",
        title: `${org.incidents.critical} critical incident${org.incidents.critical === 1 ? "" : "s"} open across the estate`,
        detail: "Nothing clears this except a resolution.",
        href: "/devops/incidents",
      });
    }
    if (org.projects.atRisk > 0) {
      items.push({
        kind: "budget",
        severity: "medium",
        title: `${org.projects.atRisk} project${org.projects.atRisk === 1 ? "" : "s"} flagged at risk`,
        detail: "Health status is At Risk or worse.",
        href: "/projects",
      });
    }
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return items.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 8);
}

/** Which blocks this viewer is entitled to — the UI mirrors this list. */
export function visibleBlocks(access: ResolvedAccess) {
  return {
    personal: can(access, "dashboard.view"),
    approvals: can(access, "approval.request.view.own"),
    team: can(access, "timesheet.entry.read.team"),
    org: can(access, "dashboard.view.org"),
  };
}
