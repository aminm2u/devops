import { useState } from 'react';
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
  Tag,
  AlertTriangle,
  Star,
  Lock,
  Unlock,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import apiClient from '@/api/client';
import {
  HelpdeskTicket,
  HelpdeskTicketStatus,
  HelpdeskTicketPriority,
  HelpdeskComment,
} from '@/types';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';

// ── Role Helpers ─────────────────────────────────────────────────────────────

function getUserRole(user: any): 'admin' | 'engineer' | 'viewer' {
  const roles = user?.roles || [];
  if (roles.some((r: any) => ['super-admin', 'devops-admin'].includes(r.name))) return 'admin';
  if (roles.some((r: any) => r.name === 'devops-engineer')) return 'engineer';
  return 'viewer';
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getStatusBadge(status: HelpdeskTicketStatus) {
  switch (status) {
    case 'open':
      return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
    case 'in_progress':
      return <Badge className="bg-yellow-100 text-yellow-700"><Loader2 className="h-3 w-3 mr-1 animate-spin" />In Progress</Badge>;
    case 'awaiting_response':
      return <Badge className="bg-orange-100 text-orange-700"><MessageSquare className="h-3 w-3 mr-1" />Awaiting Response</Badge>;
    case 'resolved':
      return <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
    case 'closed':
      return <Badge className="bg-gray-100 text-gray-700"><CheckCircle className="h-3 w-3 mr-1" />Closed</Badge>;
    case 'reopened':
      return <Badge className="bg-purple-100 text-purple-700"><AlertTriangle className="h-3 w-3 mr-1" />Reopened</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getPriorityBadge(priority: HelpdeskTicketPriority) {
  switch (priority) {
    case 'urgent':
      return <Badge className="bg-red-600 text-white">Urgent</Badge>;
    case 'high':
      return <Badge className="bg-red-100 text-red-700">High</Badge>;
    case 'medium':
      return <Badge className="bg-yellow-100 text-yellow-700">Medium</Badge>;
    case 'low':
      return <Badge className="bg-green-100 text-green-700">Low</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function HelpdeskTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userRole = getUserRole(user);

  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showSatisfactionDialog, setShowSatisfactionDialog] = useState(false);

  // Fetch ticket
  const { data: ticketData, isLoading } = useQuery({
    queryKey: ['helpdesk-ticket', id],
    queryFn: async () => {
      const res = await apiClient.get(`/helpdesk/tickets/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch users for assignment
  const { data: usersData } = useQuery({
    queryKey: ['helpdesk-users'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/users');
      return res.data;
    },
  });

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['helpdesk-categories'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/categories');
      return res.data;
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

  const updateTicketMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.put(`/helpdesk/tickets/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
      toast.success('Ticket updated');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update ticket');
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
    mutationFn: async (data: { content: string; isInternal: boolean }) => {
      const res = await apiClient.post(`/helpdesk/tickets/${id}/comments`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-ticket', id] });
      setNewComment('');
      setIsInternal(false);
      toast.success('Comment added');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to add comment');
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

  const ticket: HelpdeskTicket | undefined = ticketData?.data;
  const users = usersData?.data || [];
  const categories = categoriesData?.data || [];

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

  // Role-based permission checks
  const isOwnTicket = ticket.reportedBy === user?.id;
  const isAssignedToMe = ticket.assignedTo === user?.id;
  const canEdit = userRole === 'admin' || isAssignedToMe || isOwnTicket;
  const canDelete = userRole === 'admin';
  const canAssign = userRole === 'admin';
  const canReopen = userRole === 'admin' || isOwnTicket || isAssignedToMe;

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
            <span className="text-muted-foreground">HD-{String(ticket.id).padStart(4, '0')}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {getStatusBadge(ticket.status)}
            {getPriorityBadge(ticket.priority)}
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
              <p className="whitespace-pre-wrap text-sm">
                {ticket.description || 'No description provided'}
              </p>
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments ({ticket.comments?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.comments && ticket.comments.length > 0 ? (
                ticket.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`p-3 rounded-lg ${
                      comment.isInternal
                        ? 'bg-yellow-50 border border-yellow-200'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {comment.user?.name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{comment.user?.name || 'Unknown'}</span>
                      {comment.isInternal && (
                        <Badge variant="outline" className="text-xs bg-yellow-100">
                          <Lock className="h-3 w-3 mr-1" />
                          Internal
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No comments yet
                </p>
              )}

              {/* Add Comment */}
              {canChangeStatus && (
                <div className="border-t pt-4">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={3}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="rounded"
                      />
                      <Lock className="h-3 w-3" />
                      Internal note
                    </label>
                    <Button
                      size="sm"
                      onClick={() => addCommentMutation.mutate({ content: newComment, isInternal })}
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
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate({ status: 'in_progress' })}
                    >
                      <Loader2 className="h-4 w-4 mr-2" />
                      Start Progress
                    </Button>
                  )}
                  {['open', 'in_progress', 'reopened'].includes(ticket.status) && (
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => updateStatusMutation.mutate({ status: 'awaiting_response' })}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Awaiting Response
                    </Button>
                  )}
                  {['in_progress', 'awaiting_response'].includes(ticket.status) && (
                    <Button
                      className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
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
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate({ status: 'closed' })}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Close Ticket
                  </Button>
                  {canReopen && (
                    <Button
                      className="w-full justify-start"
                      variant="outline"
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
                  onClick={() => setShowSatisfactionDialog(true)}
                >
                  <Star className="h-4 w-4 mr-2" />
                  Rate Resolution
                </Button>
              )}
              {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full justify-start" variant="outline">
                    <Trash2 className="h-4 w-4 mr-2 text-red-600" />
                    <span className="text-red-600">Delete Ticket</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this ticket? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
                <span className="capitalize">{ticket.source}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(ticket.createdAt)}</span>
              </div>
              <Separator />
              {ticket.resolvedAt && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resolved</span>
                    <span>{formatDate(ticket.resolvedAt)}</span>
                  </div>
                  <Separator />
                </>
              )}
              {ticket.closedAt && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Closed</span>
                    <span>{formatDate(ticket.closedAt)}</span>
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
                    <span>{ticket.contactName}</span>
                  </div>
                )}
                {ticket.contactEmail && (
                  <div>
                    <span className="text-muted-foreground">Email:</span>{' '}
                    <span>{ticket.contactEmail}</span>
                  </div>
                )}
                {ticket.contactPhone && (
                  <div>
                    <span className="text-muted-foreground">Phone:</span>{' '}
                    <span>{ticket.contactPhone}</span>
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
    </div>
  );
}

// ── Assign Dialog ───────────────────────────────────────────────────────────

function AssignDialog({
  users,
  currentAssignee,
  onAssign,
  onClose,
  isSubmitting,
}: {
  users: any[];
  currentAssignee: number | null;
  onAssign: (userId: number | null) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const [selectedUserId, setSelectedUserId] = useState<string>(
    currentAssignee ? String(currentAssignee) : 'unassigned'
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Ticket</DialogTitle>
          <DialogDescription>Select a technician to assign this ticket to</DialogDescription>
        </DialogHeader>

        <Select
          value={selectedUserId}
          onValueChange={(v) => setSelectedUserId(v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {users.map((user: any) => (
              <SelectItem key={user.id} value={String(user.id)}>
                {user.name} ({user.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onAssign(selectedUserId === 'unassigned' ? null : Number(selectedUserId))}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate This Resolution</DialogTitle>
          <DialogDescription>
            How satisfied are you with the resolution of this ticket?
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-2 py-4">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSubmit({ satisfaction: rating, feedback: feedback || undefined })}
            disabled={rating === 0 || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
