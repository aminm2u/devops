import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Server,
  Layers,
  Box,
  Rocket,
  AlertTriangle,
  FolderOpen,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  X,
  Key,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import { KanbanTab } from './project-tabs/KanbanTab';
import { TeamTab } from './project-tabs/TeamTab';
import { FinanceTab } from './project-tabs/FinanceTab';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { projectsApi } from '@/api/projects';
import { useAuth } from '@/hooks/useAuth';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { InfrastructureNodeDialog } from '@/components/infrastructure/InfrastructureNodeDialog';
import { ServiceDialog } from '@/components/services/ServiceDialog';
import { DeploymentDialog } from '@/components/deployments/DeploymentDialog';
import { IncidentDialog } from '@/components/incidents/IncidentDialog';
import { DocumentDialog } from '@/components/documents/DocumentDialog';
import apiClient from '@/api/client';
import { cn, formatDate, getStatusColor, getPriorityColor, formatStatus } from '@/lib/utils';
import toast from 'react-hot-toast';

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-8 w-8 skeleton rounded" />
        <div className="space-y-2">
          <div className="h-6 w-48 skeleton rounded" />
          <div className="h-4 w-32 skeleton rounded" />
        </div>
      </div>
      <div className="h-10 w-full skeleton rounded-lg" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="h-5 w-32 skeleton rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-24 skeleton rounded" />
                <div className="h-4 w-32 skeleton rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="h-5 w-32 skeleton rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-24 skeleton rounded" />
                <div className="h-4 w-32 skeleton rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const projectId = Number(id);
  const isValidProjectId = !isNaN(projectId) && projectId > 0;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddEnvDialog, setShowAddEnvDialog] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvType, setNewEnvType] = useState('development');
  const [newEnvUrl, setNewEnvUrl] = useState('');

  // Credential state
  const [showAddCredentialDialog, setShowAddCredentialDialog] = useState(false);
  const [showEditCredentialDialog, setShowEditCredentialDialog] = useState(false);
  const [editingCredential, setEditingCredential] = useState<any>(null);
  const [credentialForm, setCredentialForm] = useState({
    name: '',
    type: 'server',
    host: '',
    port: '',
    username: '',
    password: '',
    description: '',
  });
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<number, string>>({});

  // Toggle infrastructure node password visibility (plaintext)
  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Toggle credential password visibility (encrypted - fetches from API)
  const toggleCredentialPassword = async (credId: number) => {
    const isVisible = visiblePasswords[credId];
    if (isVisible) {
      setVisiblePasswords(prev => ({ ...prev, [credId]: false }));
    } else {
      if (!decryptedPasswords[credId]) {
        try {
          const res = await apiClient.get(`/projects/${projectId}/credentials/${credId}/raw`);
          setDecryptedPasswords(prev => ({ ...prev, [credId]: res.data.data.password || '••••••••' }));
        } catch {
          setDecryptedPasswords(prev => ({ ...prev, [credId]: '••••••••' }));
        }
      }
      setVisiblePasswords(prev => ({ ...prev, [credId]: true }));
    }
  };

  // Delete confirmation dialogs
  const [showDeleteEnvDialog, setShowDeleteEnvDialog] = useState(false);
  const [deletingEnvId, setDeletingEnvId] = useState<number | null>(null);
  const [showDeleteCredentialDialog, setShowDeleteCredentialDialog] = useState(false);
  const [deletingCredentialId, setDeletingCredentialId] = useState<number | null>(null);
  const [deletingCredentialName, setDeletingCredentialName] = useState('');

  // Infrastructure node state
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);
  const [showDeleteNodeDialog, setShowDeleteNodeDialog] = useState(false);
  const [deletingNodeId, setDeletingNodeId] = useState<number | null>(null);
  const [deletingNodeName, setDeletingNodeName] = useState('');

  // Service state
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);

  // Deployment state
  const [showDeploymentDialog, setShowDeploymentDialog] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState<any>(null);

  // Incident state
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [editingIncident, setEditingIncident] = useState<any>(null);

  // Document state
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [editingDocument, setEditingDocument] = useState<any>(null);
  const [viewingDocument, setViewingDocument] = useState<any>(null);

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getProject(projectId),
    enabled: isValidProjectId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<any>) => projectsApi.updateProject(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowEditDialog(false);
      toast.success('Project updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
      toast.success('Project deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete'),
  });

  const addEnvMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; url?: string }) => {
      const res = await apiClient.post(`/projects/${projectId}/environments`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowAddEnvDialog(false);
      setNewEnvName('');
      setNewEnvType('development');
      setNewEnvUrl('');
      toast.success('Environment added');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add environment'),
  });

  const deleteEnvMutation = useMutation({
    mutationFn: async (envId: number) => {
      await apiClient.delete(`/projects/${projectId}/environments/${envId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Environment removed');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to remove environment'),
  });

  // Credential mutations
  const addCredentialMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = { ...data, port: data.port ? parseInt(data.port, 10) : null };
      const res = await apiClient.post(`/projects/${projectId}/credentials`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowAddCredentialDialog(false);
      resetCredentialForm();
      toast.success('Credential added');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add credential'),
  });

  const updateCredentialMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = { ...data, port: data.port ? parseInt(data.port, 10) : null };
      const res = await apiClient.put(`/projects/${projectId}/credentials/${editingCredential.id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowEditCredentialDialog(false);
      setEditingCredential(null);
      resetCredentialForm();
      toast.success('Credential updated');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update credential'),
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: async (credentialId: number) => {
      await apiClient.delete(`/projects/${projectId}/credentials/${credentialId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Credential deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete credential'),
  });

  // Infrastructure node mutations
  const deleteNodeMutation = useMutation({
    mutationFn: async (nodeId: number) => {
      await apiClient.delete(`/infrastructure/${nodeId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Server deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete server'),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (serviceId: number) => {
      await apiClient.delete(`/services/${serviceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Service deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete service'),
  });

  const deleteDeploymentMutation = useMutation({
    mutationFn: async (deploymentId: number) => {
      await apiClient.delete(`/deployments/${deploymentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Deployment deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete deployment'),
  });

  const deleteIncidentMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      await apiClient.delete(`/incidents/${incidentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Incident deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete incident'),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      await apiClient.delete(`/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Document deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete document'),
  });

  const resetCredentialForm = () => {
    setCredentialForm({
      name: '',
      type: 'server',
      host: '',
      port: '',
      username: '',
      password: '',
      description: '',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  if (isLoading) return <DetailSkeleton />;

  if (error || !project?.data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold">Project not found</h2>
        <p className="text-muted-foreground mb-4">
          The project you're looking for doesn't exist or you don't have access.
        </p>
        <Link to="/projects">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  const projectData = project.data?.data || project.data;
  const canEdit = hasRole('super-admin') || hasRole('devops-admin');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Link to="/projects">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{projectData.name}</h1>
            <p className="text-muted-foreground">{projectData.description}</p>
            <div className="flex items-center gap-4 mt-2">
              <Badge className={cn(getStatusColor(projectData.status))}>
                {formatStatus(projectData.status)}
              </Badge>
              <Badge className={cn(getPriorityColor(projectData.priority))}>
                {formatStatus(projectData.priority)}
              </Badge>
              {projectData.repositoryUrl && (
                <a
                  href={projectData.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Repository
                </a>
              )}
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="overflow-x-auto flex flex-nowrap w-full justify-start h-auto p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="finances">Finances & Requisitions</TabsTrigger>
          <TabsTrigger value="environments">Environments</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className={cn(getStatusColor(projectData.status))}>
                    {formatStatus(projectData.status)}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Priority</span>
                  <Badge className={cn(getPriorityColor(projectData.priority))}>
                    {formatStatus(projectData.priority)}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Health Status</span>
                  <span className="text-sm font-semibold">{projectData.healthStatus || 'N/A'}</span>
                </div>
                <Separator />
                {projectData.startDate && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Timeline</span>
                      <span className="text-sm">
                        {new Date(projectData.startDate).toLocaleDateString()} - {projectData.expectedEndDate ? new Date(projectData.expectedEndDate).toLocaleDateString() : 'TBD'}
                      </span>
                    </div>
                    <Separator />
                  </>
                )}
                {projectData.owner && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Owner</span>
                      <span className="text-sm font-medium">{projectData.owner.name}</span>
                    </div>
                    <Separator />
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <span className="text-sm">{formatDate(projectData.createdAt)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Last Updated</span>
                  <span className="text-sm">{formatDate(projectData.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>

            {projectData.delayReason && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Project Delay Alert
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-red-900 mb-2"><strong>Reason:</strong> {projectData.delayReason}</p>
                  {projectData.recommendation && (
                    <p className="text-sm text-red-800"><strong>Recommendation:</strong> {projectData.recommendation}</p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Environments</span>
                  <span className="text-sm font-medium">{projectData.environments?.length ?? 0}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Infrastructure Nodes</span>
                  <span className="text-sm font-medium">{projectData.infrastructureNodes?.length ?? 0}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Services</span>
                  <span className="text-sm font-medium">{projectData.services?.length ?? 0}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Applications</span>
                  <span className="text-sm font-medium">{projectData.applications?.length ?? 0}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Team Members</span>
                  <span className="text-sm font-medium">{projectData.teamAssignments?.length ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {projectData.documentationUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documentation</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={projectData.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <FileText className="h-4 w-4" />
                  View Documentation
                  <ExternalLink className="h-3 w-3" />
                </a>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="kanban" className="space-y-6">
          <KanbanTab project={projectData} refetch={() => queryClient.invalidateQueries({ queryKey: ['project', projectId] })} />
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <TeamTab project={projectData} refetch={() => queryClient.invalidateQueries({ queryKey: ['project', projectId] })} />
        </TabsContent>

        <TabsContent value="finances" className="space-y-6">
          <FinanceTab project={projectData} refetch={() => queryClient.invalidateQueries({ queryKey: ['project', projectId] })} />
        </TabsContent>

        {/* Environments Tab */}
        <TabsContent value="environments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Environments</CardTitle>
              {canEdit && (
                <Button size="sm" onClick={() => setShowAddEnvDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Environment
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!projectData.environments?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Layers className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No environments configured</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Created</TableHead>
                      {canEdit && <TableHead className="w-12" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectData.environments.map((env) => (
                      <TableRow key={env.id}>
                        <TableCell className="font-medium">{env.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatStatus(env.type)}</Badge>
                        </TableCell>
                        <TableCell>
                          {env.url ? (
                            <a
                              href={env.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {env.url}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(env.createdAt)}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setDeletingEnvId(env.id);
                                setShowDeleteEnvDialog(true);
                              }}
                              aria-label="Remove environment"
                            >
                              <X className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Infrastructure Tab */}
        <TabsContent value="infrastructure">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Infrastructure Nodes</CardTitle>
              {canEdit && (
                <Button size="sm" onClick={() => { setEditingNode(null); setShowNodeDialog(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Server
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!projectData.infrastructureNodes?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Server className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No servers configured</p>
                  {canEdit && (
                    <Button variant="link" size="sm" onClick={() => { setEditingNode(null); setShowNodeDialog(true); }}>
                      Add your first server
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>Memory</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Password</TableHead>
                        {canEdit && <TableHead className="w-24" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectData.infrastructureNodes.map((node) => (
                        <TableRow key={node.id}>
                          <TableCell className="font-medium">
                            <div>
                              <div>{node.name}</div>
                              {node.hostname && <div className="text-xs text-muted-foreground">{node.hostname}</div>}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{node.ipAddress}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{formatStatus(node.type)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(getStatusColor(node.status))}>
                              {formatStatus(node.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {node.cpuCores !== null ? `${node.cpuCores} cores` : '-'}
                          </TableCell>
                          <TableCell>
                            {node.memoryGb !== null ? `${node.memoryGb} GB` : '-'}
                          </TableCell>
                          <TableCell>
                            {node.storageGb !== null ? `${node.storageGb} GB` : '-'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {node.username || '-'}
                          </TableCell>
                          <TableCell>
                            {node.password ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-sm">
                                  {visiblePasswords[node.id] ? node.password : '••••••••'}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => togglePasswordVisibility(node.id)}
                                >
                                  {visiblePasswords[node.id] ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {canEdit && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => { setEditingNode(node); setShowNodeDialog(true); }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => { setDeletingNodeId(node.id); setDeletingNodeName(node.name); setShowDeleteNodeDialog(true); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credentials Tab */}
        <TabsContent value="credentials">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4" />
                Credentials
              </CardTitle>
              {canEdit && (
                <Button size="sm" onClick={() => {
                  resetCredentialForm();
                  setShowAddCredentialDialog(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Credential
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!projectData.credentials?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Key className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No credentials stored</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add server, database, or API credentials for easy access
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Password</TableHead>
                      <TableHead>Description</TableHead>
                      {canEdit && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectData.credentials.map((cred: any) => (
                      <TableRow key={cred.id}>
                        <TableCell className="font-medium">{cred.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{cred.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{cred.host}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-1"
                            onClick={() => copyToClipboard(cred.host)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </TableCell>
                        <TableCell>
                          {cred.username ? (
                            <span className="font-mono text-sm">{cred.username}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                          {cred.username && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 ml-1"
                              onClick={() => copyToClipboard(cred.username)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {visiblePasswords[cred.id] ? (decryptedPasswords[cred.id] || '••••••••') : '••••••••'}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-1"
                            onClick={() => toggleCredentialPassword(cred.id)}
                          >
                            {visiblePasswords[cred.id] ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-1"
                            onClick={async () => {
                              let pw = decryptedPasswords[cred.id];
                              if (!pw) {
                                try {
                                  const res = await apiClient.get(`/projects/${projectId}/credentials/${cred.id}/raw`);
                                  pw = res.data.data.password || '';
                                  setDecryptedPasswords(prev => ({ ...prev, [cred.id]: pw }));
                                } catch { pw = ''; }
                              }
                              copyToClipboard(pw);
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </TableCell>
                        <TableCell className="max-w-32 truncate text-muted-foreground">
                          {cred.description || '-'}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingCredential(cred);
                                  setCredentialForm({
                                    name: cred.name,
                                    type: cred.type,
                                    host: cred.host,
                                    port: cred.port?.toString() || '',
                                    username: cred.username || '',
                                    password: '',
                                    description: cred.description || '',
                                  });
                                  setShowEditCredentialDialog(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setDeletingCredentialId(cred.id);
                                  setDeletingCredentialName(cred.name);
                                  setShowDeleteCredentialDialog(true);
                                }}
                                aria-label="Delete credential"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Services</CardTitle>
              {canEdit && (
                <Button size="sm" onClick={() => { setEditingService(null); setShowServiceDialog(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Service
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!projectData.services?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Box className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No services configured</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Port</TableHead>
                      <TableHead>Version</TableHead>
                      {canEdit && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectData.services.map((service) => (
                      <TableRow key={service.id}>
                        <TableCell className="font-medium">{service.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatStatus(service.type)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(getStatusColor(service.status))}>
                            {formatStatus(service.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{service.port || '-'}</TableCell>
                        <TableCell>{service.version || '-'}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setEditingService(service); setShowServiceDialog(true); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => deleteServiceMutation.mutate(service.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deployments Tab */}
        <TabsContent value="deployments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Deployments</CardTitle>
              {canEdit && (
                <Button size="sm" onClick={() => { setEditingDeployment(null); setShowDeploymentDialog(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Deployment
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!projectData.deployments?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Rocket className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No deployments yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Deployed At</TableHead>
                      {canEdit && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectData.deployments.map((deployment) => (
                      <TableRow key={deployment.id}>
                        <TableCell className="font-medium">{deployment.name}</TableCell>
                        <TableCell>v{deployment.version}</TableCell>
                        <TableCell>
                          <Badge className={cn(getStatusColor(deployment.status))}>
                            {formatStatus(deployment.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {deployment.branch || deployment.commitHash?.slice(0, 7) || '-'}
                        </TableCell>
                        <TableCell>
                          {deployment.deployedAt ? formatDate(deployment.deployedAt) : '-'}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setEditingDeployment(deployment); setShowDeploymentDialog(true); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => deleteDeploymentMutation.mutate(deployment.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incidents Tab */}
        <TabsContent value="incidents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Incidents</CardTitle>
              {canEdit && (
                <Button size="sm" onClick={() => { setEditingIncident(null); setShowIncidentDialog(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Report Incident
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!projectData.incidents?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No incidents reported</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      {canEdit && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectData.incidents.map((incident) => (
                      <TableRow key={incident.id}>
                        <TableCell className="font-medium">{incident.title}</TableCell>
                        <TableCell>
                          <Badge className={cn(getPriorityColor(incident.severity))}>
                            {formatStatus(incident.severity)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(getStatusColor(incident.status))}>
                            {formatStatus(incident.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(incident.createdAt)}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setEditingIncident(incident); setShowIncidentDialog(true); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => deleteIncidentMutation.mutate(incident.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Documents</CardTitle>
              {canEdit && (
                <Button size="sm" onClick={() => { setEditingDocument(null); setShowDocumentDialog(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!projectData.documents?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FolderOpen className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No documents uploaded</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Created</TableHead>
                      {canEdit && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectData.documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <button
                            className="font-medium text-left hover:underline text-primary"
                            onClick={() => setViewingDocument(doc)}
                          >
                            {doc.title}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatStatus(doc.type)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(getStatusColor(doc.status))}>
                            {formatStatus(doc.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{doc.version}</TableCell>
                        <TableCell>{formatDate(doc.createdAt)}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setViewingDocument(doc)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setEditingDocument(doc); setShowDocumentDialog(true); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => deleteDocumentMutation.mutate(doc.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardContent>
              <ProjectForm
                project={projectData}
                onSubmit={async (data) => {
                  await updateMutation.mutateAsync(data);
                }}
                onCancel={() => setShowEditDialog(false)}
                isLoading={updateMutation.isPending}
              />
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader>
              <CardTitle>Delete Project</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Are you sure you want to delete "{projectData.name}"? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Add Environment Dialog */}
      <Dialog open={showAddEnvDialog} onOpenChange={setShowAddEnvDialog}>
        <DialogContent className="p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader>
              <CardTitle>Add Environment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    value={newEnvName}
                    onChange={(e) => setNewEnvName(e.target.value)}
                    placeholder="e.g., Production"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newEnvType} onValueChange={setNewEnvType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="testing">Testing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={newEnvUrl}
                    onChange={(e) => setNewEnvUrl(e.target.value)}
                    placeholder="https://staging.example.com"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowAddEnvDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!newEnvName.trim()) {
                        toast.error('Environment name is required');
                        return;
                      }
                      addEnvMutation.mutate({
                        name: newEnvName.trim(),
                        type: newEnvType,
                        url: newEnvUrl.trim() || undefined,
                      });
                    }}
                    disabled={addEnvMutation.isPending}
                  >
                    {addEnvMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Environment
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Add Credential Dialog */}
      <Dialog open={showAddCredentialDialog} onOpenChange={setShowAddCredentialDialog}>
        <DialogContent className="max-w-lg p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader>
              <CardTitle>Add Credential</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    value={credentialForm.name}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Production Server"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={credentialForm.type} onValueChange={(v) => setCredentialForm(prev => ({ ...prev, type: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="server">Server</SelectItem>
                        <SelectItem value="database">Database</SelectItem>
                        <SelectItem value="ssh">SSH</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={credentialForm.port}
                      onChange={(e) => setCredentialForm(prev => ({ ...prev, port: e.target.value }))}
                      placeholder="22"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Host *</Label>
                  <Input
                    value={credentialForm.host}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="192.168.1.100 or hostname"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={credentialForm.username}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="root"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={credentialForm.password}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={credentialForm.description}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Main production web server"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowAddCredentialDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!credentialForm.name.trim() || !credentialForm.host.trim()) {
                        toast.error('Name and Host are required');
                        return;
                      }
                      addCredentialMutation.mutate(credentialForm);
                    }}
                    disabled={addCredentialMutation.isPending}
                  >
                    {addCredentialMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Credential
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Edit Credential Dialog */}
      <Dialog open={showEditCredentialDialog} onOpenChange={setShowEditCredentialDialog}>
        <DialogContent className="max-w-lg p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader>
              <CardTitle>Edit Credential</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    value={credentialForm.name}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Production Server"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={credentialForm.type} onValueChange={(v) => setCredentialForm(prev => ({ ...prev, type: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="server">Server</SelectItem>
                        <SelectItem value="database">Database</SelectItem>
                        <SelectItem value="ssh">SSH</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={credentialForm.port}
                      onChange={(e) => setCredentialForm(prev => ({ ...prev, port: e.target.value }))}
                      placeholder="22"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Host *</Label>
                  <Input
                    value={credentialForm.host}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="192.168.1.100 or hostname"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={credentialForm.username}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="root"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password (leave blank to keep current)</Label>
                  <Input
                    type="password"
                    value={credentialForm.password}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={credentialForm.description}
                    onChange={(e) => setCredentialForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Main production web server"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowEditCredentialDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (!credentialForm.name.trim() || !credentialForm.host.trim()) {
                        toast.error('Name and Host are required');
                        return;
                      }
                      updateCredentialMutation.mutate(credentialForm);
                    }}
                    disabled={updateCredentialMutation.isPending}
                  >
                    {updateCredentialMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Delete Environment Confirmation */}
      <AlertDialog open={showDeleteEnvDialog} onOpenChange={setShowDeleteEnvDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Environment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this environment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingEnvId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingEnvId) {
                  deleteEnvMutation.mutate(deletingEnvId);
                  setDeletingEnvId(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Credential Confirmation */}
      <AlertDialog open={showDeleteCredentialDialog} onOpenChange={setShowDeleteCredentialDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingCredentialName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeletingCredentialId(null); setDeletingCredentialName(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingCredentialId) {
                  deleteCredentialMutation.mutate(deletingCredentialId);
                  setDeletingCredentialId(null);
                  setDeletingCredentialName('');
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Server Confirmation */}
      <AlertDialog open={showDeleteNodeDialog} onOpenChange={setShowDeleteNodeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingNodeName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeletingNodeId(null); setDeletingNodeName(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingNodeId) {
                  deleteNodeMutation.mutate(deletingNodeId);
                  setDeletingNodeId(null);
                  setDeletingNodeName('');
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Infrastructure Node Dialog */}
      <InfrastructureNodeDialog
        open={showNodeDialog}
        onOpenChange={setShowNodeDialog}
        projectId={projectId}
        node={editingNode}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['project', projectId] }); }}
      />

      {/* Service Dialog */}
      <ServiceDialog
        open={showServiceDialog}
        onOpenChange={setShowServiceDialog}
        projectId={projectId}
        environments={projectData.environments}
        nodes={projectData.infrastructureNodes}
        service={editingService}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['project', projectId] }); }}
      />

      {/* Deployment Dialog */}
      <DeploymentDialog
        open={showDeploymentDialog}
        onOpenChange={setShowDeploymentDialog}
        projectId={projectId}
        environments={projectData.environments}
        deployment={editingDeployment}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['project', projectId] }); }}
      />

      {/* Incident Dialog */}
      <IncidentDialog
        open={showIncidentDialog}
        onOpenChange={setShowIncidentDialog}
        projectId={projectId}
        incident={editingIncident}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['project', projectId] }); }}
      />

      {/* Document Dialog */}
      <DocumentDialog
        open={showDocumentDialog}
        onOpenChange={setShowDocumentDialog}
        projectId={projectId}
        document={editingDocument}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['project', projectId] }); }}
      />

      {/* Document Viewer Dialog */}
      <Dialog open={!!viewingDocument} onOpenChange={() => setViewingDocument(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader>
              <CardTitle>{viewingDocument?.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Document Info */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant="outline">{formatStatus(viewingDocument?.type || '')}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge className={cn(getStatusColor(viewingDocument?.status || ''))}>
                      {formatStatus(viewingDocument?.status || '')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Version:</span>
                    <span>{viewingDocument?.version}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Created:</span>
                    <span>{formatDate(viewingDocument?.createdAt)}</span>
                  </div>
                </div>

                <Separator />

                {/* Content */}
                {viewingDocument?.content && (
                  <div>
                    <h4 className="font-medium mb-2">Content</h4>
                    <div className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap">
                      {viewingDocument.content}
                    </div>
                  </div>
                )}

                {/* Attached Files */}
                {viewingDocument?.metadata?.files && viewingDocument.metadata.files.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Attached Files</h4>
                    <div className="space-y-2">
                      {viewingDocument.metadata.files.map((file: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-muted rounded-lg p-3"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{file.originalName}</p>
                              <p className="text-xs text-muted-foreground">
                                {file.mimeType} • {(file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const token = localStorage.getItem('token');
                              window.open(`${file.url}?token=${token}`, '_blank');
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content URL */}
                {viewingDocument?.contentUrl && (
                  <div>
                    <h4 className="font-medium mb-2">Link</h4>
                    <a
                      href={viewingDocument.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-sm"
                    >
                      {viewingDocument.contentUrl}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    </div>
  );
}
