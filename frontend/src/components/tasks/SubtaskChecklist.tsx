import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckSquare, Square, Plus, Trash2, Timer, MessageSquare,
  ChevronDown, ChevronRight, Loader2, Users
} from 'lucide-react';
import apiClient from '@/api/client';
import toast from '@/lib/toast';

interface SubtaskChecklistProps {
  taskId: number;
  subtasks: any[];
  members: any[];
  timeEntries?: any[];
  onUpdate: () => void;
  /**
   * Present when the host page has a single log-work composer (the task
   * page's sidebar). Clicking a subtask's clock icon targets that composer
   * instead of an inline one — one form to fill, wherever the click came
   * from.
   */
  onLogWork?: (subtaskId: number) => void;
  /** Opens the discussion feed scrolled to this subtask's thread. */
  onDiscuss?: (subtaskId: number) => void;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

/**
 * Checklist-style subtasks on the task page (2-level limit: subtasks never
 * have children). Several people can work one subtask — the assignee picker
 * is a MultiSelect over the project team. Work logging and discussion live on
 * the host page; each row offers a clock button (log work) and a chat button
 * (discuss) that target them.
 */
export function SubtaskChecklist({ taskId, subtasks, members, timeEntries = [], onUpdate, onLogWork, onDiscuss }: SubtaskChecklistProps) {
  const { can } = useAuth();
  const canEditTask = can('task.manage');
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editingAssigneesId, setEditingAssigneesId] = useState<number | null>(null);
  const [assigneesDraft, setAssigneesDraft] = useState<string[]>([]);

  /** Read the assignee array, falling back to the legacy mirror column. */
  const assigneesOf = (s: any): number[] =>
    Array.isArray(s.assignees) ? s.assignees : s.assigneeId ? [s.assigneeId] : [];

  const doneCount = subtasks.filter((s) => s.status === 'done').length;

  const memberOptions: Option[] = members.map((m: any) => ({
    label: m.user.name,
    value: String(m.userId ?? m.id),
  }));

  const memberName = (id: number) => {
    const m = members.find((x: any) => (x.userId ?? x.id) === id);
    return m ? m.user.name : `User ${id}`;
  };

  const openAssignees = (s: any) => {
    setEditingAssigneesId(s.id);
    setAssigneesDraft(assigneesOf(s).map(String));
  };

  const saveAssignees = async (subtaskId: number) => {
    try {
      setSavingId(subtaskId);
      await apiClient.put(`/tasks/${taskId}/subtasks/${subtaskId}`, {
        assignees: assigneesDraft.map(Number),
      });
      setEditingAssigneesId(null);
      onUpdate();
    } catch (err) {
      toast.error('Failed to update assignees');
    } finally {
      setSavingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    try {
      setAdding(true);
      await apiClient.post(`/tasks/${taskId}/subtasks`, { title: newTitle.trim() });
      setNewTitle('');
      toast.success('Subtask added');
      onUpdate();
    } catch (err) {
      toast.error('Failed to add subtask');
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (subtaskId: number, patch: any) => {
    try {
      setSavingId(subtaskId);
      await apiClient.put(`/tasks/${taskId}/subtasks/${subtaskId}`, patch);
      onUpdate();
    } catch (err) {
      toast.error('Failed to update subtask');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (subtaskId: number) => {
    try {
      await apiClient.delete(`/tasks/${taskId}/subtasks/${subtaskId}`);
      toast.success('Subtask deleted');
      setDeleteTarget(null);
      setExpandedId(null);
      onUpdate();
    } catch (err) {
      toast.error('Failed to delete subtask');
    }
  };

  const isOverdue = (s: any) =>
    s.dueDate && s.status !== 'done' && new Date(s.dueDate) < new Date();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          Subtasks
          <Badge variant="secondary" className="text-[10px]">{doneCount}/{subtasks.length}</Badge>
        </h4>
      </div>

      <div className="space-y-1.5">
        {subtasks.length === 0 && (
          <p className="text-xs text-muted-foreground">No subtasks yet</p>
        )}

        {subtasks.map((s: any) => {
          const expanded = expandedId === s.id;
          const subEntries = timeEntries.filter((e: any) => e.subtaskId === s.id);
          return (
            <div key={s.id} className="border border-border/50 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button
                  className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  onClick={() =>
                    handleUpdate(s.id, { status: s.status === 'done' ? 'open' : 'done' })
                  }
                  title={s.status === 'done' ? 'Mark as open' : 'Mark as done'}
                >
                  {s.status === 'done'
                    ? <CheckSquare className="h-4 w-4 text-green-500" />
                    : <Square className="h-4 w-4" />}
                </button>

                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                >
                  <span className={`text-sm ${s.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                    {s.title}
                  </span>
                </button>

                {/* Everyone working this subtask — click to edit the roster */}
                {editingAssigneesId === s.id ? (
                  <span className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <MultiSelect
                      options={memberOptions}
                      selected={assigneesDraft}
                      onChange={setAssigneesDraft}
                      placeholder="Assignees..."
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveAssignees(s.id)}>
                      ✓
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingAssigneesId(null)}>
                      ✕
                    </Button>
                  </span>
                ) : (
                  canEditTask && (
                    <button
                      type="button"
                      className="shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded hover:bg-muted/70 transition-colors"
                      onClick={(e) => { e.stopPropagation(); openAssignees(s); }}
                      title="Edit assignees"
                    >
                      <Users className="h-3 w-3" />
                      {assigneesOf(s).length > 0
                        ? assigneesOf(s).slice(0, 2).map(memberName).join(', ') + (assigneesOf(s).length > 2 ? ` +${assigneesOf(s).length - 2}` : '')
                        : 'Assign'}
                    </button>
                  )
                )}
                {s.dueDate && (
                  <span className={`text-[10px] shrink-0 ${isOverdue(s) ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                    {new Date(s.dueDate).toLocaleDateString()}
                  </span>
                )}
                {savingId === s.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                {onDiscuss && (
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground/60 hover:text-primary transition-colors"
                    onClick={(e) => { e.stopPropagation(); onDiscuss(s.id); }}
                    title="Discuss this subtask"
                    aria-label={`Discuss ${s.title}`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                )}
                {onLogWork && (
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground/60 hover:text-primary transition-colors"
                    onClick={() => onLogWork(s.id)}
                    title="Log work against this subtask"
                    aria-label={`Log work against ${s.title}`}
                  >
                    <Timer className="h-3.5 w-3.5" />
                  </button>
                )}
                {expanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>

              {expanded && (
                <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-border/40">
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Status</label>
                      <Select
                        value={s.status}
                        onValueChange={(v) => handleUpdate(s.id, { status: v })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Due date</label>
                      <DatePicker
                        value={s.dueDate ? new Date(s.dueDate).toISOString().split('T')[0] : ''}
                        onChange={(v) =>
                          handleUpdate(s.id, { dueDate: v ? new Date(v).toISOString() : null })
                        }
                      />
                    </div>
                  </div>

                  {/* Hours logged against this subtask — entries themselves are
                      created from the page's single log-work composer. */}
                  {subEntries.length > 0 && (
                    <div className="space-y-1">
                      {subEntries.map((e: any) => (
                        <div key={e.id} className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 gap-1 border-primary/30 text-primary">
                            <Timer className="h-2.5 w-2.5" />
                            {Number(e.hours)}h
                          </Badge>
                          <span className="truncate">{e.description}</span>
                          <span className="ml-auto shrink-0">{e.workDate}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {can('task.delete') && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add subtask */}
      {can('task.create') && (
      <div className="flex gap-1.5 mt-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a subtask..."
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button size="sm" className="h-8" disabled={!newTitle.trim() || adding} onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Delete Subtask"
        description={`Delete "${deleteTarget?.title}"? Its logged hours will be removed with it.`}
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id); }}
      />
    </div>
  );
}
