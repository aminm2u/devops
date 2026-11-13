import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { RichListBox } from '@/components/ui/rich-listbox';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import apiClient from '@/api/client';
import { accessApi } from '@/api/access';
import { timesheetApi } from '@/api/timesheet';
import { useTimesheetRules } from '@/hooks/useTimeEntries';
import type { TimesheetApprovalRule, TimesheetApproverType } from '@/types';

// ─── Approval rules ─────────────────────────────────────────────────────────

const APPROVER_TYPE_LABELS: Record<TimesheetApproverType, string> = {
  project_role: 'Project role',
  users: 'Specific users',
  direct_manager: 'Direct manager',
  app_role: 'App role',
};

export function TimesheetRulesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TimesheetApprovalRule | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<TimesheetApprovalRule | null>(null);

  const { data: rules = [], isLoading } = useTimesheetRules();

  const deleteMutation = useMutation({
    mutationFn: (rule: TimesheetApprovalRule) => timesheetApi.deleteRule(rule.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet-rules'] });
      setDeleting(null);
      toast.success('Rule deleted');
    },
    onError: () => toast.error('Failed to delete rule'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      timesheetApi.updateRule(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet-rules'] });
      toast.success('Rule updated');
    },
    onError: () => toast.error('Failed to update rule'),
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <div>
            <h3 className="text-sm font-semibold">Approval Routing Rules</h3>
            <p className="text-xs text-muted-foreground">
              First matching rule (by sort order) decides who approves a submitted entry.
            </p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Rule
          </Button>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading rules...</div>
        ) : rules.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium">No approval rules</p>
            <p className="text-xs text-muted-foreground mt-1">
              Without rules, approvers fall back to project owner → direct manager → super-admin.
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add first rule
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 pl-3">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Matches</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className={rule.isActive ? 'dark:text-gray-400 text-gray-500' : 'opacity-60'}>
                  <TableCell className="tabular-nums text-muted-foreground text-center">{rule.sortOrder}</TableCell>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(rule.categoryValue ?? '').split(',').map((c) => c.trim()).filter(Boolean).length ? (
                        (rule.categoryValue ?? '').split(',').map((c) => c.trim()).filter(Boolean).map((cat) => (
                          <Badge key={cat} variant="outline" className="text-[10px] capitalize dark:text-gray-400 text-gray-500">
                            {cat}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline" className="text-[10px] capitalize dark:text-gray-400 text-gray-500">
                          Any category
                        </Badge>
                      )}
                      {rule.projectId != null && (
                        <Badge variant="outline" className="text-[10px] dark:text-gray-400 text-gray-500">
                          Project #{rule.projectId}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] dark:text-gray-400 text-gray-500">
                        {rule.appliesTo?.length
                          ? `${rule.appliesTo.length} user${rule.appliesTo.length === 1 ? '' : 's'}`
                          : 'All users'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{APPROVER_TYPE_LABELS[rule.approverType] ?? rule.approverType}</div>
                    <div className="text-xs text-muted-foreground">
                      {rule.approverType === 'project_role' && (rule.projectRole?.name ?? `Role #${rule.projectRoleId}`)}
                      {rule.approverType === 'users' && (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {(rule.approvers ?? []).map((a, i) => (
                            <span key={`${a.step}-${a.userId}`} className="inline-flex items-center gap-1">
                              {i > 0 && <span className="text-muted-foreground/60">→</span>}
                              <span>
                                <span className="tabular-nums text-[10px] mr-0.5">{a.step}.</span>
                                {a.user?.name ?? `#${a.userId}`}
                              </span>
                            </span>
                          ))}
                          {!rule.approvers?.length && '—'}
                        </span>
                      )}
                      {rule.approverType === 'direct_manager' && "Submitter's direct manager"}
                      {rule.approverType === 'app_role' && rule.appRole}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: rule.id, isActive: v })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Edit" onClick={() => setEditing(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleting(rule)}>
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
        <RuleDialog
          rule={editing}
          nextSortOrder={rules.length ? Math.max(...rules.map((r) => r.sortOrder)) + 1 : 1}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDeleting(null); }}
          title="Delete approval rule?"
          description={`"${deleting.name}" will no longer route approvals.`}
          onConfirm={() => deleteMutation.mutate(deleting)}
        />
      )}
    </Card>
  );
}

function RuleDialog({
  rule,
  nextSortOrder,
  onClose,
}: {
  rule: TimesheetApprovalRule | null;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  // Approver roles are whatever exists in Access Control — no hardcoded list.
  const { data: roles = [] } = useQuery({
    queryKey: ['access', 'roles'],
    queryFn: () => accessApi.getRoles(),
    staleTime: 5 * 60 * 1000,
  });

  const [name, setName] = useState(rule?.name || '');
  const [sortOrder, setSortOrder] = useState(rule?.sortOrder ?? nextSortOrder);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [categoryValues, setCategoryValues] = useState<string[]>(
    (rule?.categoryValue ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  );
  const [projectId, setProjectId] = useState(rule?.projectId ? String(rule.projectId) : '');
  const [approverType, setApproverType] = useState<TimesheetApproverType>(
    rule?.approverType ?? 'direct_manager'
  );
  const [projectRoleId, setProjectRoleId] = useState(
    rule?.projectRoleId ? String(rule.projectRoleId) : ''
  );
  const [appRole, setAppRole] = useState(rule?.appRole ?? '');
  // Submitters this rule applies to (empty = everyone).
  const [appliesToUserIds, setAppliesToUserIds] = useState<string[]>(
    (rule?.appliesTo || []).map((a) => String(a.userId))
  );
  // `users` approver type: ordered chain. `approvalMode` only drives the picker
  // UI (single rich-list vs ordered multi-list) — the payload is the same list.
  const [approvalMode, setApprovalMode] = useState<'single' | 'multi'>(
    (rule?.approvers?.length ?? 0) > 1 ? 'multi' : 'single'
  );
  const [approverIds, setApproverIds] = useState<string[]>(
    (rule?.approvers || []).map((a) => String(a.userId))
  );

  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.get('/admin/users', { params: { limit: 500 } }).then((r) => r.data.data),
  });
  const { data: refs } = useQuery({
    queryKey: ['references'],
    queryFn: () => apiClient.get('/references').then((r) => r.data.data),
  });
  const { data: projectsData } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => apiClient.get('/projects', { params: { limit: 200 } }).then((r) => r.data.data),
  });

  const projectRoles: any[] = refs?.projectRoles || [];
  const users: any[] = Array.isArray(usersData) ? usersData : usersData?.data || [];
  const projects: any[] = Array.isArray(projectsData) ? projectsData : projectsData?.data || [];

  const userOptions = users.map((u) => ({ value: String(u.id), label: u.name }));
  const userLabel = (id: string) => userOptions.find((o) => o.value === id)?.label ?? `#${id}`;

  const moveApprover = (index: number, dir: -1 | 1) => {
    setApproverIds((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const usersTypeNeedsApprover = approverType === 'users' && approverIds.length === 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        isActive,
        sortOrder: Number(sortOrder),
        categoryValues,
        projectId: projectId ? Number(projectId) : null,
        approverType,
        projectRoleId: approverType === 'project_role' && projectRoleId ? Number(projectRoleId) : null,
        appRole: approverType === 'app_role' ? appRole || null : null,
        appliesToUserIds: appliesToUserIds.map(Number),
        userIds: approverType === 'users' ? approverIds.map(Number) : [],
      };
      if (rule) return timesheetApi.updateRule(rule.id, payload);
      return timesheetApi.createRule(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet-rules'] });
      toast.success(rule ? 'Rule updated' : 'Rule created');
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.errors?.categoryValues?.[0] ??
        err?.response?.data?.errors?.appliesToUserIds?.[0] ??
        err?.response?.data?.errors?.userIds?.[0] ??
        err?.response?.data?.message;
      if (msg) toast.error(msg);
      else toast.error('Failed to save rule');
    },
  });

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={rule ? 'Edit Approval Rule' : 'Add Approval Rule'}
      maxWidth="lg"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || usersTypeNeedsApprover) return;
        mutation.mutate();
      }}
      submitLabel={rule ? 'Save' : 'Create'}
      isSubmitting={mutation.isPending}
      submitDisabled={!name.trim() || usersTypeNeedsApprover}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className='dark:text-gray-400 text-gray-500'>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Project work → PM" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="rule-active" />
              <Label htmlFor="rule-active" className="cursor-pointer">Active</Label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className='dark:text-gray-400 text-gray-500'>Category</Label>
            <MultiSelect
              options={[
                { value: 'project', label: 'Project' },
                { value: 'management', label: 'Management' },
                { value: 'programme', label: 'Programme' },
                { value: 'others', label: 'Others' },
              ]}
              selected={categoryValues}
              onChange={(vals) => {
                setCategoryValues(vals);
                // Project scoping only makes sense for project hours; drop it
                // when no selected category is "project".
                if (!vals.includes('project')) setProjectId('');
              }}
              placeholder="Any category (select to restrict)"
            />
          </div>
          {/* Project scoping only applies when "project" is among the chosen
              categories — other categories aren't tied to a project. */}
          {categoryValues.includes('project') && (
            <div className="space-y-2">
              <Label className='dark:text-gray-400 text-gray-500'>Project</Label>
              <Select value={projectId || 'any'} onValueChange={(v) => setProjectId(v === 'any' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Any project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* ── Who this rule applies to ─────────────────────────────── */}
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Applies to</Label>
          <RichListBox
            multiple
            items={users.map((u) => ({
              value: String(u.id),
              label: u.name,
              description: u.department?.name ?? u.email,
            }))}
            values={appliesToUserIds}
            onValuesChange={setAppliesToUserIds}
            placeholder="All users (select to restrict)"
            searchPlaceholder="Search users..."
            emptyMessage="No users found."
          />
          <p className="text-xs text-muted-foreground">
            {appliesToUserIds.length === 0
              ? 'Empty means the rule matches everyone. A user can belong to only one rule at a time.'
              : `Only these ${appliesToUserIds.length} user${appliesToUserIds.length === 1 ? '' : 's'} follow this rule's approval flow when they submit a timesheet.`}
          </p>
        </div>

        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-500'>Approver type</Label>
          <Select value={approverType} onValueChange={(v) => setApproverType(v as TimesheetApproverType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(APPROVER_TYPE_LABELS) as TimesheetApproverType[]).map((t) => (
                <SelectItem key={t} value={t}>{APPROVER_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {approverType === 'project_role' && (
          <div className="space-y-2">
            <Label className='dark:text-gray-400 text-gray-500'>Project role</Label>
            <Select value={projectRoleId} onValueChange={setProjectRoleId}>
              <SelectTrigger><SelectValue placeholder="Select project role..." /></SelectTrigger>
              <SelectContent>
                {projectRoles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Resolved from the entry's project team. Skips the submitter.
            </p>
          </div>
        )}

        {approverType === 'users' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className='dark:text-gray-400 text-gray-500'>Approval level</Label>
              <Select
                value={approvalMode}
                onValueChange={(v) => {
                  const mode = v as 'single' | 'multi';
                  setApprovalMode(mode);
                  // Switching to single-level keeps only the first approver.
                  if (mode === 'single') setApproverIds((prev) => prev.slice(0, 1));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single level — one approver</SelectItem>
                  <SelectItem value="multi">Multiple levels — sequential approvers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {approvalMode === 'single' ? (
              <div className="space-y-2">
                <Label className='dark:text-gray-400 text-gray-500'>Approver</Label>
                <RichListBox
                  items={userOptions.map((o) => ({
                    value: o.value,
                    label: o.label,
                    description: users.find((u) => String(u.id) === o.value)?.email,
                  }))}
                  value={approverIds[0] ?? ''}
                  onChange={(v) => setApproverIds(v ? [v] : [])}
                  placeholder="Select approver..."
                  searchPlaceholder="Search users..."
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label className='dark:text-gray-400 text-gray-500'>Approvers (in order)</Label>
                <MultiSelect
                  options={userOptions}
                  selected={approverIds}
                  onChange={setApproverIds}
                  placeholder="Select approvers — selection order is the approval order"
                />
                {approverIds.length > 0 && (
                  <div className="rounded-md border border-border/60 divide-y divide-border/60">
                    {approverIds.map((id, i) => (
                      <div key={id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <Badge variant="secondary" className="text-[10px] tabular-nums">
                          Step {i + 1}
                        </Badge>
                        <span className="flex-1 truncate">{userLabel(id)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5"
                          disabled={i === 0}
                          onClick={() => moveApprover(i, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5"
                          disabled={i === approverIds.length - 1}
                          onClick={() => moveApprover(i, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Each step must approve before the entry reaches the next one. The submitter is skipped wherever they appear.
                </p>
              </div>
            )}
          </div>
        )}

        {approverType === 'direct_manager' && (
          <p className="text-xs text-muted-foreground">
            Routes to the submitter's direct manager (from their user profile).
          </p>
        )}

        {approverType === 'app_role' && (
          <div className="space-y-2">
            <Label className='dark:text-gray-400 text-gray-500'>App role</Label>
            <Select value={appRole} onValueChange={setAppRole}>
              <SelectTrigger><SelectValue placeholder="Select app role..." /></SelectTrigger>
              <SelectContent>
                {/* Roles are data now — the list comes from Access Control, so a
                    role created there is immediately usable as an approver. */}
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.name}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Routes to any user holding this application role. Skips the submitter.
            </p>
          </div>
        )}
      </div>
    </FormDialog>
  );
}
