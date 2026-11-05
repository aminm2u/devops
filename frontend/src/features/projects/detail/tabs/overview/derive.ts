/**
 * Pure derivations for the project overview dashboard.
 *
 * Everything here works off the single `GET /projects/:id` payload the detail
 * page already holds, so the dashboard can never disagree with the tabs beside
 * it and adds no extra requests. Keep this file free of React.
 */

export interface OverviewTask {
  id: number;
  title: string;
  columnId: number;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  assignees?: unknown;
  subtasks?: { id: number; status: string; dueDate?: string | null }[];
}

export interface OverviewColumn {
  id: number;
  name: string;
  position: number;
}

const DONE_COLUMN = /^(done|complete|completed|closed|shipped|released)$/i;

export function isDoneColumn(column: OverviewColumn | undefined): boolean {
  return !!column && DONE_COLUMN.test(column.name.trim());
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

export interface TaskRollup {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  overdue: number;
  dueThisWeek: number;
  completionPercent: number;
  byPriority: { key: string; label: string; count: number }[];
  byColumn: { id: number; name: string; count: number; done: boolean }[];
  /** Open tasks with a due date, soonest first — the to-do list. */
  upcoming: OverviewTask[];
}

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'] as const;
const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function rollupTasks(
  tasks: OverviewTask[],
  columns: OverviewColumn[],
  now: Date = new Date()
): TaskRollup {
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const today = startOfDay(now);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const counts = new Map<number, number>();
  let done = 0;
  let inProgress = 0;
  let overdue = 0;
  let dueThisWeek = 0;

  for (const task of tasks) {
    counts.set(task.columnId, (counts.get(task.columnId) ?? 0) + 1);
    const column = columnById.get(task.columnId);
    const taskDone = isDoneColumn(column);

    if (taskDone) {
      done += 1;
      continue;
    }
    if (column && column.position > 1) inProgress += 1;

    if (task.dueDate) {
      const due = startOfDay(new Date(task.dueDate));
      if (due < today) overdue += 1;
      else if (due <= weekEnd) dueThisWeek += 1;
    }
  }

  const total = tasks.length;

  const byPriority = PRIORITY_ORDER.map((key) => ({
    key,
    label: PRIORITY_LABEL[key],
    count: tasks.filter((task) => (task.priority || 'medium') === key).length,
  }));

  const byColumn = [...columns]
    .sort((a, b) => a.position - b.position)
    .map((column) => ({
      id: column.id,
      name: column.name,
      count: counts.get(column.id) ?? 0,
      done: isDoneColumn(column),
    }));

  const upcoming = tasks
    .filter((task) => !isDoneColumn(columnById.get(task.columnId)) && !!task.dueDate)
    .sort(
      (a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
    )
    .slice(0, 6);

  return {
    total,
    done,
    inProgress,
    todo: total - done - inProgress,
    overdue,
    dueThisWeek,
    completionPercent: total > 0 ? Math.round((done / total) * 100) : 0,
    byPriority,
    byColumn,
    upcoming,
  };
}

export interface BudgetRollup {
  allocated: number;
  utilized: number;
  remaining: number;
  utilizationPercent: number;
  committedOnPos: number;
  paidToDate: number;
  byCategory: { name: string; allocated: number; utilized: number }[];
  items: { id: number; description: string; allocated: number; utilized: number }[];
}

export function rollupBudget(project: any): BudgetRollup {
  const items: any[] = project.budgetItems ?? [];
  const allocated = items.reduce((sum, item) => sum + Number(item.allocatedBudget || 0), 0);
  const utilized = items.reduce((sum, item) => sum + Number(item.utilizedBudget || 0), 0);

  const categoryMap = new Map<string, { allocated: number; utilized: number }>();
  for (const item of items) {
    const key = item.category || 'Uncategorised';
    const bucket = categoryMap.get(key) ?? { allocated: 0, utilized: 0 };
    bucket.allocated += Number(item.allocatedBudget || 0);
    bucket.utilized += Number(item.utilizedBudget || 0);
    categoryMap.set(key, bucket);
  }

  const purchaseOrders: any[] = project.purchaseOrders ?? [];
  const committedOnPos = purchaseOrders
    .filter((po) => po.status !== 'cancelled')
    .reduce((sum, po) => sum + Number(po.grandTotal || 0), 0);
  const paidToDate = purchaseOrders.reduce(
    (sum, po) =>
      sum +
      (po.payments ?? [])
        .filter((payment: any) => payment.status === 'paid')
        .reduce((inner: number, payment: any) => inner + Number(payment.totalPaid || 0), 0),
    0
  );

  return {
    allocated,
    utilized,
    remaining: allocated - utilized,
    utilizationPercent: allocated > 0 ? Math.round((utilized / allocated) * 100) : 0,
    committedOnPos,
    paidToDate,
    byCategory: [...categoryMap.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.allocated - a.allocated),
    items: items
      .map((item) => ({
        id: item.id,
        description: item.description,
        allocated: Number(item.allocatedBudget || 0),
        utilized: Number(item.utilizedBudget || 0),
      }))
      .sort((a, b) => b.allocated - a.allocated),
  };
}

export interface TimelineRow {
  id: number;
  label: string;
  start: Date;
  end: Date;
  done: boolean;
  overdue: boolean;
  /** 0-1 position of the row inside the whole project window. */
  offset: number;
  width: number;
}

export interface TimelineRollup {
  start: Date;
  end: Date;
  totalDays: number;
  rows: TimelineRow[];
  todayOffset: number | null;
  elapsedPercent: number;
}

/**
 * Builds a Gantt from task dates.
 *
 * Tasks carry a due date and a creation stamp but no explicit start, so the bar
 * starts where the task became known (its creation, floored to the project
 * start) and ends at its due date. That is honest about what the data holds —
 * an invented start date would look precise and be wrong.
 */
export function rollupTimeline(project: any, now: Date = new Date()): TimelineRollup | null {
  const projectStart = project.startDate ? startOfDay(new Date(project.startDate)) : null;
  const projectEnd = project.expectedEndDate ? startOfDay(new Date(project.expectedEndDate)) : null;
  if (!projectStart || !projectEnd || projectEnd <= projectStart) return null;

  const columns = new Map<number, OverviewColumn>(
    ((project.taskColumns ?? []) as OverviewColumn[]).map((column) => [column.id, column])
  );

  const tasks: OverviewTask[] = (project.tasks ?? []).filter((task: OverviewTask) => !!task.dueDate);

  const rows: TimelineRow[] = tasks
    .map((task) => {
      const rawStart = startOfDay(new Date(task.createdAt));
      const start = rawStart < projectStart ? projectStart : rawStart;
      const end = startOfDay(new Date(task.dueDate!));
      const clampedStart = start > projectEnd ? projectEnd : start;
      const clampedEnd = end < projectStart ? projectStart : end;
      return { task, start: clampedStart, end: clampedEnd };
    })
    .filter(({ end, start }) => end >= start)
    .sort((a, b) => a.end.getTime() - b.end.getTime())
    .slice(0, 10)
    .map(({ task, start, end }) => {
      const total = daysBetween(projectStart, projectEnd) || 1;
      const offset = Math.max(0, Math.min(1, daysBetween(projectStart, start) / total));
      const span = Math.max(daysBetween(start, end), 1);
      return {
        id: task.id,
        label: task.title,
        start,
        end,
        done: isDoneColumn(columns.get(task.columnId)),
        overdue: end < startOfDay(now) && !isDoneColumn(columns.get(task.columnId)),
        offset,
        width: Math.min(1 - offset, span / total),
      };
    });

  const totalDays = daysBetween(projectStart, projectEnd) || 1;
  const todayDelta = daysBetween(projectStart, now);

  return {
    start: projectStart,
    end: projectEnd,
    totalDays,
    rows,
    todayOffset: todayDelta >= 0 && todayDelta <= totalDays ? todayDelta / totalDays : null,
    elapsedPercent: Math.max(0, Math.min(100, Math.round((todayDelta / totalDays) * 100))),
  };
}

export interface RiskItem {
  id: string;
  kind: 'change' | 'security' | 'incident' | 'delay';
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  detail?: string | null;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  serious: 1,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function normaliseSeverity(value: unknown): RiskItem['severity'] {
  const key = String(value ?? 'medium').toLowerCase();
  if (key === 'critical' || key === 'blocker') return 'critical';
  if (key === 'high' || key === 'serious') return 'high';
  if (key === 'low' || key === 'info') return 'low';
  return 'medium';
}

/**
 * Risks come from the three places the platform actually records them: change
 * requests with an elevated risk level, unresolved security findings, open
 * incidents, and the project's own delay note. Only elevated items are listed —
 * a "low risk, standard change" is not a risk to act on.
 */
export function collectRisks(project: any): RiskItem[] {
  const items: RiskItem[] = [];

  for (const change of project.changeManagements ?? []) {
    const severity = normaliseSeverity(change.riskLevel);
    if (severity === 'low') continue;
    if (['completed', 'closed', 'rejected', 'cancelled'].includes(change.status)) continue;
    items.push({
      id: `change-${change.id}`,
      kind: 'change',
      title: change.title,
      severity,
      status: change.status,
      detail: change.type ? `${change.type} change` : null,
    });
  }

  for (const finding of project.securityFindings ?? []) {
    items.push({
      id: `security-${finding.id}`,
      kind: 'security',
      title: finding.title,
      severity: normaliseSeverity(finding.severity),
      status: finding.status,
      detail: finding.cveId ?? finding.type ?? null,
    });
  }

  for (const incident of project.incidents ?? []) {
    if (['resolved', 'closed'].includes(incident.status)) continue;
    items.push({
      id: `incident-${incident.id}`,
      kind: 'incident',
      title: incident.title,
      severity: normaliseSeverity(incident.severity),
      status: incident.status,
      detail: incident.rootCause ?? null,
    });
  }

  if (project.delayReason) {
    items.push({
      id: 'delay',
      kind: 'delay',
      title: 'Project delay recorded',
      severity: 'high',
      status: 'open',
      detail: project.delayReason,
    });
  }

  return items.sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
  );
}

export interface HealthRollup {
  label: string;
  total: number;
  counts: { severity: RiskItem['severity']; count: number }[];
  /** 0-100, higher is healthier. Weighted by severity. */
  score: number;
  verdict: 'On Track' | 'At Risk' | 'Critical';
}

export function rollupHealth(risks: RiskItem[], scheduleSlipPercent: number): HealthRollup {
  const weight = { critical: 12, high: 6, medium: 3, low: 1 } as const;
  const penalty = risks.reduce((sum, risk) => sum + weight[risk.severity], 0);
  const slipPenalty = Math.max(0, Math.min(30, Math.round(scheduleSlipPercent / 2)));
  const score = Math.max(0, Math.min(100, 100 - penalty - slipPenalty));

  const counts = (['critical', 'high', 'medium', 'low'] as const).map((severity) => ({
    severity,
    count: risks.filter((risk) => risk.severity === severity).length,
  }));

  return {
    label:
      score >= 75 ? 'Healthy' : score >= 50 ? 'Needs attention' : 'At risk',
    total: risks.length,
    counts,
    score,
    verdict: score >= 75 ? 'On Track' : score >= 50 ? 'At Risk' : 'Critical',
  };
}

/**
 * Schedule variance in whole days: positive means behind.
 *
 * With an end date, it compares elapsed time against task completion; without
 * one, there is nothing to compare, so it returns 0 rather than inventing a
 * number.
 */
export function scheduleSlipDays(project: any, completionPercent: number, now: Date = new Date()): number {
  if (!project.startDate || !project.expectedEndDate) return 0;
  const start = startOfDay(new Date(project.startDate));
  const end = startOfDay(new Date(project.expectedEndDate));
  const total = daysBetween(start, end);
  if (total <= 0) return 0;
  const elapsed = Math.max(0, Math.min(total, daysBetween(start, now)));
  const expectedCompletion = Math.round((elapsed / total) * 100);
  return expectedCompletion - completionPercent;
}
