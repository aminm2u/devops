import { useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useChartTheme } from '@/components/charts/chart-theme';
import { ChartEmpty } from '@/components/charts/chart-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { daysBetween, type BaselineBar, type ScopeTimeline } from './derive';

/**
 * Scope Gantt — same hand-built rows+track structure as the overview
 * ProjectGantt, but driven by the scope tree: indented labels with WBS
 * numbers, phase summary bars rolling up their children, and role codes from
 * the workbook's month-grid annotations.
 *
 * When a baseline is overlaid the track doubles in height: the current bar
 * sits on top, the baseline bar (dashed, grey) below, and a red/green variance
 * band fills the span between the two end dates — delay reads red, gained time
 * reads green. Removed work gets its own struck-through row.
 */
export function ScopeGantt({
  timeline,
  baselineBars,
  baselineLabel,
}: {
  timeline: ScopeTimeline | null;
  baselineBars?: BaselineBar[];
  baselineLabel?: string;
}) {
  const theme = useChartTheme();
  const hasOverlay = !!baselineBars && baselineBars.length > 0;
  const baselineByWbs = new Map((baselineBars ?? []).map((bar) => [bar.wbsNumber, bar]));
  const removedGhosts = (baselineBars ?? []).filter((bar) => bar.removed);

  // Zoom: scales the px-per-month width. 1× = the default fit; 4× is close to
  // day-level reading on a year-long plan. The step buttons and Ctrl+wheel
  // share the same clamp.
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 6;
  const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

  // Variance summary — the headline when an overlay is active.
  const stats = (() => {
    if (!hasOverlay) return null;
    let delayed = 0;
    let ahead = 0;
    let onTime = 0;
    for (const bar of baselineBars!) {
      if (bar.removed) continue;
      const current = timeline?.rows.find((row) => row.wbsNumber === bar.wbsNumber);
      if (!current) continue;
      const variance = daysBetween(bar.end, current.end);
      if (variance > 0) delayed += 1;
      else if (variance < 0) ahead += 1;
      else onTime += 1;
    }
    return { delayed, ahead, onTime, added: timeline!.rows.length - (baselineBars!.length - removedGhosts.length), removed: removedGhosts.length };
  })();

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
      {/* Zoom controls — toolbar top-right of the chart */}
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => setZoom((z) => clampZoom(z * 1.5))}
          aria-label="Zoom in"
          title="Zoom in (also Ctrl+scroll over the chart)"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => setZoom((z) => clampZoom(z / 1.5))}
          aria-label="Zoom out"
          title="Zoom out (also Ctrl+scroll over the chart)"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={zoom === ZOOM_MIN}
          onClick={() => setZoom(1)}
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <span className="ml-1 w-10 text-right text-[11px] tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
      </div>
      {stats && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="border-blue-500/60 dark:border-blue-400 text-blue-600 dark:text-blue-400">
            vs {baselineLabel}
          </Badge>
          <span className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-0.5">
            <span className="font-semibold text-destructive">{stats.delayed}</span> delayed
          </span>
          <span className="rounded-md border border-green-600/40 bg-green-500/5 px-2 py-0.5">
            <span className="font-semibold text-green-600 dark:text-green-400">{stats.ahead}</span> ahead
          </span>
          <span className="rounded-md border dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400 px-2 py-0.5 text-muted-foreground">
            <span className="font-semibold text-foreground">{stats.onTime}</span> on time
          </span>
          {stats.added > 0 && (
            <span className="rounded-md border border-green-600/40 bg-green-500/5 px-2 py-0.5">
              <span className="font-semibold text-green-600 dark:text-green-400">+{stats.added}</span> added
            </span>
          )}
          {stats.removed > 0 && (
            <span className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-0.5">
              <span className="font-semibold text-destructive">−{stats.removed}</span> removed
            </span>
          )}
        </div>
      )}

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
        {hasOverlay && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-[2px] border border-dashed border-muted-foreground" />
              {baselineLabel ?? 'Baseline'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.status.critical, opacity: 0.35 }} />
              Delay vs baseline
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-[2px]" style={{ backgroundColor: theme.series[2], opacity: 0.35 }} />
              Gained vs baseline
            </span>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        {/* Fixed width per month × zoom: zoom in for day-level reading, out to
            see the whole plan. Percentage-positioned bars scale with it. */}
        <div
          style={{ width: chartWidthPx(timeline, zoom) }}
          onWheel={(e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setZoom((z) => clampZoom(e.deltaY < 0 ? z * 1.15 : z / 1.15));
          }}
        >
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
                      {(() => {
                        const ghost = baselineByWbs.get(row.wbsNumber);
                        if (!ghost) return hasOverlay ? (
                          <Badge variant="outline" className="border-green-600/50 px-1 py-0 text-[9px] text-green-600 dark:text-green-400">
                            + new
                          </Badge>
                        ) : null;
                        const variance = daysBetween(ghost.end, row.end);
                        if (variance === 0) return null;
                        return (
                          <Badge
                            variant="outline"
                            className={`px-1 py-0 text-[9px] ${
                              variance > 0
                                ? 'border-destructive/50 text-destructive'
                                : 'border-green-600/50 text-green-600 dark:text-green-400'
                            }`}
                          >
                            {variance > 0 ? `+${variance}d late` : `${variance}d early`}
                          </Badge>
                        );
                      })()}
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
                  <div className={hasOverlay ? 'relative h-10' : 'relative h-5'}>
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
                    {hasOverlay && (
                      <div className="absolute inset-x-0 top-0 h-1/2">
                        {(() => {
                          const ghost = baselineByWbs.get(row.wbsNumber);
                          const current = row;
                          if (!ghost) return null;
                          // Variance band between the earlier end and the later
                          // end: red = finished later than planned, green = earlier.
                          const bandStart = ghost.end < current.end ? ghost.end : current.end;
                          const bandEnd = ghost.end < current.end ? current.end : ghost.end;
                          const variance = daysBetween(ghost.end, current.end);
                          const bandColor =
                            variance > 0 ? theme.status.critical : theme.series[2];
                          return (
                            <>
                              <div
                                className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-[2px] border border-dashed border-muted-foreground/80"
                                style={{
                                  left: `${offsetOf(timeline, ghost.start) * 100}%`,
                                  width: `${Math.max(widthOf(timeline, ghost.start, ghost.end) * 100, 1)}%`,
                                }}
                                title={`Baseline ${ghost.wbsNumber}: ${formatShort(ghost.start)} → ${formatShort(ghost.end)}`}
                              />
                              {variance !== 0 && (
                                <div
                                  className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-[2px]"
                                  style={{
                                    left: `${offsetOf(timeline, bandStart) * 100}%`,
                                    width: `${Math.max(widthOf(timeline, bandStart, bandEnd) * 100, 0.8)}%`,
                                    backgroundColor: bandColor,
                                    opacity: 0.4,
                                  }}
                                  title={`Variance vs baseline: ${variance > 0 ? `+${variance}` : variance} day(s)`}
                                />
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div className={`absolute inset-x-0 ${hasOverlay ? 'bottom-0 h-1/2' : 'inset-y-0'}`}>
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
                </div>
              );
            })}
            {/* Baseline items whose WBS no longer exists — ghosts of removed work */}
            {removedGhosts.map((ghost) => (
              <div key={`removed-${ghost.wbsNumber}`} className="grid grid-cols-[minmax(140px,36%)_1fr] items-center gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px]">{ghost.wbsNumber}</span>
                    <p className="truncate text-xs font-medium text-muted-foreground line-through" title={ghost.title}>
                      {ghost.title}
                    </p>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatShort(ghost.start)} → {formatShort(ghost.end)} · removed since baseline
                  </div>
                </div>
                <div className="relative h-5">
                  <div
                    className="absolute top-1/2 h-1 -translate-y-1/2 rounded-[2px] border border-dashed"
                    style={{
                      left: `${offsetOf(timeline, ghost.start) * 100}%`,
                      width: `${Math.max(widthOf(timeline, ghost.start, ghost.end) * 100, 1)}%`,
                      borderColor: 'currentColor',
                      color: theme.status.critical,
                      opacity: 0.7,
                    }}
                    title={`Removed since baseline: ${ghost.wbsNumber} ${ghost.title}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Bars span each scope item's start and end dates; phase bars roll up their children.
        {hasOverlay && ` Top lane: ${baselineLabel ?? 'baseline'} (dashed) with the variance band; bottom lane: current.`}
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

/** ~180px per month at 1×, scaled by the zoom factor; clamped to a fit width. */
function chartWidthPx(timeline: ScopeTimeline, zoom: number): number {
  const months = Math.max(
    1,
    Math.round((timeline.end.getTime() - timeline.start.getTime()) / (30 * 86_400_000))
  );
  return Math.max(720, months * 180 * zoom);
}
