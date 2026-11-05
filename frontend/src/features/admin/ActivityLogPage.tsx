import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Plus, Pencil, Trash2, LogIn } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
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

  const columns: DataTableColumn<ActivityLog>[] = [
    {
      key: 'icon',
      header: '',
      width: 'w-16',
      render: (log) => (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          {getEventIcon(log.event)}
        </div>
      ),
      skeletonClassName: 'h-8 w-8 rounded-full',
    },
    {
      key: 'description',
      header: 'Description',
      render: (log) => (
        <div className="flex items-center gap-2">
          <span className="text-sm">{log.description}</span>
          <Badge variant="secondary" className={`text-xs ${getEventColor(log.event)}`}>
            {log.event}
          </Badge>
        </div>
      ),
    },
    {
      key: 'model',
      header: 'Model',
      render: (log) =>
        getModelLabel(log.subjectType) ? (
          <Badge variant="outline" className="text-xs">
            {getModelLabel(log.subjectType)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'user',
      header: 'User',
      accessor: (log) => log.user?.name || 'System',
      className: 'text-sm text-muted-foreground',
    },
    {
      key: 'createdAt',
      header: 'Time',
      accessor: (log) => formatRelativeTime(log.createdAt),
      sortValue: (log) => new Date(log.createdAt).getTime(),
      sortable: true,
      className: 'text-sm text-muted-foreground whitespace-nowrap',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Activity Log" description="Audit trail of all actions across the platform" />

      <DataTable
        columns={columns}
        data={logs}
        loading={isLoading}
        error={
          error ? (
            <div className="flex flex-col items-center justify-center py-6">
              <p className="text-sm text-destructive">Failed to load activity log</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later</p>
            </div>
          ) : undefined
        }
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: 'Search activity...',
        }}
        filters={
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
        }
        pagination={{
          page,
          totalPages: meta?.lastPage ?? 1,
          onPageChange: setPage,
          totalItems: meta?.total,
          itemsPerPage: 30,
        }}
        emptyIcon={Activity}
        emptyTitle="No activity found"
      />
    </div>
  );
}
