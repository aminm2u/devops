import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Headphones,
  Plus,
  Loader2,
  Search,
  Eye,
  Clock,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Paperclip,
  User,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useEffect } from 'react';
import {
  HelpdeskTicket,
  HelpdeskTicketStatus,
  HelpdeskTicketPriority,
  HelpdeskCategory,
  HelpdeskStats,
} from '@/types';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

// ── Role Helpers ─────────────────────────────────────────────────────────────

function getUserRole(user: any): 'admin' | 'engineer' | 'viewer' {
  const roles = user?.roles || [];
  if (roles.some((r: any) => ['super-admin', 'devops-admin'].includes(r.name))) return 'admin';
  if (roles.some((r: any) => r.name === 'devops-engineer')) return 'engineer';
  return 'viewer';
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: HelpdeskTicketStatus) {
  switch (status) {
    case 'open':
      return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
    case 'in_progress':
      return <Badge className="bg-yellow-100 text-yellow-700"><Loader2 className="h-3 w-3 mr-1 animate-spin" />In Progress</Badge>;
    case 'awaiting_response':
      return <Badge className="bg-orange-100 text-orange-700"><MessageSquare className="h-3 w-3 mr-1" />Awaiting</Badge>;
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

function getSlaIndicator(slaDate: string | null, resolvedAt: string | null): React.ReactNode {
  if (resolvedAt) return <span className="text-green-600 text-xs">✓ Met</span>;
  if (!slaDate) return <span className="text-muted-foreground text-xs">-</span>;

  const now = new Date();
  const sla = new Date(slaDate);
  const diff = sla.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (diff < 0) {
    return <span className="text-red-600 text-xs font-bold">Breached</span>;
  } else if (hours < 2) {
    return <span className="text-orange-600 text-xs font-bold">{hours}h left</span>;
  } else {
    return <span className="text-green-600 text-xs">{hours}h left</span>;
  }
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
      return res.data;
    },
  });

  // Categories
  const { data: categoriesData } = useQuery({
    queryKey: ['helpdesk-categories'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/categories');
      return res.data;
    },
  });

  // Projects
  const { data: projectsData } = useQuery({
    queryKey: ['helpdesk-projects'],
    queryFn: async () => {
      const res = await apiClient.get('/helpdesk/projects');
      return res.data;
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

  const stats: HelpdeskStats = statsData?.data || {
    total: 0, open: 0, inProgress: 0, awaitingResponse: 0,
    resolvedToday: 0, closedToday: 0, myOpenTickets: 0,
    priority: { urgent: 0, high: 0, medium: 0, low: 0 },
    avgSatisfaction: 0, totalRated: 0,
  };
  const categories: HelpdeskCategory[] = categoriesData?.data || [];
  const projects: { id: number; name: string; slug: string; status: string }[] = projectsData?.data || [];
  const tickets: HelpdeskTicket[] = data?.data || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {userRole === 'viewer' ? 'My Support Tickets' : 'Helpdesk'}
          </h1>
          <p className="text-muted-foreground">
            {userRole === 'viewer'
              ? 'View and manage your support requests'
              : userRole === 'engineer'
              ? 'Manage assigned support tickets'
              : 'Manage support tickets and requests'}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
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
              <SelectTrigger className="w-[150px]">
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
              <SelectTrigger className="w-[180px]">
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
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-[60px]" />
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[80px]" />
                </div>
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Headphones className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No tickets found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Ticket</TableHead>
                  <TableHead>Subject</TableHead>
                  {userRole !== 'viewer' && <TableHead>Requester</TableHead>}
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  {userRole !== 'viewer' && <TableHead>Assigned</TableHead>}
                  {userRole === 'viewer' && <TableHead>Satisfaction</TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/helpdesk/${ticket.id}`)}
                  >
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      HD-{String(ticket.id).padStart(4, '0')}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    {userRole !== 'viewer' && (
                    <>
                    <TableCell>
                      <div className="text-sm">
                        {ticket.contactName || ticket.reporter?.name || '-'}
                      </div>
                      {ticket.contactEmail && (
                        <div className="text-xs text-muted-foreground">{ticket.contactEmail}</div>
                      )}
                    </TableCell>
                    </>
                    )}
                    <TableCell>
                      {ticket.category ? (
                        <Badge
                          variant="outline"
                          style={ticket.category.color ? { borderColor: ticket.category.color, color: ticket.category.color } : {}}
                        >
                          {ticket.category.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                    <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                    {userRole !== 'viewer' ? (
                    <TableCell>
                      {ticket.assignee ? (
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {ticket.assignee.name.charAt(0)}
                          </div>
                          <span className="text-sm">{ticket.assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Unassigned</span>
                      )}
                    </TableCell>
                    ) : (
                    <TableCell>
                      {ticket.satisfaction ? (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: ticket.satisfaction }).map((_, i) => (
                            <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    )}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/helpdesk/${ticket.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Ticket</DialogTitle>
          <DialogDescription>
            Submit a new support request
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
