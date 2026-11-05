import { useMemo } from 'react';
import {
  CalendarOff,
  ChevronRight,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ListTodo,
  RotateCcw,
  Send,
  Timer,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TimeEntry } from '@/types';

/**
 * The timesheet, as a list grouped by day.
 *
 * The old view was a seven-column week grid: fine for knowing which cell is
 * empty, bad at everything else — long descriptions were clipped, the status
 * of each row was invisible, and the day totals were not the thing the eye
 * landed on. This groups entries under sticky date headers with a per-day
 * total, which is how people actually read a timesheet ("what did I do
 * Tuesday?").
 *
 * Selection opens the detail drawer; the list itself is read-only so a stray
 * click can never edit an approved entry.
 */

interface TimesheetListProps {
  /** Ordered YYYY-MM-DD strings for the current week. */
  days: string[];
  entries: TimeEntry[];
  /** Show the owner's name (an approver or admin viewing another person). */
  showUser?: boolean;
  /** Hide the per-day "Add" affordance when the week is not the viewer's own. */
  canAdd?: boolean;
  onAddEntry: (date: string) => void;
  onOpenEntry: (entry: TimeEntry) => void;
}

const STATUS_STYLE: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  draft: {
    label: 'Draft',
    className: 'border-border text-muted-foreground',
    icon: Clock3,
  },
  submitted: {
    label: 'Submitted',
    className:
      'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    icon: Send,
  },
  approved: {
    label: 'Approved',
    className:
      'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    className:
      'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400',
    icon: XCircle,
  },
};

function dayLabel(date: string): { weekday: string; short: string; isToday: boolean; isWeekend: boolean } {
  const value = new Date(`${date}T00:00:00`);
  const today = new Date();
  const isToday =
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate();
  const day = value.getDay();

  return {
    weekday: value.toLocaleDateString(undefined, { weekday: 'long' }),
    short: value.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    isToday,
    isWeekend: day === 0 || day === 6,
  };
}

function formatHours(hours: number): string {
  // 0.25 steps read better as "1.25h" than "1.25 hours", and whole numbers as
  // "2h" rather than "2.0h".
  return `${Number.isInteger(hours) ? hours : hours.toFixed(2).replace(/0$/, '')}h`;
}

export function TimesheetList({
  days,
  entries,
  showUser = false,
  canAdd = true,
  onAddEntry,
  onOpenEntry,
}: TimesheetListProps) {
  const byDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const date of days) map.set(date, []);
    for (const entry of entries) {
      const bucket = map.get(entry.workDate);
      if (bucket) bucket.push(entry);
      // An entry outside the requested week is not shown here; the server is
      // asked for one week at a time, so this only protects against a stale
      // cache during a week change.
    }
    return map;
  }, [days, entries]);

  const weekTotal = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
  const loggedDays = days.filter((date) => (byDay.get(date) ?? []).length > 0).length;

  return (
    <div className="space-y-3">
      {days.map((date) => {
        const dayEntries = byDay.get(date) ?? [];
        const { weekday, short, isToday, isWeekend } = dayLabel(date);
        const dayTotal = dayEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);

        return (
          <section key={date} className="overflow-hidden rounded-lg border bg-card">
            {/* Sticky so the date stays visible while scrolling a long day. */}
            <header
              className={cn(
                'sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card/95 px-4 py-2.5 backdrop-blur',
                isToday && 'border-l-4 border-l-primary'
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {weekday}
                    <span className="ml-2 font-normal text-muted-foreground">{short}</span>
                  </p>
                </div>
                {isToday && (
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    Today
                  </Badge>
                )}
                {isWeekend && !isToday && (
                  <span className="text-xs text-muted-foreground">Weekend</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {dayTotal > 0 ? (
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatHours(dayTotal)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">No entries</span>
                )}
                {canAdd && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onAddEntry(date)}
                  >
                    Add
                  </Button>
                )}
              </div>
            </header>

            {dayEntries.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                <CalendarOff className="h-4 w-4" />
                Nothing logged
              </div>
            ) : (
              <ul className="divide-y">
                {dayEntries.map((entry) => {
                  const style = STATUS_STYLE[entry.status] ?? STATUS_STYLE.draft;
                  const StatusIcon = style.icon;
                  const isTaskLinked = !!(entry.taskId || entry.subtaskId);

                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => onOpenEntry(entry)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <span className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                          {formatHours(Number(entry.hours))}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm">{entry.description}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {isTaskLinked ? (
                              <span className="inline-flex items-center gap-1">
                                <ListTodo className="h-3 w-3" />
                                {(entry as any).task?.title ?? 'Task'}
                                {(entry as any).subtask?.title
                                  ? ` › ${(entry as any).subtask.title}`
                                  : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Timer className="h-3 w-3" />
                                {entry.categoryValue}
                              </span>
                            )}
                            {entry.projectId && (
                              <span className="inline-flex items-center gap-1">
                                <FolderKanban className="h-3 w-3" />
                                {(entry as any).project?.name ?? `Project #${entry.projectId}`}
                              </span>
                            )}
                            {showUser && (entry as any).user?.name && (
                              <span>{(entry as any).user.name}</span>
                            )}
                            {entry.status === 'rejected' && entry.rejectReason && (
                              <span className="inline-flex items-center gap-1 text-red-500">
                                <RotateCcw className="h-3 w-3" />
                                {entry.rejectReason}
                              </span>
                            )}
                          </span>
                        </span>

                        <Badge variant="outline" className={cn('shrink-0 gap-1', style.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {style.label}
                        </Badge>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          {loggedDays} of {days.length} days logged
        </span>
        <span className="font-semibold">
          Week total <span className="ml-2 font-mono tabular-nums">{formatHours(weekTotal)}</span>
        </span>
      </div>
    </div>
  );
}
