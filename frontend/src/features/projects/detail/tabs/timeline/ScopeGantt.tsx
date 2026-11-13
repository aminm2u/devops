import { useChartTheme } from '@/components/charts/chart-theme';
import { ChartEmpty } from '@/components/charts/chart-primitives';
import { Badge } from '@/components/ui/badge';
import type { ScopeTimeline } from './derive';

/**
 * Scope Gantt — same hand-built rows+track structure as the overview
 * ProjectGantt, but driven by the scope tree: indented labels with WBS
 * numbers, phase summary bars rolling up their children, and role codes from
 * the workbook's month-grid annotations.
 */
export function ScopeGantt({ timeline }: { timeline: ScopeTimeline | null }) {
  const theme = useChartTheme();

  if (!timeline || timeline.rows.length === 0) {
    return (
      <ChartEmpty
        height={200}
        message="No dated scope items yet — add start and end dates on the Scope tab to build the timeline."
      />
    );
  }

  const monthTicks = buildMonthTicks(timeline.start, timeline.end);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[0] }} />
          Activity
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[3] ?? theme.series[1] }} />
          Phase (rolled up)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[2] }} />
          Completed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.status.critical }} />
          Past due
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px" style={{ backgroundColor: theme.status.warning }} />
          Today
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        {/* Fixed width per month: the chart never compresses — a 36-month plan
            simply scrolls. Percentage-positioned bars scale with this width. */}
        <div style={{ width: chartWidthPx(timeline) }}>
          {/* Date axis */}
          <div className="relative h-6 border-b border-border/60 bg-muted/30">
            {monthTicks.map((tick) => (
              <span
                key={`${tick.label}-${tick.offset}`}
                className="absolute top-1 text-[10px] tabular-nums text-muted-foreground"
                style={{ left: `${tick.offset * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          <div className="divide-y divide-border/50">
            {timeline.rows.map((row) => {
              const color = row.done
                ? theme.series[2]
                : row.overdue
                  ? theme.status.critical
                  : row.isPhase
                    ? theme.series[3] ?? theme.series[1]
                    : theme.series[0];

              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(140px,36%)_1fr] items-center gap-3 px-3 py-2"
                  style={{ paddingLeft: 12 + row.depth * 16 }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px]">{row.wbsNumber}</span>
                      <p className="truncate text-xs font-medium" title={row.label}>
                        {row.label}
                      </p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {formatShort(row.start)} → {formatShort(row.end)}
                      {row.roleCodes.slice(0, 4).map((code) => (
                        <Badge key={code} variant="secondary" className="px-1 py-0 font-mono text-[9px]">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="relative h-5">
                    <div className="absolute inset-0 flex justify-between">
                      {[0, 25, 50, 75, 100].map((tick) => (
                        <span key={tick} className="h-full w-px" style={{ backgroundColor: theme.grid }} />
                      ))}
                    </div>
                    {timeline.todayOffset != null && (
                      <span
                        className="absolute top-0 h-full w-px"
                        style={{ left: `${timeline.todayOffset * 100}%`, backgroundColor: theme.status.warning }}
                      />
                    )}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 rounded-[2px] ${row.isPhase ? 'h-1.5' : 'h-2.5'}`}
                      style={{
                        left: `${offsetOf(timeline, row.start) * 100}%`,
                        width: `${Math.max(widthOf(timeline, row.start, row.end) * 100, 1.5)}%`,
                        backgroundColor: color,
                        opacity: row.progress != null && !row.done ? 0.55 + 0.45 * (row.progress / 100) : 1,
                      }}
                      title={`${row.wbsNumber} ${row.label}: ${formatShort(row.start)} → ${formatShort(row.end)}${
                        row.progress != null ? ` (${row.progress}%)` : ''
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Bars span each scope item's start and end dates; phase bars roll up their children.
        {timeline.undatedCount > 0 && ` ${timeline.undatedCount} item(s) without dates are hidden.`}
      </p>
    </div>
  );
}

function offsetOf(timeline: ScopeTimeline, date: Date): number {
  const total = timeline.end.getTime() - timeline.start.getTime();
  return Math.max(0, Math.min(1, (date.getTime() - timeline.start.getTime()) / total));
}

function widthOf(timeline: ScopeTimeline, start: Date, end: Date): number {
  const total = timeline.end.getTime() - timeline.start.getTime();
  const from = Math.max(0, (start.getTime() - timeline.start.getTime()) / total);
  const to = Math.min(1, (end.getTime() - timeline.start.getTime()) / total);
  return Math.max(0, to - from);
}

function buildMonthTicks(start: Date, end: Date): { label: string; offset: number }[] {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return [];

  const ticks: { label: string; offset: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const monthCount = Math.round(total / (30 * 86_400_000));
  // The chart is fixed at ~180px per month, so every month fits a label —
  // no thinning needed.
  for (let index = 0; index < monthCount + 1; index += 1) {
    const month = new Date(cursor.getFullYear(), cursor.getMonth() + index, 1);
    if (month > end) break;
    ticks.push({
      label: month.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      offset: Math.max(0, Math.min(1, (month.getTime() - start.getTime()) / total)),
    });
  }

  return ticks;
}

function formatShort(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** ~180px per month, clamped so short plans still fill the viewport. */
function chartWidthPx(timeline: ScopeTimeline): number {
  const months = Math.max(
    1,
    Math.round((timeline.end.getTime() - timeline.start.getTime()) / (30 * 86_400_000))
  );
  return Math.max(720, months * 180);
}
