import { useEffect, useState } from 'react';
import { FormDialog } from '@/components/ui/form-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ScopeItem, ScopeItemPayload } from '@/api/scope';
import { toLocalDateStr } from '@/lib/utils';

/**
 * Add/edit scope item. `parentTitle` is fixed context — parenting is chosen by
 * where the dialog was opened from (add child / add sibling), not in the form.
 */
export function ScopeItemDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  item,
  parentTitle,
  teamMembers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ScopeItemPayload) => void;
  isSubmitting: boolean;
  item: ScopeItem | null;
  parentTitle: string | null;
  teamMembers: { userId: number; name: string }[];
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [roleCodes, setRoleCodes] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [status, setStatus] = useState<ScopeItem['status']>('planned');

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? '');
    setDescription(item?.description ?? '');
    setStartDate(item?.startDate ? toLocalDateStr(new Date(item.startDate)) : '');
    setEndDate(item?.endDate ? toLocalDateStr(new Date(item.endDate)) : '');
    setRoleCodes((item?.roleCodes ?? []).join(', '));
    setAssigneeUserId(item?.assigneeUserId ? String(item.assigneeUserId) : '');
    setStatus(item?.status ?? 'planned');
  }, [open, item]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const roles = roleCodes
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      roleCodes: roles.length ? roles : null,
      assigneeUserId: assigneeUserId ? Number(assigneeUserId) : null,
      status,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'Edit Scope Item' : 'Add Scope Item'}
      description={parentTitle ? `Under: ${parentTitle}` : undefined}
      submitLabel={item ? 'Save Changes' : 'Add Item'}
      isSubmitting={isSubmitting}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Phase 1: Requirements Study" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deliverables, notes…" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date</Label>
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Select start" />
        </div>
        <div className="space-y-2">
          <Label>End Date</Label>
          <DatePicker value={endDate} onChange={setEndDate} placeholder="Select end" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Role Codes</Label>
        <Input
          value={roleCodes}
          onChange={(e) => setRoleCodes(e.target.value)}
          placeholder="PM, APM, GIS-L (comma separated)"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Assignee</Label>
          <Select value={assigneeUserId || 'none'} onValueChange={(v) => setAssigneeUserId(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {teamMembers.map((member) => (
                <SelectItem key={member.userId} value={String(member.userId)}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ScopeItem['status'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </FormDialog>
  );
}
