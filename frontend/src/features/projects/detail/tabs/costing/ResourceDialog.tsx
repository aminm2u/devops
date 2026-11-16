import { useEffect, useState } from 'react';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichListBox } from '@/components/ui/rich-listbox';
import apiClient from '@/api/client';
import type { ResourceAssignment, ResourcePayload } from '@/api/costing';

/**
 * Add/edit one row of the resources cost block (person × rate × weeks).
 *
 * The name is a searchable picker over every active system user; adding one
 * also enrolls them on the project team (with the chosen project role) — the
 * save handler does that after the costing line lands. Users already on the
 * team are offered but marked.
 */

export interface ResourceDialogUser {
  id: number;
  name: string;
  email: string;
}

export interface ResourceDialogRole {
  id: number;
  name: string;
}

export function ResourceDialog({
  open,
  onOpenChange,
  onSubmit,
  canEnroll,
  isSubmitting,
  resource,
  teamMembers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called with the line payload plus the picked user id, and an `enroll`
   * intent (userId + role) when a role was chosen for a new line — the caller
   * enrolls and links the assignment after the costing line has actually
   * saved, never before.
   */
  onSubmit: (data: ResourcePayload & {
    pickedUserId: number;
    enroll?: { userId: number; projectRoleId: number };
  }) => void;
  /** Whether the caller can enroll (project.team.manage); gates the role field. */
  canEnroll: boolean;
  isSubmitting: boolean;
  resource: ResourceAssignment | null;
  teamMembers: { userId: number }[];
}) {
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [users, setUsers] = useState<ResourceDialogUser[]>([]);
  const [roles, setRoles] = useState<ResourceDialogRole[]>([]);
  const [costPerDay, setCostPerDay] = useState('0');
  const [weeksRequired, setWeeksRequired] = useState('0');
  const [daysPerWeek, setDaysPerWeek] = useState('5');
  const [remarks, setRemarks] = useState('');

  // Load the user directory and project roles once when first opened.
  // /admin/users/list (not /admin/users) — the paginated directory is gated by
  // hr.user.view, which costing managers don't hold; users/list only needs a
  // session and returns the id/name/email the picker shows.
  useEffect(() => {
    if (!open) return;
    if (users.length === 0) {
      apiClient
        .get('/admin/users/list')
        .then((res: any) => setUsers(res.data.data ?? []))
        .catch(() => undefined);
    }
    if (roles.length === 0) {
      apiClient
        .get('/references')
        .then((res) => setRoles(res.data.data?.projectRoles ?? []))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Resolve the picker value: prefer the stored team-assignment link, fall
    // back to matching the line's name against the directory (lines saved
    // before the link existed carry only the name).
    const linkedId = resource?.teamAssignment?.user?.id;
    const matched = users.find((candidate) => candidate.name === resource?.name);
    setUserId(
      linkedId
        ? String(linkedId)
        : matched
          ? String(matched.id)
          : resource
            ? ''
            : ''
    );
    setRoleId('');
    setCostPerDay(resource ? String(resource.costPerDay) : '0');
    setWeeksRequired(resource ? String(resource.weeksRequired) : '0');
    setDaysPerWeek(resource ? String(resource.daysPerWeek) : '5');
    setRemarks(resource?.remarks ?? '');
    // Re-runs when the directory arrives, so the name-match can fill the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resource, users]);

  const selectedUser = users.find((candidate) => String(candidate.id) === userId);
  const selectedRole = roles.find((role) => String(role.id) === roleId);
  const budget = Number(costPerDay || 0) * Number(weeksRequired || 0) * Number(daysPerWeek || 5);

  const handleSubmit = () => {
    if (!userId) return;
    // Position code is the project role's name — it labels the workbook-style
    // Position column, so the two can't drift apart.
    const position = selectedRole?.name ?? resource?.positionCode ?? 'Member';
    onSubmit({
      positionCode: position,
      teamAssignmentId: resource?.teamAssignmentId ?? null,
      name: selectedUser?.name ?? '',
      costPerDay: Number(costPerDay || 0),
      weeksRequired: Number(weeksRequired || 0),
      daysPerWeek: Number(daysPerWeek || 5),
      remarks: remarks.trim() || null,
      pickedUserId: Number(userId),
      // Only new lines enroll, and only when the caller has the permission
      enroll:
        !resource && canEnroll && roleId
          ? { userId: Number(userId), projectRoleId: Number(roleId) }
          : undefined,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={resource ? 'Edit Resource' : 'Add Resource'}
      submitLabel={resource ? 'Save Changes' : 'Add Resource'}
      isSubmitting={isSubmitting}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="space-y-2">
        <Label className='dark:text-gray-400 text-gray-800'>Name *</Label>
        <RichListBox
          value={userId}
          onChange={(value) => setUserId(value)}
          items={[
            // The line's own user first, so an edit shows the current person
            // even if they were deactivated since the line was saved.
            ...(resource && userId && !users.some((u) => String(u.id) === userId)
              ? [{ value: userId, label: resource.name, description: 'Not in the active directory' }]
              : []),
            ...users.map((candidate) => ({
              value: String(candidate.id),
              label: candidate.name,
              description: candidate.email,
              disabled: !resource && teamMembers.some((member) => member.userId === candidate.id),
            })),
          ]}
          placeholder="Pick a user..."
          searchPlaceholder="Search users..."
          emptyMessage="No users found."
        />
      </div>
      {canEnroll && (
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-800'>
            Project Role{' '}
            {!resource && <span className="text-xs text-muted-foreground">(enrolls them on the team)</span>}
          </Label>
          <RichListBox
            value={roleId}
            onChange={setRoleId}
            items={roles.map((role) => ({
              value: String(role.id),
              label: role.name,
            }))}
            placeholder="Assign a role..."
            searchPlaceholder="Search roles..."
            emptyMessage="No roles found."
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-800'>Cost / Day</Label>
          <Input type="number" min={0} step="any" value={costPerDay} onChange={(e) => setCostPerDay(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-800'>Weeks</Label>
          <Input type="number" min={0} step="any" value={weeksRequired} onChange={(e) => setWeeksRequired(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className='dark:text-gray-400 text-gray-800'>Days / Week</Label>
          <Input type="number" min={1} max={7} value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end text-sm text-muted-foreground">
        Budget:{' '}
        <span className="ml-1 font-medium text-foreground">
          MYR {budget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="space-y-2">
        <Label className='dark:text-gray-400 text-gray-800'>Remarks</Label>
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
      </div>
    </FormDialog>
  );
}
