import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Inbox,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  approvalsApi,
  ageTone,
  formatAge,
  moduleLabel,
  type ApprovalModule,
  type ApprovalRequest,
} from '@/api/approvals';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatDate } from '@/lib/utils';

/**
 * The Approval Section.
 *
 * Every module writes into one ledger, so this is the only inbox a person has
 * to check. The queue is strictly personal — the server refuses `scope=all`
 * without the audit grant — which is why the page never worries about whose
 * request it is showing.
 */

const MODULE_TABS: { value: ApprovalModule | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'timesheet', label: 'Timesheet' },
  { value: 'requisition', label: 'Requisition' },
  { value: 'purchase-order', label: 'Purchase Order' },
  { value: 'payment', label: 'Payment' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'change', label: 'Change' },
  { value: 'enrollment', label: 'Enrollment' },
];

const ageClasses = {
  calm: 'border-border text-muted-foreground',
  warn: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  late: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400',
} as const;

export function ApprovalsPage() {
  const { can, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<ApprovalModule | 'all'>('all');
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'any'>('pending');
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [comment, setComment] = useState('');
  const [intent, setIntent] = useState<'approve' | 'reject'>('approve');

  // Only auditors and the platform owner may look at other people's queues.
  const canAudit = isSuperAdmin || can('approval.request.read.all');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');

  const queryKey = ['approvals', status, tab, scope] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      approvalsApi.list({
        status,
        module: tab,
        scope,
        limit: 100,
      }),
  });

  const decideMutation = useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: number;
      action: 'approve' | 'reject';
      note: string;
    }) => approvalsApi.decide(id, action, note),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // Every module list is affected by a decision, so the caches that can
      // show a status are refreshed rather than guessed at.
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      // A chain step is an approval by this person but not a finished record;
      // saying "Approved" there would suggest the requisition can be bought.
      const stillOpen = result.subjectStatus === 'under_review';
      toast.success(
        variables.action === 'reject'
          ? 'Rejected'
          : stillOpen
            ? 'Approved — passed to the next approver'
            : 'Approved'
      );
      setSelected(null);
      setComment('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Could not record the decision');
    },
  });

  const requests = data?.data ?? [];
  const meta = data?.meta;
  const byModule = meta?.byModule ?? {};

  const pendingTotal = useMemo(
    () => Object.values(byModule).reduce((sum, count) => sum + count, 0),
    [byModule]
  );

  const columns: DataTableColumn<ApprovalRequest>[] = [
    {
      key: 'title',
      header: 'Request',
      accessor: (request) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{request.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {moduleLabel[request.module] ?? request.module} · {request.subjectType} #
            {request.subjectId}
          </p>
        </div>
      ),
      sortValue: (request) => request.title,
      sortable: true,
    },
    {
      key: 'requester',
      header: 'Requested by',
      accessor: (request) => (
        <div className="flex items-center gap-2">
          <UserAvatar user={request.requester} size="sm" />
          <span className="text-sm">{request.requester.name}</span>
        </div>
      ),
      sortValue: (request) => request.requester.name,
      sortable: true,
      skeletonClassName: 'h-8 w-8 rounded-full',
    },
    {
      key: 'module',
      header: 'Module',
      accessor: (request) => (
        <Badge variant="outline">{moduleLabel[request.module] ?? request.module}</Badge>
      ),
      sortValue: (request) => request.module,
      sortable: true,
    },
    {
      key: 'age',
      header: 'Waiting',
      accessor: (request) =>
        request.status === 'pending' ? (
          <Badge variant="outline" className={cn('font-mono', ageClasses[ageTone(request.ageHours)])}>
            {formatAge(request.ageHours)}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {request.decidedAt ? formatDate(request.decidedAt) : '—'}
          </span>
        ),
      sortValue: (request) => request.ageHours,
      sortable: true,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (request) => <StatusChip status={request.status} />,
      sortValue: (request) => request.status,
      sortable: true,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (request) =>
        request.status === 'pending' ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-green-600 hover:text-green-700"
              onClick={(event) => {
                event.stopPropagation();
                setSelected(request);
                setIntent('approve');
                setComment('');
              }}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                setSelected(request);
                setIntent('reject');
                setComment('');
              }}
            >
              <XCircle className="mr-1 h-4 w-4" />
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Approvals"
        description="Everything waiting on your decision, gathered from every module"
        icon={ClipboardCheck}
      >
        {canAudit && (
          <Button
            variant={scope === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScope(scope === 'all' ? 'mine' : 'all')}
          >
            {scope === 'all' ? 'Audit view' : 'Show everyone'}
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Waiting on you" value={pendingTotal} tone="text-amber-600" icon={Clock3} />
        <SummaryCard
          label="Shown here"
          value={meta?.total ?? 0}
          tone="text-foreground"
          icon={Inbox}
        />
        <SummaryCard
          label="Modules involved"
          value={Object.keys(byModule).length}
          tone="text-foreground"
          icon={ClipboardCheck}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as ApprovalModule | 'all')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="flex-wrap">
            {MODULE_TABS.map((item) => {
              const count = item.value === 'all' ? pendingTotal : byModule[item.value];
              return (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                  {count ? (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
                      {count}
                    </span>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="flex items-center gap-2">
            {(['pending', 'approved', 'rejected', 'any'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={status === value ? 'secondary' : 'ghost'}
                onClick={() => setStatus(value)}
              >
                {value === 'any' ? 'Everything' : value[0].toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <TabsContent value={tab} className="mt-4">
          <DataTable
            columns={columns}
            data={requests}
            rowKey={(request) => request.id}
            loading={isLoading}
            loadingRows={6}
            error={
              error ? (
                <p className="py-6 text-center text-sm text-destructive">
                  Could not load your approval queue
                </p>
              ) : undefined
            }
            onRowClick={(request) => {
              setSelected(request);
              setIntent('approve');
              setComment(request.comment ?? '');
            }}
            emptyIcon={Inbox}
            emptyTitle={status === 'pending' ? 'Nothing waiting on you' : 'No requests match'}
            emptyDescription={
              status === 'pending'
                ? 'When something needs your approval it will appear here.'
                : undefined
            }
          />
        </TabsContent>
      </Tabs>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
            <SheetDescription>
              {selected
                ? `${moduleLabel[selected.module] ?? selected.module} · requested by ${selected.requester.name}`
                : ''}
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            {selected && (
              <>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Record">
                    {selected.subjectType} #{selected.subjectId}
                  </Field>
                  <Field label="Opened">
                    {formatDate(selected.createdAt)}
                  </Field>
                  <Field label="Waiting">
                    {selected.status === 'pending'
                      ? formatAge(selected.ageHours)
                      : selected.decidedAt
                        ? formatDate(selected.decidedAt)
                        : '—'}
                  </Field>
                  <Field label="Status">
                    <StatusChip status={selected.status} />
                  </Field>
                </dl>

                {selected.comment && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Previous comment
                    </p>
                    {selected.comment}
                  </div>
                )}

                {selected.status === 'pending' && (
                  <div className="space-y-2">
                    <Label htmlFor="approval-comment">Comment</Label>
                    <Textarea
                      id="approval-comment"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      rows={4}
                      placeholder={
                        intent === 'reject'
                          ? 'Explain what needs to change before this can be approved'
                          : 'Optional note for the requester'
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      The requester receives a notification with this note.
                    </p>
                  </div>
                )}
              </>
            )}
          </SheetBody>

          {selected?.status === 'pending' && (
            <SheetFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
              <Button
                variant="destructive"
                disabled={decideMutation.isPending}
                onClick={() =>
                  decideMutation.mutate({ id: selected.id, action: 'reject', note: comment })
                }
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button
                disabled={decideMutation.isPending}
                onClick={() =>
                  decideMutation.mutate({ id: selected.id, action: 'approve', note: comment })
                }
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const classes: Record<string, string> = {
    pending: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    approved: 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400',
    rejected: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400',
    cancelled: 'border-border text-muted-foreground',
  };
  return (
    <Badge variant="outline" className={cn('capitalize', classes[status])}>
      {status}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p>
        </div>
        <Icon className="h-8 w-8 text-muted-foreground/40" />
      </CardContent>
    </Card>
  );
}
