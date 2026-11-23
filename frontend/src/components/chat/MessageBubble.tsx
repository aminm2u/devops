import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { FileText } from 'lucide-react';

export interface ChatMessage {
  id: number | string;
  content: string;
  createdAt: string | Date;
  /** Present for real people; work logs carry their own author too. */
  user?: { id: number; name: string; email?: string } | null;
  /** Thread this message belongs to: null = the task itself. */
  subtaskId?: number | null;
  /** Hours entries are shown with the timer treatment, not as chat. */
  isWorkLog?: boolean;
  attachments?: {
    id: number;
    originalName: string;
    size: number;
    mimeType: string;
  }[];
}

interface MessageBubbleProps {
  message: ChatMessage;
  /** Comparing ids is left to the caller — it knows the session user. */
  isMine: boolean;
  onViewAttachment?: (attachment: any) => void;
  /** Optional trailing content, e.g. the subtask a message was posted to. */
  footer?: ReactNode;
  /** Show the "You" label instead of the author's name. */
  youLabel?: string;
  className?: string;
}

/**
 * One chat bubble, helpdesk-style: own messages right in primary, everyone
 * else left in muted, tail corner squared on the author's side. Work logs keep
 * the timer treatment — hours are facts recorded in the timesheet, not chat —
 * so they read as their own kind of message while sitting in the same flow.
 *
 * Presentational only: formatting ages, grouping and scroll behaviour belong
 * to the page that owns the conversation.
 */
export function MessageBubble({
  message,
  isMine,
  onViewAttachment,
  footer,
  youLabel = 'You',
  className,
}: MessageBubbleProps) {
  const authorName = isMine ? youLabel : message.user?.name ?? 'Unknown';
  const attachments = message.attachments ?? [];
  // UserAvatar wants an email for its tooltip; chat payloads always carry one
  // but the type allows it to be absent, so normalise rather than widen the
  // shared component's contract.
  const avatarUser = message.user
    ? { id: message.user.id, name: message.user.name, email: message.user.email ?? '' }
    : null;

  return (
    <div className={cn('flex gap-2', isMine ? 'justify-end' : 'justify-start', className)}>
      {!isMine && (
        <UserAvatar user={avatarUser} size="sm" className="mt-1 shrink-0" />
      )}

      <div className={cn('max-w-[75%] space-y-1', isMine && 'flex flex-col items-end')}>
        <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', isMine && 'justify-end')}>
          <span className="font-medium text-foreground">{authorName}</span>
          {footer}
        </div>

        <div
          className={cn(
            'inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm whitespace-pre-wrap break-words',
            message.isWorkLog
              ? 'rounded-bl-md border border-primary/30 bg-primary/5'
              : isMine
                ? 'rounded-br-md bg-primary text-primary-foreground'
                : 'rounded-bl-md bg-muted'
          )}
        >
          {message.content}
        </div>

        {attachments.length > 0 && (
          <div className={cn('flex flex-wrap gap-1.5', isMine && 'justify-end')}>
            {attachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                onClick={() => onViewAttachment?.(attachment)}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs hover:bg-muted/60"
                title={`${attachment.originalName} — click to view`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{attachment.originalName}</span>
                <span className="shrink-0 text-muted-foreground">
                  {Math.max(1, Math.round(attachment.size / 1024))} KB
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isMine && (
        <UserAvatar user={avatarUser} size="sm" className="mt-1 shrink-0" />
      )}
    </div>
  );
}
