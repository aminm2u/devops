import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, ArrowLeft, Calendar, Clock, MessageSquare, Send, Timer,
  UserPlus, UserMinus, ArrowRight, Plus, Edit, Check, X,
  ChevronDown, ChevronRight, Link2, FolderKanban, Trash2,
  Paperclip, Download, FileText,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { todayLocal, formatRelativeTime } from '@/lib/utils';
import apiClient from '@/api/client';
import toast from '@/lib/toast';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { SubtaskChecklist } from '@/components/tasks/SubtaskChecklist';

/**
 * The full-page task workspace at /tasks/:id (publicId uuid).
 *
 * The old modal had outgrown its dialog: assignee stats, a subtask checklist
 * with per-subtask work logging, an activity timeline and a work-log composer
 * do not fit a popover. This page is that content re-laid-out — main column
 * (description, subtasks, chat-style discussion, activity) plus a sidebar
 * (scope link, assignees, due date, log-work composer) — and it is
 * URL-addressable, so a task can be linked from chat, the calendar or a
 * timesheet entry.
 *
 * Accepts a numeric id too (legacy links), same as the backend resolver.
 */
export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // 'PUSH' means the user navigated here from inside the app, so there is a
  // previous page to return to. A direct link ('POP'/'REPLACE' on first load)
  // has none — send those to the parent project instead of stepping out of
  // the app or doing nothing.
  const navigationType = useNavigationType();
  const canGoBack = navigationType === 'PUSH';
  const { can } = useAuth();
  const { user } = useAuth();
  const canEditTask = can('task.manage');

  const handleBack = () => {
    if (canGoBack) navigate(-1);
    else if (task?.projectId) navigate(`/projects/${task.projectId}?tab=kanban`);
    else navigate('/projects');
  };

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<any>(null);

  // Work-log composer. `logSubtaskId` targets a subtask — set by the clock
  // button on a subtask row, cleared when the user picks "the task itself".
  const [comment, setComment] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [logSubtaskId, setLogSubtaskId] = useState<number | null>(null);

  // Discussion (chat-style) composer. `threadSubtaskId` is the thread the
  // composer posts to — null = the task itself; set by the chat icon on a
  // subtask row or by the thread picker beside the composer.
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [threadSubtaskId, setThreadSubtaskId] = useState<number | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<any>(null);
  // Collapsed thread sections (key: subtask id or 'task' for the task thread).
  const [collapsedThreads, setCollapsedThreads] = useState<Record<string, boolean>>({});
  const discussionEndRef = useRef<HTMLDivElement>(null);

  // Same limits the backend's multer middleware enforces — kept side by side
  // so the composer's copy and the server's rule stay honest together.
  const MAX_FILES = 5;
  const MAX_FILE_MB = 10;
  const ACCEPTED_LABEL = 'Images, PDF, Word, Excel, PowerPoint, text, CSV, ZIP/RAR';

  // Inline editors
  const [editAssignees, setEditAssignees] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [savingAssignees, setSavingAssignees] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateValue, setDueDateValue] = useState('');
  const [editingScope, setEditingScope] = useState(false);
  const [scopeValue, setScopeValue] = useState('');
  const [savingScope, setSavingScope] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const { socket } = useSocket();

  const effectiveMembers = project?.teamAssignments ?? [];
  const assigneeOptions: Option[] = effectiveMembers.map((m: any) => ({
    label: m.user.name,
    value: String(m.userId ?? m.id),
  }));

  useEffect(() => {
    if (id) fetchTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep the newest chat bubble in view when the thread changes.
  useEffect(() => {
    discussionEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [task?.comments?.length, threadSubtaskId]);

  useEffect(() => {
    if (socket && task?.id) {
      const handleActivity = (data: any) => {
        if (data.taskId === task.id) {
          setTask((prev: any) => ({
            ...prev,
            activities: [...(prev?.activities || []), data.activity],
          }));
        }
      };
      const handleComment = (data: any) => {
        if (data.taskId === task.id) {
          setTask((prev: any) => ({
            ...prev,
            comments: [...(prev?.comments || []), data.comment],
          }));
        }
      };
      socket.on('task-activity', handleActivity);
      socket.on('task-comment', handleComment);
      return () => {
        socket.off('task-activity', handleActivity);
        socket.off('task-comment', handleComment);
      };
    }
  }, [socket, task?.id]);

  const fetchTask = async () => {
    try {
      setLoading(true);
      setNotFound(false);
      const res = await apiClient.get(`/tasks/${id}`);
      const data = res.data.data;
      setTask(data);
      setSelectedAssignees((data.assignees || []).map(String));
      // The board passes the team in; standalone we fetch the project once.
      try {
        const projRes = await apiClient.get(`/projects/${data.projectId}`);
        setProject(projRes.data.data);
      } catch {
        setProject(null);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !task) return;
    try {
      setSendingComment(true);
      const hours = workingHours ? Math.round(parseFloat(workingHours) * 4) / 4 : 0;

      if (hours > 0) {
        // Shared work log — same TimeEntry record as the Timesheet page.
        // A subtask target (from the row's clock button) rides along.
        const res = await apiClient.post('/timesheet/entries', {
          workDate: todayLocal(),
          hours,
          description: comment.trim(),
          taskId: task.id,
          ...(logSubtaskId ? { subtaskId: logSubtaskId } : {}),
        });
        setTask((prev: any) => ({
          ...prev,
          timeEntries: [...(prev?.timeEntries || []), res.data.data],
        }));
        toast.success(
          logSubtaskId ? 'Work logged on subtask' : 'Work logged'
        );
      } else {
        // Text-only update — plain comment, no hours
        const res = await apiClient.post(`/tasks/${task.id}/comments`, {
          content: comment.trim(),
        });
        setTask((prev: any) => ({
          ...prev,
          comments: [...(prev?.comments || []), res.data.data],
        }));
      }
      setComment('');
      setWorkingHours('');
      setLogSubtaskId(null);
    } catch {
      toast.error('Failed to log work');
    } finally {
      setSendingComment(false);
    }
  };

  /** Subtask clock button → aim the single composer at that subtask. */
  const targetSubtask = (subtaskId: number) => {
    setLogSubtaskId(subtaskId);
    const el = document.getElementById('log-work-composer');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector('textarea')?.focus();
  };

  /** Subtask chat button → open that subtask's thread in the discussion. */
  const discussSubtask = (subtaskId: number) => {
    setThreadSubtaskId(subtaskId);
    // The thread's messages must be visible for the reply to have context —
    // expand it if a previous visit collapsed it.
    setCollapsedThreads((prev) => ({ ...prev, [subtaskId]: false }));
    setTimeout(() => {
      const el = document.getElementById('discussion-section');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.querySelector('textarea')?.focus();
    }, 50);
  };

  /** Post a chat message (multipart when files ride along, JSON otherwise). */
  const handleSendMessage = async () => {
    if (!comment.trim() || !task) return;
    try {
      setSendingMessage(true);
      let res;
      if (newFiles.length > 0) {
        const form = new FormData();
        form.append('content', comment.trim());
        if (threadSubtaskId) form.append('subtaskId', String(threadSubtaskId));
        newFiles.forEach((file) => form.append('attachments', file));
        res = await apiClient.post(`/tasks/${task.id}/comments`, form, {
          // The shared client pins Content-Type to application/json, which
          // overrides axios's FormData detection — multer then sees JSON and
          // finds no files. Passing undefined makes axios set the multipart
          // header with its boundary itself.
          headers: { 'Content-Type': undefined },
        });
      } else {
        res = await apiClient.post(`/tasks/${task.id}/comments`, {
          content: comment.trim(),
          subtaskId: threadSubtaskId,
        });
      }
      // Only keep the new bubble when it belongs to the visible thread.
      const saved = res.data.data;
      if (!threadSubtaskId || saved.subtaskId === threadSubtaskId) {
        setTask((prev: any) => ({
          ...prev,
          comments: [...(prev?.comments || []), saved],
        }));
      }
      setComment('');
      setNewFiles([]);
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const pickFiles = (picked: FileList | null) => {
    const files = Array.from(picked ?? []);
    const rejected = files.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    const accepted = files.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    setNewFiles((prev) => [...prev, ...accepted].slice(0, MAX_FILES));
    if (rejected.length > 0) {
      toast.error(`${rejected.length} file${rejected.length > 1 ? 's' : ''} skipped — over the ${MAX_FILE_MB}MB limit`);
    }
    if (newFiles.length + accepted.length > MAX_FILES) {
      toast.error(`At most ${MAX_FILES} files per message`);
    }
  };

  const handleSaveAssignees = async () => {
    if (!task) return;
    try {
      setSavingAssignees(true);
      await apiClient.put(`/tasks/${task.id}`, {
        assignees: selectedAssignees.map(Number),
      });
      toast.success('Assignees updated');
      setEditAssignees(false);
      fetchTask();
    } catch {
      toast.error('Failed to update assignees');
    } finally {
      setSavingAssignees(false);
    }
  };

  const handleSaveDueDate = async () => {
    if (!task) return;
    try {
      await apiClient.put(`/tasks/${task.id}`, {
        dueDate: dueDateValue ? new Date(dueDateValue).toISOString() : null,
      });
      toast.success('Due date updated');
      setEditingDueDate(false);
      fetchTask();
    } catch {
      toast.error('Failed to update due date');
    }
  };

  const handleSaveScope = async () => {
    if (!task) return;
    try {
      setSavingScope(true);
      await apiClient.put(`/tasks/${task.id}`, {
        scopeItemId: scopeValue ? Number(scopeValue) : null,
      });
      toast.success(scopeValue ? 'Scope item linked' : 'Scope item unlinked');
      setEditingScope(false);
      fetchTask();
    } catch {
      toast.error('Failed to update scope link');
    } finally {
      setSavingScope(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      await apiClient.delete(`/tasks/${task.id}`);
      toast.success('Task deleted');
      navigate(-1);
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
      case 'low': return 'bg-green-500/15 text-green-400 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'created': return <Plus className="h-3.5 w-3.5 text-green-500" />;
      case 'moved': return <ArrowRight className="h-3.5 w-3.5 text-blue-500" />;
      case 'commented': return <MessageSquare className="h-3.5 w-3.5 text-purple-500" />;
      case 'assigned': return <UserPlus className="h-3.5 w-3.5 text-emerald-500" />;
      case 'unassigned': return <UserMinus className="h-3.5 w-3.5 text-red-500" />;
      case 'updated': return <Edit className="h-3.5 w-3.5 text-amber-500" />;
      case 'scope_linked': return <Link2 className="h-3.5 w-3.5 text-blue-500" />;
      case 'scope_unlinked': return <Link2 className="h-3.5 w-3.5 text-muted-foreground" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getActivityDescription = (activity: any) => {
    const d = activity.details || {};
    const userName = activity.user?.name || 'Unknown';
    switch (activity.action) {
      case 'created':
        return <><strong>{userName}</strong> created this task in <Badge variant="outline" className="text-[10px]">{d.column}</Badge></>;
      case 'moved':
        return <><strong>{userName}</strong> moved from <Badge variant="outline" className="text-[10px]">{d.from}</Badge> <ArrowRight className="inline h-3 w-3" /> <Badge variant="outline" className="text-[10px]">{d.to}</Badge></>;
      case 'commented':
        return <><strong>{userName}</strong> commented: <em className="text-muted-foreground">"{d.preview}"</em></>;
      case 'assigned':
        return <><strong>{userName}</strong> assigned <strong>{d.assigneeName}</strong></>;
      case 'unassigned':
        return <><strong>{userName}</strong> unassigned <strong>{d.assigneeName}</strong></>;
      case 'updated':
        return <><strong>{userName}</strong> updated {d.fields?.join(', ')}</>;
      case 'work_logged':
        return <><strong>{userName}</strong> logged <strong>{d.hours}h</strong> of work{d.subtaskId ? ' on a subtask' : ''}: <em className="text-muted-foreground">"{d.description}"</em></>;
      case 'subtask_created':
        return <><strong>{userName}</strong> added subtask <strong>{d.title}</strong></>;
      case 'subtask_updated':
        return <><strong>{userName}</strong> updated subtask <strong>{d.title}</strong></>;
      case 'subtask_deleted':
        return <><strong>{userName}</strong> deleted subtask <strong>{d.title}</strong></>;
      case 'scope_linked':
        return <><strong>{userName}</strong> linked this task to <Badge variant="outline" className="text-[10px] font-mono">{d.wbsNumber}</Badge> <strong>{d.scopeTitle}</strong></>;
      case 'scope_unlinked':
        return <><strong>{userName}</strong> unlinked this task from its scope item</>;
      default:
        return <><strong>{userName}</strong> performed an action</>;
    }
  };

  const getAssigneeStats = () => {
    if (!task?.assigneeDetails) return [];
    return task.assigneeDetails.map((a: any) => {
      const assignActivities = (task.activities || []).filter(
        (act: any) => act.action === 'assigned' && act.details?.assigneeId === a.id
      );
      const userComments = (task.comments || []).filter((c: any) => c.userId === a.id);
      const userEntries = (task.timeEntries || []).filter((e: any) => e.userId === a.id);
      const totalHoursLogged =
        userEntries.reduce((sum: number, e: any) => sum + (parseFloat(e.hours) || 0), 0) +
        userComments.reduce((sum: number, c: any) => sum + (parseFloat(c.workingHours) || 0), 0);
      const assignedAt = assignActivities.length > 0 ? new Date(assignActivities[0].createdAt) : null;
      const hoursActive = assignedAt
        ? Math.round((Date.now() - assignedAt.getTime()) / (1000 * 60 * 60))
        : 0;
      return { ...a, commentCount: userComments.length, totalHoursLogged, assignedAt, hoursActive };
    });
  };

  // Same leaf rule as the create dialog: a parent's work is its children's
  // sum, so a task must point at a leaf or it would double-count in the WBS
  // rollup.
  const scopeLeafOptions = useMemo(() => {
    const items = project?.scopeItems || [];
    const parentIds = new Set(items.map((i: any) => i.parentId).filter(Boolean));
    return items
      .filter((i: any) => !parentIds.has(i.id))
      .map((i: any) => ({ value: String(i.id), label: `${i.wbsNumber} — ${i.title}` }));
  }, [project?.scopeItems]);

  // The conversation, grouped by work item: the task itself plus one thread
  // per subtask. Comments and work logs weave together chronologically —
  // "logged 2h" entries read as chat updates from the person who did them.
  // (Above the early returns: hooks must run on every render.)
  const threads = useMemo(() => {
    const comments: any[] = task?.comments || [];
    const asMessages = (task?.timeEntries || []).map((e: any) => ({
      id: `work-${e.id}`,
      subtaskId: e.subtaskId ?? null,
      user: e.user,
      content: `⏱ Logged ${Number(e.hours)}h — ${e.description}`,
      createdAt: e.createdAt || e.workDate,
      attachments: [],
      isWorkLog: true,
    }));
    const all = [...comments, ...asMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    // Task thread = everything without a subtask; each subtask gets its own.
    const taskThread = all.filter((m) => !m.subtaskId);
    const subtaskThreads = (task?.subtasks || []).map((s: any) => ({
      subtask: s,
      messages: all.filter((m) => m.subtaskId === s.id),
    }));
    return { taskThread, subtaskThreads, total: all.length };
  }, [task?.comments, task?.timeEntries, task?.subtasks]);

  // System events only — the human conversation lives in the Discussion.
  const activityItems = useMemo(
    () =>
      (task?.activities || [])
        .slice()
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [task?.activities]
  );

  if (loading && !task) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <Skeleton className="h-80 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
        <h2 className="text-lg font-semibold">Task not found</h2>
        <p className="mb-4 text-muted-foreground">
          The task you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {canGoBack ? 'Go back' : 'Back to Projects'}
        </Button>
      </div>
    );
  }

  if (!task) return null;

  const assigneeStats = getAssigneeStats();

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={task.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {project && (
              <Link
                to={`/projects/${project.id}`}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                {project.name}
              </Link>
            )}
            <Badge className={`border text-[11px] px-2 py-0.5 ${getPriorityColor(task.priority)}`} variant="outline">
              {task.priority}
            </Badge>
            {task.column && (
              <Badge variant="outline" className="text-[11px] px-2 py-0.5">{task.column.name}</Badge>
            )}
            {task.scopeItem && (
              <Badge variant="outline" className="text-[11px] gap-1 px-2 py-0.5">
                <Link2 className="h-3 w-3" />
                <span className="font-mono">{task.scopeItem.wbsNumber}</span>
                <span className="max-w-[200px] truncate">{task.scopeItem.title}</span>
              </Badge>
            )}
            {!!task.loggedHours && task.loggedHours > 0 && (
              <span className="flex items-center gap-1 text-xs text-primary font-medium">
                <Timer className="h-3.5 w-3.5" />
                {Number(task.loggedHours) % 1 === 0 ? Number(task.loggedHours) : Number(task.loggedHours).toFixed(2)}h logged
              </span>
            )}
          </span>
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          title={canGoBack ? 'Back to the previous page' : 'Back to the project board'}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {can('task.delete') && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          {task.description && (
            <div className="bg-muted/50 rounded-lg px-4 py-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Subtasks (2-level checklist) — the clock icon aims the sidebar
              composer at that subtask; the chat icon opens its thread */}
          <div id="subtasks-section">
            <SubtaskChecklist
              taskId={task.id}
              subtasks={task.subtasks || []}
              members={effectiveMembers}
              timeEntries={task.timeEntries || []}
              onUpdate={fetchTask}
              onLogWork={targetSubtask}
              onDiscuss={discussSubtask}
            />
          </div>

          {/* Discussion — chat-style, grouped by work item: the task thread
              first, then one collapsible thread per subtask. The composer
              posts to whichever thread is selected. */}
          <div id="discussion-section" className="rounded-lg border dark:border-gray-800 bg-card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Discussion
                <Badge variant="secondary" className="text-[10px]">{threads.total}</Badge>
              </h4>
            </div>

            {/* Task thread */}
            <ThreadSection
              title="Task"
              icon={<FolderKanban className="h-3.5 w-3.5" />}
              messages={threads.taskThread}
              count={threads.taskThread.length}
              collapsed={!!collapsedThreads['task']}
              onToggle={() => setCollapsedThreads((prev) => ({ ...prev, task: !prev.task }))}
              onSelect={() => setThreadSubtaskId(null)}
              selected={threadSubtaskId === null}
              mine={user?.id}
              onViewAttachment={setViewingAttachment}
              getInitials={getInitials}
            />

            {/* One thread per subtask */}
            {threads.subtaskThreads.map(({ subtask, messages }: any) => (
              <ThreadSection
                key={subtask.id}
                title={subtask.title}
                icon={<Check className="h-3.5 w-3.5" />}
                messages={messages}
                count={messages.length}
                collapsed={!!collapsedThreads[String(subtask.id)]}
                onToggle={() => setCollapsedThreads((prev) => ({ ...prev, [subtask.id]: !prev[String(subtask.id)] }))}
                onSelect={() => setThreadSubtaskId(subtask.id)}
                selected={threadSubtaskId === subtask.id}
                mine={user?.id}
                onViewAttachment={setViewingAttachment}
                getInitials={getInitials}
              />
            ))}

            {/* Chat composer — posts to the selected thread; hours live in the
                sidebar's log-work form, this is for talking. */}
            <div className="border-t border-border/50 pt-3 mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Posting to:</span>
                <Select
                  value={threadSubtaskId ? String(threadSubtaskId) : 'task'}
                  onValueChange={(v) => setThreadSubtaskId(v === 'task' ? null : Number(v))}
                >
                  <SelectTrigger className="h-7 w-auto min-w-[200px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task — {task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}</SelectItem>
                    {(task.subtasks || []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {newFiles.map((file, index) => (
                    <span
                      key={`${file.name}-${index}`}
                      className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 py-1 pl-2.5 pr-1 text-xs"
                    >
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {Math.max(1, Math.round(file.size / 1024))} KB
                      </span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-black/10"
                        onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
                        title={`Remove ${file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <label
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted/60"
                  title={`Attach files — up to ${MAX_FILES} × ${MAX_FILE_MB}MB. ${ACCEPTED_LABEL}.`}
                >
                  <Paperclip className="h-4 w-4" />
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      pickFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={threadSubtaskId ? 'Reply on this subtask…' : 'Message the team…'}
                  rows={2}
                  className="flex-1 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-9"
                  onClick={handleSendMessage}
                  disabled={!comment.trim() || sendingMessage}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {ACCEPTED_LABEL} — up to {MAX_FILES} files, {MAX_FILE_MB}MB each. Hours go in the Log work form, not here.
              </p>
            </div>
          </div>

          {/* Activity Timeline — system events only; conversation lives above */}
          <div>
            <button
              onClick={() => setActivityOpen(!activityOpen)}
              className="w-full flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
            >
              {activityOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <Clock className="h-4 w-4 text-muted-foreground" />
              Activity History
              <Badge variant="secondary" className="ml-auto text-[10px]">{activityItems.length}</Badge>
            </button>
            {activityOpen && (
              <div className="space-y-0 max-h-[400px] overflow-y-auto pr-2 thin-scrollbar mt-3">
                {activityItems.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
                )}
                {activityItems.map((item: any, idx: number) => (
                  <div key={item.id ?? idx} className="flex gap-3 group">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {getActivityIcon(item.action)}
                      </div>
                      {idx < activityItems.length - 1 && (
                        <div className="w-px flex-1 bg-border min-h-[16px]" />
                      )}
                    </div>

                    <div className="flex-1 pb-4 min-w-0">
                      <span className="text-[11px] text-muted-foreground/70">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                      <p className="text-xs mt-1 leading-relaxed">
                        {getActivityDescription(item)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Work-log composer — the one and only. Subtask rows target it
              via their clock icon; the target chip shows where hours land. */}
          <div
            id="log-work-composer"
            className={`rounded-lg border bg-card p-4 space-y-3 transition-colors ${
              logSubtaskId ? 'border-primary/50' : 'dark:border-gray-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" /> Log work
              </h4>
              {logSubtaskId ? (
                <button
                  type="button"
                  onClick={() => setLogSubtaskId(null)}
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                  title="Click to log against the task itself"
                >
                  {task.subtasks?.find((s: any) => s.id === logSubtaskId)?.title ?? `Subtask #${logSubtaskId}`}
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <div className="w-20 shrink-0">
                <Label className="text-[11px] text-muted-foreground">Hrs</Label>
                <Input
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  value={workingHours}
                  onChange={(e) => setWorkingHours(e.target.value)}
                  placeholder="0.0"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1">
                <Label className="text-[11px] text-muted-foreground">Work done</Label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What did you work on?"
                  rows={3}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleAddComment}
                disabled={!comment.trim() || sendingComment}
                size="sm"
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Log Work
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {logSubtaskId
                ? 'Hours will be logged against the selected subtask — click its chip to log on the task instead.'
                : 'Hours are saved to your timesheet as an entry on this task; leave hours empty to post a plain comment. Use the clock icon on a subtask to log against it.'}
            </p>
          </div>

          {/* Details: due date + scope */}
          <div className="rounded-lg border dark:border-gray-800 bg-card p-4 space-y-4">
            <h4 className="text-sm font-semibold">Details</h4>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Due date
              </Label>
              {editingDueDate ? (
                <div className="flex items-center gap-1.5">
                  <DatePicker value={dueDateValue} onChange={setDueDateValue} />
                  <Button size="icon" className="h-7 w-7" onClick={handleSaveDueDate}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingDueDate(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => { setDueDateValue(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''); setEditingDueDate(true); }}
                  disabled={!canEditTask}
                  className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors disabled:cursor-default"
                >
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Set due date'}
                </button>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5" /> Scope item
              </Label>
              {editingScope ? (
                <div className="flex items-center gap-1.5">
                  <Select value={scopeValue || 'none'} onValueChange={setScopeValue}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No scope item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No scope item</SelectItem>
                      {scopeLeafOptions.map((option: { value: string; label: string }) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon" className="h-7 w-7" onClick={handleSaveScope} disabled={savingScope}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingScope(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : task.scopeItem ? (
                <button
                  onClick={() => { if (!canEditTask || scopeLeafOptions.length === 0) return; setScopeValue(task.scopeItem?.id ? String(task.scopeItem.id) : ''); setEditingScope(true); }}
                  disabled={!canEditTask || scopeLeafOptions.length === 0}
                  className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors disabled:cursor-default"
                >
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{task.scopeItem.wbsNumber}</span>
                  <span className="truncate">{task.scopeItem.title}</span>
                </button>
              ) : (
                <button
                  onClick={() => { if (!canEditTask) return; setScopeValue(''); setEditingScope(true); }}
                  disabled={!canEditTask}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:cursor-default"
                >
                  {scopeLeafOptions.length > 0 ? 'Link a scope item' : 'No scope items on this project'}
                </button>
              )}
            </div>
          </div>

          {/* Assignees */}
          <div className="rounded-lg border dark:border-gray-800 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" /> Assignees
              </h4>
              {canEditTask && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditAssignees(!editAssignees)}>
                  {editAssignees ? 'Cancel' : 'Edit'}
                </Button>
              )}
            </div>

            {editAssignees ? (
              <div className="space-y-3">
                <MultiSelect
                  options={assigneeOptions}
                  selected={selectedAssignees}
                  onChange={setSelectedAssignees}
                  placeholder="Select team members..."
                />
                <Button size="sm" onClick={handleSaveAssignees} disabled={savingAssignees}>
                  {savingAssignees ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {assigneeStats.length > 0 ? (
                  assigneeStats.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(a.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{a.email}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {a.commentCount} updates
                          </span>
                          {a.totalHoursLogged > 0 && (
                            <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              {a.totalHoursLogged}h logged
                            </span>
                          )}
                          {a.assignedAt && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {a.hoursActive < 1 ? '<1' : a.hoursActive}h active
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No one assigned yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Task"
        description={`Are you sure you want to delete "${task.title}"? This action cannot be undone and all associated data will be permanently removed.`}
        onConfirm={handleDelete}
      />

      {/* Attachment viewer — images large, other files as a download card.
          The cookie carries auth, so a plain <img> needs no token. */}
      <Dialog open={!!viewingAttachment} onOpenChange={(open) => !open && setViewingAttachment(null)}>
        <DialogContent
          className={
            viewingAttachment?.mimeType?.startsWith('image/')
              ? 'max-w-[min(1100px,92vw)] p-3'
              : 'max-w-md'
          }
        >
          {viewingAttachment?.mimeType?.startsWith('image/') ? (
            <div className="space-y-2">
              <img
                src={`/api/tasks/attachments/${viewingAttachment.id}/download`}
                alt={viewingAttachment.originalName}
                className="max-h-[75vh] w-full rounded-md object-contain"
              />
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{viewingAttachment.originalName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {viewingAttachment.uploader?.name ?? 'Unknown'} ·{' '}
                    {Math.max(1, Math.round(viewingAttachment.size / 1024))} KB
                  </p>
                </div>
                <a
                  href={`/api/tasks/attachments/${viewingAttachment.id}/download`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs hover:bg-muted/60"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </div>
            </div>
          ) : viewingAttachment ? (
            <div className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{viewingAttachment.originalName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {viewingAttachment.uploader?.name ?? 'Unknown'} ·{' '}
                    {Math.max(1, Math.round(viewingAttachment.size / 1024))} KB ·{' '}
                    {viewingAttachment.mimeType}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This file type cannot be previewed in the browser — download it to view.
              </p>
              <a
                href={`/api/tasks/attachments/${viewingAttachment.id}/download`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                <Download className="h-4 w-4" />
                Download file
              </a>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * One collapsible thread inside the Discussion — the task itself or a
 * subtask. Bubbles are helpdesk-style (own messages right in primary,
 * others left); the header row is also the composer target selector, so
 * clicking "Reply here" points the chat input at this thread.
 */
function ThreadSection({
  title,
  icon,
  messages,
  count,
  collapsed,
  onToggle,
  onSelect,
  selected,
  mine,
  onViewAttachment,
  getInitials,
}: {
  title: string;
  icon: React.ReactNode;
  messages: any[];
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: () => void;
  selected: boolean;
  mine?: number;
  onViewAttachment: (a: any) => void;
  getInitials: (name: string) => string;
}) {
  const last = messages[messages.length - 1];
  return (
    <div className={`rounded-lg border ${selected ? 'border-primary/40' : 'border-border/50'} mb-2`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="text-muted-foreground">{icon}</span>
        <button
          type="button"
          onClick={onSelect}
          className={`flex-1 min-w-0 text-left text-sm truncate ${selected ? 'font-semibold text-foreground' : 'hover:text-foreground'}`}
          title="Send replies here"
        >
          {title}
        </button>
        {count > 0 && (
          <Badge variant="secondary" className="text-[10px] shrink-0">{count}</Badge>
        )}
        {last && !collapsed && (
          <span className="hidden sm:inline text-[10px] text-muted-foreground shrink-0">
            {formatRelativeTime(last.createdAt)}
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1 thin-scrollbar border-t border-border/40 px-3 py-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No messages yet.</p>
          )}
          {messages.map((m: any) => {
            const isMine = m.user?.id === mine;
            return (
              <div key={m.id} className={`flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                {!isMine && (
                  <Avatar className="h-7 w-7 mt-1 shrink-0">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(m.user?.name || '?')}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[75%] space-y-1 ${isMine ? 'items-end text-right' : ''}`}>
                  <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isMine ? 'justify-end' : ''}`}>
                    <span className="font-medium text-foreground">{isMine ? 'You' : m.user?.name ?? 'Unknown'}</span>
                    <span>{formatRelativeTime(m.createdAt)}</span>
                  </div>
                  <div
                    className={`inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm whitespace-pre-wrap break-words ${
                      m.isWorkLog
                        ? // Work logs keep the timer treatment — hours are facts, not chat.
                          'border border-primary/30 bg-primary/5 rounded-bl-md'
                        : isMine
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted rounded-bl-md'
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.attachments?.length > 0 && (
                    <div className={`flex flex-wrap gap-1.5 ${isMine ? 'justify-end' : ''}`}>
                      {m.attachments.map((a: any) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => onViewAttachment(a)}
                          className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs hover:bg-muted/60"
                          title={`${a.originalName} — click to view`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{a.originalName}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {Math.max(1, Math.round(a.size / 1024))} KB
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {isMine && (
                  <Avatar className="h-7 w-7 mt-1 shrink-0">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(m.user?.name || '?')}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
