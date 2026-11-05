import { CheckCircle2, Clock3, FileEdit, Inbox, Timer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Four numbers above the list.
 *
 * The list answers "what did I do on Tuesday"; this answers "am I on track this
 * week and is anything of mine sitting in an approval queue". Both were being
 * asked of the old week grid, which answered neither.
 */

interface TimesheetSummaryStripProps {
  todayHours: number;
  weekHours: number;
  /** `null` when the view spans several people, so one month total is meaningless. */
  monthHours: number | null;
  draftCount: number;
  submittedCount: number;
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0$/, '');
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Timer;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
            accent
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-lg font-semibold leading-tight tabular-nums">{value}</p>
          {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function TimesheetSummaryStrip({
  todayHours,
  weekHours,
  monthHours,
  draftCount,
  submittedCount,
}: TimesheetSummaryStripProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Today"
        value={`${formatHours(todayHours)}h`}
        icon={Timer}
        accent="bg-primary/10 text-primary"
      />
      <Stat
        label="This week"
        value={`${formatHours(weekHours)}h`}
        hint="Mon – Sun"
        icon={Clock3}
      />
      <Stat
        label="Month to date"
        value={monthHours === null ? '—' : `${formatHours(monthHours)}h`}
        hint={monthHours === null ? 'Pick one person' : undefined}
        icon={CheckCircle2}
        accent="bg-green-500/10 text-green-600 dark:text-green-400"
      />
      <Stat
        label="Awaiting approval"
        value={String(submittedCount)}
        hint={draftCount > 0 ? `${draftCount} still in draft` : 'Nothing in draft'}
        icon={submittedCount > 0 ? Inbox : FileEdit}
        accent={
          submittedCount > 0
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : undefined
        }
      />
    </div>
  );
}
