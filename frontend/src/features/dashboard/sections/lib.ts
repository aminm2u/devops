import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  HelpCircle,
  ListTodo,
  ShieldAlert,
  Timer,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import type { ChartTheme } from '@/components/charts/chart-theme';

/** Severity order used everywhere on this page — one ranking, one sort. */
export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export type Severity = keyof typeof SEVERITY_RANK;

/**
 * Status colours carry *state*; they are never used as a categorical series.
 * `warning` and `serious` are below 3:1 on a light card by design, so every use
 * here is paired with the word itself (a label or an icon + text) — never a
 * bare colour swatch.
 */
export function severityColor(theme: ChartTheme, severity: Severity): string {
  switch (severity) {
    case 'critical':
      return theme.status.critical;
    case 'high':
      return theme.status.serious;
    case 'medium':
      return theme.status.warning;
    default:
      return theme.tick;
  }
}

export const ATTENTION_ICON: Record<string, LucideIcon> = {
  approval: ClipboardList,
  task: ListTodo,
  ticket: HelpCircle,
  incident: TriangleAlert,
  ssl: ShieldAlert,
  timesheet: Timer,
  budget: Wallet,
};

export const MODULE_LABEL: Record<string, string> = {
  timesheet: 'Timesheet',
  requisition: 'Requisition',
  'purchase-order': 'Purchase order',
  payment: 'Payment',
  deployment: 'Deployment',
  change: 'Change',
  enrollment: 'Enrolment',
};

export function moduleLabel(module: string): string {
  return MODULE_LABEL[module] ?? module.replace(/-/g, ' ');
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatHours(value: number | null | undefined): string {
  if (value == null) return '—';
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function compactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `MYR ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `MYR ${Math.round(value / 1_000)}k`;
  return formatMoney(value);
}

/** Deterministic colour for a named status, so a status keeps its hue as filters change. */
export function statusTone(theme: ChartTheme, status: string): string {
  const key = status.toLowerCase();
  if (['healthy', 'resolved', 'closed', 'approved', 'done', 'completed', 'active', 'on track'].includes(key)) {
    return theme.status.good;
  }
  if (['warning', 'pending', 'submitted', 'at risk', 'in progress', 'review'].includes(key)) {
    return theme.status.warning;
  }
  if (['critical', 'off track', 'failed', 'rejected', 'down'].includes(key)) {
    return theme.status.critical;
  }
  if (['unknown', 'maintenance', 'draft', 'cancelled'].includes(key)) {
    return theme.tick;
  }
  return theme.series[0];
}
