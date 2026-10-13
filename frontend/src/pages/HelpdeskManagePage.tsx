import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Headphones,
  Eye,
  Clock,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Loader2,
  Trash2,
  UserPlus,
  ArrowUpRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatCard } from '@/components/stat-card';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import apiClient from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import {
  HelpdeskTicket,
  HelpdeskTicketStatus,
  HelpdeskTicketPriority,
  HelpdeskCategory,
  HelpdeskStats,
} from '@/types';
import toast from 'react-hot-toast';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getStatusIcon(status: HelpdeskTicketStatus) {
  switch (status) {
    case 'open':
      return <Clock className="h-3 w-3 mr-1" />;
    case 'in_progress':
      return <Loader2 className="h-3 w-3 mr-1 animate-spin" />;
    case 'awaiting_response':
      return <MessageSquare className="h-3 w-3 mr-1" />;
    case 'resolved':
      return <CheckCircle className="h-3 w-3 mr-1" />;
    case 'closed':
      return <CheckCircle className="h-3 w-3 mr-1" />;
    case 'reopened':
      return <AlertTriangle className="h-3 w-3 mr-1" />;
    default:
      return undefined;
  }
}

function getStatusBadge(status: HelpdeskTicketStatus) {
  return (
    <StatusBadge
      domain="helpdeskStatus"
      value={status}
      icon={getStatusIcon(status)}
      label={status === 'awaiting_response' ? 'Awaiting' : undefined}
    />
  );
}

function getPriorityBadge(priority: HelpdeskTicketPriority) {
  return <StatusBadge domain="helpdeskPriority" value={priority} />;
}

function timeAgo(date: string) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Main Component ──────────────────────────────────────────────────────────

export function HelpdeskManagePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(15);

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<HelpdeskTicket | null>(null);

  // Bulk status dialog
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkStatusTicket, setBulkStatusTicket] = useState<HelpdeskTicket | null>(null);
  const [bulkNewStatus, setBulkNewStatus] = useState<string>('');

  // Stats
  const { data: statsData } = useQuery({
    queryKey: ['helpdesk-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/stats');
      return res.data.data as HelpdeskStats;
    },
  });

  // Categories
  const { data: categoriesData } = useQuery({
    queryKey: ['helpdesk-categories'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/categories');
      return res.data.data as HelpdeskCategory[];
    },
  });

  // Users for assignment
  const { data: usersData } = useQuery({
    queryKey: ['helpdesk-users'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/users');
      return res.data.data as { id: number; name: string; email: string }[];
    },
  });

  // Tickets
  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['helpdesk-tickets-manage', search, statusFilter, priorityFilter, categoryFilter, assigneeFilter, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (categoryFilter !== 'all') params.append('categoryId', categoryFilter);
      if (assigneeFilter !== 'all') params.append('assignedTo', assigneeFilter);
      params.append('page', String(page));
      params.append('limit', String(limit));
      const res = await apiClient.get(`/helpdesk/tickets?${params.toString()}`);
      return res.data;
    },
  });

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async ({ ticketId, assignedTo }: { ticketId: number; assignedTo: number | null }) => {
      const res = await apiClient.put(`/helpdesk/tickets/${ticketId}/assign`, { assignedTo });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets-manage'] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-stats'] });
      toast.success('Ticket assigned successfully');
      setAssignDialogOpen(false);
      setSelectedTicket(null);
      setSelectedAssignee('');
    },
    onError: () => {
      toast.error('Failed to assign ticket');
    },
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: number; status: string }) => {
      const res = await apiClient.put(`/helpdesk/tickets/${ticketId}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets-manage'] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-stats'] });
      toast.success('Status updated');
      setBulkStatusDialogOpen(false);
      setBulkStatusTicket(null);
      setBulkNewStatus('');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await apiClient.delete(`/helpdesk/tickets/${ticketId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets-manage'] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-stats'] });
      toast.success('Ticket deleted');
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
    },
    onError: () => {
      toast.error('Failed to delete ticket');
    },
  });

  const stats: HelpdeskStats = statsData || {
    total: 0, open: 0, inProgress: 0, awaitingResponse: 0, resolvedToday: 0, closedToday: 0,
    myOpenTickets: 0, priority: { urgent: 0, high: 0, medium: 0, low: 0 },
    avgSatisfaction: 0, totalRated: 0,
  };

  const categories: HelpdeskCategory[] = categoriesData || [];
  const users: { id: number; name: string; email: string }[] = usersData || [];
  const tickets: HelpdeskTicket[] = ticketsData?.data || [];
  const meta = ticketsData?.meta || { currentPage: 1, lastPage: 1, total: 0 };

  const engineers = users.filter((u) =>
    u.id !== user?.id
  );

  const columns: DataTableColumn<HelpdeskTicket>[] = [
    {
      key: 'id',
      header: 'ID',
      width: 'w-[80px]',
      className: 'font-mono text-sm text-muted-foreground',
      accessor: (ticket) => `#${ticket.id}`,
    },
    {
      key: 'title',
      header: 'Title',
      render: (ticket) => (
        <div>
          <div className="font-medium max-w-[250px] truncate">{ticket.title}</div>
          {ticket.contactName && (
            <div className="text-xs text-muted-foreground">{ticket.contactName}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (ticket) => getStatusBadge(ticket.status),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (ticket) => getPriorityBadge(ticket.priority),
    },
    {
      key: 'category',
      header: 'Category',
      render: (ticket) =>
        ticket.category ? (
          <Badge variant="outline" style={{ borderColor: ticket.category.color || undefined, color: ticket.category.color || undefined }}>
            {ticket.category.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        ),
    },
    {
      key: 'reporter',
      header: 'Reporter',
      render: (ticket) => (
        <div>
          <div className="text-sm">{ticket.reporter?.name || '-'}</div>
          {ticket.reporter?.email && (
            <div className="text-xs text-muted-foreground truncate max-w-[120px]">{ticket.reporter.email}</div>
          )}
        </div>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      render: (ticket) =>
        ticket.assignee ? (
          <div className="text-sm">{ticket.assignee.name}</div>
        ) : (
          <Badge variant="outline" className="text-orange-600">Unassigned</Badge>
        ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      className: 'text-sm text-muted-foreground whitespace-nowrap',
      accessor: (ticket) => timeAgo(ticket.createdAt),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: 'w-[200px]',
      render: (ticket) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="View"
            onClick={() => navigate(`/helpdesk/${ticket.id}`)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Assign"
            onClick={() => {
              setSelectedTicket(ticket);
              setSelectedAssignee(ticket.assignedTo ? String(ticket.assignedTo) : '');
              setAssignDialogOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Change Status"
            onClick={() => {
              setBulkStatusTicket(ticket);
              setBulkNewStatus(ticket.status);
              setBulkStatusDialogOpen(true);
            }}
          >
            <ArrowUpRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
            title="Delete"
            onClick={() => {
              setTicketToDelete(ticket);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Helpdesk Management"
        description="Manage and assign all support tickets"
        icon={Headphones}
      >
        <Button onClick={() => navigate('/helpdesk')} variant="outline">
          <ArrowUpRight className="h-4 w-4 mr-2" />
          User View
        </Button>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="Total Tickets" value={stats.total} />
        <StatCard label="Open" value={stats.open} valueClassName="text-blue-600" />
        <StatCard label="In Progress" value={stats.inProgress} valueClassName="text-yellow-600" />
        <StatCard label="Awaiting" value={stats.awaitingResponse} valueClassName="text-orange-600" />
        <StatCard label="Resolved Today" value={stats.resolvedToday} valueClassName="text-green-600" />
        <StatCard
          label="Urgent/High"
          value={(stats.priority?.urgent || 0) + (stats.priority?.high || 0)}
          valueClassName="text-purple-600"
        />
      </div>

      <DataTable
        columns={columns}
        data={tickets}
        loading={isLoading}
        loadingRows={8}
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: 'Search tickets...',
        }}
        filters={
          <>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="awaiting_response">Awaiting</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="reopened">Reopened</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="All Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assigneeFilter} onValueChange={(v) => { setAssigneeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Assignees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignees</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        pagination={{
          page,
          totalPages: meta.lastPage,
          onPageChange: setPage,
          totalItems: meta.total,
          itemsPerPage: limit,
        }}
        emptyIcon={Headphones}
        emptyTitle="No tickets found"
      />

      {/* Assign Dialog */}
      <FormDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        title="Assign Ticket"
        description={`Assign ticket #${selectedTicket?.id} to a team member`}
        maxWidth="md"
        onSubmit={() => {
          if (selectedTicket) {
            assignMutation.mutate({
              ticketId: selectedTicket.id,
              assignedTo: selectedAssignee === 'null' ? null : Number(selectedAssignee),
            });
          }
        }}
        submitLabel={selectedAssignee === 'null' ? 'Unassign' : 'Assign'}
        isSubmitting={assignMutation.isPending}
      >
        <div className="p-3 bg-muted rounded-lg">
          <p className="font-medium">{selectedTicket?.title}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Priority: {selectedTicket?.priority} | Status: {selectedTicket?.status?.replace('_', ' ')}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Assign To</Label>
          <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
            <SelectTrigger>
              <SelectValue placeholder="Select team member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">Unassigned</SelectItem>
              {engineers.map((eng) => (
                <SelectItem key={eng.id} value={String(eng.id)}>
                  {eng.name} ({eng.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FormDialog>

      {/* Change Status Dialog */}
      <FormDialog
        open={bulkStatusDialogOpen}
        onOpenChange={setBulkStatusDialogOpen}
        title="Change Ticket Status"
        description={`Update status for ticket #${bulkStatusTicket?.id}`}
        maxWidth="md"
        onSubmit={() => {
          if (bulkStatusTicket && bulkNewStatus) {
            statusMutation.mutate({
              ticketId: bulkStatusTicket.id,
              status: bulkNewStatus,
            });
          }
        }}
        submitLabel="Update Status"
        submitDisabled={bulkNewStatus === bulkStatusTicket?.status}
        isSubmitting={statusMutation.isPending}
      >
        <div className="p-3 bg-muted rounded-lg">
          <p className="font-medium">{bulkStatusTicket?.title}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Current status: {bulkStatusTicket?.status?.replace('_', ' ')}
          </p>
        </div>
        <div className="space-y-2">
          <Label>New Status</Label>
          <Select value={bulkNewStatus} onValueChange={setBulkNewStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="awaiting_response">Awaiting Response</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="reopened">Reopened</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FormDialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Ticket"
        description="Are you sure you want to delete this ticket? This action cannot be undone."
        confirmLabel="Delete Ticket"
        onConfirm={() => {
          if (ticketToDelete) {
            deleteMutation.mutate(ticketToDelete.id);
          }
        }}
        isConfirming={deleteMutation.isPending}
      >
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="font-medium text-red-800">{ticketToDelete?.title}</p>
          <p className="text-sm text-red-600 mt-1">
            Ticket #{ticketToDelete?.id} will be permanently removed.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
