import { useEffect, useState } from 'react';
import { Check, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { RichListBox } from '@/components/ui/rich-listbox';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import type { CostingApproval, SheetStatus } from '@/api/costing';

/**
 * The costing sign-off chain: the project manager prepares and initiates,
 * hand-picking two verifiers (tier 1 → tier 2); the final approval belongs to
 * whoever holds the costing-approve permission. The PM may withdraw the sheet
 * back to draft until the first verification lands. The API enforces every
 * guard; the UI only shows the actions the current user can actually take.
 */
const STEP_META: { stepKey: string; label: string }[] = [
  { stepKey: 'prepared', label: 'Prepared (PM)' },
  { stepKey: 'verified_1', label: 'Verified (Tier 1)' },
  { stepKey: 'verified_2', label: 'Verified (Tier 2)' },
  { stepKey: 'approved', label: 'Approved' },
];

/** Which sheet status each step acts on — mirrors the backend guards. */
const REQUIRED_STATUS: Record<string, SheetStatus> = {
  prepared: 'draft',
  verified_1: 'submitted',
  verified_2: 'verified_1',
  approved: 'verified_2',
};

interface DirectoryUser {
  id: number;
  name: string;
  email: string;
}

export function SignOffPanel({
  status,
  approvals,
  isProjectManager,
  canApprove,
  onSubmit,
  onWithdraw,
  onSignOff,
  onReopen,
  isPending,
}: {
  status: SheetStatus;
  approvals: CostingApproval[];
  /** Holds costing.manage AND is the project's PM — the only initiator. */
  isProjectManager: boolean;
  canApprove: boolean;
  onSubmit: (verifier1Id: number, verifier2Id: number) => void;
  onWithdraw: () => void;
  onSignOff: (stepKey: string, decision: 'approve' | 'reject', comments: string | null) => void;
  onReopen: () => void;
  isPending: boolean;
}) {
  const { user } = useAuth();
  const [acting, setActing] = useState<{ stepKey: string; decision: 'approve' | 'reject' } | null>(null);
  const [comments, setComments] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [verifier1, setVerifier1] = useState('');
  const [verifier2, setVerifier2] = useState('');
  const [users, setUsers] = useState<DirectoryUser[]>([]);

  // Same session-only directory the resource picker uses.
  useEffect(() => {
    if (users.length === 0) {
      apiClient
        .get('/admin/users/list')
        .then((res: any) => setUsers(res.data.data ?? []))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSubmit]);

  const statusBadge = {
    draft: <Badge variant="outline">Draft</Badge>,
    submitted: <Badge variant="outline" className="border-blue-500/60 text-blue-600">Awaiting Tier 1</Badge>,
    verified_1: <Badge variant="outline" className="border-blue-500/60 text-blue-600">Awaiting Tier 2</Badge>,
    verified_2: <Badge variant="outline" className="border-blue-500/60 text-blue-600">Awaiting Approval</Badge>,
    approved: <Badge className="bg-green-600">Approved</Badge>,
    rejected: <Badge variant="destructive">Rejected</Badge>,
  }[status];

  const stepCanBeActed = (stepKey: string) => {
    if (status !== REQUIRED_STATUS[stepKey]) return false;
    const approval = approvals.find((a) => a.stepKey === stepKey);
    if (stepKey === 'approved') return canApprove;
    // Verify steps belong to the assigned verifier only.
    return approval?.assignedUserId != null && approval.assignedUserId === user?.id;
  };

  // Withdraw action renders directly; no extra flag needed.

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Sign-off
        </CardTitle>
        <div className="flex items-center gap-2">
          {statusBadge}
          {canApprove && status === 'approved' && (
            <Button variant="outline" size="sm" onClick={onReopen} disabled={isPending}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reopen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STEP_META.map((meta) => {
            const approval = approvals.find((a) => a.stepKey === meta.stepKey);
            const actionable = stepCanBeActed(meta.stepKey);
            const showVerifier =
              (meta.stepKey === 'verified_1' || meta.stepKey === 'verified_2') && approval?.assignedName;
            return (
              <div
                key={meta.stepKey}
                className={`rounded-md border p-3 ${
                  approval?.status === 'approved'
                    ? 'border-green-600/40 bg-green-500/5'
                    : approval?.status === 'rejected'
                      ? 'border-destructive/40 bg-destructive/5'
                      : actionable
                        ? 'border-primary/50'
                        : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium">{meta.label}</span>
                  {approval?.status === 'approved' && <Check className="h-3.5 w-3.5 text-green-600" />}
                  {approval?.status === 'rejected' && <X className="h-3.5 w-3.5 text-destructive" />}
                </div>
                {showVerifier && approval?.status === 'pending' ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Assigned: <span className="font-medium text-foreground">{approval.assignedName}</span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {approval?.actorName ?? 'Pending'}
                    {approval?.actedAt && <div>{formatDateTime(approval.actedAt)}</div>}
                  </div>
                )}
                {approval?.comments && (
                  <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">“{approval.comments}”</p>
                )}
                {actionable && (
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

        {isProjectManager && (status === 'draft' || status === 'rejected') && !showSubmit && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowSubmit(true)}>
              Submit for Approval
            </Button>
          </div>
        )}

        {isProjectManager && status === 'submitted' && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onWithdraw} disabled={isPending}>
              Withdraw
            </Button>
          </div>
        )}

        {isProjectManager && showSubmit && (status === 'draft' || status === 'rejected') && (
          <div className="space-y-3 rounded-md border dark:border-gray-800 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Verifier — Tier 1</Label>
                <RichListBox
                  value={verifier1}
                  onChange={setVerifier1}
                  items={users
                    .filter((candidate) => candidate.id !== user?.id)
                    .map((candidate) => ({
                      value: String(candidate.id),
                      label: candidate.name,
                      description: candidate.email,
                    }))}
                  placeholder="Pick verifier 1..."
                  searchPlaceholder="Search users..."
                />
              </div>
              <div className="space-y-2">
                <Label>Verifier — Tier 2</Label>
                <RichListBox
                  value={verifier2}
                  onChange={setVerifier2}
                  items={users
                    .filter((candidate) => candidate.id !== user?.id && String(candidate.id) !== verifier1)
                    .map((candidate) => ({
                      value: String(candidate.id),
                      label: candidate.name,
                      description: candidate.email,
                    }))}
                  placeholder="Pick verifier 2..."
                  searchPlaceholder="Search users..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowSubmit(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!verifier1 || !verifier2 || verifier1 === verifier2 || isPending}
                onClick={() => onSubmit(Number(verifier1), Number(verifier2))}
              >
                Submit
              </Button>
            </div>
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
