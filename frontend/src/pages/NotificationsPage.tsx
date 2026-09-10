import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  Loader2,
  ArrowLeft,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '@/api/notifications';
import type { Notification } from '@/types';
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

const typeBadge: Record<string, { label: string; variant: string }> = {
  welcome: { label: 'Welcome', variant: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  incident: { label: 'Incident', variant: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  deployment: { label: 'Deployment', variant: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  system: { label: 'System', variant: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  security: { label: 'Security', variant: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotifications({
        page,
        limit: 20,
        unreadOnly: filter === 'unread',
      });
      setNotifications(res.data);
      setLastPage(res.meta.lastPage);
      if (res.meta.unreadCount !== undefined) {
        setUnreadCount(res.meta.unreadCount);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    getUnreadCount().then(setUnreadCount).catch(() => {});
  }, []);

  const handleMarkRead = async (id: number) => {
    try {
      await markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClickItem = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0
                ? `You have ${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                : 'All caught up!'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markingAll}
          >
            {markingAll ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-2 h-4 w-4" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('all'); setPage(1); }}
        >
          All
        </Button>
        <Button
          variant={filter === 'unread' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setFilter('unread'); setPage(1); }}
        >
          Unread
          {unreadCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1 text-xs">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Notification List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm text-muted-foreground">
                {filter === 'unread'
                  ? "You've read all your notifications"
                  : "You'll see notifications here when there's activity"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const badge = typeBadge[notification.type];
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'flex items-start gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50',
                      !notification.isRead && 'bg-muted/30'
                    )}
                    onClick={() => handleClickItem(notification)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {!notification.isRead && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            badge?.variant || 'bg-gray-500/10 text-gray-600'
                          )}
                        >
                          {badge?.label || notification.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </div>
                      <p className={cn('text-sm', !notification.isRead && 'font-medium')}>
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(notification.id);
                        }}
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
