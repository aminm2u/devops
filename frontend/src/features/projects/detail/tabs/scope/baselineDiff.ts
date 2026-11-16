import type { BaselineItem, ScopeItem } from '@/api/scope';

/**
 * Pure baseline-vs-current comparison — no React.
 *
 * Rows are matched by wbsNumber (the stable coordinate: ids churn with
 * reorders). A row is "changed" when any reviewed field differs from the
 * snapshot; added/removed mean it exists on only one side.
 */

export type DiffKind = 'unchanged' | 'added' | 'removed' | 'changed';

export interface DiffRow {
  wbsNumber: string;
  kind: DiffKind;
  /** Baseline title — present for unchanged/changed/removed. */
  baseline?: BaselineItem;
  /** Current item — present for unchanged/changed/added. */
  current?: ScopeItem;
  /** Fields that differ, for compact old → new rendering. */
  changes: { field: string; from: string; to: string }[];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function money(value: string | number | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diffItem(baseline: BaselineItem, current: ScopeItem): DiffRow['changes'] {
  const changes: DiffRow['changes'] = [];
  if (baseline.title !== current.title) {
    changes.push({ field: 'Title', from: baseline.title, to: current.title });
  }
  const bStart = formatDate(baseline.startDate);
  const cStart = formatDate(current.startDate);
  if (bStart !== cStart) changes.push({ field: 'Start', from: bStart, to: cStart });
  const bEnd = formatDate(baseline.endDate);
  const cEnd = formatDate(current.endDate);
  if (bEnd !== cEnd) changes.push({ field: 'End', from: bEnd, to: cEnd });
  if (baseline.status !== current.status) {
    changes.push({ field: 'Status', from: baseline.status, to: current.status });
  }
  if (Number(baseline.planCost) !== Number(current.planCost)) {
    changes.push({ field: 'Plan cost', from: money(baseline.planCost), to: money(current.planCost) });
  }
  if ((baseline.progress ?? null) !== (current.progress ?? null)) {
    changes.push({ field: 'Progress', from: `${baseline.progress ?? '—'}%`, to: `${current.progress ?? '—'}%` });
  }
  return changes;
}

export function diffBaseline(baselineItems: BaselineItem[], currentItems: ScopeItem[]): DiffRow[] {
  const byWbs = new Map(currentItems.map((item) => [item.wbsNumber, item]));
  const seen = new Set<string>();
  const rows: DiffRow[] = [];

  const wbsCompare = (a: string, b: string): number => {
    const segsA = a.split('.').map(Number);
    const segsB = b.split('.').map(Number);
    const len = Math.max(segsA.length, segsB.length);
    for (let i = 0; i < len; i += 1) {
      const diff = (segsA[i] ?? 0) - (segsB[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  for (const baselineItem of baselineItems) {
    seen.add(baselineItem.wbsNumber);
    const current = byWbs.get(baselineItem.wbsNumber);
    if (!current) {
      rows.push({ wbsNumber: baselineItem.wbsNumber, kind: 'removed', baseline: baselineItem, changes: [] });
    } else {
      const changes = diffItem(baselineItem, current);
      rows.push({
        wbsNumber: baselineItem.wbsNumber,
        kind: changes.length ? 'changed' : 'unchanged',
        baseline: baselineItem,
        current,
        changes,
      });
    }
  }
  for (const current of currentItems) {
    if (!seen.has(current.wbsNumber)) {
      rows.push({ wbsNumber: current.wbsNumber, kind: 'added', current, changes: [] });
    }
  }

  return rows.sort((a, b) => wbsCompare(a.wbsNumber, b.wbsNumber));
}
