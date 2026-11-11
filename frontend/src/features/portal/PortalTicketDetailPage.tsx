import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MessageSquare, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { portalApi } from '@/api/portalClient';
import { formatRelativeTime } from '@/lib/utils';

/**
 * A ticket as its external reporter sees it: description, public
 * conversation and a reply box. Internal notes never reach this page — the
 * portal API filters them server-side, so there is nothing to hide here.
 */
export function PortalTicketDetailPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['portal-ticket', publicId],
    queryFn: () => portalApi.getTicket(publicId!),
    retry: false,
  });

  const replyMutation = useMutation({
    mutationFn: (content: string) => portalApi.addComment(publicId!, content),
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['portal-ticket', publicId] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <h2 className="text-lg font-semibold">Ticket not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This ticket does not exist or is not linked to your email address.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/portal/track')}>
            Back to my tickets
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/portal/track')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          My tickets
        </Button>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">
            {ticket.ticketNumber ?? `HD-${ticket.id}`}
          </span>
          <StatusBadge domain="helpdeskStatus" value={ticket.status as never} />
          <StatusBadge domain="helpdeskPriority" value={ticket.priority as never} />
          {ticket.category && <Badge variant="outline">{ticket.category.name}</Badge>}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{ticket.title}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {ticket.description || 'No description provided'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Conversation ({ticket.comments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ticket.comments.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No replies yet.</p>
          )}
          {ticket.comments.map((comment) => {
            const external = comment.userId === null;
            const author = external
              ? comment.authorName || 'You'
              : comment.user?.name || 'Support team';
            return (
              <div key={comment.id} className={`flex gap-2 ${external ? 'justify-end' : 'justify-start'}`}>
                {!external && (
                  <Avatar className="mt-1 h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs">{author.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <div className={`max-w-[75%] space-y-1 ${external ? 'items-end text-right' : ''}`}>
                  <div className={`flex items-center gap-2 text-xs text-muted-foreground ${external ? 'justify-end' : ''}`}>
                    <span className="font-medium text-foreground">
                      {external ? 'You' : `${author} (Support)`}
                    </span>
                    <span>{formatRelativeTime(comment.createdAt)}</span>
                  </div>
                  <div
                    className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-sm ${
                      external
                        ? 'rounded-br-md bg-primary text-primary-foreground'
                        : 'rounded-bl-md bg-muted'
                    }`}
                  >
                    {comment.content}
                  </div>
                </div>
                {external && (
                  <Avatar className="mt-1 h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs">{author.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}

          {ticket.status !== 'closed' && (
            <div className="space-y-2 border-t pt-4">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply to our team..."
                rows={3}
                maxLength={5000}
              />
              {replyMutation.isError && (
                <p className="text-sm text-destructive">Could not send the reply. Please try again.</p>
              )}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!reply.trim() || replyMutation.isPending}
                  onClick={() => replyMutation.mutate(reply)}
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send reply
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Want to submit a new issue? <Link to="/portal" className="underline">Open the submit form</Link>
      </p>
    </div>
  );
}
