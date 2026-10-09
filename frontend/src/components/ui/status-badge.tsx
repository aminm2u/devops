import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatStatus, getStatusColor } from '@/lib/utils';

/**
 * Canonical status-color registries per business domain. Every entry is a
 * full literal class string (Tailwind JIT-safe) with dark-mode variants,
 * following the lib/utils.ts palette. Per-domain semantic conflicts are
 * intentional (e.g. `approved` is green for POs, amber for payments) —
 * they mirror what the live pages show today.
 */
const gray = 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
const blue = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
const green = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
const emerald = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
const amber = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
const orange = 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
const purple = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
const red = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

export type StatusDomain =
  | 'po'
  | 'directPurchase'
  | 'rfq'
  | 'payment'
  | 'grn'
  | 'asset'
  | 'internalProject'
  | 'requisition'
  | 'helpdeskStatus'
  | 'helpdeskPriority'
  | 'generic';

export const statusBadgeClasses: Record<StatusDomain, Record<string, string>> = {
  po: {
    draft: gray,
    submitted: blue,
    approved: green,
    dispatched: amber,
    partially_received: orange,
    fully_received: emerald,
    completed: purple,
    cancelled: red,
  },
  directPurchase: {
    draft: gray,
    submitted: blue,
    approved: green,
    completed: purple,
    cancelled: red,
  },
  rfq: {
    draft: gray,
    sent: blue,
    receiving: amber,
    evaluating: purple,
    awarded: green,
    cancelled: red,
  },
  payment: {
    draft: gray,
    submitted: blue,
    approved: amber,
    paid: green,
    cancelled: red,
  },
  grn: {
    pending: amber,
    inspected: blue,
    accepted: green,
    rejected: red,
    partial: orange,
    cancelled: gray,
  },
  asset: {
    active: green,
    inactive: gray,
    maintenance: amber,
    disposed: red,
    decommissioned: red,
  },
  internalProject: {
    planning: gray,
    in_progress: blue,
    on_hold: amber,
    completed: green,
    cancelled: red,
  },
  requisition: {
    draft: gray,
    submitted: blue,
    approved: green,
    rejected: red,
  },
  helpdeskStatus: {
    open: blue,
    in_progress: amber,
    awaiting_response: orange,
    resolved: green,
    closed: gray,
    reopened: purple,
  },
  helpdeskPriority: {
    urgent: red,
    high: orange,
    medium: amber,
    low: blue,
  },
  generic: {},
};

/** Class string for a domain value; unknown values fall back to the generic lib/utils palette. */
export function statusBadgeClassesFor(domain: StatusDomain, value: string): string {
  const map = statusBadgeClasses[domain];
  return (value && map[value.toLowerCase()]) || getStatusColor(value);
}

export interface StatusBadgeProps {
  domain: StatusDomain;
  value: string;
  /** Custom label; defaults to formatStatus(value), e.g. "in_progress" → "In Progress" */
  label?: ReactNode;
  /** Optional leading icon node, e.g. <Clock className="h-3 w-3 mr-1" /> */
  icon?: ReactNode;
  className?: string;
}

/**
 * Status-colored Badge for a business domain. Use everywhere a status,
 * priority or state is shown as a badge instead of local color maps.
 */
export function StatusBadge({ domain, value, label, icon, className }: StatusBadgeProps) {
  return (
    <Badge className={cn(statusBadgeClassesFor(domain, value), className)}>
      {icon}
      {label ?? formatStatus(value)}
    </Badge>
  );
}
