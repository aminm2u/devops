import { useState, useEffect } from 'react';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Timer, ListTodo, CheckCircle2 } from 'lucide-react';
import { todayLocal } from '@/lib/utils';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';
import {
  useMyTasks,
  useCreateTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  useSubmitTimeEntry,
  useRecallTimeEntry,
} from '@/hooks/useTimeEntries';
import type { TimeEntry } from '@/types';

interface TimeEntryFormDialogProps {
  open: boolean;
  onClose: () => void;
  entry?: TimeEntry | null; // null = create
  defaultDate?: string; // YYYY-MM-DD
  readOnly?: boolean;
}

/**
 * Create/edit a timesheet entry. Task-linked entries auto-derive category
 * ("project") from the task metadata; ad-hoc entries pick from the admin
 * managed `timesheet_category` reference group.
 */
export function TimeEntryFormDialog({
  open,
  onClose,
  entry,
  defaultDate,
  readOnly = false,
}: TimeEntryFormDialogProps) {
  const isEdit = !!entry;
  const locked = readOnly || (isEdit && entry.status === 'approved');
  const onlyRecall = isEdit && entry.status === 'submitted' && !readOnly;

  const [workDate, setWorkDate] = useState('');
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<'task' | 'adhoc'>('adhoc');
  const [taskId, setTaskId] = useState<string>('');
  const [subtaskId, setSubtaskId] = useState<string>('');
  const [categoryValue, setCategoryValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: categories } = useReferenceData('timesheet_category');
  const { data: myTasks } = useMyTasks();
  const createTimeEntry = useCreateTimeEntry();
  const updateTimeEntry = useUpdateTimeEntry();
  const deleteTimeEntry = useDeleteTimeEntry();
  const submitTimeEntry = useSubmitTimeEntry();
  const recallTimeEntry = useRecallTimeEntry();

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setWorkDate(entry.workDate);
      setHours(String(entry.hours));
      setDescription(entry.description);
      setSource(entry.taskId || entry.subtaskId ? 'task' : 'adhoc');
      setTaskId(entry.taskId ? String(entry.taskId) : '');
      setSubtaskId(entry.subtaskId ? String(entry.subtaskId) : '');
      setCategoryValue(entry.categoryValue);
    } else {
      setWorkDate(defaultDate || todayLocal());
      setHours('');
      setDescription('');
      setSource('adhoc');
      setTaskId('');
      setSubtaskId('');
      setCategoryValue('');
    }
  }, [open, entry, defaultDate]);

  const selectedTask = myTasks?.find((t) => String(t.id) === taskId);
  const isTaskLinked = source === 'task' && !!taskId;

  const saveEntry = async (): Promise<TimeEntry | null> => {
    const parsedHours = Math.round(parseFloat(hours || '0') * 4) / 4;
    if (!description.trim() || !workDate || parsedHours <= 0) return null;

    const payload = {
      workDate,
      hours: parsedHours,
      description: description.trim(),
      taskId: isTaskLinked ? Number(taskId) : null,
      subtaskId: isTaskLinked && subtaskId ? Number(subtaskId) : null,
      categoryValue: isTaskLinked ? undefined : categoryValue,
    };

    if (isEdit) {
      return await updateTimeEntry.mutateAsync({ id: entry.id, input: payload });
    }
    return await createTimeEntry.mutateAsync(payload);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveEntry();
    onClose();
  };

  const handleDelete = async () => {
    if (!entry) return;
    await deleteTimeEntry.mutateAsync(entry.id);
    setDeleteOpen(false);
    onClose();
  };

  const isSubmitting = createTimeEntry.isPending || updateTimeEntry.isPending;

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={(v) => { if (!v) onClose(); }}
        title={
          <span className="flex items-center gap-2">
            {isEdit ? 'Edit Timesheet Entry' : 'Add Timesheet Entry'}
            {entry && <Badge variant="outline" className="text-[9px] capitalize">{entry.status}</Badge>}
          </span>
        }
        maxWidth="lg"
        onSubmit={handleSubmit}
        submitLabel={locked ? undefined : isEdit ? 'Save Changes' : 'Add Entry'}
        isSubmitting={isSubmitting}
        submitDisabled={locked || !description.trim() || !hours || (!isTaskLinked && !categoryValue)}
        hideFooter={onlyRecall}
        footer={
          onlyRecall ? (
            <div className="flex justify-between items-center pt-4 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => { await recallTimeEntry.mutateAsync(entry.id); onClose(); }}
              >
                Recall to Draft
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <DatePicker value={workDate} onChange={setWorkDate} disabled={locked} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Timer className="h-3 w-3" /> Hours</Label>
              <Input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0.0"
                disabled={locked}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Work done</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
              disabled={locked}
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1"><ListTodo className="h-3 w-3" /> Source</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={source === 'task' ? 'default' : 'outline'}
                onClick={() => { if (!locked) setSource('task'); }}
                disabled={locked}
              >
                Task / Subtask
              </Button>
              <Button
                type="button"
                size="sm"
                variant={source === 'adhoc' ? 'default' : 'outline'}
                onClick={() => {
                  if (locked) return;
                  setSource('adhoc');
                  setTaskId('');
                  setSubtaskId('');
                }}
                disabled={locked}
              >
                Ad-hoc activity
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Task-linked entries are always "project". For ad-hoc work, the category
              you pick decides which approval rule applies.
            </p>
          </div>

          {source === 'task' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Task</Label>
                <Select value={taskId} onValueChange={(v) => { setTaskId(v); setSubtaskId(''); }} disabled={locked}>
                  <SelectTrigger><SelectValue placeholder="Select assigned task..." /></SelectTrigger>
                  <SelectContent>
                    {(myTasks || []).map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.title} <span className="text-muted-foreground">({t.projectName})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subtask (optional)</Label>
                <Select value={subtaskId || 'none'} onValueChange={(v) => setSubtaskId(v === 'none' ? '' : v)} disabled={locked || !selectedTask}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(selectedTask?.subtasks || []).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Category</Label>
            {isTaskLinked ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                  <CheckCircle2 className="h-3 w-3" />
                  Project (from task)
                </Badge>
                <span className="text-xs text-muted-foreground">Metadata derived from the selected task</span>
              </div>
            ) : (
              <Select value={categoryValue} onValueChange={setCategoryValue} disabled={locked}>
                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  {toSelectOptions(categories).map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {entry?.status === 'rejected' && entry.rejectReason && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-500">
              <strong>Rejected:</strong> {entry.rejectReason}
            </div>
          )}

          {isEdit && !locked && !onlyRecall && (
            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Entry
              </Button>
              {entry.status !== 'approved' && entry.status !== 'submitted' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting || submitTimeEntry.isPending}
                  onClick={async () => {
                    const saved = await saveEntry();
                    if (!saved) return;
                    await submitTimeEntry.mutateAsync(entry.id);
                    onClose();
                  }}
                >
                  Save & Submit
                </Button>
              )}
            </div>
          )}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Timesheet Entry"
        description="Are you sure? This will permanently remove the entry and its logged hours."
        onConfirm={handleDelete}
      />
    </>
  );
}
