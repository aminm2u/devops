/**
 * Pure derivations for the Timeline tab — no React.
 *
 * Rows come from the project's scope tree (the spine): each item's bar spans
 * its own dates, and parent bars roll up min(start)/max(end) of their
 * descendants so phases render as summary bars, mirroring the workbook's
 * month-grid timeline.
 */

export interface TimelineScopeItem {
  id: number;
  parentId: number | null;
  wbsNumber: string;
  sortOrder: number;
  title: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  roleCodes: string[] | null;
  progress: number | null;
}

export interface GanttRow {
  id: number;
  wbsNumber: string;
  label: string;
  depth: number;
  isPhase: boolean;
  start: Date;
  end: Date;
  done: boolean;
  overdue: boolean;
  progress: number | null;
  roleCodes: string[];
}

export interface ScopeTimeline {
  start: Date;
  end: Date;
  todayOffset: number | null;
  rows: GanttRow[];
  undatedCount: number;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/** Builds Gantt rows from the flat scope list; parents roll up children. */
export function buildScopeTimeline(
  items: TimelineScopeItem[],
  now: Date = new Date()
): ScopeTimeline | null {
  const today = startOfDay(now);

  interface Node {
    item: TimelineScopeItem;
    children: Node[];
    ownStart: Date | null;
    ownEnd: Date | null;
    childStart: Date;
    childEnd: Date;
  }

  const nodes = new Map<number, Node>(
    items.map((item) => [
      item.id,
      {
        item,
        children: [],
        ownStart: item.startDate ? startOfDay(new Date(item.startDate)) : null,
        ownEnd: item.endDate ? startOfDay(new Date(item.endDate)) : null,
        childStart: new Date(8640000000000000),
        childEnd: new Date(-8640000000000000),
      },
    ])
  );
  const roots: Node[] = [];
  for (const node of nodes.values()) {
    const parent = node.item.parentId ? nodes.get(node.item.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: Node[]) => {
    list.sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.item.id - b.item.id);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  // Post-order: compute each node's effective window (own dates falling back
  // to children's rolled-up window).
  const compute = (node: Node): { start: Date | null; end: Date | null } => {
    let start = node.ownStart;
    let end = node.ownEnd;
    const childWindow = { start: null as Date | null, end: null as Date | null };
    for (const child of node.children) {
      const window = compute(child);
      if (window.start && (!childWindow.start || window.start < childWindow.start)) {
        childWindow.start = window.start;
      }
      if (window.end && (!childWindow.end || window.end > childWindow.end)) {
        childWindow.end = window.end;
      }
    }
    if (!start && childWindow.start) start = childWindow.start;
    if (!end && childWindow.end) end = childWindow.end;
    node.childStart = start ?? new Date(NaN);
    node.childEnd = end ?? new Date(NaN);
    return { start, end };
  };
  roots.forEach(compute);

  // Flatten in render order, keeping only rows with a resolvable window.
  const rows: GanttRow[] = [];
  let undatedCount = 0;
  const walk = (node: Node, depth: number) => {
    const start = node.childStart;
    const end = node.childEnd;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      undatedCount += 1;
    } else {
      const done = node.item.status === 'completed';
      rows.push({
        id: node.item.id,
        wbsNumber: node.item.wbsNumber,
        label: node.item.title,
        depth,
        isPhase: node.children.length > 0,
        start,
        end,
        done,
        overdue: !done && end < today,
        progress: node.item.progress,
        roleCodes: node.item.roleCodes ?? [],
      });
    }
    node.children.forEach((child) => walk(child, depth + 1));
  };
  roots.forEach((root) => walk(root, 0));

  if (rows.length === 0) return null;

  // Axis window: the scope extent itself. The project header dates are often
  // much older (a record created long before planning began) — anchoring the
  // axis to them would push every bar into a sliver at the right edge. The
  // axis starts at the earliest item's start and ends at the latest end.
  const axisStart = new Date(Math.min(...rows.map((row) => row.start.getTime())));
  const axisEnd = new Date(Math.max(...rows.map((row) => row.end.getTime())));

  const total = axisEnd.getTime() - axisStart.getTime();
  if (total <= 0) return null;

  const todayOffset = today >= axisStart && today <= axisEnd ? daysBetween(axisStart, today) / daysBetween(axisStart, axisEnd) : null;

  return { start: axisStart, end: axisEnd, todayOffset, rows, undatedCount };
}
