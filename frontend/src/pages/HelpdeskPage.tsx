import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Headphones,
  Plus,
  Loader2,
  Eye,
  Clock,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  Star,
  Settings,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { FormDialog } from '@/components/ui/form-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import apiClient from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import {
  HelpdeskTicket,
  HelpdeskTicketStatus,
  HelpdeskTicketPriority,
  HelpdeskCategory,
  HelpdeskStats,
} from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

// ── Role Helpers ─────────────────────────────────────────────────────────────

function getUserRole(user: any): 'admin' | 'engineer' | 'viewer' {
  const roles = user?.roles || [];
  if (roles.some((r: any) => ['super-admin', 'devops-admin'].includes(r.name))) return 'admin';
  if (roles.some((r: any) => r.name === 'devops-engineer')) return 'engineer';
  return 'viewer';
}

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

// ── Main Page ───────────────────────────────────────────────────────────────

export function HelpdeskPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userRole = getUserRole(user);
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (socket && isConnected) {
      socket.on('new-ticket', () => {
        queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['helpdesk-stats'] });
      });
      return () => {
        socket.off('new-ticket');
      };
    }
  }, [socket, isConnected, queryClient]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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

  // Projects
  const { data: projectsData } = useQuery({
    queryKey: ['helpdesk-projects'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/projects');
      return res.data.data;
    },
  });

  // Tickets
  const { data, isLoading } = useQuery({
    queryKey: ['helpdesk-tickets', search, statusFilter, priorityFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (categoryFilter !== 'all') params.append('categoryId', categoryFilter);
      const res = await apiClient.get(`/helpdesk/tickets?${params.toString()}`);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: any) => {
      const res = await apiClient.post('/helpdesk/tickets', formData);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['helpdesk-stats'] });
      setShowCreateDialog(false);
      toast.success('Ticket created');
      navigate(`/helpdesk/${data.data.id}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create ticket');
    },
  });

  const stats: HelpdeskStats = statsData || {
    total: 0, open: 0, inProgress: 0, awaitingResponse: 0,
    resolvedToday: 0, closedToday: 0, myOpenTickets: 0,
    priority: { urgent: 0, high: 0, medium: 0, low: 0 },
    avgSatisfaction: 0, totalRated: 0,
  };
  const categories: HelpdeskCategory[] = categoriesData || [];
  const projects: { id: number; name: string; slug: string; status: string }[] = projectsData || [];
  const tickets: HelpdeskTicket[] = data?.data || [];

  const columns: DataTableColumn<HelpdeskTicket>[] = [
    {
      key: 'ticket',
      header: 'Ticket',
      width: 'w-16',
      className: 'font-mono text-sm text-muted-foreground',
      accessor: (ticket) => `HD-${String(ticket.id).padStart(4, '0')}`,
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (ticket) => (
        <div>
          <div className="font-medium">{ticket.title}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>{formatRelativeTime(ticket.createdAt)}</span>
            {ticket._count && ticket._count.comments > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {ticket._count.comments}
              </span>
            )}
            {ticket._count && ticket._count.attachments > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {ticket._count.attachments}
              </span>
            )}
          </div>
        </div>
      ),
    },
    ...(userRole !== 'viewer'
      ? [{
          key: 'requester',
          header: 'Requester',
          render: (ticket: HelpdeskTicket) => (
            <div>
              <div className="text-sm">
                {ticket.contactName || ticket.reporter?.name || '-'}
              </div>
              {ticket.contactEmail && (
                <div className="text-xs text-muted-foreground">{ticket.contactEmail}</div>
              )}
            </div>
          ),
        }]
      : []),
    {
      key: 'category',
      header: 'Category',
      render: (ticket) =>
        ticket.category ? (
          <Badge
            variant="outline"
            style={ticket.category.color ? { borderColor: ticket.category.color, color: ticket.category.color } : {}}
          >
            {ticket.category.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (ticket) => getPriorityBadge(ticket.priority),
    },
    {
      key: 'status',
      header: 'Status',
      render: (ticket) => getStatusBadge(ticket.status),
    },
    ...(userRole !== 'viewer'
      ? [{
          key: 'assigned',
          header: 'Assigned',
          render: (ticket: HelpdeskTicket) =>
            ticket.assignee ? (
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                  {ticket.assignee.name.charAt(0)}
                </div>
                <span className="text-sm">{ticket.assignee.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">Unassigned</span>
            ),
        }]
      : [{
          key: 'satisfaction',
          header: 'Satisfaction',
          render: (ticket: HelpdeskTicket) =>
            ticket.satisfaction ? (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: ticket.satisfaction }).map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            ),
        }]),
    {
      key: 'view',
      header: '',
      width: 'w-12',
      render: (ticket) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/helpdesk/${ticket.id}`);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader
        title={userRole === 'viewer' ? 'My Support Tickets' : 'Helpdesk'}
        description={
          userRole === 'viewer'
            ? 'View and manage your support requests'
            : userRole === 'engineer'
            ? 'Manage assigned support tickets'
            : 'Manage support tickets and requests'
        }
      >
        {userRole !== 'admin' && (
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Ticket
          </Button>
        )}
        {userRole === 'admin' && (
          <Button size="sm" variant="outline" onClick={() => navigate('/helpdesk/manage')}>
            <Settings className="mr-2 h-4 w-4" />
            Manage Tickets
          </Button>
        )}
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.inProgress}</p>
              </div>
              <Loader2 className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Awaiting</p>
                <p className="text-2xl font-bold text-orange-600">{stats.awaitingResponse}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved Today</p>
                <p className="text-2xl font-bold text-green-600">{stats.resolvedToday}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Priority Summary */}
      <div className="grid gap-4 sm:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-600" />
              <span className="text-sm">Urgent</span>
              <span className="ml-auto font-bold">{stats.priority.urgent}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <span className="text-sm">High</span>
              <span className="ml-auto font-bold">{stats.priority.high}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="text-sm">Medium</span>
              <span className="ml-auto font-bold">{stats.priority.medium}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-400" />
              <span className="text-sm">Low</span>
              <span className="ml-auto font-bold">{stats.priority.low}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              <span className="text-sm">Satisfaction</span>
              <span className="ml-auto font-bold">
                {stats.avgSatisfaction > 0 ? `${stats.avgSatisfaction.toFixed(1)}/5` : '-'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={tickets}
        loading={isLoading}
        loadingRows={5}
        onRowClick={(ticket) => navigate(`/helpdesk/${ticket.id}`)}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Search tickets...',
        }}
        filters={
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
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
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
          </>
        }
        emptyIcon={Headphones}
        emptyTitle="No tickets found"
      />

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateTicketDialog
          categories={categories}
          projects={projects}
          onSubmit={(data) => createMutation.mutate(data)}
          onClose={() => setShowCreateDialog(false)}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Create Ticket Dialog ────────────────────────────────────────────────────

function CreateTicketDialog({
  categories,
  projects,
  onSubmit,
  onClose,
  isSubmitting,
}: {
  categories: HelpdeskCategory[];
  projects: { id: number; name: string; slug: string; status: string }[];
  onSubmit: (data: any) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as HelpdeskTicketPriority,
    categoryId: null as number | null,
    projectId: null as number | null,
    source: 'web',
    contactName: user?.name || '',
    contactEmail: user?.email || '',
    contactPhone: '',
  });

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    onSubmit({
      ...form,
      categoryId: form.categoryId || null,
      projectId: form.projectId || null,
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title="Create New Ticket"
      description="Submit a new support request"
      maxWidth="lg"
      onSubmit={handleSubmit}
      submitLabel="Create Ticket"
      isSubmitting={isSubmitting}
    >
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Brief description of the issue"
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Detailed description of the issue..."
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(v: HelpdeskTicketPriority) => setForm({ ...form, priority: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={form.categoryId ? String(form.categoryId) : 'none'}
            onValueChange={(v) => setForm({ ...form, categoryId: v === 'none' ? null : Number(v) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Related Project</Label>
        <Select
          value={form.projectId ? String(form.projectId) : 'none'}
          onValueChange={(v) => setForm({ ...form, projectId: v === 'none' ? null : Number(v) })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select project (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No project</SelectItem>
            {projects.map((proj) => (
              <SelectItem key={proj.id} value={String(proj.id)}>
                {proj.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select a project to auto-assign a DevOps engineer from the project team
        </p>
      </div>

      <div className="space-y-2">
        <Label>Source</Label>
        <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="web">Web Portal</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="phone">Phone</SelectItem>
            <SelectItem value="walk-in">Walk-in</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border-t pt-4">
        <Label className="font-semibold">Contact Information</Label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Contact Name</Label>
          <Input
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            placeholder="Name"
          />
        </div>
        <div className="space-y-2">
          <Label>Contact Email</Label>
          <Input
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            placeholder="email@example.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Contact Phone</Label>
        <Input
          value={form.contactPhone}
          onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          placeholder="Phone number"
        />
      </div>
    </FormDialog>
  );
}
