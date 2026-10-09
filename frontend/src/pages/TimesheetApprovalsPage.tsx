import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@/components/ui/form-dialog';
import { EntryStatusBadge } from '@/components/timesheet/EntryStatusBadge';
import {
  ClipboardCheck, CheckCircle2, XCircle, Timer, ListTodo, User as UserIcon,
} from 'lucide-react';
import {
  useTimesheetApprovals,
  useApproveTimeEntry,
  useRejectTimeEntry,
} from '@/hooks/useTimeEntries';
import { useAuth } from '@/hooks/useAuth';
import type { TimeEntry } from '@/types';

function sourceLabel(entry: TimeEntry): string {
  if (entry.sourceLabel) return entry.sourceLabel;
  if (entry.subtask) return `${entry.task?.title ?? ''} › ${entry.subtask.title}`;
  if (entry.task) return entry.task.title;
  return 'Ad-hoc';
}

export function TimesheetApprovalsPage() {
  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const [showAll, setShowAll] = useState(false);
  const [rejecting, setRejecting] = useState<TimeEntry | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { hasRole } = useAuth();
  const isAdmin = hasRole('super-admin') || hasRole('devops-admin');

  const { data: entries = [], isLoading } = useTimesheetApprovals(tab, showAll && isAdmin);
  const approveEntry = useApproveTimeEntry();
  const rejectEntry = useRejectTimeEntry();

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejecting || !rejectReason.trim()) return;
    await rejectEntry.mutateAsync({ id: rejecting.id, reason: rejectReason.trim() });
    setRejecting(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Timesheet Approvals"
        description="Review and decide submitted timesheet entries"
        icon={ClipboardCheck}
      >
        {isAdmin && (
          <Button
            variant={showAll ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAll(!showAll)}
          >
            All users
          </Button>
        )}
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'decided')}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending {tab === 'pending' && entries.length > 0 && (
              <Badge variant="outline" className="ml-1.5 text-[9px] px-1.5 py-0">{entries.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="decided">Decided</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading approvals...</div>
          ) : entries.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {tab === 'pending'
                  ? 'No entries waiting for your approval'
                  : 'No decided entries yet'}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <Card key={entry.id}>
                  <CardContent className="p-4 flex flex-wrap items-start gap-4">
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{entry.user?.name ?? `User #${entry.userId}`}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(entry.workDate + 'T00:00:00').toLocaleDateString(undefined, {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                        <Timer className="h-3 w-3" /> {Number(entry.hours)}h
                      </Badge>
                      <Badge variant="outline" className="capitalize text-[10px]">{entry.categoryValue}</Badge>
                      <EntryStatusBadge status={entry.status} />
                    </div>

                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm text-foreground/90">{entry.description}</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <ListTodo className="h-3 w-3 shrink-0" />
                        <span className="truncate">{sourceLabel(entry)}</span>
                      </div>
                      {entry.status === 'rejected' && entry.rejectReason && (
                        <div className="mt-1.5 text-xs text-red-500">
                          <strong>Rejected:</strong> {entry.rejectReason}
                        </div>
                      )}
                    </div>

                    {tab === 'pending' ? (
                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => { setRejecting(entry); setRejectReason(''); }}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={approveEntry.isPending}
                          onClick={() => approveEntry.mutate(entry.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve
                        </Button>
                      </div>
                    ) : (
                      <div className="ml-auto text-xs text-muted-foreground">
                        {entry.decidedAt
                          ? `Decided ${new Date(entry.decidedAt).toLocaleDateString()}`
                          : ''}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <FormDialog
        open={!!rejecting}
        onOpenChange={(v) => { if (!v) { setRejecting(null); setRejectReason(''); } }}
        title="Reject Timesheet Entry"
        description="Provide a reason so the user knows what to fix before resubmitting."
        maxWidth="sm"
        onSubmit={handleReject}
        submitLabel="Reject Entry"
        isSubmitting={rejectEntry.isPending}
        submitDisabled={!rejectReason.trim()}
      >
        <div className="space-y-2">
          {rejecting && (
            <div className="rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-xs">
              <div className="font-medium">{rejecting.user?.name ?? `User #${rejecting.userId}`}</div>
              <div className="text-muted-foreground">
                {Number(rejecting.hours)}h · {rejecting.workDate} · {sourceLabel(rejecting)}
              </div>
            </div>
          )}
          <Label>Rejection reason</Label>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Hours do not match the task deliverable..."
            rows={3}
            required
          />
        </div>
      </FormDialog>
    </div>
  );
}
