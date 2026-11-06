import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import apiClient from '@/api/client';
import { accessApi } from '@/api/access';
import { timesheetApi } from '@/api/timesheet';
import { useTimesheetRules } from '@/hooks/useTimeEntries';
import { useReferenceData } from '@/hooks/useReferenceData';
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
                      <Badge variant="outline" className="text-[10px] capitalize dark:text-gray-400 text-gray-500">
                        {rule.categoryValue ?? 'Any category'}
                      </Badge>
                      {rule.projectId != null && (
                        <Badge variant="outline" className="text-[10px] dark:text-gray-400 text-gray-500">
                          Project #{rule.projectId}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{APPROVER_TYPE_LABELS[rule.approverType] ?? rule.approverType}</div>
                    <div className="text-xs text-muted-foreground">
                      {rule.approverType === 'project_role' && (rule.projectRole?.name ?? `Role #${rule.projectRoleId}`)}
                      {rule.approverType === 'users' &&
                        (rule.users?.map((u) => u.user?.name ?? `#${u.userId}`).join(', ') || '—')}
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
  const [categoryValue, setCategoryValue] = useState(rule?.categoryValue ?? '');
  const [projectId, setProjectId] = useState(rule?.projectId ? String(rule.projectId) : '');
  const [approverType, setApproverType] = useState<TimesheetApproverType>(
    rule?.approverType ?? 'direct_manager'
  );
  const [projectRoleId, setProjectRoleId] = useState(
    rule?.projectRoleId ? String(rule.projectRoleId) : ''
  );
  const [appRole, setAppRole] = useState(rule?.appRole ?? '');
  const [userIds, setUserIds] = useState<string[]>(
    (rule?.users || []).map((u) => String(u.userId))
  );

  const { data: categories } = useReferenceData('timesheet_category');
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

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        isActive,
        sortOrder: Number(sortOrder),
        categoryValue: categoryValue || null,
        projectId: projectId ? Number(projectId) : null,
        approverType,
        projectRoleId: approverType === 'project_role' && projectRoleId ? Number(projectRoleId) : null,
        appRole: approverType === 'app_role' ? appRole || null : null,
        userIds: approverType === 'users' ? userIds.map(Number) : [],
      };
      if (rule) return timesheetApi.updateRule(rule.id, payload);
      return timesheetApi.createRule(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet-rules'] });
      toast.success(rule ? 'Rule updated' : 'Rule created');
      onClose();
    },
    onError: () => toast.error('Failed to save rule'),
  });

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={rule ? 'Edit Approval Rule' : 'Add Approval Rule'}
      maxWidth="lg"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        mutation.mutate();
      }}
      submitLabel={rule ? 'Save' : 'Create'}
      isSubmitting={mutation.isPending}
      submitDisabled={!name.trim()}
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
            <Label className='dark:text-gray-400 text-gray-500'>Category (empty = any)</Label>
            <Select value={categoryValue || 'any'} onValueChange={(v) => setCategoryValue(v === 'any' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Any category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any category</SelectItem>
                {(categories || []).map((c: any) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className='dark:text-gray-400 text-gray-500'>Project (empty = any)</Label>
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
          <div className="space-y-2">
            <Label className='dark:text-gray-400 text-gray-500'>Approvers</Label>
            <MultiSelect
              options={users.map((u) => ({ value: String(u.id), label: u.name }))}
              selected={userIds}
              onChange={setUserIds}
              placeholder="Select users..."
            />
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
