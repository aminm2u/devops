import { useState } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { CostingApproval, SheetStatus } from '@/api/costing';

/**
 * The fixed 4-step sign-off chain from the workbook: Prepared (PM/APM) →
 * Verified (HOD) → Verified (Finance) → Approved (CEO). Each step shows its
 * actor and timestamp; the button for the current step renders only for users
 * holding that step's permission, and the API re-checks everything.
 */
const STEP_META: { stepKey: string; label: string; permission: string }[] = [
  { stepKey: 'prepared', label: 'Prepared (PM/APM)', permission: 'project.costing.manage' },
  { stepKey: 'hod_verified', label: 'Verified (HOD)', permission: 'project.costing.verify.hod' },
  { stepKey: 'finance_verified', label: 'Verified (Finance)', permission: 'project.costing.verify.finance' },
  { stepKey: 'ceo_approved', label: 'Approved (CEO)', permission: 'project.costing.approve.ceo' },
];

/** Which sheet status each step acts on — mirrors the backend guards. */
const REQUIRED_STATUS: Record<string, SheetStatus> = {
  prepared: 'draft',
  hod_verified: 'submitted',
  finance_verified: 'hod_verified',
  ceo_approved: 'finance_verified',
};

export function SignOffPanel({
  status,
  approvals,
  onSubmit,
  onSignOff,
  onReopen,
  isPending,
}: {
  status: SheetStatus;
  approvals: CostingApproval[];
  onSubmit: () => void;
  onSignOff: (stepKey: string, decision: 'approve' | 'reject', comments: string | null) => void;
  onReopen: () => void;
  isPending: boolean;
}) {
  const { can } = useAuth();
  const [acting, setActing] = useState<{ stepKey: string; decision: 'approve' | 'reject' } | null>(null);
  const [comments, setComments] = useState('');

  const statusBadge = {
    draft: <Badge variant="outline">Draft</Badge>,
    submitted: <Badge variant="outline" className="border-blue-500/60 text-blue-600">Awaiting HOD</Badge>,
    hod_verified: <Badge variant="outline" className="border-blue-500/60 text-blue-600">Awaiting Finance</Badge>,
    finance_verified: <Badge variant="outline" className="border-blue-500/60 text-blue-600">Awaiting CEO</Badge>,
    approved: <Badge className="bg-green-600">Approved</Badge>,
    rejected: <Badge variant="destructive">Rejected</Badge>,
  }[status];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Sign-off
        </CardTitle>
        <div className="flex items-center gap-2">
          {statusBadge}
          {can('project.costing.approve.ceo') && status === 'approved' && (
            <Button variant="outline" size="sm" onClick={onReopen} disabled={isPending}>
              Reopen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STEP_META.map((meta, idx) => {
            const approval = approvals.find((a) => a.stepKey === meta.stepKey);
            const isNext =
              status === REQUIRED_STATUS[meta.stepKey] && can(meta.permission) &&
              (meta.stepKey === 'prepared'
                ? status === 'draft' || status === 'rejected'
                : approvals.filter((_, i) => i < idx).every((a) => a.status === 'approved'));
            return (
              <div
                key={meta.stepKey}
                className={`rounded-md border p-3 ${
                  approval?.status === 'approved'
                    ? 'border-green-600/40 bg-green-500/5'
                    : approval?.status === 'rejected'
                      ? 'border-destructive/40 bg-destructive/5'
                      : isNext
                        ? 'border-primary/50'
                        : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium">{meta.label}</span>
                  {approval?.status === 'approved' && <Check className="h-3.5 w-3.5 text-green-600" />}
                  {approval?.status === 'rejected' && <X className="h-3.5 w-3.5 text-destructive" />}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {approval?.actorName ?? 'Pending'}
                  {approval?.actedAt && <div>{formatDateTime(approval.actedAt)}</div>}
                </div>
                {approval?.comments && (
                  <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">“{approval.comments}”</p>
                )}
                {isNext && meta.stepKey !== 'prepared' && (
                  <div className="mt-2 flex gap-1">
                    <Button size="sm" className="h-7 flex-1" onClick={() => setActing({ stepKey: meta.stepKey, decision: 'approve' })}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => setActing({ stepKey: meta.stepKey, decision: 'reject' })}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {can('project.costing.manage') && (status === 'draft' || status === 'rejected') && (
          <div className="flex justify-end">
            <Button size="sm" onClick={onSubmit} disabled={isPending}>
              Submit for Approval
            </Button>
          </div>
        )}
        {status === 'rejected' && (
          <p className="text-xs text-muted-foreground">
            The sheet was rejected — edit as needed, then submit again.
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={acting !== null}
        onOpenChange={() => setActing(null)}
        title={acting?.decision === 'approve' ? 'Confirm sign-off' : 'Reject sheet'}
        description={
          acting?.decision === 'approve'
            ? 'Your name and timestamp will be recorded on this step.'
            : 'The sheet returns to draft for rework.'
        }
        confirmLabel={acting?.decision === 'approve' ? 'Sign' : 'Reject'}
        onConfirm={() => {
          if (acting) onSignOff(acting.stepKey, acting.decision, comments.trim() || null);
          setComments('');
          setActing(null);
        }}
        isConfirming={isPending}
      >
        <Label>Comments</Label>
        <Textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Optional" />
      </ConfirmDialog>
    </Card>
  );
}
