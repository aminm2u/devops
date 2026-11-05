import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Send,
  Timer,
} from 'lucide-react';
import { TimesheetList } from './TimesheetList';
import { TimesheetEntryDrawer } from './TimesheetEntryDrawer';
import { TimesheetSummaryStrip } from './TimesheetSummaryStrip';
import { useTimeEntries, useSubmitWeek, useTimesheetSummary } from '@/hooks/useTimeEntries';
import apiClient from '@/api/client';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { toLocalDateStr } from '@/lib/utils';
import type { TimeEntry } from '@/types';

// Local date helpers (no date lib — calendar dates as YYYY-MM-DD strings)
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function TimesheetPage() {
  // Entry statuses are master data, so the filter cannot drift from the
  // lifecycle the approval engine writes.
  const { data: statusData } = useReferenceData('status_timesheet_entry');
  const entryStatuses = toSelectOptions(statusData);

  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [statusFilter, setStatusFilter] = useState('all');
  const [adminAll, setAdminAll] = useState(false);
  const [filterUserId, setFilterUserId] = useState<string>('');

  // The drawer is one piece of state for both modes: `entry === null` means the
  // user asked for a new entry on `defaultDate`, otherwise they opened a row.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toLocalDateStr(addDays(anchor, i))),
    [anchor]
  );
  const weekFrom = weekDays[0];
  const weekTo = weekDays[6];

  const { can } = useAuth();
  const isAdmin = can('timesheet.entry.read.all');
  const viewingOthers = adminAll && isAdmin;

  const { data: entries = [], isLoading } = useTimeEntries({
    from: weekFrom,
    to: weekTo,
    status: statusFilter === 'all' ? undefined : statusFilter,
    all: viewingOthers,
    userId: viewingOthers && filterUserId ? Number(filterUserId) : undefined,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.get('/admin/users').then((r) => r.data.data),
    enabled: isAdmin && adminAll,
  });

  const submitWeek = useSubmitWeek();

  // Month-to-date is a separate, cheaper query than widening the week request:
  // the list must stay exactly one week, but the strip should not reset when
  // the user pages back through October.
  const monthStart = useMemo(() => {
    const d = new Date(anchor);
    return toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [anchor]);
  const monthEnd = useMemo(() => {
    const d = new Date(anchor);
    return toLocalDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }, [anchor]);

  const { data: monthSummary } = useTimesheetSummary(
    monthStart,
    monthEnd,
    viewingOthers
      ? filterUserId
        ? Number(filterUserId)
        : undefined
      : undefined
  );
  // "Everyone" is not a person, so a single month total would be the sum of
  // whoever happens to have logged — misleading rather than useful.
  const monthHours =
    viewingOthers && !filterUserId ? null : (monthSummary?.total ?? 0);

  const weekTotal = entries.reduce((sum, e) => sum + Number(e.hours), 0);
  const todayStr = toLocalDateStr(new Date());
  const todayHours = entries
    .filter((e) => e.workDate === todayStr)
    .reduce((sum, e) => sum + Number(e.hours), 0);
  const submittedCount = entries.filter((e) => e.status === 'submitted').length;

  // Only the user's own drafts can be submitted in a batch; an admin browsing
  // someone else's week must not submit on their behalf.
  const draftCount = viewingOthers
    ? 0
    : entries.filter((e) => e.status === 'draft' || e.status === 'rejected').length;

  const handleAdd = (date: string) => {
    setSelectedEntry(null);
    setDefaultDate(date);
    setDrawerOpen(true);
  };

  const handleOpen = (entry: TimeEntry) => {
    setSelectedEntry(entry);
    setDefaultDate(undefined);
    setDrawerOpen(true);
  };

  const handleClose = () => {
    setDrawerOpen(false);
    setSelectedEntry(null);
    setDefaultDate(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Timer className="h-6 w-6 text-primary" /> My Timesheet
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Log work against projects you are enrolled in, or record a daily activity
          </p>
        </div>
        {!viewingOthers && (
          <Button onClick={() => handleAdd(toLocalDateStr(new Date()))}>
            <Plus className="mr-2 h-4 w-4" /> Add Entry
          </Button>
        )}
      </div>

      <TimesheetSummaryStrip
        todayHours={todayHours}
        weekHours={weekTotal}
        monthHours={monthHours}
        draftCount={draftCount}
        submittedCount={submittedCount}
      />

      {/* Week navigator + filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setAnchor(addDays(anchor, -7))}
              title="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setAnchor(startOfWeek(new Date()))}
            >
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setAnchor(addDays(anchor, 7))}
              title="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-sm font-medium">
            {new Date(weekFrom + 'T00:00:00').toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
            {' – '}
            {new Date(weekTo + 'T00:00:00').toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </div>

          <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-sm text-primary">
            <Timer className="h-3.5 w-3.5" />
            <span className="font-semibold">{weekTotal}h</span>
            <span className="text-primary/70">this week</span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {entryStatuses.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <>
                <Button
                  variant={adminAll ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setAdminAll(!adminAll)}
                >
                  All users
                </Button>
                {adminAll && (
                  <Select value={filterUserId || 'all'} onValueChange={setFilterUserId}>
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue placeholder="User" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      {(users || []).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}

            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={draftCount === 0 || submitWeek.isPending}
              onClick={() => submitWeek.mutate({ from: weekFrom, to: weekTo })}
              title={
                viewingOthers
                  ? "You are viewing another person's week"
                  : draftCount === 0
                    ? 'No draft entries to submit'
                    : `Submit ${draftCount} draft entries`
              }
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Submit Week ({draftCount})
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading timesheet...</div>
      ) : (
        <TimesheetList
          days={weekDays}
          entries={entries}
          onAddEntry={handleAdd}
          onOpenEntry={handleOpen}
          showUser={viewingOthers}
          canAdd={!viewingOthers}
        />
      )}

      <TimesheetEntryDrawer
        open={drawerOpen}
        onClose={handleClose}
        entry={selectedEntry}
        defaultDate={defaultDate}
        readOnly={viewingOthers}
      />
    </div>
  );
}
