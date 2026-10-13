import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { errMessage } from '@/lib/errors';
import {
  SlidersHorizontal,
  ShieldCheck,
  Hash,
  Database,
  Plus,
  Pencil,
  Trash2,
  Users,
  Info,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';
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
  yearFormat: 'YYYY' | 'YY';
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

// ── Main Page ───────────────────────────────────────────────────────────────

export function ProcurementSettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Procurement Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure approval workflows, document numbering and reference data
          </p>
        </div>
      </div>

      <Tabs defaultValue="approval-policies">
        <TabsList>
          <TabsTrigger value="approval-policies" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Approval Policies
          </TabsTrigger>
          <TabsTrigger value="numbering" className="gap-2">
            <Hash className="h-4 w-4" />
            Numbering
          </TabsTrigger>
          <TabsTrigger value="reference-data" className="gap-2">
            <Database className="h-4 w-4" />
            Reference Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approval-policies" className="mt-4">
          <ApprovalPoliciesTab />
        </TabsContent>
        <TabsContent value="numbering" className="mt-4">
          <NumberingTab />
        </TabsContent>
        <TabsContent value="reference-data" className="mt-4">
          <ReferenceDataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Approval Policies Tab ───────────────────────────────────────────────────

const emptyTiers: ApprovalTier[] = [{ minAmount: 0, maxAmount: 1000, requiredApprovals: 1 }];

function ApprovalPoliciesTab() {
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

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/30 p-4">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          Policies are matched to a requisition by <strong className="text-foreground">Budget Type + Division</strong>,
          falling back to Budget Type only, Division only, then a global policy. The requisition amount must fall
          within a tier to determine how many of the assigned approvers (in order) must approve.
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {policies.length} {policies.length === 1 ? 'policy' : 'policies'} configured
        </p>
        <Button onClick={() => { setEditing(null); setShowDialog(true); }}>
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
        <div className="grid gap-4 lg:grid-cols-2">
          {policies.map((policy) => (
            <Card key={policy.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{policy.name}</p>
                      {!policy.isActive && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    {policy.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{policy.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" title="Edit" onClick={() => { setEditing(policy); setShowDialog(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleting(policy)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                {/* Scope */}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scope</span>
                  <Badge variant="outline">{policy.budgetType || 'Any budget type'}</Badge>
                  <Badge variant="outline">{policy.division || 'Any division'}</Badge>
                </div>

                {/* Tiers */}
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Amount Tiers</p>
                  <div className="flex flex-wrap gap-1.5">
                    {policy.tiers.map((t, i) => (
                      <Badge key={i} variant="secondary" className="font-normal">
                        {formatCurrency(Number(t.minAmount))} – {formatCurrency(Number(t.maxAmount))} → {t.requiredApprovals} approval{t.requiredApprovals > 1 ? 's' : ''}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Approvers */}
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Approvers (in order)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {policy.assignments.map((a, i) => (
                      <Badge key={a.id} variant="outline" className="gap-1.5 font-normal">
                        <span className="h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                        {a.user?.name || `User #${a.userId}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
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

  // Reference data for scope selects
  const { data: refData } = useQuery({
    queryKey: ['reference-data'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/reference-data');
      return res.data.data as Record<string, RefDataItem[]>;
    },
  });
  const budgetTypes = refData?.budget_type || [];
  const divisions = refData?.division || [];

  // Users for approver picker
  const { data: userData } = useQuery({
    queryKey: ['users-for-approval'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/users', { params: { limit: 500 } });
      return res.data.data as UserOption[];
    },
  });
  const users: UserOption[] = userData || [];

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
          <Label>Policy Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Departmental Approval"
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div className="space-y-2">
          <Label>Budget Type</Label>
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
          <Label>Division</Label>
          <Select value={division} onValueChange={setDivision}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any division</SelectItem>
              {divisions.map((d) => (
                <SelectItem key={d.id} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Amount Tiers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            Amount Tiers
            <Badge variant="secondary">{tiers.length}</Badge>
          </Label>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => {
              const last = tiers[tiers.length - 1];
              setTiers([...tiers, { minAmount: Number(last.maxAmount) + 1, maxAmount: Number(last.maxAmount) + 1000, requiredApprovals: 1 }]);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Tier
          </Button>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10"></TableHead>
                <TableHead>Min Amount (RM)</TableHead>
                <TableHead>Max Amount (RM)</TableHead>
                <TableHead className="w-36">Required Approvals</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier, index) => (
                <TableRow key={index}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.minAmount}
                      onChange={(e) => updateTier(index, 'minAmount', parseFloat(e.target.value) || 0)}
                      className="h-8 border-border/40 shadow-none"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.maxAmount}
                      onChange={(e) => updateTier(index, 'maxAmount', parseFloat(e.target.value) || 0)}
                      className="h-8 border-border/40 shadow-none"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(tier.requiredApprovals)}
                      onValueChange={(v) => updateTier(index, 'requiredApprovals', parseInt(v, 10))}
                    >
                      <SelectTrigger className="h-8 border-border/40 shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: Math.max(approverIds.length, 1) }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} approver{n > 1 ? 's' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600"
                      disabled={tiers.length <= 1}
                      onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Approvers */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Approvers
          {approverIds.length > 0 && <Badge variant="secondary">{approverIds.length} selected</Badge>}
        </Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Tick users in approval order — the first user ticked approves first.
        </p>
        <div className="rounded-lg border border-border/40 bg-muted/20 max-h-56 overflow-y-auto">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No users found</p>
          ) : (
            users.map((user) => {
              const orderIndex = approverIds.indexOf(user.id);
              const checked = orderIndex !== -1;
              return (
                <label
                  key={user.id}
                  className="flex items-center gap-3 px-3 py-2 border-b border-border/40 last:border-0 hover:bg-muted/40 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleApprover(user.id)}
                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer shrink-0"
                  />
                  {checked && (
                    <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                      {orderIndex + 1}
                    </span>
                  )}
                  <span className="text-sm min-w-0">
                    <span className="block truncate">{user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        {approverIds.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Order: {approverIds.map((id, i) => `${i + 1}. ${userName(id)}`).join('  →  ')}
          </p>
        )}
      </div>
    </FormDialog>
  );
}

// ── Numbering Tab ───────────────────────────────────────────────────────────

function NumberingTab() {
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
                <TableHead>Document Type</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Separator</TableHead>
                <TableHead>Year Format</TableHead>
                <TableHead>Digits</TableHead>
                <TableHead>Counter</TableHead>
                <TableHead>Example</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">{config.refType}</TableCell>
                  <TableCell className="font-mono">{config.prefix}</TableCell>
                  <TableCell className="font-mono">{config.separator}</TableCell>
                  <TableCell>{config.yearFormat}</TableCell>
                  <TableCell className="tabular-nums">{config.digitPadding}</TableCell>
                  <TableCell className="tabular-nums">{config.currentCounter}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono font-normal">
                      {config.example || `${config.prefix}${config.separator}${new Date().getFullYear()}${config.separator}${String(config.currentCounter).padStart(config.digitPadding, '0')}`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
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

  const example = `${prefix}${separator}${yearFormat === 'YY' ? String(new Date().getFullYear()).slice(-2) : new Date().getFullYear()}${separator}${String(currentCounter).padStart(Number(digitPadding) || 0, '0')}`;

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={`Numbering — ${config.refType}`}
      description="Configure how reference numbers are generated for this document type"
      maxWidth="sm"
      onSubmit={() => mutation.mutate()}
      submitLabel="Save"
      isSubmitting={mutation.isPending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Prefix</Label>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="font-mono" />
        </div>
        <div className="space-y-2">
          <Label>Separator</Label>
          <Input value={separator} onChange={(e) => setSeparator(e.target.value)} className="font-mono" maxLength={5} />
        </div>
        <div className="space-y-2">
          <Label>Year Format</Label>
          <Select value={yearFormat} onValueChange={(v: 'YYYY' | 'YY') => setYearFormat(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YYYY">YYYY (2026)</SelectItem>
              <SelectItem value="YY">YY (26)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Digit Padding</Label>
          <Input
            type="number"
            min={3}
            max={8}
            value={digitPadding}
            onChange={(e) => setDigitPadding(parseInt(e.target.value) || 4)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Current Counter</Label>
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

function ReferenceDataTab() {
  const queryClient = useQueryClient();
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<RefDataItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<RefDataItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reference-data'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/reference-data');
      return res.data.data as Record<string, RefDataItem[]>;
    },
  });

  const groups = Object.keys(data || {}).sort();
  const activeGroup = group && groups.includes(group) ? group : groups[0] || '';
  const items: RefDataItem[] = (data?.[activeGroup] || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

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

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 p-4 border-b border-border/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:w-64">
            <Select value={activeGroup} onValueChange={setGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g} value={g}>{g.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!activeGroup}
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>

        {isLoading ? (
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
            <p className="text-sm font-medium">No items in "{activeGroup}"</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add first item
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Order</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{item.sortOrder}</TableCell>
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono font-normal">{item.value}</Badge>
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
          description={`"${deleting.label}" will be hidden from dropdowns that use the "${deleting.group}" group.`}
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
      title={item ? `Edit ${group.replace(/_/g, ' ')}` : `Add ${group.replace(/_/g, ' ')} item`}
      maxWidth="sm"
      onSubmit={handleSubmit}
      submitLabel={item ? 'Save' : 'Add'}
      isSubmitting={mutation.isPending}
    >
      <div className="space-y-2">
        <Label>Label *</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display label" />
      </div>
      {!item && (
        <div className="space-y-2">
          <Label>Value *</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Stored value" />
        </div>
      )}
      <div className="space-y-2">
        <Label>Sort Order</Label>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
        />
      </div>
    </FormDialog>
  );
}
