import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Plus, Pencil, Trash2, LogIn, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';
import { formatRelativeTime } from '@/lib/utils';

interface ActivityLog {
  id: number;
  description: string;
  event: string;
  subjectType: string | null;
  subjectId: number | null;
  properties: any;
  createdAt: string;
  user: { id: number; name: string; email: string } | null;
}

function getEventIcon(event: string) {
  switch (event) {
    case 'created':
      return <Plus className="h-3.5 w-3.5 text-green-500" />;
    case 'updated':
      return <Pencil className="h-3.5 w-3.5 text-blue-500" />;
    case 'deleted':
      return <Trash2 className="h-3.5 w-3.5 text-red-500" />;
    case 'login':
      return <LogIn className="h-3.5 w-3.5 text-purple-500" />;
    default:
      return <Activity className="h-3.5 w-3.5 text-gray-500" />;
  }
}

function getEventColor(event: string) {
  switch (event) {
    case 'created':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'updated':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'deleted':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'login':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

function getModelLabel(subjectType: string | null) {
  if (!subjectType) return null;
  const parts = subjectType.split('\\');
  return parts[parts.length - 1];
}

export function ActivityLogPage() {
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['activity-log', search, eventFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: 30 };
      if (search) params.search = search;
      if (eventFilter !== 'all') params.event = eventFilter;
      const res = await apiClient.get('/activity-log', { params });
      return res.data;
    },
  });

  const logs: ActivityLog[] = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground">Audit trail of all actions across the platform</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Input
            placeholder="Search activity..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Event Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
            <SelectItem value="login">Login</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Activity Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-[400px]" />
                  <Skeleton className="h-4 w-[100px] ml-auto" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-destructive">Failed to load activity log</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Activity className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No activity found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Description</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        {getEventIcon(log.event)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{log.description}</span>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${getEventColor(log.event)}`}
                        >
                          {log.event}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getModelLabel(log.subjectType) ? (
                        <Badge variant="outline" className="text-xs">
                          {getModelLabel(log.subjectType)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.user?.name || 'System'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(log.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.lastPage > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.currentPage} of {meta.lastPage} ({meta.total} total)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.lastPage} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
