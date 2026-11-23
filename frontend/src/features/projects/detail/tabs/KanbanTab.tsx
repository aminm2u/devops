import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/progress';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { EmptyState } from '@/components/empty-state';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Calendar, Plus, Trash2, CheckSquare, Clock, Link2, Sparkles,
  ArrowUpRight, Layers,
} from 'lucide-react';
import apiClient from '@/api/client';
import toast from '@/lib/toast';
import { GenerateTasksDialog } from './GenerateTasksDialog';
import { useAuth } from '@/hooks/useAuth';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';
import { cn } from '@/lib/utils';

/** Due-date tone, shared with the task page so a date reads the same in both. */
function dueTone(dueDate?: string | null) {
  if (!dueDate) return 'text-muted-foreground';
  const due = new Date(dueDate).getTime();
  const now = Date.now();
  if (due < now) return 'text-destructive';
  if (due - now < 3 * 24 * 60 * 60 * 1000) return 'text-amber-500';
  return 'text-muted-foreground';
}

export function KanbanTab({ project, refetch }: { project: any, refetch: () => void }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  // Task priority is project priority — the same four-plus-one scale the
  // project itself uses, so both read one master list.
  const { data: priorityData } = useReferenceData('project_priority');
  const taskPriorities = toSelectOptions(priorityData).filter(
    (option) => option.value !== 'critical'
  );
  const [columns, setColumns] = useState(project.taskColumns || []);
  const [tasks, setTasks] = useState(project.tasks || []);

  React.useEffect(() => {
    setColumns(project?.taskColumns || []);
    setTasks(project?.tasks || []);
  }, [project?.taskColumns, project?.tasks]);

  const [colDialogOpen, setColDialogOpen] = useState(false);
  const [newColName, setNewColName] = useState('');

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [activeColId, setActiveColId] = useState<number | null>(null);

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assignees: [] as number[],
    priority: 'medium',
    dueDate: '',
    scopeItemId: ''
  });

  // Leaf scope items — the only kind a task can deliver. A parent's work is
  // the sum of its children, so pointing a task at one would double-count it
  // in the progress rollup.
  const scopeLeaves = React.useMemo(() => {
    const items = project.scopeItems || [];
    const parentIds = new Set(items.map((i: any) => i.parentId).filter(Boolean));
    return items.filter((i: any) => !parentIds.has(i.id));
  }, [project.scopeItems]);

  const scopeOptions = React.useMemo(
    () =>
      scopeLeaves.map((item: any) => ({
        value: String(item.id),
        label: `${item.wbsNumber} — ${item.title}`,
      })),
    [scopeLeaves]
  );

  // Build assignee options from ACTIVE team members. A removed member keeps
  // an `isActive: false` row, so an unfiltered list would still offer them.
  const activeTeam = (project.teamAssignments || []).filter(
    (m: any) => m.isActive !== false
  );
  const assigneeOptions: Option[] = activeTeam.map((m: any) => ({
    label: m.user.name,
    value: String(m.userId),
  }));

  /** Board-level glance numbers, all derived from the payload the tab already has. */
  const summary = useMemo(() => {
    const all: any[] = project.tasks || [];
    let openSubtasks = 0;
    let overdue = 0;
    let hours = 0;
    const now = Date.now();
    for (const task of all) {
      hours += Number(task.loggedHours) || 0;
      const subtasks: any[] = task.subtasks || [];
      openSubtasks += subtasks.filter((s) => s.status !== 'done').length;
      const allDone = subtasks.length > 0 && subtasks.every((s) => s.status === 'done');
      if (task.dueDate && !allDone && new Date(task.dueDate).getTime() < now) overdue += 1;
    }
    return { total: all.length, openSubtasks, hours, overdue, columnCount: (project.taskColumns || []).length };
  }, [project.tasks, project.taskColumns]);

  const onDragEnd = async (result: any) => {
    if (!result.destination) return;

    const destColId = parseInt(result.destination.droppableId);
    const taskId = parseInt(result.draggableId);

    const newTasks = Array.from(tasks);
    const taskIndex = newTasks.findIndex((t: any) => t.id === taskId);
    const [movedTask] = newTasks.splice(taskIndex, 1) as any[];
    movedTask.columnId = destColId;

    const destTasks = newTasks.filter((t: any) => t.columnId === destColId);
    destTasks.splice(result.destination.index, 0, movedTask);

    const reorderedDestTasks = destTasks.map((t: any, index: number) => ({ ...t, position: index }));
    const finalTasks = newTasks.filter((t: any) => t.columnId !== destColId).concat(reorderedDestTasks);

    setTasks(finalTasks as any);

    try {
      await apiClient.put('/tasks/reorder', {
        tasks: reorderedDestTasks.map((t: any) => ({
          id: t.id,
          columnId: t.columnId,
          position: t.position
        }))
      });
      toast.success('Task moved');
      refetch();
    } catch (err) {
      toast.error('Failed to move task');
      refetch();
    }
  };

  const getAssigneeUser = (id: number) => {
    const member = project.teamAssignments?.find((m: any) => m.userId === id);
    return member
      ? { id: member.userId, name: member.user.name, email: member.user.email ?? '' }
      : { id, name: `User ${id}`, email: '' };
  };

  const handleAddColumn = async () => {
    if (!newColName) return;
    try {
      await apiClient.post('/tasks/columns', { projectId: project.id, name: newColName });
      toast.success('Board added');
      setColDialogOpen(false);
      setNewColName('');
      refetch();
    } catch (err) {
      toast.error('Failed to add board');
    }
  };

  const handleAddTask = async () => {
    if (!taskForm.title) return;
    try {
      await apiClient.post('/tasks', {
        projectId: project.id,
        columnId: activeColId,
        ...taskForm,
        assignees: taskForm.assignees.map(Number),
        dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : null,
        scopeItemId: taskForm.scopeItemId ? Number(taskForm.scopeItemId) : null
      });
      toast.success('Task added');
      setTaskDialogOpen(false);
      setTaskForm({ title: '', description: '', assignees: [], priority: 'medium', dueDate: '', scopeItemId: '' });
      refetch();
    } catch (err) {
      toast.error('Failed to add task');
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      await apiClient.delete(`/tasks/${taskId}`);
      toast.success('Task deleted');
      refetch();
    } catch (err) {
      toast.error('Failed to delete task');
    }
  };

  // Card click opens the full task page — the modal was retired once the
  // page existed; the URL makes tasks linkable from calendar and chat.
  const openTaskDetail = (taskId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent drag
    const task = tasks.find((t: any) => t.id === taskId);
    navigate(task?.publicId ? `/tasks/${task.publicId}` : `/tasks/${taskId}`);
  };

  const openAddTask = (colId: number) => {
    setActiveColId(colId);
    setTaskDialogOpen(true);
  };

  return (
    <div className="h-full">
      {/* ── Board header ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Project Board</h2>
          <p className="text-sm text-muted-foreground">
            {summary.total} task{summary.total === 1 ? '' : 's'} across {summary.columnCount} board{summary.columnCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('task.create') && scopeLeaves.length > 0 && columns.length > 0 && (
            <Button onClick={() => setGenerateDialogOpen(true)} variant="outline">
              <Sparkles className="w-4 h-4 mr-2" /> Generate from Scope
            </Button>
          )}
          {can('task.create') && (
            <Button onClick={() => setColDialogOpen(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" /> Add Board
            </Button>
          )}
        </div>
      </div>

      {/* ── Glance strip ─────────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BoardStat label="Tasks" value={summary.total} icon={<Layers className="h-3.5 w-3.5" />} />
        <BoardStat label="Open subtasks" value={summary.openSubtasks} icon={<CheckSquare className="h-3.5 w-3.5" />} />
        <BoardStat
          label="Hours logged"
          value={summary.hours % 1 === 0 ? summary.hours : summary.hours.toFixed(2)}
          icon={<Clock className="h-3.5 w-3.5" />}
        />
        <BoardStat
          label="Overdue"
          value={summary.overdue}
          icon={<Calendar className="h-3.5 w-3.5" />}
          tone={summary.overdue > 0 ? 'text-destructive' : undefined}
        />
      </div>

      {/* ── Board ────────────────────────────────────────────────────────── */}
      {columns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70">
          <EmptyState
            icon={Layers}
            title="No boards yet"
            description="A board is a column of tasks — start with one and move work through it."
            action={
              can('task.create') ? (
                <Button onClick={() => setColDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add your first board
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex items-stretch gap-4 overflow-x-auto pb-4">
            {columns.map((col: any, colIndex: number) => {
              const colTasks = tasks
                .filter((t: any) => t.columnId === col.id)
                .sort((a: any, b: any) => a.position - b.position);

              return (
                <div
                  key={col.id}
                  className="flex max-h-[calc(100vh-19rem)] min-w-[300px] w-[300px] flex-col rounded-xl border border-border/40 bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                    <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      {/* Column accent — a stable hue per position, not a status */}
                      <span
                        className={cn(
                          'h-3.5 w-1 shrink-0 rounded-full',
                          COLUMN_ACCENTS[colIndex % COLUMN_ACCENTS.length]
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{col.name}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">{colTasks.length}</Badge>
                    </h3>
                    {can('task.create') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => openAddTask(col.id)}
                        title={`Add a task to ${col.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <Droppable droppableId={String(col.id)}>
                    {(provided, snapshot) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={cn(
                          'flex-1 space-y-2.5 overflow-y-auto px-2.5 pb-2.5 min-h-[120px] thin-scrollbar rounded-b-xl transition-colors',
                          snapshot.isDraggingOver && 'bg-primary/5 ring-2 ring-inset ring-primary/30'
                        )}
                      >
                        {colTasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8 text-center">
                            <p className="text-xs font-medium text-muted-foreground">No tasks yet</p>
                            {can('task.create') && (
                              <button
                                type="button"
                                onClick={() => openAddTask(col.id)}
                                className="mt-1 text-[11px] text-primary hover:underline"
                              >
                                Add one
                              </button>
                            )}
                          </div>
                        )}
                        {colTasks.length === 0 && snapshot.isDraggingOver && (
                          <div className="flex items-center justify-center rounded-lg border border-dashed border-primary/40 py-8 text-center text-xs font-medium text-primary">
                            Drop here
                          </div>
                        )}

                        {colTasks.map((task: any, index: number) => {
                          const subtasks: any[] = task.subtasks || [];
                          const done = subtasks.filter((s: any) => s.status === 'done').length;
                          const pct = subtasks.length ? (done / subtasks.length) * 100 : 0;
                          const assignees: number[] = task.assignees || [];

                          return (
                            <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={provided.draggableProps.style}
                                >
                                  <Card
                                    className={cn(
                                      'group cursor-grab border border-transparent shadow-sm transition-all hover:border-border/60 hover:shadow-md active:cursor-grabbing',
                                      snapshot.isDragging && 'rotate-[0.5deg] shadow-lg ring-1 ring-primary/30'
                                    )}
                                    onClick={(e) => openTaskDetail(task.id, e)}
                                  >
                                    <CardContent className="p-3">
                                      <div className="mb-1.5 flex items-start justify-between gap-2">
                                        <h4 className="line-clamp-2 text-sm font-medium leading-snug">
                                          {task.title}
                                        </h4>
                                        <div className="flex shrink-0 items-center gap-0.5">
                                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                          {can('task.delete') && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-5 w-5 text-destructive opacity-0 transition-opacity hover:text-destructive/80 group-hover:opacity-100"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteTask(task.id);
                                              }}
                                              title="Delete task"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>

                                      {task.scopeItem && (
                                        <p className="mb-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                                          <Link2 className="h-3 w-3 shrink-0" />
                                          <span className="font-mono">{task.scopeItem.wbsNumber}</span>
                                          <span className="truncate">· {task.scopeItem.title}</span>
                                        </p>
                                      )}

                                      {task.description && (
                                        <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
                                      )}

                                      {/* Assignee avatar stack */}
                                      <div className="mb-2.5 flex items-center">
                                        {assignees.length > 0 ? (
                                          <div className="flex items-center -space-x-1.5">
                                            {assignees.slice(0, 3).map((id: number) => (
                                              <UserAvatar
                                                key={id}
                                                user={getAssigneeUser(id)}
                                                size="sm"
                                                className="ring-2 ring-card"
                                              />
                                            ))}
                                            {assignees.length > 3 && (
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card">
                                                +{assignees.length - 3}
                                              </span>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60">
                                            Unassigned
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center justify-between gap-2">
                                        <StatusBadge domain="helpdeskPriority" value={task.priority} />

                                        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                                          {subtasks.length > 0 && (
                                            <span className="flex items-center gap-1" title={`${done} of ${subtasks.length} subtasks done`}>
                                              <Progress value={pct} className="h-1 w-8" />
                                              {done}/{subtasks.length}
                                            </span>
                                          )}
                                          {!!task.loggedHours && task.loggedHours > 0 && (
                                            <span className="flex items-center gap-1">
                                              <Clock className="h-3 w-3" />
                                              {Number(task.loggedHours) % 1 === 0
                                                ? Number(task.loggedHours)
                                                : Number(task.loggedHours).toFixed(2)}
                                              h
                                            </span>
                                          )}
                                          {task.dueDate && (
                                            <span className={cn('flex items-center gap-1', dueTone(task.dueDate))}>
                                              <Calendar className="h-3 w-3" />
                                              {new Date(task.dueDate).toLocaleDateString()}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>

                  {colTasks.length > 0 && can('task.create') && (
                    <button
                      type="button"
                      onClick={() => openAddTask(col.id)}
                      className="flex items-center gap-1.5 rounded-b-xl border-t border-border/40 px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> Add task
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Add Board Dialog */}
      <FormDialog
        open={colDialogOpen}
        onOpenChange={setColDialogOpen}
        title="Add New Board"
        description="Create a new board column for task tracking"
        maxWidth="sm"
        onSubmit={handleAddColumn}
        submitLabel="Save"
      >
        <div className="space-y-2">
          <Label>Board Name</Label>
          <Input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="e.g. Backlog, Testing" />
        </div>
      </FormDialog>

      {/* Add Task Dialog */}
      <FormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        title="Add New Task"
        description="Create a new task item in this board"
        maxWidth="lg"
        onSubmit={handleAddTask}
        submitLabel="Create Task"
      >
        <div className="space-y-2">
          <Label>Task Title</Label>
          <Input value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} placeholder="What needs to be done?" />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} placeholder="Add details..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Assignees</Label>
            <MultiSelect
              options={assigneeOptions}
              selected={taskForm.assignees.map(String)}
              onChange={(vals) => setTaskForm({ ...taskForm, assignees: vals.map(Number) })}
              placeholder="Select team members..."
            />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={taskForm.priority} onValueChange={v => setTaskForm({...taskForm, priority: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {taskPriorities.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Due Date</Label>
          <DatePicker value={taskForm.dueDate} onChange={v => setTaskForm({...taskForm, dueDate: v})} />
        </div>
        {scopeOptions.length > 0 && (
          <div className="space-y-2">
            <Label>Scope item <span className="text-muted-foreground font-normal">(optional — links this task to a work package)</span></Label>
            <Select
              value={taskForm.scopeItemId || 'none'}
              onValueChange={v => setTaskForm({...taskForm, scopeItemId: v === 'none' ? '' : v})}
            >
              <SelectTrigger><SelectValue placeholder="No scope item" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No scope item</SelectItem>
                {scopeOptions.map((option: { value: string; label: string }) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </FormDialog>

      {/* Generate Tasks from Scope */}
      <GenerateTasksDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        projectId={project.id}
        scopeItems={project.scopeItems || []}
        columns={columns}
        tasks={tasks}
        teamAssignments={activeTeam}
        onGenerated={refetch}
      />
    </div>
  );
}

/** Per-column accent bar — positional, not semantic, so a board keeps its colour. */
const COLUMN_ACCENTS = [
  'bg-slate-400/70',
  'bg-blue-500/70',
  'bg-amber-500/70',
  'bg-emerald-500/70',
  'bg-violet-500/70',
  'bg-rose-500/70',
];

function BoardStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className={cn('text-base font-bold leading-tight tabular-nums', tone)}>{value}</p>
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
