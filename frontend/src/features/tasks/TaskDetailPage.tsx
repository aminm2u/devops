import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, ArrowLeft, Calendar, Clock, MessageSquare, UserPlus, UserMinus,
  ArrowRight, Plus, Edit, Check, X, ChevronDown, ChevronRight, Link2,
  FolderKanban, Trash2, Download, FileText, Timer, Activity,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { todayLocal, formatRelativeTime, cn } from '@/lib/utils';
import apiClient from '@/api/client';
import toast from '@/lib/toast';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { SubtaskChecklist } from '@/components/tasks/SubtaskChecklist';
import { MessageBubble, type ChatMessage } from '@/components/chat/MessageBubble';
import { ChatComposer, type ComposerMode, type ComposerTarget } from '@/components/chat/ChatComposer';

/**
 * The full-page task workspace at /tasks/:id (publicId uuid).
 *
 * Two zones, two jobs:
 *
 *   left  — the work itself: description, subtasks, activity history. Scrolls
 *           with the page like any document.
 *   right — the task's conversation: a permanent, independently-scrolling
 *           Discussion pane. The task thread is the default channel and each
 *           subtask gets its own pill, so a task owns its discussion instead
 *           of the discussion being one collapsible box among many.
 *
 * One composer serves both talking and logging hours — two modes of one form,
 * not two boxes writing into the same state (which is what the old layout did).
 *
 * Accepts a numeric id too (legacy links), same as the backend resolver.
 */

/** Comments page size — mirrors the backend's default. */
const COMMENT_PAGE = 50;

const MAX_FILES = 5;
const MAX_FILE_MB = 10;
const ACCEPTED_LABEL = 'Images, PDF, Word, Excel, PowerPoint, text, CSV, ZIP/RAR';

interface CommentPage {
  messages: ChatMessage[];
  hasMore: boolean;
  nextBefore: number | null;
}

type ChannelKey = 'all' | 'task' | number;

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // 'PUSH' means the user navigated here from inside the app, so there is a
  // previous page to return to. A direct link ('POP'/'REPLACE' on first load)
  // has none — send those to the parent project instead of stepping out of
  // the app or doing nothing.
  const navigationType = useNavigationType();
  const canGoBack = navigationType === 'PUSH';
  const { can, user } = useAuth();
  const canEditTask = can('task.manage');

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<any>(null);

  // ── Discussion ────────────────────────────────────────────────────────────
  // Messages are paged per channel. `channelCache` keeps what each channel has
  // loaded so switching pills is instant; `channel` is the visible one.
  const [channel, setChannel] = useState<ChannelKey>('all');
  const [channelCache, setChannelCache] = useState<Record<string, CommentPage>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [seenChannels, setSeenChannels] = useState<Record<string, number>>({});
  const [viewingAttachment, setViewingAttachment] = useState<any>(null);

  // ── Composer ──────────────────────────────────────────────────────────────
  const [composerMode, setComposerMode] = useState<ComposerMode>('message');
  const [messageDraft, setMessageDraft] = useState('');
  const [logHours, setLogHours] = useState('');
  const [logDraft, setLogDraft] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);

  // ── Inline editors ────────────────────────────────────────────────────────
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

  const discussionEndRef = useRef<HTMLDivElement>(null);
  const discussionPaneRef = useRef<HTMLDivElement>(null);
  const { socket, isConnected } = useSocket();

  // Only ACTIVE members may be assigned. Removing someone flips `isActive`
  // rather than deleting the assignment row, so an unfiltered list still
  // offers people who have left the project — they cannot see the work, and
  // the server rejects the assignment anyway.
  //
  // The checklist gets the FULL list so it can still print the name of a
  // departed member left over on an old subtask; it filters its own options.
  const teamMembers = project?.teamAssignments ?? [];
  const activeMembers = useMemo(
    () => teamMembers.filter((m: any) => m.isActive !== false),
    [teamMembers]
  );
  const assigneeOptions: Option[] = activeMembers.map((m: any) => ({
    label: m.user.name,
    value: String(m.userId ?? m.id),
  }));

  const channelKey = (key: ChannelKey) => String(key);

  // ── Fetching ──────────────────────────────────────────────────────────────

  const fetchTask = async () => {
    try {
      setLoading(true);
      setNotFound(false);
      const res = await apiClient.get(`/tasks/${id}`);
      const data = res.data.data;
      setTask(data);
      setSelectedAssignees((data.assignees || []).map(String));
      setCommentCounts(data.commentCounts ?? {});
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

  const fetchComments = useCallback(
    async (key: ChannelKey, opts: { before?: number; append?: boolean } = {}) => {
      if (!task) return;
      const cacheKey = channelKey(key);
      setLoadingMessages(true);
      try {
        const params = new URLSearchParams({ channel: cacheKey, limit: String(COMMENT_PAGE) });
        if (opts.before) params.set('before', String(opts.before));
        const res = await apiClient.get(`/tasks/${task.id}/comments?${params.toString()}`);
        const page: ChatMessage[] = res.data.data ?? [];
        setChannelCache((prev) => {
          const existing = prev[cacheKey];
          const merged =
            opts.append && existing
              ? // `append` prepends an older page; dedupe by id in case the
                // boundary row arrived through the socket meanwhile.
                [
                  ...page,
                  ...existing.messages.filter((m) => !page.some((p) => p.id === m.id)),
                ]
              : page;
          return {
            ...prev,
            [cacheKey]: { messages: merged, hasMore: !!res.data.meta?.hasMore, nextBefore: res.data.meta?.nextBefore ?? null },
          };
        });
      } catch {
        toast.error('Failed to load messages');
      } finally {
        setLoadingMessages(false);
      }
    },
    [task?.id]
  );

  useEffect(() => {
    if (id) fetchTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load the visible channel on first need. `all` is the default view.
  useEffect(() => {
    if (!task) return;
    if (!channelCache[channelKey(channel)]) fetchComments(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, channel]);

  // Track "seen" so a channel pill can flag messages that arrived while you
  // were reading another channel. Local to this session — no read receipts.
  // Counts compare like with like: stored counts are comment totals, the seen
  // marker is the number of loaded comments, so a paged channel that is
  // currently open does not keep flagging itself.
  useEffect(() => {
    const page = channelCache[channelKey(channel)];
    if (!page) return;
    const total = channel === 'all'
      ? Object.values(commentCounts).reduce((a, b) => a + b, 0)
      : commentCounts[channelKey(channel)] ?? 0;
    setSeenChannels((prev) => ({ ...prev, [channelKey(channel)]: total }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, channelCache, commentCounts]);

  // Keep the newest bubble in view when the visible channel grows.
  const visibleMessages = channelCache[channelKey(channel)]?.messages ?? [];
  useEffect(() => {
    discussionEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [visibleMessages.length, channel]);

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket || !task?.id) return;
    // The backend scopes task events to project-<id>; without the join this
    // page would receive nothing at all.
    if (task.projectId) socket.emit('join-project', task.projectId);

    const handleActivity = (data: any) => {
      if (data.taskId === task.id) {
        setTask((prev: any) => ({
          ...prev,
          activities: [...(prev?.activities || []), data.activity],
        }));
      }
    };
    const handleComment = (data: any) => {
      if (data.taskId !== task.id || !data.comment) return;
      const comment: ChatMessage = data.comment;
      const key = comment.subtaskId == null ? 'task' : String(comment.subtaskId);
      setCommentCounts((prev) => ({
        ...prev,
        task: prev.task ?? 0,
        [key]: (prev[key] ?? 0) + 1,
      }));
      // Drop it into whichever caches are already loaded.
      setChannelCache((prev) => {
        const next = { ...prev };
        for (const cacheKey of ['all', key]) {
          const page = next[cacheKey];
          if (page && !page.messages.some((m) => m.id === comment.id)) {
            next[cacheKey] = { ...page, messages: [...page.messages, comment] };
          }
        }
        return next;
      });
    };
    const handleUpdate = (data: any) => {
      if (data?.taskId === task.id || data?.task?.id === task.id) fetchTask();
    };

    socket.on('task-activity', handleActivity);
    socket.on('task-comment', handleComment);
    socket.on('task-updated', handleUpdate);

    return () => {
      socket.off('task-activity', handleActivity);
      socket.off('task-comment', handleComment);
      socket.off('task-updated', handleUpdate);
      if (task.projectId) socket.emit('leave-project', task.projectId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, task?.id, task?.projectId]);

  // ── Posting ───────────────────────────────────────────────────────────────

  /** Target of the next post: `all` falls back to the task itself. */
  const targetSubtaskId: number | null =
    typeof channel === 'number' ? channel : null;

  const submitMessage = async () => {
    if (!task || !messageDraft.trim()) return;
    try {
      setPosting(true);
      let res;
      if (newFiles.length > 0) {
        const form = new FormData();
        form.append('content', messageDraft.trim());
        if (targetSubtaskId != null) form.append('subtaskId', String(targetSubtaskId));
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
          content: messageDraft.trim(),
          subtaskId: targetSubtaskId,
        });
      }
      const saved: ChatMessage = res.data.data;
      const savedKey = saved.subtaskId == null ? 'task' : String(saved.subtaskId);
      setCommentCounts((prev) => ({
        ...prev,
        task: prev.task ?? 0,
        [savedKey]: (prev[savedKey] ?? 0) + 1,
      }));
      setChannelCache((prev) => {
        const next = { ...prev };
        for (const cacheKey of ['all', savedKey]) {
          const page = next[cacheKey];
          if (page && !page.messages.some((m) => m.id === saved.id)) {
            next[cacheKey] = { ...page, messages: [...page.messages, saved] };
          }
        }
        return next;
      });
      setMessageDraft('');
      setNewFiles([]);
    } catch {
      toast.error('Failed to send message');
    } finally {
      setPosting(false);
    }
  };

  const submitLog = async () => {
    if (!task) return;
    const hours = Math.round((Number.parseFloat(logHours || '0') || 0) * 4) / 4;
    if (hours <= 0 || !logDraft.trim()) return;
    try {
      setPosting(true);
      // Shared work log — same TimeEntry record as the Timesheet page.
      const res = await apiClient.post('/timesheet/entries', {
        workDate: todayLocal(),
        hours,
        description: logDraft.trim(),
        taskId: task.id,
        ...(targetSubtaskId != null ? { subtaskId: targetSubtaskId } : {}),
      });
      setTask((prev: any) => ({
        ...prev,
        timeEntries: [...(prev?.timeEntries || []), res.data.data],
        // The header reads this scalar; keep it honest without a refetch.
        loggedHours: Number(prev?.loggedHours || 0) + Number(res.data.data?.hours || 0),
      }));
      toast.success(targetSubtaskId != null ? 'Work logged on subtask' : 'Work logged');
      setLogHours('');
      setLogDraft('');
    } catch {
      toast.error('Failed to log work');
    } finally {
      setPosting(false);
    }
  };

  const submitComposer = () => {
    if (composerMode === 'log') submitLog();
    else submitMessage();
  };

  const pickFiles = (picked: FileList | null) => {
    const files = Array.from(picked ?? []);
    const rejected = files.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    const accepted = files.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    // Compute the combined list before storing so the overflow check sees the
    // array that will actually be kept, not the pre-update state.
    const combined = [...newFiles, ...accepted];
    setNewFiles(combined.slice(0, MAX_FILES));
    if (rejected.length > 0) {
      toast.error(`${rejected.length} file${rejected.length > 1 ? 's' : ''} skipped — over the ${MAX_FILE_MB}MB limit`);
    }
    if (combined.length > MAX_FILES) {
      toast.error(`At most ${MAX_FILES} files per message`);
    }
  };

  // ── Detail editors ────────────────────────────────────────────────────────

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

  // ── Derived ───────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (canGoBack) navigate(-1);
    else if (task?.projectId) navigate(`/projects/${task.projectId}?tab=kanban`);
    else navigate('/projects');
  };

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
        return <><strong>{userName}</strong> commented: <em className="text-muted-foreground">&quot;{d.preview}&quot;</em></>;
      case 'assigned':
        return <><strong>{userName}</strong> assigned <strong>{d.assigneeName}</strong></>;
      case 'unassigned':
        return <><strong>{userName}</strong> unassigned <strong>{d.assigneeName}</strong></>;
      case 'updated':
        return <><strong>{userName}</strong> updated {d.fields?.join(', ')}</>;
      case 'work_logged':
        return <><strong>{userName}</strong> logged <strong>{d.hours}h</strong> of work{d.subtaskId ? ' on a subtask' : ''}: <em className="text-muted-foreground">&quot;{d.description}&quot;</em></>;
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
    const userCounts: Record<string, number> = task.commentUserCounts ?? {};
    return task.assigneeDetails.map((a: any) => {
      const assignActivities = (task.activities || []).filter(
        (act: any) => act.action === 'assigned' && act.details?.assigneeId === a.id
      );
      const userEntries = (task.timeEntries || []).filter((e: any) => e.userId === a.id);
      const totalHoursLogged = userEntries.reduce(
        (sum: number, e: any) => sum + (parseFloat(e.hours) || 0),
        0
      );
      const assignedAt = assignActivities.length > 0 ? new Date(assignActivities[0].createdAt) : null;
      const hoursActive = assignedAt
        ? Math.round((Date.now() - assignedAt.getTime()) / (1000 * 60 * 60))
        : 0;
      return {
        ...a,
        commentCount: userCounts[String(a.id)] ?? 0,
        totalHoursLogged,
        assignedAt,
        hoursActive,
      };
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

  /**
   * The conversation, grouped by work item. Comments arrive paged per channel;
   * work logs come whole from the task payload and are woven in by timestamp so
   * "logged 2h" entries read as chat updates from the person who did them.
   * (Above the early returns: hooks must run on every render.)
   */
  const mergeChannel = useCallback(
    (key: ChannelKey): ChatMessage[] => {
      const comments = channelCache[channelKey(key)]?.messages ?? [];
      // Work logs are TimeEntry rows, not comments, so they are not part of a
      // paged comment fetch — they come whole from the task payload and are
      // filtered to the visible channel here ('all' keeps every one).
      const inChannel = (subtaskId: number | null | undefined) => {
        if (key === 'all') return true;
        if (key === 'task') return subtaskId == null;
        return subtaskId === key;
      };
      const workLogs: ChatMessage[] = (task?.timeEntries || [])
        .filter((e: any) => inChannel(e.subtaskId))
        .map((e: any) => ({
          id: `work-${e.id}`,
          subtaskId: e.subtaskId ?? null,
          user: e.user,
          content: `⏱ Logged ${Number(e.hours)}h — ${e.description}`,
          createdAt: e.createdAt || e.workDate,
          attachments: [],
          isWorkLog: true,
        }));
      return [...comments, ...workLogs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    },
    [channelCache, task?.timeEntries]
  );

  const visibleThread = useMemo(() => mergeChannel(channel), [mergeChannel, channel]);

  // System events only — the human conversation lives in the Discussion.
  const activityItems = useMemo(
    () =>
      (task?.activities || [])
        .slice()
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [task?.activities]
  );

  // Channel pills: All, then the task itself, then each subtask.
  const channels = useMemo(() => {
    const subtasks = task?.subtasks || [];
    return [
      { key: 'all' as ChannelKey, label: 'All', count: Object.values(commentCounts).reduce((a, b) => a + b, 0) },
      { key: 'task' as ChannelKey, label: 'Task', count: commentCounts.task ?? 0 },
      ...subtasks.map((s: any) => ({
        key: s.id as ChannelKey,
        label: s.title,
        count: commentCounts[String(s.id)] ?? 0,
      })),
    ];
  }, [task?.subtasks, commentCounts]);

  const composerTargets: ComposerTarget[] = useMemo(
    () => [
      { subtaskId: null, label: 'Task — this task itself' },
      ...(task?.subtasks || []).map((s: any) => ({ subtaskId: s.id as number, label: s.title })),
    ],
    [task?.subtasks]
  );

  const composerTargetLabel =
    targetSubtaskId == null
      ? 'the task'
      : task?.subtasks?.find((s: any) => s.id === targetSubtaskId)?.title ?? `Subtask #${targetSubtaskId}`;

  const subtaskProgress = useMemo(() => {
    const subtasks = task?.subtasks || [];
    const done = subtasks.filter((s: any) => s.status === 'done').length;
    return { done, total: subtasks.length, pct: subtasks.length ? (done / subtasks.length) * 100 : 0 };
  }, [task?.subtasks]);

  const dueTone = useMemo(() => {
    if (!task?.dueDate) return 'text-muted-foreground';
    const due = new Date(task.dueDate).getTime();
    const now = Date.now();
    if (due < now) return 'text-destructive';
    if (due - now < 3 * 24 * 60 * 60 * 1000) return 'text-amber-500';
    return 'text-muted-foreground';
  }, [task?.dueDate]);

  // ── Early returns ─────────────────────────────────────────────────────────

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
  const currentPage = channelCache[channelKey(channel)];

  // ── Render ────────────────────────────────────────────────────────────────

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
            <StatusBadge domain="helpdeskPriority" value={task.priority} />
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
            {subtaskProgress.total > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5" />
                {subtaskProgress.done}/{subtaskProgress.total}
                <Progress value={subtaskProgress.pct} className="h-1.5 w-16" />
              </span>
            )}
            {task.dueDate && (
              <span className={cn('flex items-center gap-1 text-xs', dueTone)}>
                <Calendar className="h-3.5 w-3.5" />
                {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
          </span>
        }
      >
        {/* Who is on this, at a glance */}
        {assigneeStats.length > 0 && (
          <div className="flex items-center -space-x-2 mr-1">
            {assigneeStats.slice(0, 3).map((a: any) => (
              <UserAvatar
                key={a.id}
                user={a}
                size="sm"
                className="h-7 w-7 ring-2 ring-background"
              />
            ))}
            {assigneeStats.length > 3 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-background">
                +{assigneeStats.length - 3}
              </span>
            )}
          </div>
        )}
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:items-start">
        {/* ── Work column ─────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          {task.description && (
            <div className="rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Subtasks — the clock icon aims the composer at that subtask; the
              chat icon opens its channel in the Discussion pane. */}
          <div id="subtasks-section">
            <SubtaskChecklist
              taskId={task.id}
              subtasks={task.subtasks || []}
              members={teamMembers}
              timeEntries={task.timeEntries || []}
              onUpdate={fetchTask}
              onLogWork={(subtaskId) => {
                setChannel(subtaskId);
                setComposerMode('log');
                // On narrow screens the pane sits below the work column, so a
                // clock click must also bring it into view.
                discussionPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              onDiscuss={(subtaskId) => {
                setChannel(subtaskId);
                discussionPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          </div>

          {/* Activity History — system events only; conversation lives right */}
          <div className="rounded-xl border border-border/60 bg-card">
            <button
              onClick={() => setActivityOpen(!activityOpen)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors hover:text-primary"
            >
              {activityOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <Activity className="h-4 w-4 text-muted-foreground" />
              Activity History
              <Badge variant="secondary" className="ml-auto text-[10px]">{activityItems.length}</Badge>
            </button>
            {activityOpen && (
              <div className="max-h-[420px] space-y-0 overflow-y-auto border-t border-border/40 px-4 py-3 pr-2 thin-scrollbar">
                {activityItems.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No activity yet</p>
                )}
                {activityItems.map((item: any, idx: number) => (
                  <div key={item.id ?? idx} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        {getActivityIcon(item.action)}
                      </div>
                      {idx < activityItems.length - 1 && (
                        <div className="min-h-[16px] w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pb-4">
                      <span className="text-[11px] text-muted-foreground/70">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                      <p className="mt-1 text-xs leading-relaxed">
                        {getActivityDescription(item)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details + assignees under the work column so the Discussion pane
              stays the full height of the screen on the right. */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Details: due date + scope */}
            <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
              <h4 className="text-sm font-semibold">Details</h4>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
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
                    className={cn('flex items-center gap-1.5 text-sm transition-colors hover:text-primary disabled:cursor-default', dueTone)}
                  >
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Set due date'}
                  </button>
                )}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
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
                    className="flex items-center gap-1.5 text-sm transition-colors hover:text-primary disabled:cursor-default"
                  >
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{task.scopeItem.wbsNumber}</span>
                    <span className="truncate">{task.scopeItem.title}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { if (!canEditTask) return; setScopeValue(''); setEditingScope(true); }}
                    disabled={!canEditTask}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary disabled:cursor-default"
                  >
                    {scopeLeafOptions.length > 0 ? 'Link a scope item' : 'No scope items on this project'}
                  </button>
                )}
              </div>
            </div>

            {/* Assignees — same edit flow, avatars from the shared component */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
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
                      <div key={a.id} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5">
                        <UserAvatar user={a} size="md" className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-tight">{a.name}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{a.email}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MessageSquare className="h-3 w-3" />
                              {a.commentCount} updates
                            </span>
                            {a.totalHoursLogged > 0 && (
                              <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                                <Timer className="h-3 w-3" />
                                {a.totalHoursLogged}h logged
                              </span>
                            )}
                            {a.assignedAt && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
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

        {/* ── Discussion pane ─────────────────────────────────────────────── */}
        <div
          ref={discussionPaneRef}
          className="flex h-[70vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card lg:sticky lg:top-0 lg:h-[calc(100vh-7.5rem)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Discussion
              <Badge variant="secondary" className="text-[10px]">{visibleThread.length}</Badge>
            </h4>
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Channel pills */}
          <div className="flex gap-1 overflow-x-auto border-b border-border/40 px-3 py-2 scrollbar-none">
            {channels.map((c) => {
              const active = channelKey(channel) === channelKey(c.key);
              const cacheKey = channelKey(c.key);
              const unseen =
                c.count > (seenChannels[cacheKey] ?? 0) && channelKey(channel) !== cacheKey && c.count > 0;
              return (
                <button
                  key={cacheKey}
                  type="button"
                  onClick={() => setChannel(c.key)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    active
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
                  )}
                  title={c.label}
                >
                  <span className="max-w-[140px] truncate">{c.label}</span>
                  <span className={cn('rounded-full px-1 text-[10px]', active ? 'bg-primary/15' : 'bg-background/70')}>
                    {c.count}
                  </span>
                  {unseen && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 thin-scrollbar">
            {currentPage?.hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground"
                  disabled={loadingMessages}
                  onClick={() =>
                    fetchComments(channel, { before: currentPage.nextBefore ?? undefined, append: true })
                  }
                >
                  {loadingMessages ? 'Loading…' : 'Load earlier messages'}
                </Button>
              </div>
            )}

            {loadingMessages && !currentPage && (
              <div className="space-y-3">
                <Skeleton className="h-16 w-3/4 rounded-lg" />
                <Skeleton className="ml-auto h-16 w-2/3 rounded-lg" />
              </div>
            )}

            {!loadingMessages && visibleThread.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No messages yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Start the conversation{channel === 'all' ? '' : ' in this thread'} below.
                </p>
              </div>
            )}

            {visibleThread.map((m) => {
              const isMine = m.user?.id === user?.id;
              return (
                <div key={m.id} className="space-y-1">
                  <MessageBubble
                    message={m}
                    isMine={isMine}
                    onViewAttachment={setViewingAttachment}
                  />
                  <div className={cn('text-[10px] text-muted-foreground', isMine ? 'pr-9 text-right' : 'pl-9')}>
                    {formatRelativeTime(m.createdAt)}
                    {channel === 'all' && m.subtaskId != null && (
                      <>
                        {' · '}
                        <span className="text-primary/80">
                          {task.subtasks?.find((s: any) => s.id === m.subtaskId)?.title ?? 'subtask'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={discussionEndRef} />
          </div>

          <ChatComposer
            mode={composerMode}
            onModeChange={setComposerMode}
            target={{ subtaskId: targetSubtaskId, label: composerTargetLabel }}
            onClearTarget={() => setChannel('task')}
            targets={composerTargets}
            onTargetChange={(subtaskId) => setChannel(subtaskId ?? 'task')}
            messageDraft={messageDraft}
            onMessageDraftChange={setMessageDraft}
            logHours={logHours}
            onLogHoursChange={setLogHours}
            logDraft={logDraft}
            onLogDraftChange={setLogDraft}
            files={newFiles}
            onPickFiles={pickFiles}
            onRemoveFile={(index) => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
            maxFiles={MAX_FILES}
            maxFileMb={MAX_FILE_MB}
            acceptedLabel={ACCEPTED_LABEL}
            onSubmit={submitComposer}
            isSubmitting={posting}
          />
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
