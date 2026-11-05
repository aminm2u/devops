import prisma from "../config/database.js";

/**
 * Helpdesk analytics.
 *
 * The old report computed four bare `Record<string, number>` maps from one
 * `findMany` and left the page to guess at deltas. This one answers the
 * questions a support lead actually asks, and answers them comparably:
 *
 *   - is the month better or worse than the last one?   → `comparison`
 *   - where is the work landing?                        → `byCategory`
 *   - are we meeting the promise we made?               → `byPriority` SLA
 *   - who is carrying it?                               → `byAssignee`
 *   - what is ageing right now?                         → `aging`
 *
 * Everything is scoped by a caller-supplied `where` so the route can decide
 * between "all tickets" and "my queue" from capabilities, not role names.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const OPEN_STATUSES = ["open", "in_progress", "awaiting_response"];
const CLOSED_STATUSES = ["resolved", "closed"];

function isClosed(status: string): boolean {
  return CLOSED_STATUSES.includes(status);
}

function monthBounds(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 60_000);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export interface ReportTicketRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  assignee: string | null;
  reporter: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  satisfaction: number | null;
  resolutionMinutes: number | null;
  slaBreached: boolean;
}

interface Bucket {
  count: number;
  resolved: number;
  resolutionMinutes: number[];
  slaBreaches: number;
}

function emptyBucket(): Bucket {
  return { count: 0, resolved: 0, resolutionMinutes: [], slaBreaches: 0 };
}

function bucketToJson(bucket: Bucket, label?: string) {
  const total = bucket.count;
  return {
    ...(label != null ? { key: label } : {}),
    count: total,
    resolved: bucket.resolved,
    avgResolutionMinutes:
      bucket.resolutionMinutes.length > 0
        ? round(average(bucket.resolutionMinutes), 1)
        : null,
    slaBreaches: bucket.slaBreaches,
    slaComplianceRate:
      bucket.resolved > 0 ? percent(bucket.resolved - bucket.slaBreaches, bucket.resolved) : null,
  };
}

/**
 * Build the month's payload. `scope` narrows the ticket set; the caller decides
 * whether that means "everything" or "the viewer's own queue".
 */
export async function monthlyReport(params: {
  month: number; // 1-12
  year: number;
  scope: Record<string, unknown>;
}) {
  const monthIndex = Math.max(0, Math.min(11, params.month - 1));
  const { start, end } = monthBounds(params.year, monthIndex);
  const previous = monthBounds(
    monthIndex === 0 ? params.year - 1 : params.year,
    monthIndex === 0 ? 11 : monthIndex - 1
  );
  const now = new Date();

  const select = {
    id: true,
    title: true,
    status: true,
    priority: true,
    createdAt: true,
    resolvedAt: true,
    closedAt: true,
    slaResponseAt: true,
    slaResolutionAt: true,
    satisfaction: true,
    category: { select: { id: true, name: true } },
    assignee: { select: { id: true, name: true } },
    reporter: { select: { id: true, name: true } },
  } as const;

  const [current, previousTickets, openNow, firstComments] = await Promise.all([
    prisma.helpdeskTicket.findMany({
      where: { ...params.scope, isActive: true, deletedAt: null, createdAt: { gte: start, lt: end } },
      select,
      orderBy: { createdAt: "desc" },
    }),
    prisma.helpdeskTicket.findMany({
      where: {
        ...params.scope,
        isActive: true,
        deletedAt: null,
        createdAt: { gte: previous.start, lt: previous.end },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        satisfaction: true,
        slaResolutionAt: true,
      },
    }),
    prisma.helpdeskTicket.findMany({
      where: {
        ...params.scope,
        isActive: true,
        deletedAt: null,
        status: { in: OPEN_STATUSES },
      },
      select: { id: true, createdAt: true, priority: true, slaResolutionAt: true, status: true },
    }),
    // First human reply per ticket — the only honest proxy for "time to first
    // response" in this schema. Internal notes are excluded: they are not a
    // customer-facing response.
    prisma.helpdeskComment.groupBy({
      by: ["ticketId"],
      where: {
        isInternal: false,
        deletedAt: null,
        ticket: {
          ...params.scope,
          isActive: true,
          deletedAt: null,
          createdAt: { gte: start, lt: end },
        },
      },
      _min: { createdAt: true },
    }),
  ]);

  // ── Row-level helpers ────────────────────────────────────────────────────
  const resolvedAtOf = (ticket: { resolvedAt: Date | null; closedAt: Date | null }) =>
    ticket.resolvedAt ?? ticket.closedAt ?? null;

  const isSlaBreached = (ticket: {
    slaResolutionAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    status: string;
  }): boolean => {
    if (!ticket.slaResolutionAt) return false;
    const closedAt = resolvedAtOf(ticket);
    if (!closedAt) return false;
    return closedAt.getTime() > new Date(ticket.slaResolutionAt).getTime();
  };

  const rows: ReportTicketRow[] = current.map((ticket) => {
    const closed = resolvedAtOf(ticket);
    return {
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category?.name ?? null,
      assignee: ticket.assignee?.name ?? null,
      reporter: ticket.reporter?.name ?? null,
      createdAt: ticket.createdAt,
      resolvedAt: closed,
      satisfaction: ticket.satisfaction,
      resolutionMinutes:
        closed != null ? round(minutesBetween(ticket.createdAt, closed), 1) : null,
      slaBreached: isSlaBreached(ticket),
    };
  });

  // ── Headline ─────────────────────────────────────────────────────────────
  const resolvedRows = rows.filter((row) => row.resolvedAt != null);
  const resolutionSamples = resolvedRows
    .map((row) => row.resolutionMinutes)
    .filter((value): value is number => value != null && value >= 0);
  const slaBreached = rows.filter((row) => row.slaBreached).length;
  const rated = rows.filter((row) => row.satisfaction != null);

  const prevResolved = previousTickets.filter((ticket) => resolvedAtOf(ticket) != null);
  const prevResolutionSamples = prevResolved
    .map((ticket) => {
      const closed = resolvedAtOf(ticket)!;
      return minutesBetween(ticket.createdAt, closed);
    })
    .filter((value) => Number.isFinite(value));
  const prevRated = previousTickets.filter((ticket) => ticket.satisfaction != null);
  const prevSlaBreached = previousTickets.filter((ticket) =>
    isSlaBreached({ ...ticket, resolvedAt: resolvedAtOf(ticket) })
  ).length;

  // First-response: map ticketId → minutes until the first public comment.
  const firstResponseByTicket = new Map(
    firstComments
      .filter((row) => row._min.createdAt != null)
      .map((row) => [row.ticketId, row._min.createdAt as Date])
  );
  const firstResponseSamples: number[] = [];
  for (const ticket of current) {
    const repliedAt = firstResponseByTicket.get(ticket.id);
    if (!repliedAt) continue;
    firstResponseSamples.push(minutesBetween(ticket.createdAt, repliedAt));
  }

  const summary = {
    totalCreated: rows.length,
    totalResolved: resolvedRows.length,
    totalOpen: rows.length - resolvedRows.length,
    avgResolutionMinutes: resolutionSamples.length ? round(average(resolutionSamples), 0) : null,
    avgFirstResponseMinutes: firstResponseSamples.length
      ? round(average(firstResponseSamples), 0)
      : null,
    slaBreached,
    slaComplianceRate: resolvedRows.length
      ? percent(resolvedRows.length - slaBreached, resolvedRows.length)
      : null,
    avgSatisfaction: rated.length ? round(average(rated.map((row) => row.satisfaction!)), 1) : null,
    totalRated: rated.length,
  };

  const comparison = {
    previousPeriod: { month: previous.start.getMonth() + 1, year: previous.start.getFullYear() },
    created: { current: rows.length, previous: previousTickets.length },
    resolved: { current: resolvedRows.length, previous: prevResolved.length },
    avgResolutionMinutes: {
      current: summary.avgResolutionMinutes,
      previous: prevResolutionSamples.length ? round(average(prevResolutionSamples), 0) : null,
    },
    avgSatisfaction: {
      current: summary.avgSatisfaction,
      previous: prevRated.length
        ? round(average(prevRated.map((ticket) => ticket.satisfaction!)), 1)
        : null,
    },
    slaBreached: { current: slaBreached, previous: prevSlaBreached },
  };

  // ── Daily series, zero-filled to the length of the month ─────────────────
  const daysInMonth = new Date(params.year, monthIndex + 1, 0).getDate();
  const createdPerDay = new Array<number>(daysInMonth).fill(0);
  const resolvedPerDay = new Array<number>(daysInMonth).fill(0);

  for (const row of rows) {
    const day = row.createdAt.getDate() - 1;
    if (day >= 0 && day < daysInMonth) createdPerDay[day] += 1;
    if (row.resolvedAt) {
      const resolvedDay = new Date(row.resolvedAt).getDate() - 1;
      if (row.resolvedAt >= start && row.resolvedAt < end && resolvedDay < daysInMonth) {
        resolvedPerDay[resolvedDay] += 1;
      }
    }
  }

  const daily = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    label: String(index + 1),
    created: createdPerDay[index],
    resolved: resolvedPerDay[index],
    backlog: createdPerDay.slice(0, index + 1).reduce((a, b) => a + b, 0) -
      resolvedPerDay.slice(0, index + 1).reduce((a, b) => a + b, 0),
  }));

  // ── Dimension roll-ups ───────────────────────────────────────────────────
  const byStatus = new Map<string, number>();
  const byPriorityBuckets = new Map<string, Bucket>();
  const byCategoryBuckets = new Map<string, Bucket>();
  const byAssigneeBuckets = new Map<string, Bucket & { open: number }>();
  const satisfactionCounts = new Map<number, number>();

  for (const row of rows) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);

    const priority = byPriorityBuckets.get(row.priority) ?? emptyBucket();
    priority.count += 1;
    if (row.resolutionMinutes != null) {
      priority.resolved += 1;
      priority.resolutionMinutes.push(row.resolutionMinutes);
    }
    if (row.slaBreached) priority.slaBreaches += 1;
    byPriorityBuckets.set(row.priority, priority);

    const categoryKey = row.category ?? "Uncategorised";
    const category = byCategoryBuckets.get(categoryKey) ?? emptyBucket();
    category.count += 1;
    if (row.resolutionMinutes != null) {
      category.resolved += 1;
      category.resolutionMinutes.push(row.resolutionMinutes);
    }
    if (row.slaBreached) category.slaBreaches += 1;
    byCategoryBuckets.set(categoryKey, category);

    const assigneeKey = row.assignee ?? "Unassigned";
    const assignee = byAssigneeBuckets.get(assigneeKey) ?? { ...emptyBucket(), open: 0 };
    assignee.count += 1;
    if (row.resolutionMinutes != null) {
      assignee.resolved += 1;
      assignee.resolutionMinutes.push(row.resolutionMinutes);
    } else {
      assignee.open += 1;
    }
    if (row.slaBreached) assignee.slaBreaches += 1;
    byAssigneeBuckets.set(assigneeKey, assignee);

    if (row.satisfaction != null) {
      satisfactionCounts.set(row.satisfaction, (satisfactionCounts.get(row.satisfaction) ?? 0) + 1);
    }
  }

  const PRIORITY_ORDER = ["urgent", "high", "medium", "low"];
  const byPriority = PRIORITY_ORDER.filter((priority) => byPriorityBuckets.has(priority))
    .concat([...byPriorityBuckets.keys()].filter((key) => !PRIORITY_ORDER.includes(key)))
    .map((priority) => ({
      priority,
      ...bucketToJson(byPriorityBuckets.get(priority)!),
    }));

  const byCategory = [...byCategoryBuckets.entries()]
    .map(([name, bucket]) => ({ key: name, label: name, ...bucketToJson(bucket) }))
    .sort((a, b) => b.count - a.count);

  const byAssignee = [...byAssigneeBuckets.entries()]
    .map(([name, bucket]) => ({
      key: name,
      label: name,
      count: bucket.count,
      open: bucket.open,
      resolved: bucket.resolved,
      avgResolutionMinutes:
        bucket.resolutionMinutes.length > 0
          ? round(average(bucket.resolutionMinutes), 0)
          : null,
      slaBreaches: bucket.slaBreaches,
    }))
    .sort((a, b) => b.count - a.count);

  const satisfactionDistribution = [1, 2, 3, 4, 5].map((score) => ({
    score: String(score),
    count: satisfactionCounts.get(score) ?? 0,
  }));

  // ── Live backlog ageing (not month-scoped: it is "now") ──────────────────
  const ageRanges = [
    { key: "< 1 day", min: 0, max: 1 },
    { key: "1–3 days", min: 1, max: 3 },
    { key: "3–7 days", min: 3, max: 7 },
    { key: "> 7 days", min: 7, max: Number.POSITIVE_INFINITY },
  ];
  const agingBuckets = ageRanges.map((range) => ({ key: range.key, count: 0, breached: 0 }));

  for (const ticket of openNow) {
    const ageDays = (now.getTime() - new Date(ticket.createdAt).getTime()) / DAY_MS;
    const index = Math.max(
      0,
      ageRanges.findIndex((range) => ageDays >= range.min && ageDays < range.max)
    );
    const bucket = agingBuckets[index === -1 ? agingBuckets.length - 1 : index];
    bucket.count += 1;
    if (ticket.slaResolutionAt && new Date(ticket.slaResolutionAt).getTime() < now.getTime()) {
      bucket.breached += 1;
    }
  }

  const openBreachedNow = openNow.filter(
    (ticket) =>
      ticket.slaResolutionAt != null && new Date(ticket.slaResolutionAt).getTime() < now.getTime()
  ).length;

  const dueToday = openNow.filter((ticket) => {
    if (!ticket.slaResolutionAt) return false;
    const due = new Date(ticket.slaResolutionAt);
    return (
      due.getTime() >= now.getTime() &&
      due.getTime() - now.getTime() <= 24 * HOUR_MS
    );
  }).length;

  return {
    period: {
      month: monthIndex + 1,
      year: params.year,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      daysInMonth,
    },
    summary,
    comparison,
    daily,
    byStatus: [...byStatus.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    byPriority,
    byCategory,
    byAssignee,
    satisfactionDistribution,
    backlog: {
      open: openNow.length,
      breached: openBreachedNow,
      dueWithin24h: dueToday,
      aging: agingBuckets,
    },
    tickets: rows,
  };
}

/** Months that actually contain tickets — drives the period picker. */
export async function availablePeriods(scopeWhere: Record<string, unknown>) {
  const tickets = await prisma.helpdeskTicket.findMany({
    where: { ...scopeWhere, isActive: true, deletedAt: null },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const seen = new Set<string>();
  const periods: { month: number; year: number; label: string }[] = [];
  for (const ticket of tickets) {
    const month = ticket.createdAt.getMonth() + 1;
    const year = ticket.createdAt.getFullYear();
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    periods.push({
      month,
      year,
      label: `${MONTH_NAMES[ticket.createdAt.getMonth()]} ${year}`,
    });
  }
  return periods;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
