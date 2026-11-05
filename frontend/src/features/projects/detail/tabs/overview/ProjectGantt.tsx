import { useChartTheme } from '@/components/charts/chart-theme';
import { ChartEmpty } from '@/components/charts/chart-primitives';
import type { TimelineRollup } from './derive';

/**
 * Gantt chart, hand-built in SVG.
 *
 * A Gantt is a table with a bar per row, so it is drawn as one: HTML rows for
 * the labels (they need truncation and vertical centring that SVG makes
 * tedious) and a single SVG track per row for the bar. The whole figure shares
 * one date axis rendered above the rows, so the bars stay comparable.
 *
 * A bar spans creation → due date. That is what the data holds; the task model
 * has no start date, and inventing one would make the chart look more precise
 * than it is.
 */
export function ProjectGantt({ timeline }: { timeline: TimelineRollup | null }) {
  const theme = useChartTheme();

  if (!timeline || timeline.rows.length === 0) {
    return (
      <ChartEmpty
        height={200}
        message="Add start and target end dates to the project and due dates to its tasks to see a timeline."
      />
    );
  }

  const monthTicks = buildMonthTicks(timeline.start, timeline.end);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[0] }} />
          In progress
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[2] }} />
          Done
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

      <div className="rounded-lg border border-border/60">
        {/* Date axis */}
        <div className="relative h-6 border-b border-border/60 bg-muted/30">
          {monthTicks.map((tick) => (
            <span
              key={tick.label}
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
                : theme.series[0];

            return (
              <div key={row.id} className="grid grid-cols-[minmax(90px,32%)_1fr] items-center gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium" title={row.label}>
                    {row.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatShort(row.start)} → {formatShort(row.end)}
                  </p>
                </div>
                <div className="relative h-5">
                  {/* Quarter guides keep the track readable without a full grid. */}
                  <div className="absolute inset-0 flex justify-between">
                    {[0, 25, 50, 75, 100].map((tick) => (
                      <span
                        key={tick}
                        className="h-full w-px"
                        style={{ backgroundColor: theme.grid }}
                      />
                    ))}
                  </div>
                  {timeline.todayOffset != null && (
                    <span
                      className="absolute top-0 h-full w-px"
                      style={{
                        left: `${timeline.todayOffset * 100}%`,
                        backgroundColor: theme.status.warning,
                      }}
                    />
                  )}
                  <div
                    className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[2px]"
                    style={{
                      left: `${row.offset * 100}%`,
                      width: `${Math.max(row.width * 100, 1.5)}%`,
                      backgroundColor: color,
                    }}
                    title={`${row.label}: ${formatShort(row.start)} → ${formatShort(row.end)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Bars span from when the task was created to its due date. Showing {timeline.rows.length} of
        the dated tasks, soonest due first.
      </p>
    </div>
  );
}

function buildMonthTicks(start: Date, end: Date): { label: string; offset: number }[] {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return [];

  const ticks: { label: string; offset: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const months = Math.max(1, Math.min(12, Math.round(total / (30 * 86_400_000))));

  for (let index = 0; index < months; index += 1) {
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
