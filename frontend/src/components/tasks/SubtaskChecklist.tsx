import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { todayLocal } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckSquare, Square, Plus, Trash2, Timer, Send,
  ChevronDown, ChevronRight, Loader2
} from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

interface SubtaskChecklistProps {
  taskId: number;
  subtasks: any[];
  members: any[];
  timeEntries?: any[];
  onUpdate: () => void;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

/**
 * Checklist-style subtasks inside the task detail modal (2-level limit:
 * subtasks never have children). Each subtask supports the same Log Work
 * method as the parent task (hours + work done) writing to the shared
 * TimeEntry work log.
 */
export function SubtaskChecklist({ taskId, subtasks, members, timeEntries = [], onUpdate }: SubtaskChecklistProps) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  // Log Work mini-composer state (per expanded subtask)
  const [logHours, setLogHours] = useState('');
  const [logDescription, setLogDescription] = useState('');
  const [logging, setLogging] = useState(false);

  const doneCount = subtasks.filter((s) => s.status === 'done').length;

  const memberOptions = members.map((m: any) => ({
    label: m.user.name,
    value: m.userId ?? m.id,
  }));

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

  const handleLogWork = async (subtaskId: number) => {
    if (!logDescription.trim()) return;
    try {
      setLogging(true);
      const hours = logHours ? Math.round(parseFloat(logHours) * 4) / 4 : 0;
      if (hours > 0) {
        // Shared work log: same TimeEntry record as the timesheet page
        await apiClient.post('/timesheet/entries', {
          workDate: todayLocal(),
          hours,
          description: logDescription.trim(),
          taskId,
          subtaskId,
        });
      } else {
        await apiClient.post(`/tasks/${taskId}/comments`, {
          content: logDescription.trim(),
        });
      }
      setLogHours('');
      setLogDescription('');
      toast.success(hours > 0 ? 'Work logged' : 'Comment added');
      onUpdate();
    } catch (err) {
      toast.error('Failed to log work');
    } finally {
      setLogging(false);
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

                {s.assignee && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {s.assignee.name}
                  </span>
                )}
                {s.dueDate && (
                  <span className={`text-[10px] shrink-0 ${isOverdue(s) ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                    {new Date(s.dueDate).toLocaleDateString()}
                  </span>
                )}
                {savingId === s.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                {expanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>

              {expanded && (
                <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-border/40">
                  <div className="grid grid-cols-3 gap-2 pt-2">
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
                      <label className="text-[10px] text-muted-foreground mb-1 block">Assignee</label>
                      <Select
                        value={s.assigneeId != null ? String(s.assigneeId) : 'unassigned'}
                        onValueChange={(v) =>
                          handleUpdate(s.id, { assigneeId: v === 'unassigned' ? null : Number(v) })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {memberOptions.map((m) => (
                            <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
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

                  {/* Log Work mini-composer — same method as the parent task */}
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                      <Timer className="h-3 w-3" /> Log Work
                    </label>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        max="24"
                        step="0.25"
                        value={logHours}
                        onChange={(e) => setLogHours(e.target.value)}
                        placeholder="Hrs"
                        className="h-7 text-xs w-16"
                      />
                      <Textarea
                        value={logDescription}
                        onChange={(e) => setLogDescription(e.target.value)}
                        placeholder="What did you work on?"
                        rows={1}
                        className="resize-none h-7 text-xs min-h-[28px]"
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2"
                        disabled={!logDescription.trim() || logging}
                        onClick={() => handleLogWork(s.id)}
                      >
                        <Send className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

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
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add subtask */}
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
