import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { errMessage } from '@/lib/errors';
import {
  ShieldCheck,
  Hash,
  Database,
  Plus,
  Pencil,
  Trash2,
  Users,
  Info,
  ChevronRight,
  Wallet,
  Building2,
  UserCheck,
  X,
  Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FormDialog } from '@/components/ui/form-dialog';
import { RichListBox } from '@/components/ui/rich-listbox';
import { PositionsPanel, type PositionRecord } from '@/features/admin/PositionsPanel';
import { UnitsPanel, type UnitRecord } from '@/features/admin/UnitsPanel';
import { TimesheetCategoriesPanel } from '@/features/admin/TimesheetCategoriesPanel';
import {
  HelpdeskCategoriesPanel,
  type HelpdeskCategoryRow,
} from '@/features/admin/HelpdeskCategoriesPanel';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
  }).format(amount);
}

// ── Types ───────────────────────────────────────────────────────────────────

interface ApprovalTier {
  id?: number;
  minAmount: number;
  maxAmount: number;
  requiredApprovals: number;
}

interface PolicyAssignment {
  id: number;
  userId: number;
  sortOrder: number;
  user?: { id: number; name: string; email: string };
}

interface ApprovalPolicy {
  id: number;
  name: string;
  description: string | null;
  budgetType: string | null;
  division: string | null;
  isActive: boolean;
  tiers: ApprovalTier[];
  assignments: PolicyAssignment[];
}

interface NumberingConfig {
  id: number;
  refType: string;
  prefix: string;
  separator: string;
  yearFormat: 'YYYY' | 'YY' | 'NONE';
  digitPadding: number;
  currentCounter: number;
  example?: string;
}

interface RefDataItem {
  id: number;
  group: string;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

/**
 * One line per reference group, so the picker says what the list is *for*
 * rather than only printing its machine name. Without this, `status_po` and
 * `status_payment` are indistinguishable to anyone who does not already know
 * the schema.
 *
 * Anything missing here still renders — it just falls back to the prettified
 * group name — so adding a group server-side never breaks this screen.
 */
const GROUP_SUMMARY: Record<string, string> = {
  // Procurement
  budget_type: 'How a budget is classified — project, department, event, overhead.',
  budget_category: 'What the money is spent on — hardware, software, rentals.',
  currency: 'Currencies a requisition or purchase order can be raised in.',
  uom: 'Units of measure for purchase order line items.',
  procurement_type: 'Whether a purchase buys material (goods) or a service.',
  urgency_level: 'How quickly a requisition needs to be actioned.',
  payment_method: 'How an approved invoice is settled with the vendor.',
  division: 'Departments. Units are created inside these; positions are separate.',
  asset_category: 'Asset class shown on the asset register — furniture, IT, vehicle.',

  // Document status flows — each list drives one document's lifecycle.
  status_budget: 'Stages a budget moves through, from request to closed.',
  status_requisition: 'Stages a purchase requisition moves through.',
  status_po: 'Stages a purchase order moves through, including receipt.',
  status_rfq: 'Stages a request for quotation moves through.',
  status_payment: 'Stages a payment request moves through.',
  status_grn: 'Stages a goods received note moves through after delivery.',
  status_direct_purchase: 'Stages a direct purchase moves through.',
  status_internal_project: 'Stages an internal project moves through.',

  // DevOps
  status_deployment: 'Stages a deployment moves through, including rollback.',
  incident_severity: 'How severe an incident is, used to set its response time.',
  status_incident: 'Stages an incident moves through from open to closed.',
  infrastructure_node_type: 'What a piece of infrastructure is — server, database, queue.',
  infrastructure_status: 'Health of an infrastructure node.',
  domain_type: 'What role a domain plays — primary, redirect, alias.',
  status_domain: 'Registration and expiry state of a domain.',
  ssl_certificate_type: 'Where a certificate came from — ACME, commercial, internal.',
  status_ssl_certificate: 'Lifecycle state of an SSL certificate.',
  environment_type: 'Environment a service or deploy target belongs to.',
  service_type: 'What a service is — web, API, worker, cron.',
  status_service: 'Runtime health of a service.',
  document_type: 'Kind of internal document — runbook, architecture, API spec.',
  status_document: 'Publication state of a document.',
  credential_type: 'What a stored credential unlocks — server, database, API.',
  cloud_provider: 'Cloud or hosting platform an asset runs on.',
  team_type: 'Purpose of a team — DevOps, support, project, operations.',

  // Helpdesk
  status_ticket: 'Stages a support ticket moves through.',
  ticket_priority: 'How urgent a support ticket is.',
  ticket_source: 'Channel a ticket came in through.',

  // Projects, assets, timesheet
  status_project: 'Stages a project moves through.',
  project_priority: 'Priority of a project.',
  status_subtask: 'Stages a project subtask moves through.',
  status_asset: 'Lifecycle state of an asset.',
  status_timesheet_entry: 'Approval state of a timesheet entry.',
  timesheet_category: 'What kind of work a timesheet row records.',
};

/**
 * `status_po` → "Status po". Sentence case, not Title Case: `status_po` and
 * `status_po_number` would otherwise both read "Status Po" and look like the
 * same list. Only the first letter is raised so the group's own words stay
 * recognisable against the API's snake_case values.
 */
function humaniseGroup(group: string): string {
  const words = group.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The item's own label, capitalised for display only.
 *
 * The stored label is also what other screens render, and some seed values are
 * lower case (`project`, `furniture`). Fixing it in the picker rather than in
 * the data keeps the two in step: editing a value here would not touch the
 * master data, so the list would disagree with every dropdown that reads it.
 */
function displayLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}// ── Main Page ───────────────────────────────────────────────────────────────

// ── Approval Policies Tab ───────────────────────────────────────────────────

const emptyTiers: ApprovalTier[] = [{ minAmount: 0, maxAmount: 1000, requiredApprovals: 1 }];

export function ApprovalPoliciesTab() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ApprovalPolicy | null>(null);
  const [deleting, setDeleting] = useState<ApprovalPolicy | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['approval-policies'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/approval-policies');
      return res.data.data as ApprovalPolicy[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiClient.delete(`/settings/approval-policies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-policies'] });
      setDeleting(null);
      toast.success('Approval policy removed');
    },
    onError: (err: any) => toast.error(errMessage(err, 'Failed to delete policy')),
  });

  const policies: ApprovalPolicy[] = data || [];
  const activeCount = policies.filter((p) => p.isActive).length;

  return (
    <div className="space-y-4">
      {/* How matching works — one sentence per rule, so it reads as a spec
          rather than a paragraph nobody finishes. */}
      <div className="flex gap-3 rounded-lg border border-border/50 bg-muted/25 p-4">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Info className="h-4 w-4 text-primary" />
        </div>
        <div className="space-y-1.5 text-sm">
          <p className="font-medium">How a requisition finds its policy</p>
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground">
            {[
              'Budget Type + Department',
              'Budget Type only',
              'Department only',
              'Global policy',
            ].map((step, index) => (
              <li key={step} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs',
                    index === 0
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'bg-background/60'
                  )}
                >
                  {step}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            The matching policy&apos;s first tier that contains the amount decides how many of the
            approvers, in order, must sign off.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-medium">
            {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
          </p>
          <span className="text-xs text-muted-foreground">
            {activeCount} active
            {policies.length !== activeCount && ` · ${policies.length - activeCount} inactive`}
          </span>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowDialog(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          New Policy
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      ) : policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <ShieldCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No approval policies</p>
            <p className="text-sm text-muted-foreground mt-1">
              Without a policy, requisitions are auto-approved on submit
            </p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => { setEditing(null); setShowDialog(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onEdit={() => { setEditing(policy); setShowDialog(true); }}
              onDelete={() => setDeleting(policy)}
            />
          ))}
        </div>
      )}

      {showDialog && (
        <PolicyFormDialog
          policy={editing}
          onClose={() => setShowDialog(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Delete approval policy?"
          description={`"${deleting.name}" will no longer be matched to new requisitions. Existing approval chains are not affected.`}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          isConfirming={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Policy card ─────────────────────────────────────────────────────────────

/**
 * One policy, read as a rule rather than a bag of chips.
 *
 * The old card laid everything out as inline badges, so the tiers — the part
 * that actually decides an approval count — were the least legible thing on
 * the screen. Here each tier is a row you can read down, and the approver list
 * shows the same order the engine walks.
 */
function PolicyCard({
  policy,
  onEdit,
  onDelete,
}: {
  policy: ApprovalPolicy;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tiers = [...policy.tiers].sort((a, b) => Number(a.minAmount) - Number(b.minAmount));
  const approvers = [...policy.assignments].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold leading-tight">{policy.name}</h3>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  policy.isActive
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    policy.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                  )}
                />
                {policy.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {policy.description && (
              <p className="text-sm text-muted-foreground">{policy.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="sm" title="Edit policy" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Delete policy"
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-5 border-t border-border/50 bg-muted/20 p-5 lg:grid-cols-5">
          {/* Left: what it applies to, and who signs off */}
          <div className="space-y-5 lg:col-span-2">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                Applies to
              </p>
              <div className="space-y-1.5">
                <ScopeLine
                  icon={Wallet}
                  label="Budget type"
                  value={policy.budgetType || 'Any budget type'}
                  isAny={!policy.budgetType}
                />
                <ScopeLine
                  icon={Building2}
                  label="Department"
                  value={policy.division || 'Any department'}
                  isAny={!policy.division}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" />
                Approvers, in order
              </p>
              {approvers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nobody assigned — matching requisitions escalate to a global approver.
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {approvers.map((assignment, index) => (
                    <li key={assignment.id} className="flex items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                        {index + 1}
                      </span>
                      <UserAvatar user={assignment.user} size="sm" />
                      <span className="truncate text-xs font-medium">
                        {assignment.user?.name || `User #${assignment.userId}`}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Right: the tiers, which is what actually decides an approval count */}
          <div className="space-y-2 lg:col-span-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Amount tiers
            </p>
            <div className="overflow-hidden rounded-md border border-border/50 bg-background">
              {tiers.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No tiers — every amount follows the policy&apos;s default.
                </p>
              ) : (
                tiers.map((tier, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3 py-2.5 text-xs',
                      index > 0 && 'border-t border-border/40'
                    )}
                  >
                    <span className="font-mono tabular-nums">
                      {formatCurrency(Number(tier.minAmount))}
                      <span className="mx-1.5 text-muted-foreground">–</span>
                      {formatCurrency(Number(tier.maxAmount))}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="flex gap-0.5">
                        {Array.from({ length: Math.min(tier.requiredApprovals, 5) }).map((_, dot) => (
                          <span key={dot} className="h-1.5 w-1.5 rounded-full bg-primary" />
                        ))}
                      </span>
                      <span className="text-muted-foreground">
                        {tier.requiredApprovals} approval{tier.requiredApprovals > 1 ? 's' : ''}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** One "Budget type / Department" line: the value reads as data, not a tag. */
function ScopeLine({
  icon: Icon,
  label,
  value,
  isAny,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  isAny: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('truncate', isAny ? 'italic text-muted-foreground' : 'font-medium')}>
        {value}
      </span>
    </div>
  );
}

// ── Policy Create/Edit Dialog ───────────────────────────────────────────────

function PolicyFormDialog({
  policy,
  onClose,
}: {
  policy: ApprovalPolicy | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState(policy?.name || '');
  const [description, setDescription] = useState(policy?.description || '');
  const [budgetType, setBudgetType] = useState(policy?.budgetType || 'any');
  const [division, setDivision] = useState(policy?.division || 'any');
  const [tiers, setTiers] = useState<ApprovalTier[]>(
    policy?.tiers?.length
      ? policy.tiers.map((t) => ({
          minAmount: Number(t.minAmount),
          maxAmount: Number(t.maxAmount),
          requiredApprovals: t.requiredApprovals,
        }))
      : [...emptyTiers]
  );
  const [approverIds, setApproverIds] = useState<number[]>(
    policy?.assignments?.length
      ? [...policy.assignments].sort((a, b) => a.sortOrder - b.sortOrder).map((a) => a.userId)
      : []
  );
  const [approverSearch, setApproverSearch] = useState('');

  // Reference data for scope selects
  const { data: refData } = useQuery({
    queryKey: ['reference-data'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/reference-data');
      return res.data.data as Record<string, RefDataItem[]>;
    },
  });
  const budgetTypes = refData?.budget_type || [];
  // Still stored under the `division` group — the API's approval-policy column
  // is `division` too. Only what the user reads has been renamed.
  const departments = refData?.division || [];

  // Users for approver picker
  const { data: userData } = useQuery({
    queryKey: ['users-for-approval'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/users', { params: { limit: 500 } });
      return res.data.data as UserOption[];
    },
  });
  const users: UserOption[] = userData || [];

  // How many options the per-tier "Required approvals" picker offers. It used
  // to be capped at the number of approvers, so a tier needing 3 approvals
  // showed a blank select whenever only 2 people were assigned — the stored
  // value had no matching option. The ceiling now also covers whatever the
  // tiers already ask for, so an over-subscribed tier stays visible and can be
  // lowered rather than silently rendering empty.
  const maxApprovals = Math.max(
    approverIds.length,
    ...tiers.map((tier) => Number(tier.requiredApprovals) || 0),
    1
  );

  // Filtered by name/email; selected people stay visible regardless so the
  // chain above the list never disagrees with the list itself.
  const filteredUsers = users.filter((user) => {
    const needle = approverSearch.trim().toLowerCase();
    if (!needle) return true;
    if (approverIds.includes(user.id)) return true;
    return (
      user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
    );
  });

  const toggleApprover = (userId: number) => {
    setApproverIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const updateTier = (index: number, field: keyof ApprovalTier, value: any) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description: description.trim() || null,
        budgetType: budgetType === 'any' ? null : budgetType,
        division: division === 'any' ? null : division,
        isActive: policy ? policy.isActive : true,
        tiers,
        approverIds,
      };
      if (policy) {
        return apiClient.put(`/settings/approval-policies/${policy.id}`, payload);
      }
      return apiClient.post('/settings/approval-policies', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-policies'] });
      toast.success(policy ? 'Approval policy updated' : 'Approval policy created');
      onClose();
    },
    onError: (err: any) => toast.error(errMessage(err, 'Failed to save policy')),
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Policy name is required');
      return;
    }
    if (tiers.some((t) => Number(t.maxAmount) < Number(t.minAmount))) {
      toast.error('Every tier must have a max amount greater than or equal to its min');
      return;
    }
    if (approverIds.length === 0) {
      toast.error('Select at least one approver');
      return;
    }
    mutation.mutate();
  };

  const userName = (id: number) => {
    const u = users.find((x) => x.id === id);
    return u?.name || `User #${id}`;
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={policy ? 'Edit Approval Policy' : 'New Approval Policy'}
      description={
        policy
          ? 'Update the scope, amount tiers and approvers for this policy'
          : 'Define which requisitions this policy matches and who approves them'
      }
      maxWidth="lg"
      onSubmit={handleSubmit}
      submitLabel={policy ? 'Update Policy' : 'Create Policy'}
      isSubmitting={mutation.isPending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Policy Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Departmental Approval"
          />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Budget Type</Label>
          <Select value={budgetType} onValueChange={setBudgetType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any budget type</SelectItem>
              {budgetTypes.map((b) => (
                <SelectItem key={b.id} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Department</Label>
          <Select value={division} onValueChange={setDivision}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any department</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Amount Tiers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className='dark:text-gray-400 text-gray-500 flex items-center gap-2'>
              Amount Tiers
              <Badge variant="secondary">{tiers.length}</Badge>
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              The first tier containing the requisition amount sets how many approvals are needed.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            type="button"
            className="shrink-0"
            onClick={() => {
              const last = tiers[tiers.length - 1];
              setTiers([...tiers, { minAmount: Number(last.maxAmount) + 1, maxAmount: Number(last.maxAmount) + 1000, requiredApprovals: 1 }]);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Tier
          </Button>
        </div>

        <div className="space-y-2">
          {tiers.map((tier, index) => (
            <div
              key={index}
              className="rounded-lg border border-border/50 bg-muted/20 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <span className="flex-1 text-xs text-muted-foreground">
                  RM {Number(tier.minAmount).toLocaleString('en-MY')} to RM{' '}
                  {Number(tier.maxAmount).toLocaleString('en-MY')} needs{' '}
                  <strong className="text-foreground">
                    {tier.requiredApprovals} approval{tier.requiredApprovals > 1 ? 's' : ''}
                  </strong>
                </span>
                {tier.requiredApprovals > approverIds.length && (
                  <span
                    className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                    title="This tier asks for more approvals than there are approvers assigned, so it will fall back to however many are available."
                  >
                    Only {approverIds.length} approver{approverIds.length === 1 ? '' : 's'} assigned
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  disabled={tiers.length <= 1}
                  onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
                  title="Remove tier"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_150px]">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Min (RM)
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tier.minAmount}
                    onChange={(e) => updateTier(index, 'minAmount', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Max (RM)
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tier.maxAmount}
                    onChange={(e) => updateTier(index, 'maxAmount', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs tabular-nums"
                  />
                </div>
                <div className="col-span-2 space-y-1 sm:col-span-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Approvals
                  </span>
                  <Select
                    value={String(tier.requiredApprovals)}
                    onValueChange={(v) => updateTier(index, 'requiredApprovals', parseInt(v, 10))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxApprovals }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} approver{n > 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approvers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className='dark:text-gray-400 text-gray-500 flex items-center gap-2'>
            <Users className="h-4 w-4" />
            Approvers
            {approverIds.length > 0 && <Badge variant="secondary">{approverIds.length} selected</Badge>}
          </Label>
          {approverIds.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setApproverIds([])}
            >
              Clear all
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Tick in approval order — the first person ticked signs off first.
        </p>

        {/* The chosen chain, kept above the list so the order is never a
            mental exercise while scrolling a long user list. */}
        {approverIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            {approverIds.map((id, index) => (
              <span key={id} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
                <span className="inline-flex items-center gap-1 rounded-full bg-background py-0.5 pl-0.5 pr-1.5 text-xs shadow-sm">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="max-w-[140px] truncate">{userName(id)}</span>
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                    onClick={() => toggleApprover(id)}
                    title={`Remove ${userName(id)}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={approverSearch}
            onChange={(e) => setApproverSearch(e.target.value)}
            placeholder="Search people by name or email…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-border/40 bg-muted/20">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No users found</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Nobody matches “{approverSearch}”</p>
          ) : (
            filteredUsers.map((user) => {
              const orderIndex = approverIds.indexOf(user.id);
              const checked = orderIndex !== -1;
              return (
                <label
                  key={user.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 border-b border-border/40 px-3 py-2 last:border-0 hover:bg-muted/50',
                    checked && 'bg-primary/5'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleApprover(user.id)}
                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0"
                  />
                  <UserAvatar user={user} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                  </span>
                  {checked && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {orderIndex + 1}
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
      </div>
    </FormDialog>
  );
}

// ── Numbering Tab ───────────────────────────────────────────────────────────

/**
 * The `refType` codes are what the API and the generator agree on, so they stay
 * as they are; this only decides what a person reads in the table. Anything
 * missing falls back to the code, which is right for the procurement documents
 * whose prefixes already say what they are.
 */
const REF_TYPE_LABEL: Record<string, string> = {
  employee: 'Employee ID',
};

export function NumberingTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<NumberingConfig | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['numbering-configs'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/numbering');
      return res.data.data as NumberingConfig[];
    },
  });

  const configs: NumberingConfig[] = data || [];

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Hash className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No numbering configs</p>
            <p className="text-sm text-muted-foreground mt-1">Run the database seed to create default configs</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Document Type</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Separator</TableHead>
                <TableHead>Year Format</TableHead>
                <TableHead>Digits</TableHead>
                <TableHead>Counter</TableHead>
                <TableHead>Example</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id} className="hover:bg-muted/40 dark:text-gray-400 text-gray-500">
                  <TableCell className="font-medium pl-5">{REF_TYPE_LABEL[config.refType] ?? config.refType}</TableCell>
                  <TableCell className="font-mono">{config.prefix}</TableCell>
                  <TableCell className="font-mono">{config.separator}</TableCell>
                  <TableCell>{config.yearFormat === 'NONE' ? '—' : config.yearFormat}</TableCell>
                  <TableCell className="tabular-nums">{config.digitPadding}</TableCell>
                  <TableCell className="tabular-nums">{config.currentCounter}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono font-normal dark:text-gray-400 text-gray-500">
                      {/* The API computes this with the same formatter the
                          generator uses, so the two can never disagree. */}
                      {config.example}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(config)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {editing && (
        <NumberingDialog
          config={editing}
          onClose={() => setEditing(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['numbering-configs'] })}
        />
      )}
    </Card>
  );
}

function NumberingDialog({
  config,
  onClose,
  onSaved,
}: {
  config: NumberingConfig;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prefix, setPrefix] = useState(config.prefix);
  const [separator, setSeparator] = useState(config.separator);
  const [yearFormat, setYearFormat] = useState(config.yearFormat);
  const [digitPadding, setDigitPadding] = useState(config.digitPadding);
  const [currentCounter, setCurrentCounter] = useState(config.currentCounter);

  const mutation = useMutation({
    mutationFn: async () => {
      return apiClient.put(`/settings/numbering/${config.refType}`, {
        prefix,
        separator,
        yearFormat,
        digitPadding: Number(digitPadding),
        currentCounter: Number(currentCounter),
      });
    },
    onSuccess: () => {
      onSaved();
      toast.success('Numbering config updated');
      onClose();
    },
    onError: (err: any) => toast.error(errMessage(err, 'Failed to update numbering config')),
  });

  // Mirrors `formatReferenceNumber` on the server. The year segment and its
  // separator both disappear for NONE, so the preview matches the issued value
  // rather than showing a dangling separator.
  const yearStr =
    yearFormat === 'NONE'
      ? ''
      : yearFormat === 'YY'
        ? String(new Date().getFullYear()).slice(-2)
        : String(new Date().getFullYear());
  const counterStr = String(currentCounter).padStart(Number(digitPadding) || 0, '0');
  const example = yearStr
    ? `${prefix}${separator}${yearStr}${separator}${counterStr}`
    : `${prefix}${separator}${counterStr}`;

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={`Numbering — ${REF_TYPE_LABEL[config.refType] ?? config.refType}`}
      description="Configure how reference numbers are generated for this document type"
      maxWidth="sm"
      onSubmit={() => mutation.mutate()}
      submitLabel="Save"
      isSubmitting={mutation.isPending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Prefix</Label>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="font-mono" />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Separator</Label>
          <Input value={separator} onChange={(e) => setSeparator(e.target.value)} className="font-mono" maxLength={5} />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Year Format</Label>
          <Select
            value={yearFormat}
            onValueChange={(v: 'YYYY' | 'YY' | 'NONE') => setYearFormat(v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YYYY">YYYY (2026)</SelectItem>
              <SelectItem value="YY">YY (26)</SelectItem>
              {/* A staff number outlives the year it was hired in, so a
                  perpetual series must be possible. */}
              <SelectItem value="NONE">None (no year segment)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Digit Padding</Label>
          <Input
            type="number"
            min={3}
            max={8}
            value={digitPadding}
            onChange={(e) => setDigitPadding(parseInt(e.target.value) || 4)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label className='dark:text-gray-400 text-gray-500'>Current Counter</Label>
          <Input
            type="number"
            min={0}
            value={currentCounter}
            onChange={(e) => setCurrentCounter(parseInt(e.target.value) || 0)}
          />
        </div>
      </div>
      <div className="rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Preview: </span>
        <span className="font-mono font-semibold">{example}</span>
      </div>
    </FormDialog>
  );
}

// ── Reference Data Tab ──────────────────────────────────────────────────────

/**
 * Two of the lists in this picker are records, not key/value rows: a position
 * is what a person's HR record points at, and a helpdesk category is what a
 * ticket points at. They live in their own tables because they carry columns
 * (grade level, description, active flag) that reference data has no room for.
 *
 * Listing them here anyway means an admin has one place to look for "where do
 * I add a department / position / helpdesk category" instead of three. The
 * `Record` tabs render their own table; everything else falls through to the
 * generic key/value editor.
 */
const RECORD_GROUP = {
  positions: 'positions',
  units: 'units',
  timesheet_categories: 'timesheet_category',
  helpdesk_categories: 'helpdesk_categories',
} as const;

type RecordGroup = (typeof RECORD_GROUP)[keyof typeof RECORD_GROUP];

function isRecordGroup(group: string): group is RecordGroup {
  return (
    group === RECORD_GROUP.positions ||
    group === RECORD_GROUP.units ||
    group === RECORD_GROUP.timesheet_categories ||
    group === RECORD_GROUP.helpdesk_categories
  );
}

/**
 * The permission that lets you *write* each record list.
 *
 * This tab is admitted by `procurement.settings.manage`, but a helpdesk
 * category is guarded by `helpdesk.ticket.manage`, a position by
 * `hr.org.manage`, and a timesheet category by `timesheet.settings.manage`.
 * Showing a group to someone who cannot save into it would mean an Add button
 * that answers 403, so the group is hidden instead — and not fetched either, so
 * a procurement-only admin does not pull lists they have no use for.
 */
const RECORD_GROUP_PERMISSION: Record<RecordGroup, string> = {
  [RECORD_GROUP.positions]: 'hr.org.manage',
  // Units are part of the org's shape for the same reason departments are, so
  // they share the grant rather than introducing one of their own.
  [RECORD_GROUP.units]: 'hr.org.manage',
  [RECORD_GROUP.timesheet_categories]: 'timesheet.settings.manage',
  [RECORD_GROUP.helpdesk_categories]: 'helpdesk.ticket.manage',
};

export function ReferenceDataTab() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<RefDataItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<RefDataItem | null>(null);

  const canManagePositions = can(RECORD_GROUP_PERMISSION[RECORD_GROUP.positions]);
  const canManageUnits = can(RECORD_GROUP_PERMISSION[RECORD_GROUP.units]);
  const canManageTimesheetCategories = can(
    RECORD_GROUP_PERMISSION[RECORD_GROUP.timesheet_categories]
  );
  const canManageCategories = can(RECORD_GROUP_PERMISSION[RECORD_GROUP.helpdesk_categories]);

  const { data, isLoading } = useQuery({
    queryKey: ['reference-data'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/reference-data');
      return res.data.data as Record<string, RefDataItem[]>;
    },
  });

  // One fetch feeds both record lists that come back from `/references` —
  // positions and units. Sharing the `['references']` key with the panels means
  // the picker can show a real count while the panel reuses the same rows, and
  // a create in either place invalidates the same entry. Skipped entirely
  // without the matching grant: a read is cheap, but a list you cannot open is
  // not worth one.
  const { data: references } = useQuery({
    queryKey: ['references'],
    queryFn: async () => {
      const res = await apiClient.get('/references');
      return res.data.data as {
        positions: PositionRecord[];
        units: UnitRecord[];
      };
    },
    enabled: canManagePositions || canManageUnits,
  });

  const positions = canManagePositions ? references?.positions : undefined;
  const units = canManageUnits ? references?.units : undefined;

  const { data: categories } = useQuery({
    queryKey: ['helpdesk-categories', 'admin'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/categories?includeInactive=true');
      return res.data.data as HelpdeskCategoryRow[];
    },
    enabled: canManageCategories,
  });

  const groups = useMemo(() => Object.keys(data || {}).sort(), [data]);

  // A user who reached this tab through `hr.org.manage` or
  // `helpdesk.ticket.manage` holds none of the key/value lists' write grant, so
  // opening on group #1 (alphabetically, "asset category") would land them on a
  // screen that refuses every button. Land them on their own list instead.
  const canManageReferenceData = can('admin.settings.manage');
  const defaultRecordGroup: RecordGroup | null = canManagePositions
    ? RECORD_GROUP.positions
    : canManageUnits
      ? RECORD_GROUP.units
      : canManageTimesheetCategories
        ? RECORD_GROUP.timesheet_categories
        : canManageCategories
          ? RECORD_GROUP.helpdesk_categories
          : null;

  const activeGroup = group && (isRecordGroup(group) || groups.includes(group))
    ? group
    : (canManageReferenceData ? groups[0] : defaultRecordGroup) || groups[0] || '';
  const items: RefDataItem[] = (data?.[activeGroup] || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  // RichListBox shows each group with its one-line summary underneath, so the
  // list reads as a set of explained choices instead of bare snake_case keys.
  //
  // Both halves are filtered by grant, not just the record lists: writing a
  // key/value row needs `admin.settings.manage`, which the HR and helpdesk
  // managers who now reach this tab do not hold. Showing them 43 read-only
  // lists they cannot edit would bury the one list they came for. The record
  // lists are appended after the key/value ones so they stay at the bottom
  // where an admin looking for them will find them.
  const groupItems = useMemo(() => {
    const keyValue = canManageReferenceData
      ? groups
          // `timesheet_category` is a key/value group with an editor of its
          // own below; listing it here as well would put the same value in the
          // picker twice and send both entries to different screens.
          .filter((g) => g !== RECORD_GROUP.timesheet_categories)
          .map((g) => ({
            value: g,
            label: humaniseGroup(g),
            description: GROUP_SUMMARY[g] ?? `${(data?.[g] || []).length} values`,
          }))
      : [];
    const records: { value: string; label: string; description: string }[] = [];
    if (canManagePositions) {
      records.push({
        value: RECORD_GROUP.positions,
        label: 'Positions',
        description: `Job titles on an employee's record. ${positions?.length ?? 0} defined.`,
      });
    }
    if (canManageUnits) {
      records.push({
        value: RECORD_GROUP.units,
        label: 'Units',
        description: `Subdivisions of a department, assigned per employee. ${units?.length ?? 0} defined.`,
      });
    }
    // `timesheet_category` is a key/value group, so `admin.settings.manage`
    // reaches it too — the panel is offered to either grant, because both can
    // write it server-side and hiding it from one would hide a list they own.
    if (canManageTimesheetCategories || canManageReferenceData) {
      // `timesheet_category` is a real key/value group and already appears in
      // the list above; this entry points at the panel instead, which is the
      // only place the active/inactive state can be edited.
      records.push({
        value: RECORD_GROUP.timesheet_categories,
        label: 'Timesheet categories',
        description: `What kind of work a timesheet row records. ${(data?.timesheet_category || []).length} active.`,
      });
    }
    if (canManageCategories) {
      records.push({
        value: RECORD_GROUP.helpdesk_categories,
        label: 'Helpdesk categories',
        description: `Categories offered when a ticket is raised. ${categories?.filter((c) => c.isActive).length ?? 0} active.`,
      });
    }
    return [...keyValue, ...records];
  }, [groups, data, positions, units, categories, canManageReferenceData, canManagePositions, canManageUnits, canManageTimesheetCategories, canManageCategories]);

  const deleteMutation = useMutation({
    mutationFn: async (item: RefDataItem) =>
      apiClient.delete(`/settings/reference-data/${item.group}/${item.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-data'] });
      setDeleting(null);
      toast.success('Reference data removed');
    },
    onError: (err: any) => toast.error(errMessage(err, 'Failed to remove item')),
  });

  // A record group owns its own create/edit dialogs and its own Add button
  // label, so the header stays one row in both modes.
  const recordGroup = isRecordGroup(activeGroup) ? activeGroup : null;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 p-4 border-b border-border/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:w-72">
            <Label className='dark:text-gray-400 text-gray-500'>Select Group</Label>
            <RichListBox
              items={groupItems}
              value={activeGroup}
              onChange={setGroup}
              placeholder="Select a group"
              searchPlaceholder="Search groups..."
              emptyMessage="No matching group."
              // Wider than the trigger: the summaries are a sentence, and the
              // default 320px clipped them to "What the money is spent on — hard…".
              contentClassName="w-[440px]"
            />
          </div>
          {/* The record tables render their own Add button beside their title. */}
          {!recordGroup && canManageReferenceData && (
            <Button size="sm" disabled={!activeGroup} onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          )}
        </div>

        {recordGroup === RECORD_GROUP.positions ? (
          <PositionsPanel />
        ) : recordGroup === RECORD_GROUP.units ? (
          <UnitsPanel />
        ) : recordGroup === RECORD_GROUP.timesheet_categories ? (
          <TimesheetCategoriesPanel />
        ) : recordGroup === RECORD_GROUP.helpdesk_categories ? (
          <HelpdeskCategoriesPanel />
        ) : isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !activeGroup ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No reference data groups</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm font-medium">No items in "{humaniseGroup(activeGroup)}"</p>
            {canManageReferenceData && (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add first item
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-2">Order</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="tabular-nums text-muted-foreground text-center dark:text-gray-400 text-gray-500">{item.sortOrder}</TableCell>
                  <TableCell className="font-medium dark:text-gray-400 text-gray-500">{displayLabel(item.label)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono font-normal dark:text-gray-400 text-gray-500">{item.value}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Remove" onClick={() => setDeleting(item)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {(adding || editing) && (
        <RefDataDialog
          group={activeGroup}
          item={editing}
          nextSortOrder={items.length ? Math.max(...items.map((i) => i.sortOrder)) + 1 : 1}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Remove reference data?"
          description={`"${displayLabel(deleting.label)}" will be hidden from dropdowns that use the "${humaniseGroup(deleting.group)}" group.`}
          confirmLabel="Remove"
          onConfirm={() => deleteMutation.mutate(deleting)}
          isConfirming={deleteMutation.isPending}
        />
      )}
    </Card>
  );
}

function RefDataDialog({
  group,
  item,
  nextSortOrder,
  onClose,
}: {
  group: string;
  item: RefDataItem | null;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(item?.label || '');
  const [value, setValue] = useState(item?.value || '');
  const [sortOrder, setSortOrder] = useState(item?.sortOrder ?? nextSortOrder);

  const mutation = useMutation({
    mutationFn: async () => {
      if (item) {
        return apiClient.put(`/settings/reference-data/${group}/${item.id}`, {
          label,
          sortOrder: Number(sortOrder),
        });
      }
      return apiClient.post(`/settings/reference-data/${group}`, {
        label,
        value,
        sortOrder: Number(sortOrder),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reference-data'] });
      toast.success(item ? 'Reference data updated' : 'Reference data added');
      onClose();
    },
    onError: (err: any) => toast.error(errMessage(err, 'Failed to save reference data')),
  });

  const handleSubmit = () => {
    if (!label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (!item && !value.trim()) {
      toast.error('Value is required');
      return;
    }
    mutation.mutate();
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={item ? `Edit ${humaniseGroup(group)}` : `Add ${humaniseGroup(group)} item`}
      maxWidth="sm"
      onSubmit={handleSubmit}
      submitLabel={item ? 'Save' : 'Add'}
      isSubmitting={mutation.isPending}
    >
      <div className="space-y-2">
        <Label className='dark:text-gray-400 text-gray-500'>Label *</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label" />
      </div>
      {!item && (
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Value *</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Stored value" />
        </div>
      )}
      <div className="space-y-2">
        <Label className='dark:text-gray-400 text-gray-500'>Sort Order</Label>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
        />
      </div>
    </FormDialog>
  );
}
