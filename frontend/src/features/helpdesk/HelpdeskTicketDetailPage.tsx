import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Clock,
  CheckCircle,
  MessageSquare,
  Send,
  User,
  UserCircle,
  Paperclip,
  Download,
  FileText,
  X,
  AlertTriangle,
  Star,
  Lock,
  Info,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RichListBox } from '@/components/ui/rich-listbox';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import apiClient from '@/api/client';
import {
  HelpdeskTicket,
  HelpdeskTicketStatus,
  HelpdeskTicketPriority,
  HelpdeskComment,
  HelpdeskAttachment,
  HelpdeskCategory,
} from '@/types';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import toast from '@/lib/toast';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useEffect } from 'react';
import { can } from '@/lib/roles';

// ── Attachment rules ─────────────────────────────────────────────────────────

/**
 * What a comment may carry. Mirrors the backend's multer limit (5 files ×
 * 10MB); the accept list is a client-side courtesy — the server stores
 * whatever it is given, so the two stay honest together.
 */
const MAX_FILES = 5;
const MAX_FILE_MB = 10;
const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-rar-compressed',
];
const ACCEPT_ATTR = `${ACCEPTED_TYPES.join(',')},.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rar`;
const ACCEPTED_LABEL = 'Images, PDF, Word, Excel, PowerPoint, text, CSV, ZIP/RAR';

// ── Role Helpers ─────────────────────────────────────────────────────────────

// ── Helpers ─────────────────────────────────────────────────────────────────

function getStatusBadge(status: HelpdeskTicketStatus) {
  switch (status) {
    case 'open':
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
    case 'in_progress':
      return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300"><Loader2 className="h-3 w-3 mr-1 animate-spin" />In Progress</Badge>;
    case 'awaiting_response':
      return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300"><MessageSquare className="h-3 w-3 mr-1" />Awaiting Response</Badge>;
    case 'resolved':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
    case 'closed':
      return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900/40 dark:text-gray-300"><CheckCircle className="h-3 w-3 mr-1" />Closed</Badge>;
    case 'reopened':
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300"><AlertTriangle className="h-3 w-3 mr-1" />Reopened</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getPriorityBadge(priority: HelpdeskTicketPriority) {
  switch (priority) {
    case 'urgent':
      return <Badge className="bg-red-600 text-gray-100 hover:bg-red-700 dark:bg-red-900/40 dark:text-red-300">Urgent</Badge>;
    case 'high':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300">High</Badge>;
    case 'medium':
      return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300">Medium</Badge>;
    case 'low':
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300">Low</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function HelpdeskTicketDetailPage() {
  // The route token — a publicId uuid, or a legacy numeric id from old links.
  // API calls may use it as-is (the backend resolves both), but the socket
  // room and the event filters below need the numeric id, which only exists
  // once the ticket has loaded.
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();

  const [newComment, setNewComment] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [isInternal, setIsInternal] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showSatisfactionDialog, setShowSatisfactionDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Fetch ticket
  const { data: ticketData, isLoading } = useQuery({
    queryKey: ['helpdesk-ticket', id],
    queryFn: async () => {
      const res = await apiClient.get(`/helpdesk/tickets/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
  const ticket: HelpdeskTicket | undefined = ticketData?.data;
  const ticketNumId = ticket?.id;

  useEffect(() => {
    // Live updates ride rooms keyed by the numeric id, so joining and
    // filtering wait for the record rather than forcing the URL token.
    if (socket && isConnected && ticketNumId) {
      socket.emit('join-ticket', ticketNumId);

      socket.on('new-comment', (data) => {
        if (data.ticketId === ticketNumId) {
          // invalidate or update cache
          queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
        }
      });

      socket.on('ticket-updated', (data) => {
        if (data.ticket?.id === ticketNumId) {
          queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
        }
      });

      return () => {
        socket.emit('leave-ticket', ticketNumId);
        socket.off('new-comment');
        socket.off('ticket-updated');
      };
    }
  }, [socket, isConnected, id, ticketNumId, queryClient]);

  // The assignment dropdown is the only consumer of this list, and opening it
  // is itself gated on `helpdesk.ticket.manage` — the same permission the API
  // checks. Fetching it unconditionally meant a reporter loading their own
  // ticket got a 403 (twice, once per retry) and a toast each time, for data
  // the page has no control to show. Ask only when the answer can be used.
  const managesQueue = can(user, 'helpdesk.ticket.manage');

  const { data: usersData } = useQuery({
    queryKey: ['helpdesk-users'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/users');
      // Unwrap to the array itself. This key is shared with the Helpdesk Queue
      // page, which expects the array — caching the raw `{ data: [...] }`
      // envelope here meant whichever page loaded first decided the shape, and
      // the other one crashed on `.filter`.
      return res.data.data as { id: number; name: string; email: string }[];
    },
    enabled: managesQueue,
  });

  // Classification options — same gating as the users list above: only the
  // people who can edit classification can use the lists, so only they fetch.
  const { data: categoriesData } = useQuery({
    queryKey: ['helpdesk-categories'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/categories');
      return res.data.data as HelpdeskCategory[];
    },
    enabled: managesQueue,
  });
  const { data: projectsData } = useQuery({
    queryKey: ['helpdesk-projects'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/projects');
      return res.data.data as { id: number; name: string }[];
    },
    enabled: managesQueue,
  });

  // Set/reset category and project — the API accepts both on the general
  // update route, gated on `helpdesk.ticket.manage` (same permission as
  // assign). Null resets to "none".
  const classificationMutation = useMutation({
    mutationFn: async (patch: { categoryId?: number | null; projectId?: number | null }) => {
      const res = await apiClient.put(`/helpdesk/tickets/${id}`, patch);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets-manage'] });
      toast.success('Ticket classification updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update classification');
    },
  });

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, resolutionNotes }: { status: HelpdeskTicketStatus; resolutionNotes?: string }) => {
      const res = await apiClient.put(`/helpdesk/tickets/${id}/status`, { status, resolutionNotes });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-stats'] });
      toast.success('Status updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update status');
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (assignedTo: number | null) => {
      const res = await apiClient.put(`/helpdesk/tickets/${id}/assign`, { assignedTo });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets'] });
      setShowAssignDialog(false);
      toast.success('Ticket assigned');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to assign ticket');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.delete(`/helpdesk/tickets/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-stats'] });
      toast.success('Ticket deleted');
      navigate('/helpdesk');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to delete ticket');
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (input: { content: string; isInternal: boolean; files: File[] }) => {
      // Multipart when files ride along — the backend's multer middleware
      // parses both shapes on this route.
      if (input.files.length > 0) {
        const form = new FormData();
        form.append('content', input.content);
        form.append('isInternal', String(input.isInternal));
        input.files.forEach((file) => form.append('attachments', file));
        const res = await apiClient.post(`/helpdesk/tickets/${id}/comments`, form, {
          // The shared client pins Content-Type to application/json, which
          // overrides axios's FormData detection — multer then sees JSON and
          // finds no files. Passing undefined makes axios set the multipart
          // header with its boundary itself.
          headers: { 'Content-Type': undefined },
        });
        return res.data;
      }
      const res = await apiClient.post(`/helpdesk/tickets/${id}/comments`, {
        content: input.content,
        isInternal: input.isInternal,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
      setNewComment('');
      setNewFiles([]);
      setIsInternal(false);
      toast.success('Comment added');
    },
    onError: (err: any) => {
      // A 400 carries a per-field map; the headline alone ("Validation failed")
      // does not tell the user which box to fix.
      const errors = err?.response?.data?.errors as Record<string, string[]> | undefined;
      const first = errors && Object.values(errors).flat()[0];
      toast.error(first || err?.response?.data?.error || 'Failed to add comment');
    },
  });

  const satisfactionMutation = useMutation({
    mutationFn: async (data: { satisfaction: number; feedback?: string }) => {
      const res = await apiClient.put(`/helpdesk/tickets/${id}/satisfaction`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
      setShowSatisfactionDialog(false);
      toast.success('Thank you for your feedback');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to submit feedback');
    },
  });

  const users = usersData || [];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-[200px]" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-[200px]" />
            <Skeleton className="h-[300px]" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-[150px]" />
            <Skeleton className="h-[200px]" />
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Ticket not found</p>
        <Button variant="ghost" onClick={() => navigate('/helpdesk')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tickets
        </Button>
      </div>
    );
  }

  const activeStatuses: HelpdeskTicketStatus[] = ['open', 'in_progress', 'awaiting_response', 'reopened'];
  const canChangeStatus = activeStatuses.includes(ticket.status);

  // Capability checks, mirroring the API. `helpdesk.ticket.manage` is the
  // permission the assign, update and delete routes actually require, so a
  // team-scoped manager sees these controls even though they do not hold it
  // org-wide. A reporter keeps the one action the API grants them: reopening.
  // `managesQueue` is computed above, where it decides whether the assignee
  // list is fetched at all.
  const isOwnTicket = ticket.reportedBy === user?.id;
  const isAssignedToMe = ticket.assignedTo === user?.id;
  const canEdit = managesQueue || isAssignedToMe || isOwnTicket;
  const canDelete = managesQueue;
  const canAssign = managesQueue;
  const canReopen = managesQueue || isOwnTicket || isAssignedToMe;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/helpdesk')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{ticket.title}</h1>
            <span className="text-muted-foreground">{ticket.ticketNumber ?? `HD-${String(ticket.id).padStart(4, '0')}`}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {getStatusBadge(ticket.status)}
            {getPriorityBadge(ticket.priority)}
            {/* Internal vs external origin — derived from the record, mirroring
                the queue badge. Portal tickets have no reporter user. */}
            {(ticket.source === 'portal' || ticket.reportedBy == null) ? (
              <Badge variant="outline" className="text-purple-600 border-purple-300 dark:text-purple-300 dark:border-purple-700">
                External
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Internal</Badge>
            )}
            {ticket.category && (
              <Badge variant="outline">{ticket.category.name}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm dark:text-gray-400 text-gray-800">
                {ticket.description || 'No description provided'}
              </p>
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 dark:text-gray-500 text-gray-800" />
                <span className="dark:text-gray-400 text-gray-800">Comments ({ticket.comments?.length || 0})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.comments && ticket.comments.length > 0 ? (
                ticket.comments.map((comment) => {
                  // Own comments hug the right like a chat client; everyone
                  // else's sit on the left. Internal notes keep the amber
                  // treatment in both positions.
                  const mine = comment.user?.id === user?.id;
                  return (
                    <div
                      key={comment.id}
                      className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      {!mine && (
                        <Avatar className="h-7 w-7 mt-1 shrink-0">
                          <AvatarFallback className="text-xs">
                            {comment.user?.name?.charAt(0) || comment.authorName?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={`max-w-[75%] space-y-1 ${mine ? 'items-end text-right' : ''}`}>
                        <div className={`flex items-center gap-2 text-xs text-muted-foreground ${mine ? 'justify-end' : ''}`}>
                          <span className="font-medium text-foreground">
                            {mine ? 'You' : comment.user?.name ?? comment.authorName ?? 'External user'}
                          </span>
                          {comment.isInternal && (
                            <Badge variant="outline" className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 p-1.5">
                              <Lock className="h-2.5 w-2.5" />
                            </Badge>
                          )}
                          <span>{formatRelativeTime(comment.createdAt)}</span>
                        </div>
                        <div
                          className={`inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm whitespace-pre-wrap break-words ${
                            comment.isInternal
                              ? // Internal notes stay amber whichever side they sit on —
                                // the colour carries the meaning, the side carries the author.
                                'bg-yellow-50 border border-yellow-200 text-gray-900 dark:bg-yellow-900/25 dark:border-yellow-800/60 dark:text-yellow-50'
                              : mine
                                ? 'bg-primary text-primary-foreground rounded-br-md'
                                : 'bg-muted rounded-bl-md'
                          }`}
                        >
                          {comment.content}
                        </div>
                        {comment.attachments && comment.attachments.length > 0 && (
                          <CommentAttachments
                            attachments={comment.attachments}
                            align={mine ? 'right' : 'left'}
                          />
                        )}
                      </div>
                      {mine && (
                        <Avatar className="h-7 w-7 mt-1 shrink-0">
                          <AvatarFallback className="text-xs">
                            {comment.user?.name?.charAt(0) || comment.authorName?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No comments yet
                </p>
              )}

              {/* Add Comment */}
              {canChangeStatus && (
                <div className="border-t pt-4 border-gray-200 dark:border-gray-800">
                  {/* Pending files are kept in local state only — they upload
                      with the comment itself, so nothing lands on the server
                      if the composer is abandoned. */}
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      className="flex-1"
                    />
                  </div>
                  {newFiles.length > 0 && (
                    <div className="mt-2 space-y-1.5">
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
                      <p className="text-[11px] text-muted-foreground">
                        {ACCEPTED_LABEL} — up to {MAX_FILES} files, {MAX_FILE_MB}MB each.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 mt-2">
                    {isInternal && (
                      <p className="mr-auto flex items-center gap-1.5 text-[11px] text-yellow-700 dark:text-yellow-400">
                        <Lock className="h-3 w-3 shrink-0" />
                        Hidden from the reporter — visible only to the assignee and managers.
                      </p>
                    )}
                    {managesQueue || isAssignedToMe ? (
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        {/* The shared checkbox: proper focus ring, indeterminate
                            support, and a consistent box across browsers — the
                            native control rendered differently everywhere. */}
                        <Checkbox
                          checked={isInternal}
                          onCheckedChange={(checked) => setIsInternal(checked === true)}
                        />
                        <Lock className="h-3 w-3" />
                        Internal note
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              role="button"
                              tabIndex={0}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="What is an internal note?"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px] text-xs">
                            Only the ticket&apos;s assignee and helpdesk managers
                            can see this note — the reporter and other viewers
                            never do, and it does not count as a reply to them.
                            Use it for coordination like vendor quotes or
                            internal diagnosis.
                          </TooltipContent>
                        </Tooltip>
                      </label>
                    ) : (
                      <span />
                    )}
                    <label
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted/60"
                      title={`Attach files — up to ${MAX_FILES} × ${MAX_FILE_MB}MB. ${ACCEPTED_LABEL}.`}
                    >
                      <Paperclip className="h-4 w-4" />
                      <input
                        type="file"
                        multiple
                        accept={ACCEPT_ATTR}
                        className="hidden"
                        onChange={(e) => {
                          const picked = Array.from(e.target.files ?? []);
                          const rejected = picked.filter(
                            (file) => file.size > MAX_FILE_MB * 1024 * 1024
                          );
                          const accepted = picked.filter((file) => {
                            // Browsers fill in unknown types from the extension
                            // badly, so judge by size here and by the accept
                            // attribute at pick time.
                            return file.size <= MAX_FILE_MB * 1024 * 1024;
                          });
                          setNewFiles((prev) =>
                            [...prev, ...accepted]
                              // Cap by dropping the newest beyond the limit —
                              // the earlier picks stay, matching what the chips
                              // already show.
                              .slice(0, MAX_FILES)
                          );
                          if (rejected.length > 0) {
                            toast.error(
                              `${rejected.length} file${rejected.length > 1 ? 's' : ''} skipped — over the ${MAX_FILE_MB}MB limit`
                            );
                          }
                          if (newFiles.length + accepted.length > MAX_FILES) {
                            toast.error(`At most ${MAX_FILES} files per comment`);
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <Button
                      size="sm"
                      onClick={() => {
                        addCommentMutation.mutate({ content: newComment, isInternal, files: newFiles });
                        setNewFiles([]);
                      }}
                      disabled={!newComment.trim() || addCommentMutation.isPending}
                    >
                      {addCommentMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Send
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canChangeStatus && canEdit && (
                <>
                  {ticket.status === 'open' && (
                    <Button
                      className="w-full justify-start dark:text-gray-500 text-gray-800"
                      variant="outline"
                      title="You have picked this ticket up — its status becomes In Progress so everyone can see work has started"
                      onClick={() => updateStatusMutation.mutate({ status: 'in_progress' })}
                    >
                      <Loader2 className="h-4 w-4 mr-2" />
                      Start Progress
                    </Button>
                  )}
                  {['open', 'in_progress', 'reopened'].includes(ticket.status) && (
                    <Button
                      className="w-full justify-start dark:text-gray-500 text-gray-800"
                      variant="outline"
                      title="You are waiting on the reporter for more information — they will be notified"
                      onClick={() => updateStatusMutation.mutate({ status: 'awaiting_response' })}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Awaiting Response
                    </Button>
                  )}
                  {['in_progress', 'awaiting_response'].includes(ticket.status) && (
                    <Button
                      className="w-full justify-start bg-green-600 hover:bg-green-700 text-gray-100"
                      title="The issue is fixed — the reporter will be asked to confirm and can then close or rate the ticket"
                      onClick={() => updateStatusMutation.mutate({ status: 'resolved' })}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Resolve
                    </Button>
                  )}
                </>
              )}
              {ticket.status === 'resolved' && (
                <>
                  <Button
                    className="w-full justify-start dark:text-gray-500 text-gray-800"
                    variant="outline"
                    title="Confirm the fix and archive this ticket — a closed ticket can no longer be commented on, only reopened"
                    onClick={() => updateStatusMutation.mutate({ status: 'closed' })}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Close Ticket
                  </Button>
                  {canReopen && (
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      title="The problem came back or was not actually fixed — the ticket returns to the active queue"
                      onClick={() => updateStatusMutation.mutate({ status: 'reopened' })}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Reopen
                    </Button>
                  )}
                </>
              )}
              {ticket.status === 'closed' && canReopen && (
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  title="Bring this closed ticket back into the active queue — use it if the same problem happens again"
                  onClick={() => updateStatusMutation.mutate({ status: 'reopened' })}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Reopen
                </Button>
              )}
              {ticket.status === 'closed' && !ticket.satisfaction && isOwnTicket && (
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  title="Rate how well your ticket was handled, from 1 to 5 stars"
                  onClick={() => setShowSatisfactionDialog(true)}
                >
                  <Star className="h-4 w-4 mr-2" />
                  Rate Resolution
                </Button>
              )}
              {canDelete && (
              <Button
                className="w-full justify-start"
                variant="outline"
                title="Permanently remove this ticket and its comments and files — this cannot be undone"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2 text-red-600" />
                <span className="text-red-600">Delete Ticket</span>
              </Button>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="capitalize dark:text-gray-500 text-gray-800">{ticket.source}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="dark:text-gray-500 text-gray-800">{formatDate(ticket.createdAt)}</span>
              </div>
              <Separator />
              {ticket.resolvedAt && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resolved</span>
                    <span className="dark:text-gray-500 text-gray-800">{formatDate(ticket.resolvedAt)}</span>
                  </div>
                  <Separator />
                </>
              )}
              {ticket.closedAt && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Closed</span>
                    <span className="dark:text-gray-500 text-gray-800">{formatDate(ticket.closedAt)}</span>
                  </div>
                  <Separator />
                </>
              )}
              {ticket.satisfaction && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Satisfaction</span>
                    <span className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${
                            i < ticket.satisfaction!
                              ? 'text-yellow-500 fill-yellow-500'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Classification — who can pick the ticket up can also steer it:
              category and project are settable/resettable here for internal
              and external tickets alike, via the manage-gated update API. */}
          {managesQueue && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Classification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Select
                    value={ticket.categoryId ? String(ticket.categoryId) : 'none'}
                    onValueChange={(v) =>
                      classificationMutation.mutate({ categoryId: v === 'none' ? null : Number(v) })
                    }
                    disabled={classificationMutation.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {(categoriesData ?? []).map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Project</Label>
                  <Select
                    value={ticket.projectId ? String(ticket.projectId) : 'none'}
                    onValueChange={(v) =>
                      classificationMutation.mutate({ projectId: v === 'none' ? null : Number(v) })
                    }
                    disabled={classificationMutation.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {(projectsData ?? []).map((proj) => (
                        <SelectItem key={proj.id} value={String(proj.id)}>
                          {proj.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {ticket.projectId && (
                    <p className="text-[11px] text-muted-foreground">
                      Setting a project on a portal ticket does not auto-assign it — assignment stays manual.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.assignee ? (
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{ticket.assignee.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{ticket.assignee.name}</p>
                    <p className="text-xs text-muted-foreground">{ticket.assignee.email}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-2">Unassigned</p>
              )}
              {canAssign && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => setShowAssignDialog(true)}
                >
                  <User className="h-4 w-4 mr-2" />
                  {ticket.assignee ? 'Reassign' : 'Assign'}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Contact */}
          {(ticket.contactName || ticket.contactEmail || ticket.contactPhone) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {ticket.contactName && (
                  <div>
                    <span className="text-muted-foreground">Name:</span>{' '}
                    <span className='dark:text-gray-300 text-gray-800'>{ticket.contactName}</span>
                  </div>
                )}
                {ticket.contactEmail && (
                  <div>
                    <span className="text-muted-foreground">Email:</span>{' '}
                    <span className='dark:text-gray-300 text-gray-800'>{ticket.contactEmail}</span>
                  </div>
                )}
                {ticket.contactPhone && (
                  <div>
                    <span className="text-muted-foreground">Phone:</span>{' '}
                    <span className='dark:text-gray-300 text-gray-800'>{ticket.contactPhone}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Reporter */}
          {ticket.reporter && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reported By</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{ticket.reporter.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{ticket.reporter.name}</p>
                    <p className="text-xs text-muted-foreground">{ticket.reporter.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Attachments */}
          <TicketAttachmentsCard ticket={ticket} />
        </div>
      </div>

      {/* Assign Dialog */}
      {showAssignDialog && (
        <AssignDialog
          users={users}
          currentAssignee={ticket.assignedTo}
          onAssign={(userId) => assignMutation.mutate(userId)}
          onClose={() => setShowAssignDialog(false)}
          isSubmitting={assignMutation.isPending}
        />
      )}

      {/* Satisfaction Dialog */}
      {showSatisfactionDialog && (
        <SatisfactionDialog
          onSubmit={(data) => satisfactionMutation.mutate(data)}
          onClose={() => setShowSatisfactionDialog(false)}
          isSubmitting={satisfactionMutation.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Ticket"
        description="Are you sure you want to delete this ticket? This action cannot be undone."
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

// ── Attachment preview helpers ───────────────────────────────────────────────

const isImage = (attachment: { mimeType: string }) =>
  attachment.mimeType.startsWith('image/');

const attachmentUrl = (attachment: { id: number }) =>
  `/api/helpdesk/attachments/${attachment.id}/download`;

/**
 * The files posted with one comment, in the bubble.
 *
 * Images render as small previews that open the viewer on click — how WhatsApp
 * and Teams treat photos. Everything else stays a download chip. Both open the
 * same viewer: images large, other files as a details card with a download
 * button (browsers cannot render most documents inline anyway).
 */
function CommentAttachments({
  attachments,
  align,
}: {
  attachments: HelpdeskAttachment[];
  align: 'left' | 'right';
}) {
  const [viewing, setViewing] = useState<HelpdeskAttachment | null>(null);

  return (
    <>
      <div className={`flex flex-wrap gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
        {attachments.map((attachment) =>
          isImage(attachment) ? (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setViewing(attachment)}
              className="block overflow-hidden rounded-lg border border-border/60"
              title={`${attachment.originalName} — click to view larger`}
            >
              <img
                src={attachmentUrl(attachment)}
                alt={attachment.originalName}
                // Fixed box keeps the chat rhythm steady regardless of the
                // photo's own shape; the object crop handles the rest.
                className="h-36 w-48 object-cover"
                loading="lazy"
              />
            </button>
          ) : (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setViewing(attachment)}
              className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs hover:bg-muted/60"
              title={`${attachment.originalName} — click to view`}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{attachment.originalName}</span>
              <span className="shrink-0 text-muted-foreground">
                {Math.max(1, Math.round(attachment.size / 1024))} KB
              </span>
              <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          )
        )}
      </div>
      {viewing && (
        <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  );
}

/**
 * Large-view modal for one attachment — the image fills most of the screen
 * (Teams-style), a non-image gets a details card with a download button. The
 * browser's cookie carries the auth, so a plain <img> needs no token.
 */
function AttachmentViewer({
  attachment,
  onClose,
}: {
  attachment: HelpdeskAttachment;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={
          isImage(attachment)
            ? // Image view: nearly the whole viewport, chrome kept minimal.
              'max-w-[min(1100px,92vw)] p-3'
            : 'max-w-md'
        }
      >
        {isImage(attachment) ? (
          <div className="space-y-2">
            <img
              src={attachmentUrl(attachment)}
              alt={attachment.originalName}
              className="max-h-[75vh] w-full rounded-md object-contain"
            />
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{attachment.originalName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {attachment.uploader?.name ?? 'Unknown'} ·{' '}
                  {Math.max(1, Math.round(attachment.size / 1024))} KB
                </p>
              </div>
              <a
                href={attachmentUrl(attachment)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs hover:bg-muted/60"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{attachment.originalName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {attachment.uploader?.name ?? 'Unknown'} ·{' '}
                  {Math.max(1, Math.round(attachment.size / 1024))} KB ·{' '}
                  {attachment.mimeType}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This file type cannot be previewed in the browser — download it to view.
            </p>
            <a
              href={attachmentUrl(attachment)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              <Download className="h-4 w-4" />
              Download file
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Ticket Attachments ──────────────────────────────────────────────────────

/**
 * Every file this ticket carries, in one list.
 *
 * Attachments arrive nested inside comments (a file belongs to the message
 * that posted it), so this flattens the comments' attachments back out — plus
 * any ticket-level attachments that were never on a comment — and shows who
 * uploaded each one and when. Newest first, because the file an admin is
 * hunting for is usually the most recent one.
 */
function TicketAttachmentsCard({ ticket }: { ticket: HelpdeskTicket }) {
  const files = useMemo(() => {
    const rows: { attachment: HelpdeskAttachment; comment?: HelpdeskComment }[] = [];
    for (const comment of ticket.comments ?? []) {
      for (const attachment of comment.attachments ?? []) {
        rows.push({ attachment, comment });
      }
    }
    // Ticket-level attachments (posted without a comment) ride the top level.
    for (const attachment of ticket.attachments ?? []) {
      if (!attachment.commentId) rows.push({ attachment });
    }
    return rows.sort(
      (a, b) =>
        new Date(b.attachment.createdAt).getTime() - new Date(a.attachment.createdAt).getTime()
    );
  }, [ticket]);

  const [viewing, setViewing] = useState<HelpdeskAttachment | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4 dark:text-gray-500 text-gray-800" />
          <span className="dark:text-gray-400 text-gray-800">
            Attachments ({files.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            No files attached. Use the paperclip next to the comment box to add one.
          </p>
        ) : (
          <>
            {files.map(({ attachment, comment }) => (
              <button
                key={attachment.id}
                type="button"
                onClick={() => setViewing(attachment)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-left hover:bg-muted/60"
                title={`${attachment.originalName} — click to view`}
              >
                {/* Images show a real thumbnail in the list too; the viewer
                    opens on click, same as in the chat. */}
                {isImage(attachment) ? (
                  <img
                    src={attachmentUrl(attachment)}
                    alt={attachment.originalName}
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{attachment.originalName}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {attachment.uploader?.name ?? 'Unknown'} ·{' '}
                    {formatDate(attachment.createdAt)}
                    {/* A file posted with a comment names the message it rode in
                        on, so it can be traced back into the conversation. */}
                    {comment && ` · on a comment${comment.isInternal ? ' (internal)' : ''}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {Math.max(1, Math.round(attachment.size / 1024))} KB
                </span>
                <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {viewing && (
              <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Assign Dialog ───────────────────────────────────────────────────────────

/**
 * Assignee picker — the same searchable list control the detail pages use,
 * narrowed to people who can actually work a ticket (the `/helpdesk/users`
 * endpoint already filters by helpdesk permissions).
 */
function AssignDialog({
  users,
  currentAssignee,
  onAssign,
  onClose,
  isSubmitting,
}: {
  users: { id: number; name: string; email: string }[];
  currentAssignee: number | null;
  onAssign: (userId: number | null) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const [selectedUserId, setSelectedUserId] = useState<string>(
    currentAssignee ? String(currentAssignee) : 'unassigned'
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title="Assign Ticket"
      description="Select a technician to assign this ticket to"
      maxWidth="sm"
      onSubmit={() => onAssign(selectedUserId === 'unassigned' ? null : Number(selectedUserId))}
      submitLabel="Assign"
      isSubmitting={isSubmitting}
    >
      <div className="space-y-2">
        <Label className="dark:text-gray-400 text-gray-800">Assignee</Label>
        <RichListBox
          value={selectedUserId}
          onChange={setSelectedUserId}
          placeholder="Unassigned"
          searchPlaceholder="Search people…"
          emptyMessage="Nobody with helpdesk access matches that search."
          contentClassName="min-w-[400px]"
          groups={[
            {
              items: [
                { value: 'unassigned', label: 'Unassigned', icon: UserCircle },
                ...users.map((user) => ({
                  value: String(user.id),
                  label: user.name,
                  description: user.email,
                  icon: User,
                })),
              ],
            },
          ]}
        />
        <p className="text-[11px] text-muted-foreground">
          Only people with helpdesk access are listed.
        </p>
      </div>
    </FormDialog>
  );
}

// ── Satisfaction Dialog ─────────────────────────────────────────────────────

function SatisfactionDialog({
  onSubmit,
  onClose,
  isSubmitting,
}: {
  onSubmit: (data: { satisfaction: number; feedback?: string }) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title="Rate This Resolution"
      description="How satisfied are you with the resolution of this ticket?"
      maxWidth="sm"
      onSubmit={() => onSubmit({ satisfaction: rating, feedback: feedback || undefined })}
      submitLabel="Submit"
      submitDisabled={rating === 0}
      isSubmitting={isSubmitting}
    >
      <div className="flex justify-center gap-2 py-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            className="p-1"
          >
            <Star
              className={`h-8 w-8 ${
                star <= rating
                  ? 'text-yellow-500 fill-yellow-500'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Feedback (Optional)</Label>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Share your experience..."
          rows={3}
        />
      </div>
    </FormDialog>
  );
}
