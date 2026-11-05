import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '@/api/notifications';
import type { Notification } from '@/types';
import { useNotifications } from '@/shared/notifications/NotificationProvider';
import { cn } from '@/lib/utils';

const timeAgo = (dateStr: string): string => {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

const typeDot: Record<string, string> = {
  welcome: 'bg-blue-500',
  incident: 'bg-red-500',
  deployment: 'bg-green-500',
  system: 'bg-purple-500',
  security: 'bg-yellow-500',
  approval_requested: 'bg-amber-500',
  approval_approved: 'bg-green-500',
  approval_rejected: 'bg-red-500',
  timesheet: 'bg-blue-500',
};

/**
 * The bell.
 *
 * The unread count now comes from `NotificationProvider`, which receives it
 * over the socket. This component used to keep its own count and poll every
 * 30 s — and read `data.unreadCount` from an endpoint that returned `count`,
 * so the badge never appeared at all.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { unreadCount } = useNotifications();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // The dropdown loads fresh each time it opens: a notification may have
  // arrived on another tab, and a stale list behind a live badge is worse than
  // a moment of loading.
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotifications({ page: 1, limit: 10 });
      setNotifications(res.data);
    } catch {
      // silently fail — the badge still reflects the socket stream
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadNotifications();
  }, [open, loadNotifications]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    } catch {
      // silently fail
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    } catch {
      // silently fail
    }
  };

  const handleClickItem = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkRead(notification.id);
    }
    setOpen(false);
    if (notification.link) {
      navigate(notification.link);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 max-h-96 overflow-y-auto" align="end" forceMount>
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs text-muted-foreground">You're all caught up!</p>
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  'flex items-start gap-3 cursor-pointer px-2 py-2',
                  !notification.isRead && 'bg-muted/50'
                )}
                onClick={() => handleClickItem(notification)}
              >
                <div className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', typeDot[notification.type] || 'bg-gray-500')} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', !notification.isRead && 'font-medium')}>
                    {notification.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {notification.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {timeAgo(notification.createdAt)}
                  </p>
                </div>
                {!notification.isRead && (
                  <Check className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center text-sm text-primary cursor-pointer"
              onClick={() => { setOpen(false); navigate('/notifications'); }}
            >
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
