import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Server,
  Database,
  HardDrive,
  Wifi,
  Container,
  Cpu,
  MemoryStick,
  Disc,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { UserAvatar } from '@/components/ui/UserAvatar';
import apiClient from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { cn, getStatusColor, formatStatus } from '@/lib/utils';
import toast from 'react-hot-toast';

interface InfrastructureNode {
  id: number;
  projectId: number;
  name: string;
  type: string;
  hostname: string;
  ipAddress: string | null;
  status: string;
  cpuCores: number | null;
  memoryGb: number | null;
  storageGb: number | null;
  operatingSystem: string | null;
  provider: string | null;
  username: string | null;
  password: string | null;
  createdAt: string;
  project?: { id: number; name: string; slug: string };
}

const nodeTypeIcons: Record<string, React.ReactNode> = {
  server: <Server className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  'load-balancer': <HardDrive className="h-4 w-4" />,
  cache: <Database className="h-4 w-4" />,
  queue: <HardDrive className="h-4 w-4" />,
  storage: <HardDrive className="h-4 w-4" />,
  network: <Wifi className="h-4 w-4" />,
  container: <Container className="h-4 w-4" />,
  kubernetes: <Container className="h-4 w-4" />,
};

// Consistent color palette for projects
const projectColors = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
  { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
  { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-800' },
  { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-300', border: 'border-lime-200 dark:border-lime-800' },
];

function getProjectColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return projectColors[Math.abs(hash) % projectColors.length];
}

function ProjectBadge({ name }: { name: string }) {
  const color = getProjectColor(name);
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', color.bg, color.text, color.border)}>
      {name}
    </span>
  );
}

const emptyForm = {
  projectId: 0,
  name: '',
  hostname: '',
  type: 'server',
  status: 'healthy',
  ipAddress: '',
  cpuCores: '',
  memoryGb: '',
  storageGb: '',
  operatingSystem: '',
  provider: '',
  username: '',
  password: '',
};

export function InfrastructurePage() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canManage = hasRole('super-admin') || hasRole('devops-admin');

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<InfrastructureNode | null>(null);
  const [editingNode, setEditingNode] = useState<InfrastructureNode | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['infrastructure', search, projectFilter, typeFilter, statusFilter],
    queryFn: async () => {
      const params: any = { limit: 100 };
      if (search) params.search = search;
      if (projectFilter !== 'all') params.projectId = projectFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await apiClient.get('/infrastructure', { params });
      return res.data;
    },
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiClient.get('/projects', { params: { limit: 100 } });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => apiClient.post('/infrastructure', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infrastructure'] });
      setShowFormDialog(false);
      setForm(emptyForm);
      toast.success('Node created');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create node'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiClient.put(`/infrastructure/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infrastructure'] });
      setShowFormDialog(false);
      setEditingNode(null);
      setForm(emptyForm);
      toast.success('Node updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update node'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/infrastructure/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infrastructure'] });
      setShowDeleteDialog(null);
      toast.success('Node deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete node'),
  });

  const openCreateDialog = () => {
    setEditingNode(null);
    setForm({
      ...emptyForm,
      projectId: projectsData?.data?.[0]?.id || 0,
    });
    setShowFormDialog(true);
  };

  const openEditDialog = (node: InfrastructureNode) => {
    setEditingNode(node);
    setForm({
      projectId: node.projectId,
      name: node.name,
      hostname: node.hostname,
      type: node.type,
      status: node.status,
      ipAddress: node.ipAddress || '',
      cpuCores: node.cpuCores?.toString() || '',
      memoryGb: node.memoryGb?.toString() || '',
      storageGb: node.storageGb?.toString() || '',
      operatingSystem: node.operatingSystem || '',
      provider: node.provider || '',
      username: node.username || '',
      password: '',
    });
    setShowFormDialog(true);
  };

  const handleFormSubmit = () => {
    if (!form.name.trim() || !form.hostname.trim()) {
      toast.error('Name and hostname are required');
      return;
    }
    const payload: any = {
      projectId: form.projectId || projectsData?.data?.[0]?.id,
      name: form.name.trim(),
      hostname: form.hostname.trim(),
      type: form.type,
      status: form.status,
      ipAddress: form.ipAddress.trim() || null,
      cpuCores: form.cpuCores ? parseInt(form.cpuCores) : null,
      memoryGb: form.memoryGb ? parseFloat(form.memoryGb) : null,
      storageGb: form.storageGb ? parseFloat(form.storageGb) : null,
      operatingSystem: form.operatingSystem.trim() || null,
      provider: form.provider.trim() || null,
      username: form.username.trim() || null,
      password: form.password.trim() || null,
    };

    if (editingNode) {
      updateMutation.mutate({ id: editingNode.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const nodes: InfrastructureNode[] = data?.data || [];
  const projects = projectsData?.data || [];
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Group nodes by project
  const nodesByProject = nodes.reduce((acc, node) => {
    const projectName = node.project?.name || 'Unassigned';
    const projectId = node.projectId || 0;
    if (!acc[projectId]) {
      acc[projectId] = { name: projectName, id: projectId, nodes: [] };
    }
    acc[projectId].nodes.push(node);
    return acc;
  }, {} as Record<number, { name: string; id: number; nodes: InfrastructureNode[] }>);

  const stats = {
    total: nodes.length,
    healthy: nodes.filter((n) => n.status === 'healthy').length,
    warning: nodes.filter((n) => n.status === 'warning').length,
    critical: nodes.filter((n) => n.status === 'critical').length,
  };

  const hasActiveFilters = search || projectFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const togglePasswordVisibility = (nodeId: number) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure</h1>
          <p className="text-muted-foreground">Monitor and manage your infrastructure nodes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Node
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Nodes</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Server className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Healthy</p>
                <p className="text-2xl font-bold text-emerald-600">{stats.healthy}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warning</p>
                <p className="text-2xl font-bold text-amber-600">{stats.warning}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Input
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
          Filters
        </Button>
      </div>
      {showFilters && (
        <div className="flex gap-3 flex-wrap">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="server">Server</SelectItem>
              <SelectItem value="database">Database</SelectItem>
              <SelectItem value="load-balancer">Load Balancer</SelectItem>
              <SelectItem value="cache">Cache</SelectItem>
              <SelectItem value="container">Container</SelectItem>
              <SelectItem value="kubernetes">Kubernetes</SelectItem>
              <SelectItem value="network">Network</SelectItem>
              <SelectItem value="storage">Storage</SelectItem>
              <SelectItem value="queue">Queue</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setProjectFilter('all'); setTypeFilter('all'); setStatusFilter('all'); setSearch(''); }}>
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold">No infrastructure nodes</h2>
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Get started by adding your first node'}
            </p>
            {canManage && (
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Node
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Card View - Grouped by Project */}
          <div className="space-y-6">
            {Object.values(nodesByProject).map((project) => {
              const color = getProjectColor(project.name);
              return (
                <Card key={project.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', color.bg)}>
                          <Layers className={cn('h-5 w-5', color.text)} />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold">{project.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{project.nodes.length} node{project.nodes.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {project.nodes.map((node) => (
                        <Card key={node.id} className="transition-shadow hover:shadow-md border">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                                  {nodeTypeIcons[node.type] || <Server className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0">
                                  <CardTitle className="text-sm font-semibold truncate">{node.name}</CardTitle>
                                  <p className="text-xs text-muted-foreground truncate">{node.hostname}</p>
                                </div>
                              </div>
                              <Badge className={cn('shrink-0', getStatusColor(node.status))}>
                                {formatStatus(node.status)}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-xs">{formatStatus(node.type)}</Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="flex items-center gap-1">
                                <Cpu className="h-3 w-3 text-muted-foreground" />
                                <span>{node.cpuCores || '-'} cores</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <MemoryStick className="h-3 w-3 text-muted-foreground" />
                                <span>{node.memoryGb || '-'} GB</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Disc className="h-3 w-3 text-muted-foreground" />
                                <span>{node.storageGb || '-'} GB</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                              <span className="font-mono">{node.ipAddress || '-'}</span>
                              <span>{node.operatingSystem || ''}</span>
                            </div>
                            {(node.username || node.password) && (
                              <div className="flex items-center gap-2 text-xs pt-1 border-t">
                                {node.username && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">User:</span>
                                    <span className="font-mono">{node.username}</span>
                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(node.username!)}>
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                                {node.password && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">Pass:</span>
                                    <span className="font-mono">{visiblePasswords.has(node.id) ? node.password : '••••••••'}</span>
                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => togglePasswordVisibility(node.id)}>
                                      {visiblePasswords.has(node.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(node.password!)}>
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                            {canManage && (
                              <div className="flex gap-2 pt-2 border-t">
                                <Button variant="ghost" size="sm" className="h-7 flex-1" onClick={() => openEditDialog(node)}>
                                  <Pencil className="mr-1 h-3 w-3" />
                                  Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => setShowDeleteDialog(node)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Table View - Grouped by Project */}
          {Object.values(nodesByProject).map((project) => {
            const color = getProjectColor(project.name);
            return (
              <Card key={`table-${project.id}`} className="hidden lg:block">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', color.bg)}>
                      <Layers className={cn('h-4 w-4', color.text)} />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{project.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{project.nodes.length} node{project.nodes.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>CPU Cores</TableHead>
                        <TableHead>Memory</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead>OS</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Password</TableHead>
                        {canManage && <TableHead className="w-24" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.nodes.map((node) => (
                        <TableRow key={node.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded bg-muted">
                                {nodeTypeIcons[node.type] || <Server className="h-3 w-3" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{node.name}</p>
                                <p className="text-xs text-muted-foreground">{node.hostname}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{formatStatus(node.type)}</Badge></TableCell>
                          <TableCell>
                            <Badge className={cn(getStatusColor(node.status))}>{formatStatus(node.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{node.cpuCores || '-'}</TableCell>
                          <TableCell className="text-sm">{node.memoryGb ? `${node.memoryGb} GB` : '-'}</TableCell>
                          <TableCell className="text-sm">{node.storageGb ? `${node.storageGb} GB` : '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{node.operatingSystem || '-'}</TableCell>
                          <TableCell>
                            {node.createdByUser ? (
                              <div className="flex items-center gap-1.5">
                                <UserAvatar user={node.createdByUser} size="sm" />
                                <span className="text-xs">{node.createdByUser.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {node.username ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-sm">{node.username}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(node.username!)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {node.password ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-sm">{visiblePasswords.has(node.id) ? node.password : '••••••••'}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePasswordVisibility(node.id)}>
                                  {visiblePasswords.has(node.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(node.password!)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {canManage && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(node)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setShowDeleteDialog(node)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNode ? 'Edit Node' : 'Add Node'}</DialogTitle>
            <DialogDescription>
              {editingNode ? 'Update the infrastructure node details' : 'Add a new infrastructure node'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="node-project">Project *</Label>
              <Select value={String(form.projectId)} onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}>
                <SelectTrigger id="node-project"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-name">Name *</Label>
                <Input id="node-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Web Server 1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-hostname">Hostname *</Label>
                <Input id="node-hostname" value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="e.g., web01.prod" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-type">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger id="node-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="server">Server</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                    <SelectItem value="load-balancer">Load Balancer</SelectItem>
                    <SelectItem value="cache">Cache</SelectItem>
                    <SelectItem value="container">Container</SelectItem>
                    <SelectItem value="kubernetes">Kubernetes</SelectItem>
                    <SelectItem value="network">Network</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="queue">Queue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="node-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-ip">IP Address</Label>
              <Input id="node-ip" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} placeholder="e.g., 10.0.1.10" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-cpu">CPU Cores</Label>
                <Input id="node-cpu" type="number" value={form.cpuCores} onChange={(e) => setForm({ ...form, cpuCores: e.target.value })} placeholder="8" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-memory">Memory (GB)</Label>
                <Input id="node-memory" type="number" value={form.memoryGb} onChange={(e) => setForm({ ...form, memoryGb: e.target.value })} placeholder="32" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-storage">Storage (GB)</Label>
                <Input id="node-storage" type="number" value={form.storageGb} onChange={(e) => setForm({ ...form, storageGb: e.target.value })} placeholder="500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-os">Operating System</Label>
                <Input id="node-os" value={form.operatingSystem} onChange={(e) => setForm({ ...form, operatingSystem: e.target.value })} placeholder="e.g., Ubuntu 22.04" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-provider">Provider</Label>
                <Input id="node-provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="e.g., AWS, GCP" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-username">Username</Label>
                <Input id="node-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g., root, admin" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-password">Password</Label>
                <Input id="node-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFormDialog(false); setEditingNode(null); }}>Cancel</Button>
            <Button onClick={handleFormSubmit} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingNode ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Node</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{showDeleteDialog?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteDialog && deleteMutation.mutate(showDeleteDialog.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
