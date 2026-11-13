import { useEffect, useMemo, useState } from 'react';
import {
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
 * week stays visible behind it. The fields cascade: picking the Project or
 * Programme category reveals a project picker (from `/timesheet/enrollable`),
 * the task list then narrows to that project's tasks, and the subtask list to
 * the chosen task. Any other category is plain ad-hoc work with no project
 * behind it.
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

/** Categories that point at real project work and unlock the project picker. */
const PROJECT_CATEGORIES = ['project', 'programme'];

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
  const [projectId, setProjectId] = useState('');
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
      setProjectId(entry.projectId ? String(entry.projectId) : '');
    } else {
      setWorkDate(defaultDate || todayLocal());
      setHours('');
      setDescription('');
      setTaskId('');
      setSubtaskId('');
      setCategoryValue('');
      setProjectId('');
    }
  }, [open, entry, defaultDate]);

  // An entry can outlive the enrollment it was logged against — the person may
  // have left the project since. The saved task is still in the select value,
  // so it must also be in the options, or the trigger renders blank and a save
  // would look like it had dropped the link.
  const enrolledTasks = enrollable?.tasks ?? [];
  const enrolledProjects = enrollable?.projects ?? [];
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
  const isProjectCategory = PROJECT_CATEGORIES.includes(categoryValue);

  // The projects offered in the picker: the enrolled list, plus the entry's own
  // project when the person has since been removed from it (same reasoning as
  // the task above).
  const projects = useMemo(() => {
    if (entry?.projectId && !enrolledProjects.some((project) => project.id === entry.projectId)) {
      return [
        {
          id: entry.projectId,
          name: entry.project?.name ?? 'Project',
          slug: '',
          role: '',
        },
        ...enrolledProjects,
      ];
    }
    return enrolledProjects;
  }, [enrollable, entry]);

  // Project-level entries carry the entry's own project; task-linked entries
  // know theirs from the task. An old ad-hoc entry has neither.
  const selectedProjectId =
    projectId || String(entry?.projectId ?? '') || (selectedTask?.projectId ? String(selectedTask.projectId) : '');
  const isTaskLinked = !!taskId;
  // Tasks offered: every enrolled task on the chosen project (or all of them
  // until a project is picked).
  const tasksForProject = useMemo(() => {
    const scoped = selectedProjectId
      ? tasks.filter((task) => String(task.projectId) === selectedProjectId)
      : tasks;
    return scoped;
  }, [tasks, selectedProjectId]);

  const parsedHours = Math.round(parseFloat(hours || '0') * 4) / 4;
  const canSave =
    !locked &&
    !!description.trim() &&
    !!workDate &&
    parsedHours > 0 &&
    (isTaskLinked ||
      (isProjectCategory ? !!projectId : !!categoryValue));

  const buildPayload = () => {
    const effectiveProjectId = isTaskLinked
      ? undefined // server derives it from the task
      : isProjectCategory && projectId
        ? Number(projectId)
        : null;
    return {
      workDate,
      hours: parsedHours,
      description: description.trim(),
      taskId: isTaskLinked ? Number(taskId) : null,
      subtaskId: isTaskLinked && subtaskId ? Number(subtaskId) : null,
      projectId: effectiveProjectId,
      categoryValue: isTaskLinked ? categoryValue || undefined : categoryValue,
    };
  };

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
                <Label className="dark:text-gray-400 text-gray-800">Hours <small className="text-muted-foreground">(in 15-minute increments)</small></Label>
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
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-400 text-gray-800">Category</Label>
              <Select
                value={categoryValue}
                onValueChange={(value) => {
                  setCategoryValue(value);
                  // Switching away from project work drops the project link —
                  // the pickers below disappear with the category.
                  if (!PROJECT_CATEGORIES.includes(value)) {
                    setProjectId('');
                    setTaskId('');
                    setSubtaskId('');
                  }
                }}
                disabled={locked}
              >
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

              {isProjectCategory && (
                <div className="mt-2 space-y-2">
                  <Label className="dark:text-gray-400 text-gray-800 mt-4">
                    {categoryValue === 'programme' ? 'Programme' : 'Project'}
                  </Label>
                  <Select
                    value={selectedProjectId || undefined}
                    onValueChange={(value) => {
                      setProjectId(value);
                      // The task belongs to the project — switching projects
                      // invalidates both downstream picks.
                      setTaskId('');
                      setSubtaskId('');
                    }}
                    disabled={locked || projects.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={projects.length === 0 ? 'No enrolled projects' : 'Select a project...'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={String(project.id)}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {projects.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      You are not enrolled on any project. Ask PMO to add you, or pick another category.
                    </p>
                  )}
                </div>
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

            {/* Linking to a task feeds project contribution numbers, but it is
                optional: a project or programme can be chosen on its own. The
                task list is scoped to the project picked above, and the
                subtask list to the task. */}
            {isProjectCategory && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="dark:text-gray-400 text-gray-800">Task (optional)</Label>
                  <Select
                    value={taskId || 'none'}
                    onValueChange={(value) => {
                      setTaskId(value === 'none' ? '' : value);
                      setSubtaskId('');
                    }}
                    disabled={locked || tasksForProject.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No task" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No task — {categoryValue} work only</SelectItem>
                      {tasksForProject.map((task) => (
                        <SelectItem key={task.id} value={String(task.id)}>
                          {task.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProjectId && tasksForProject.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      No open tasks on this project for you.
                    </p>
                  )}
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
            )}
            <p className="text-xs text-muted-foreground">
              {isProjectCategory
                ? selectedProjectId
                  ? 'Optionally link a task on this project to record the hours against it; the project alone is enough.'
                  : 'Choose which project or programme this work is for, then optionally a task.'
                : isTaskLinked
                  ? ''
                  : 'Logged as a standalone activity under the category you pick.'}
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
              <dl className="grid grid-cols-2 gap-3 rounded-lg border dark:border-gray-800 bg-muted/30 p-3 text-xs">
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
