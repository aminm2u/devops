import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, Plus, Timer, Send, CalendarDays
} from 'lucide-react';
import { WeekGrid } from '@/components/timesheet/WeekGrid';
import { TimeEntryFormDialog } from '@/components/timesheet/TimeEntryFormDialog';
import {
  useTimeEntries,
  useSubmitWeek,
  useRecallTimeEntry,
} from '@/hooks/useTimeEntries';
import apiClient from '@/api/client';
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
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [statusFilter, setStatusFilter] = useState('all');
  const [adminAll, setAdminAll] = useState(false);
  const [filterUserId, setFilterUserId] = useState<string>('');

  const [formOpen, setFormOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toLocalDateStr(addDays(anchor, i))),
    [anchor]
  );
  const weekFrom = weekDays[0];
  const weekTo = weekDays[6];

  const { hasRole } = useAuth();
  const isAdmin = hasRole('super-admin') || hasRole('devops-admin');

  const { data: entries = [], isLoading } = useTimeEntries({
    from: weekFrom,
    to: weekTo,
    status: statusFilter === 'all' ? undefined : statusFilter,
    all: adminAll && isAdmin,
    userId: adminAll && isAdmin && filterUserId ? Number(filterUserId) : undefined,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.get('/admin/users').then((r) => r.data.data),
    enabled: isAdmin && adminAll,
  });

  const submitWeek = useSubmitWeek();
  const recallEntry = useRecallTimeEntry();

  const weekTotal = entries.reduce((sum, e) => sum + Number(e.hours), 0);
  const draftCount = entries.filter((e) => e.status === 'draft' || e.status === 'rejected').length;

  const handleAdd = (date: string) => {
    setSelectedEntry(null);
    setDefaultDate(date);
    setFormOpen(true);
  };

  const handleOpen = (entry: TimeEntry) => {
    setSelectedEntry(entry);
    setDefaultDate(undefined);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Timer className="h-6 w-6 text-primary" /> My Timesheet
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Log work against assigned tasks or your daily activities
          </p>
        </div>
        <Button onClick={() => handleAdd(toLocalDateStr(new Date()))}>
          <Plus className="h-4 w-4 mr-2" /> Add Entry
        </Button>
      </div>

      {/* Week navigator + filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor(addDays(anchor, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setAnchor(startOfWeek(new Date()))}>
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" /> Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnchor(addDays(anchor, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-sm font-medium">
            {new Date(weekFrom + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            {' – '}
            {new Date(weekTo + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>

          <div className="flex items-center gap-1.5 text-sm bg-primary/10 text-primary px-2.5 py-1 rounded-lg">
            <Timer className="h-3.5 w-3.5" />
            <span className="font-semibold">{weekTotal}h</span>
            <span className="text-primary/70">this week</span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
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
                    <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="User" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      {(users || []).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
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
              title={draftCount === 0 ? 'No draft entries to submit' : `Submit ${draftCount} draft entries`}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" /> Submit Week ({draftCount})
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading timesheet...</div>
      ) : (
        <WeekGrid
          days={weekDays}
          entries={entries}
          onAddEntry={handleAdd}
          onOpenEntry={handleOpen}
          showUser={adminAll && isAdmin}
        />
      )}

      {selectedEntry?.status === 'submitted' && !formOpen && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recallEntry.mutate(selectedEntry.id)}
          >
            Recall to Draft
          </Button>
        </div>
      )}

      <TimeEntryFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setSelectedEntry(null); }}
        entry={selectedEntry}
        defaultDate={defaultDate}
      />
    </div>
  );
}
