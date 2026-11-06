import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  RotateCcw,
  Save,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn, formatDate, todayLocal } from '@/lib/utils';
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useEnrollable,
  useRecallTimeEntry,
  useSubmitTimeEntry,
  useUpdateTimeEntry,
} from '@/hooks/useTimeEntries';
import type { TimeEntry } from '@/types';

/**
 * The timesheet entry drawer.
 *
 * Same job as `TimeEntryFormDialog`, presented as a right-hand sheet so the
 * week stays visible behind it. The form fields are identical on purpose —
 * this is a change of container, not of behaviour — but the pickers now come
 * from `/timesheet/enrollable`, so the task list is the work this person is
 * actually enrolled on rather than every task they were ever assigned.
 *
 * `entry === null` means "new entry on `defaultDate`".
 */

interface TimesheetEntryDrawerProps {
  open: boolean;
  onClose: () => void;
  entry: TimeEntry | null;
  defaultDate?: string;
  /** Viewing somebody else's week (admin) — show the details, offer no edits. */
  readOnly?: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'border-border text-muted-foreground',
  submitted:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  approved:
    'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400',
  rejected:
    'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400',
};

export function TimesheetEntryDrawer({
  open,
  onClose,
  entry,
  defaultDate,
  readOnly = false,
}: TimesheetEntryDrawerProps) {
  const isEdit = !!entry;
  const locked = readOnly || (isEdit && entry.status === 'approved');
  const onlyRecall = isEdit && entry.status === 'submitted' && !readOnly;

  const [workDate, setWorkDate] = useState('');
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [taskId, setTaskId] = useState('');
  const [subtaskId, setSubtaskId] = useState('');
  const [categoryValue, setCategoryValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: enrollable } = useEnrollable();
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();
  const deleteEntry = useDeleteTimeEntry();
  const submitEntry = useSubmitTimeEntry();
  const recallEntry = useRecallTimeEntry();

  useEffect(() => {
    if (!open) return;

    if (entry) {
      setWorkDate(entry.workDate);
      setHours(String(entry.hours));
      setDescription(entry.description);
      setTaskId(entry.taskId ? String(entry.taskId) : '');
      setSubtaskId(entry.subtaskId ? String(entry.subtaskId) : '');
      setCategoryValue(entry.categoryValue);
    } else {
      setWorkDate(defaultDate || todayLocal());
      setHours('');
      setDescription('');
      setTaskId('');
      setSubtaskId('');
      setCategoryValue('');
    }
  }, [open, entry, defaultDate]);

  // An entry can outlive the enrollment it was logged against — the person may
  // have left the project since. The saved task is still in the select value,
  // so it must also be in the options, or the trigger renders blank and a save
  // would look like it had dropped the link.
  const enrolledTasks = enrollable?.tasks ?? [];
  const tasks = useMemo(() => {
    if (entry?.task && !enrolledTasks.some((task) => task.id === entry.task!.id)) {
      return [
        {
          id: entry.task.id,
          title: entry.task.title,
          projectId: entry.projectId ?? 0,
          projectName: entry.project?.name ?? 'Project',
          subtasks: [],
        },
        ...enrolledTasks,
      ];
    }
    return enrolledTasks;
  }, [enrollable, entry]);
  const categories = enrollable?.categories ?? [];
  const selectedTask = tasks.find((task) => String(task.id) === taskId);
  const isTaskLinked = !!taskId;

  const parsedHours = Math.round(parseFloat(hours || '0') * 4) / 4;
  const canSave =
    !locked && !!description.trim() && !!workDate && parsedHours > 0 && (isTaskLinked || !!categoryValue);

  const buildPayload = () => ({
    workDate,
    hours: parsedHours,
    description: description.trim(),
    taskId: isTaskLinked ? Number(taskId) : null,
    subtaskId: isTaskLinked && subtaskId ? Number(subtaskId) : null,
    categoryValue: isTaskLinked ? undefined : categoryValue,
  });

  const save = async (): Promise<TimeEntry | null> => {
    if (!canSave) return null;
    if (isEdit) return updateEntry.mutateAsync({ id: entry.id, input: buildPayload() });
    return createEntry.mutateAsync(buildPayload());
  };

  const handleSave = async () => {
    const saved = await save();
    if (saved) onClose();
  };

  const handleSaveAndSubmit = async () => {
    const saved = await save();
    if (!saved) return;
    await submitEntry.mutateAsync(saved.id);
    onClose();
  };

  const handleDelete = async () => {
    if (!entry) return;
    await deleteEntry.mutateAsync(entry.id);
    setDeleteOpen(false);
    onClose();
  };

  const saving = createEntry.isPending || updateEntry.isPending;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {isEdit ? 'Timesheet entry' : 'Log work'}
              {entry && (
                <Badge variant="outline" className={cn('capitalize', STATUS_STYLE[entry.status])}>
                  {entry.status}
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription>
              {isEdit && entry
                ? formatDate(entry.workDate)
                : `New entry${defaultDate ? ` for ${formatDate(defaultDate)}` : ''}`}
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="dark:text-gray-400 text-gray-800">Date</Label>
                <DatePicker value={workDate} onChange={setWorkDate} disabled={locked} />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-400 text-gray-800">Hours</Label>
                <Input
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                  placeholder="0.0"
                  disabled={locked}
                />
                <p className="text-[11px] text-muted-foreground">Rounds to the nearest 15 minutes</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-400 text-gray-800">Category</Label>
              {isTaskLinked ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                    <CheckCircle2 className="h-3 w-3" />
                    Project (from task)
                  </Badge>
                </div>
              ) : (
                <Select value={categoryValue} onValueChange={setCategoryValue} disabled={locked}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-400 text-gray-800">Work done</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What did you work on?"
                rows={4}
                disabled={locked}
              />
            </div>

            {/* Linking to a task is what feeds project contribution numbers, so
                the picker stays — but it is optional, and picking one is the
                only thing the old "Source" toggle did. Category below carries
                the same information for ad-hoc work, which is why the toggle
                was redundant. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="dark:text-gray-400 text-gray-800">Project task (optional)</Label>
                <Select
                  value={taskId || 'none'}
                  onValueChange={(value) => {
                    setTaskId(value === 'none' ? '' : value);
                    setSubtaskId('');
                  }}
                  disabled={locked || tasks.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No task" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No task — log an activity</SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={String(task.id)}>
                        {task.title}
                        <span className="ml-1 text-muted-foreground">({task.projectName})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-400 text-gray-800">Subtask</Label>
                <Select
                  value={subtaskId || 'none'}
                  onValueChange={(value) => setSubtaskId(value === 'none' ? '' : value)}
                  disabled={locked || !selectedTask}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(selectedTask?.subtasks ?? [])
                      .filter((subtask) => subtask.claimable)
                      .map((subtask) => (
                        <SelectItem key={subtask.id} value={String(subtask.id)}>
                          {subtask.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {tasks.length === 0
                ? 'You have no open task to link, so this is logged as an activity under the category you pick.'
                : 'Linking a task records the hours against its project. Leave it empty to log a standalone activity.'}
            </p>

            {entry?.status === 'rejected' && entry.rejectReason && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                <strong className="flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Rejected
                </strong>
                <p className="mt-1">{entry.rejectReason}</p>
                <p className="mt-1 text-red-600/70 dark:text-red-400/70">
                  Edit and resubmit, or recall it to a draft.
                </p>
              </div>
            )}

            {entry && (
              <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="mt-0.5">{formatDate(entry.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Submitted</dt>
                  <dd className="mt-0.5">{entry.submittedAt ? formatDate(entry.submittedAt) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Approver</dt>
                  <dd className="mt-0.5">{entry.approver?.name ?? 'Resolved on submit'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Decided</dt>
                  <dd className="mt-0.5">{entry.decidedAt ? formatDate(entry.decidedAt) : '—'}</dd>
                </div>
              </dl>
            )}
          </SheetBody>

          <SheetFooter className="sm:justify-between">
            {isEdit && !locked ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            ) : (
              <span />
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>

              {onlyRecall && entry ? (
                <Button
                  variant="outline"
                  disabled={recallEntry.isPending}
                  onClick={async () => {
                    await recallEntry.mutateAsync(entry.id);
                    onClose();
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Recall to draft
                </Button>
              ) : locked ? null : (
                <>
                  {isEdit && (
                    <Button variant="secondary" disabled={!canSave || saving} onClick={handleSave}>
                      <Save className="mr-2 h-4 w-4" /> Save
                    </Button>
                  )}
                  <Button
                    disabled={!canSave || saving || submitEntry.isPending}
                    onClick={isEdit ? handleSaveAndSubmit : handleSave}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {isEdit ? 'Save & submit' : 'Add entry'}
                  </Button>
                </>
              )}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this entry?"
        description="The logged hours are removed permanently. This cannot be undone."
        onConfirm={handleDelete}
      />
    </>
  );
}
