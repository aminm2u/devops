import { useState, useMemo, useCallback } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer, Event as RbcEvent } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays, addMonths, addWeeks, subDays, subMonths, subWeeks, endOfWeek, endOfDay, startOfDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { PageHeader } from '@/components/layout/PageHeader';
import { CalendarToolbar, CalendarView } from '@/components/calendar/CalendarToolbar';
import { TaskDetailModal } from '@/pages/project-tabs/TaskDetailModal';
import { TimeEntryFormDialog } from '@/components/timesheet/TimeEntryFormDialog';
import { useCalendarEvents } from '@/hooks/useTimeEntries';
import type { TimeEntry, CalendarTaskEvent } from '@/types';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
});

const VIEW_STORAGE_KEY = 'my-work.calendar.defaultView';

function loadDefaultView(): CalendarView {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === 'month' || v === 'week' || v === 'day') return v;
  } catch { /* ignore */ }
  return 'month';
}

type CalEvent = RbcEvent & {
  kind: 'task' | 'subtask' | 'entry';
  payload: CalendarTaskEvent | TimeEntry;
  isOverdue: boolean;
};

function toCalEvents(tasks: CalendarTaskEvent[], entries: TimeEntry[]): CalEvent[] {
  const events: CalEvent[] = [];

  for (const t of tasks) {
    if (!t.dueDate) continue;
    const day = new Date(t.dueDate + 'T00:00:00');
    events.push({
      title: t.kind === 'subtask' ? `📌 ${t.title}` : `📋 ${t.title}`,
      start: day,
      end: day,
      allDay: true,
      kind: t.kind,
      payload: t,
      isOverdue: t.isOverdue,
    });
  }

  for (const e of entries) {
    const day = new Date(e.workDate + 'T00:00:00');
    const label = e.sourceLabel
      ?? (e.subtask ? `${e.task?.title ?? ''} › ${e.subtask.title}` : e.task ? e.task.title : 'Ad-hoc');
    events.push({
      title: `⏱ ${Number(e.hours)}h · ${label}`,
      start: day,
      end: day,
      allDay: true,
      kind: 'entry',
      payload: e,
      isOverdue: false,
    });
  }

  return events;
}

export function CalendarPage() {
  const [view, setView] = useState<CalendarView>(loadDefaultView);
  const [date, setDate] = useState<Date>(new Date());

  const [taskModal, setTaskModal] = useState<{ taskId: number | null; open: boolean }>({ taskId: null, open: false });
  const [entryDialog, setEntryDialog] = useState<{ entry: TimeEntry | null; open: boolean }>({ entry: null, open: false });

  // Range covering the visible calendar period (a little padding for month edges)
  const range = useMemo(() => {
    const start = startOfDay(subMonths(startOfWeek(date, { weekStartsOn: 1 }), 1));
    const end = endOfDay(addMonths(endOfWeek(date, { weekStartsOn: 1 }), 1));
    return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') };
  }, [date]);

  const { data, isLoading } = useCalendarEvents(range.from, range.to);
  const events = useMemo(() => toCalEvents(data?.tasks ?? [], data?.entries ?? []), [data]);

  const handleView = useCallback((v: CalendarView) => {
    setView(v);
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* ignore */ }
  }, []);

  const handleNavigate = useCallback((action: 'PREV' | 'NEXT' | 'TODAY') => {
    if (action === 'TODAY') { setDate(new Date()); return; }
    const dir = action === 'NEXT' ? 1 : -1;
    setDate((d) => {
      if (view === 'month') return dir > 0 ? addMonths(d, 1) : subMonths(d, 1);
      if (view === 'week') return dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1);
      return dir > 0 ? addDays(d, 1) : subDays(d, 1);
    });
  }, [view]);

  const handleSelectEvent = useCallback((event: RbcEvent) => {
    const e = event as CalEvent;
    if (e.kind === 'entry') {
      setEntryDialog({ entry: e.payload as TimeEntry, open: true });
    } else {
      const t = e.payload as CalendarTaskEvent;
      setTaskModal({ taskId: t.kind === 'subtask' ? (t.parentTaskId ?? t.id) : t.id, open: true });
    }
  }, []);

  const eventPropGetter = useCallback((event: RbcEvent) => {
    const e = event as CalEvent;
    if (e.isOverdue) {
      return {
        className: 'rbc-event-overdue',
        style: {
          backgroundColor: 'hsl(var(--destructive) / 0.15)',
          border: '1px solid hsl(var(--destructive) / 0.4)',
          color: 'hsl(var(--destructive))',
          borderRadius: '6px',
          fontSize: '11px',
          padding: '1px 4px',
        },
      };
    }
    if (e.kind === 'entry') {
      return {
        style: {
          backgroundColor: 'hsl(var(--primary) / 0.12)',
          border: '1px solid hsl(var(--primary) / 0.35)',
          color: 'hsl(var(--primary))',
          borderRadius: '6px',
          fontSize: '11px',
          padding: '1px 4px',
        },
      };
    }
    return {
      style: {
        backgroundColor: 'hsl(var(--muted))',
        border: '1px solid hsl(var(--border))',
        color: 'hsl(var(--foreground))',
        borderRadius: '6px',
        fontSize: '11px',
        padding: '1px 4px',
      },
    };
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar"
        description="Task due dates and your timesheet entries"
      />

      <div className="bg-card border border-border/50 rounded-xl p-4 my-calendar">
        {isLoading && !events.length ? (
          <div className="text-center py-12 text-muted-foreground">Loading calendar...</div>
        ) : (
          <BigCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            allDayAccessor="allDay"
            view={view}
            onView={(v) => handleView(v as CalendarView)}
            date={date}
            onNavigate={(newDate: Date) => setDate(newDate)}
            style={{ height: 640 }}
            toolbar
            components={{
              toolbar: (props: any) => (
                <CalendarToolbar
                  label={props.label}
                  view={view}
                  onView={handleView}
                  onNavigate={handleNavigate}
                />
              ),
            }}
            eventPropGetter={eventPropGetter}
            onSelectEvent={handleSelectEvent}
            popup
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }} />
          Task / subtask due date
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: 'hsl(var(--primary) / 0.35)' }} />
          Timesheet entry
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: 'hsl(var(--destructive) / 0.45)' }} />
          Overdue
        </span>
      </div>

      <TaskDetailModal
        taskId={taskModal.taskId}
        open={taskModal.open}
        onClose={() => setTaskModal({ taskId: null, open: false })}
        onDelete={() => setTaskModal({ taskId: null, open: false })}
      />

      <TimeEntryFormDialog
        open={entryDialog.open}
        onClose={() => setEntryDialog({ entry: null, open: false })}
        entry={entryDialog.entry}
      />
    </div>
  );
}
