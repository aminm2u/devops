import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil, Trash2, AlertTriangle, UserPlus, Check } from 'lucide-react';
import { KanbanTab } from './tabs/KanbanTab';
import { TeamTab } from './tabs/TeamTab';
import { FinanceTab } from './tabs/FinanceTab';
import { OverviewTab } from './tabs/OverviewTab';
import { TimelineTab } from './tabs/TimelineTab';
import { EnvironmentsTab } from './tabs/EnvironmentsTab';
import { InfrastructureTab } from './tabs/InfrastructureTab';
import { CredentialsTab } from './tabs/CredentialsTab';
import { ServicesTab } from './tabs/ServicesTab';
import { DeploymentsTab } from './tabs/DeploymentsTab';
import { IncidentsTab } from './tabs/IncidentsTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { ScopeTab } from './tabs/ScopeTab';
import { CostingSheetTab } from './tabs/CostingSheetTab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/layout/PageHeader';
import toast from '@/lib/toast';

/**
 * One project, seven top-level views.
 *
 * This file owns the project payload, the tab bar and every dialog; each tab is
 * a component that renders one slice of that payload. The split is by
 * ownership, not by line count: the page fetches and mutates, the tabs display
 * and raise events.
 *
 * Every view is gated on its own permission rather than one blanket admin flag —
 * a PMO owns the project record but not the servers it runs on, and
 * `project.document.manage` has nothing to do with `devops.deployment.create`.
 * The API enforces the same boundaries, so this only decides what is worth
 * showing, never what is allowed.
 *
 * The active tab — and, inside the Infrastructure tab, the active section —
 * live in the URL, so a link can point at a project's deployments and a reload
 * keeps you there. Old deep links of the form `?tab=deployments` still resolve,
 * into the matching Infrastructure section.
 */

const TAB_KEYS = [
  'overview',
  'timeline',
  'scope',
  'costing-sheet',
  'kanban',
  'team',
  'finances',
  'infrastructure',
  'incidents',
  'documents',
] as const;

type TabKey = (typeof TAB_KEYS)[number];

/** Sections shown in the sidebar once the Infrastructure tab is open. */
const INFRA_SECTIONS = [
  'environments',
  'infrastructure',
  'credentials',
  'services',
  'deployments',
] as const;

type InfraSection = (typeof INFRA_SECTIONS)[number];

const INFRA_SECTION_LABELS: Record<InfraSection, string> = {
  environments: 'Environments',
  infrastructure: 'Infrastructure',
  credentials: 'Credentials',
  services: 'Services',
  deployments: 'Deployments',
};

const CREDENTIAL_EMPTY = {
  name: '',
  type: 'server',
  host: '',
  port: '',
  username: '',
  password: '',
  description: '',
};

type CredentialForm = typeof CREDENTIAL_EMPTY;

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const projectId = Number(id);
  // Environment kinds are master data — a "testing" environment is not a code
  // path, it is a row an admin can rename or extend.
  const { data: envTypeData } = useReferenceData('environment_type');
  const environmentTypes = toSelectOptions(envTypeData);
  const isValidProjectId = Number.isInteger(projectId) && projectId > 0;

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as TabKey | null;
  const tab: TabKey = requestedTab && TAB_KEYS.includes(requestedTab) ? requestedTab : 'overview';
  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete('section');
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  // Which slice of the Infrastructure tab the sidebar has open. Old deep links
  // like ?tab=deployments map onto the matching section so bookmarks survive.
  // "infrastructure" is excluded from that mapping — it is both a top-level tab
  // and a section, so treating plain ?tab=infrastructure as legacy would pin
  // the sidebar to its own Infrastructure entry on every render.
  const isLegacyInfraUrl =
    requestedTab !== null &&
    requestedTab !== 'infrastructure' &&
    INFRA_SECTIONS.includes(requestedTab as InfraSection);
  const activeTab: TabKey = isLegacyInfraUrl ? 'infrastructure' : tab;
  const requestedSection = searchParams.get('section') ?? (isLegacyInfraUrl ? requestedTab : null);
  const section: InfraSection =
    requestedSection && INFRA_SECTIONS.includes(requestedSection as InfraSection)
      ? (requestedSection as InfraSection)
      : 'environments';
  const setSection = (next: string) => {
    const params = new URLSearchParams(searchParams);
    // Normalize a legacy ?tab=<section> link while we are here, so the stale
    // tab param does not linger once the sidebar has been used.
    if (isLegacyInfraUrl) params.set('tab', 'infrastructure');
    if (next === 'environments') params.delete('section');
    else params.set('section', next);
    setSearchParams(params, { replace: true });
  };

  // Capabilities — one per tab, matching the permission each endpoint checks.
  const canManageProject = can('project.record.manage');
  const canDeleteProject = can('project.record.delete');
  const canManageEnvironments = can('project.environment.manage');
  const canManageCredentials = can('project.credential.manage');
  const canManageDocuments = can('project.document.manage');
  const canManageInfrastructure = can('devops.infrastructure.manage');
  const canManageServices = can('devops.service.manage');
  const canCreateDeployment = can('devops.deployment.create');
  const canUpdateDeployment = can('devops.deployment.update');
  const canDeleteDeployment = can('devops.deployment.delete');
  const canCreateIncident = can('devops.incident.create');
  const canManageIncidents = can('devops.incident.manage');

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Environment form
  const [showAddEnvDialog, setShowAddEnvDialog] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvType, setNewEnvType] = useState('development');
  const [newEnvUrl, setNewEnvUrl] = useState('');
  const [deletingEnv, setDeletingEnv] = useState<{ id: number; name: string } | null>(null);

  // Credential form
  const [showAddCredentialDialog, setShowAddCredentialDialog] = useState(false);
  const [showEditCredentialDialog, setShowEditCredentialDialog] = useState(false);
  const [editingCredential, setEditingCredential] = useState<any>(null);
  const [credentialForm, setCredentialForm] = useState<CredentialForm>(CREDENTIAL_EMPTY);
  const [deletingCredential, setDeletingCredential] = useState<any>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});
  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<number, string>>({});

  // Dialogs raised by the other tabs
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);
  const [deletingNode, setDeletingNode] = useState<any>(null);
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [deletingService, setDeletingService] = useState<any>(null);
  const [showDeploymentDialog, setShowDeploymentDialog] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState<any>(null);
  const [deletingDeployment, setDeletingDeployment] = useState<any>(null);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [editingIncident, setEditingIncident] = useState<any>(null);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [editingDocument, setEditingDocument] = useState<any>(null);
  const [deletingDocument, setDeletingDocument] = useState<any>(null);

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getProject(projectId),
    enabled: isValidProjectId,
  });

  /** Anything written here invalidates the project, and usually the list too. */
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  };

  const updateMutation = useMutation({
    mutationFn: (data: Partial<any>) => projectsApi.updateProject(projectId, data),
    onSuccess: () => {
      refresh();
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

  const enrollMutation = useMutation({
    mutationFn: () => projectsApi.enroll(projectId),
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['timesheet-enrollable'] });
      toast.success('You joined the project team');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to enroll'),
  });

  const addEnvMutation = useMutation({
    mutationFn: (data: { name: string; type: string; url?: string }) =>
      apiClient.post(`/projects/${projectId}/environments`, data),
    onSuccess: () => {
      refresh();
      setShowAddEnvDialog(false);
      setNewEnvName('');
      setNewEnvType('development');
      setNewEnvUrl('');
      toast.success('Environment added');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add environment'),
  });

  const deleteEnvMutation = useMutation({
    mutationFn: (envId: number) => apiClient.delete(`/projects/${projectId}/environments/${envId}`),
    onSuccess: () => {
      refresh();
      setDeletingEnv(null);
      toast.success('Environment removed');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Failed to remove environment'),
  });

  const credentialPayload = (form: CredentialForm) => ({
    ...form,
    port: form.port ? parseInt(form.port, 10) : null,
  });

  const addCredentialMutation = useMutation({
    mutationFn: (form: CredentialForm) =>
      apiClient.post(`/projects/${projectId}/credentials`, credentialPayload(form)),
    onSuccess: () => {
      refresh();
      setShowAddCredentialDialog(false);
      setCredentialForm(CREDENTIAL_EMPTY);
      toast.success('Credential added');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to add credential'),
  });

  const updateCredentialMutation = useMutation({
    mutationFn: (form: CredentialForm) =>
      apiClient.put(
        `/projects/${projectId}/credentials/${editingCredential?.id}`,
        credentialPayload(form)
      ),
    onSuccess: () => {
      refresh();
      setShowEditCredentialDialog(false);
      setEditingCredential(null);
      setCredentialForm(CREDENTIAL_EMPTY);
      toast.success('Credential updated');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Failed to update credential'),
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: (credentialId: number) =>
      apiClient.delete(`/projects/${projectId}/credentials/${credentialId}`),
    onSuccess: () => {
      refresh();
      setDeletingCredential(null);
      toast.success('Credential deleted');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Failed to delete credential'),
  });

  const deleteNodeMutation = useMutation({
    mutationFn: (nodeId: number) => apiClient.delete(`/infrastructure/${nodeId}`),
    onSuccess: () => {
      refresh();
      setDeletingNode(null);
      toast.success('Server deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete server'),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (serviceId: number) => apiClient.delete(`/services/${serviceId}`),
    onSuccess: () => {
      refresh();
      setDeletingService(null);
      toast.success('Service deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete service'),
  });

  const deleteDeploymentMutation = useMutation({
    mutationFn: (deploymentId: number) => apiClient.delete(`/deployments/${deploymentId}`),
    onSuccess: () => {
      refresh();
      setDeletingDeployment(null);
      toast.success('Deployment deleted');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Failed to delete deployment'),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: number) => apiClient.delete(`/documents/${documentId}`),
    onSuccess: () => {
      refresh();
      setDeletingDocument(null);
      toast.success('Document deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete document'),
  });

  const togglePasswordVisibility = (nodeId: number) =>
    setVisiblePasswords((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));

  /** Fetches one credential's password the first time it is revealed. */
  const toggleCredentialPassword = async (credId: number) => {
    if (visiblePasswords[credId]) {
      setVisiblePasswords((prev) => ({ ...prev, [credId]: false }));
      return;
    }
    if (!decryptedPasswords[credId]) {
      try {
        const res = await apiClient.get(`/projects/${projectId}/credentials/${credId}/raw`);
        setDecryptedPasswords((prev) => ({
          ...prev,
          [credId]: res.data.data.password || '••••••••',
        }));
      } catch {
        setDecryptedPasswords((prev) => ({ ...prev, [credId]: '••••••••' }));
      }
    }
    setVisiblePasswords((prev) => ({ ...prev, [credId]: true }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Failed to copy'));
  };

  if (isLoading) return <ProjectDetailSkeleton />;

  if (error || !project?.data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
        <h2 className="text-lg font-semibold">Project not found</h2>
        <p className="mb-4 text-muted-foreground">
          The project you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
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

  const projectData = project.data;

  // Membership decides whether the "Join team" button is worth offering at all;
  // the server re-checks both the flag and the duplicate on write.
  const myAssignment = (projectData.teamAssignments ?? []).find(
    (assignment) => assignment.userId === user?.id && assignment.isActive !== false
  );
  const canSelfEnroll =
    !!projectData.allowSelfEnroll && !myAssignment && !canManageProject;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={projectData.name}
        description={
          <span className="block">
            {projectData.description}
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/projects')}
                className="-ml-2"
              >
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <StatusBadge domain="internalProject" value={projectData.status} />
              <StatusBadge domain="helpdeskPriority" value={projectData.priority} />
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
            </span>
          </span>
        }
      >
        {canSelfEnroll && (
          <Button
            variant="outline"
            size="sm"
            disabled={enrollMutation.isPending}
            onClick={() => enrollMutation.mutate()}
            title="Join this project team"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Join team
          </Button>
        )}
        {myAssignment && !canManageProject && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-green-500" />
            Team member
          </span>
        )}
        {canManageProject && (
          <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
        {canDeleteProject && (
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-nowrap justify-start overflow-x-auto p-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="scope">Scope</TabsTrigger>
          <TabsTrigger value="costing-sheet">Costing Sheet</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="finances">Finances &amp; Requisitions</TabsTrigger>
          <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab project={projectData} />
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineTab project={projectData} />
        </TabsContent>

        <TabsContent value="scope">
          <ScopeTab project={projectData} />
        </TabsContent>
        <TabsContent value="costing-sheet">
          <CostingSheetTab project={projectData} />
        </TabsContent>

        <TabsContent value="kanban">
          <KanbanTab project={projectData} refetch={refresh} />
        </TabsContent>

        <TabsContent value="team">
          <TeamTab project={projectData} refetch={refresh} />
        </TabsContent>

        <TabsContent value="finances">
          <FinanceTab project={projectData} refetch={refresh} />
        </TabsContent>

        <TabsContent value="infrastructure">
          <div className="flex flex-col gap-4 lg:flex-row">
            <nav
              aria-label="Infrastructure sections"
              className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-48 lg:flex-col"
            >
              {INFRA_SECTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  aria-current={section === key ? 'true' : undefined}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                    section === key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {INFRA_SECTION_LABELS[key]}
                </button>
              ))}
            </nav>
            <div className="min-w-0 flex-1">
              {section === 'environments' && (
                <EnvironmentsTab
                  project={projectData}
                  canEdit={canManageEnvironments}
                  onAdd={() => setShowAddEnvDialog(true)}
                  onRemove={(envId, name) => setDeletingEnv({ id: envId, name })}
                />
              )}
              {section === 'infrastructure' && (
                <InfrastructureTab
                  project={projectData}
                  canEdit={canManageInfrastructure}
                  visiblePasswords={visiblePasswords}
                  onTogglePassword={togglePasswordVisibility}
                  onAdd={() => {
                    setEditingNode(null);
                    setShowNodeDialog(true);
                  }}
                  onEdit={(node) => {
                    setEditingNode(node);
                    setShowNodeDialog(true);
                  }}
                  onDelete={(node) => setDeletingNode(node)}
                />
              )}
              {section === 'credentials' && (
                <CredentialsTab
                  project={projectData}
                  canEdit={canManageCredentials}
                  visiblePasswords={visiblePasswords}
                  decryptedPasswords={decryptedPasswords}
                  onTogglePassword={toggleCredentialPassword}
                  onCopy={copyToClipboard}
                  onAdd={() => {
                    setCredentialForm(CREDENTIAL_EMPTY);
                    setShowAddCredentialDialog(true);
                  }}
                  onEdit={(cred) => {
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
                  onDelete={(cred) => setDeletingCredential(cred)}
                />
              )}
              {section === 'services' && (
                <ServicesTab
                  project={projectData}
                  canEdit={canManageServices}
                  onAdd={() => {
                    setEditingService(null);
                    setShowServiceDialog(true);
                  }}
                  onEdit={(service) => {
                    setEditingService(service);
                    setShowServiceDialog(true);
                  }}
                  onDelete={(service) => setDeletingService(service)}
                />
              )}
              {section === 'deployments' && (
                <DeploymentsTab
                  project={projectData}
                  canCreate={canCreateDeployment}
                  canEdit={canUpdateDeployment}
                  canDelete={canDeleteDeployment}
                  onAdd={() => {
                    setEditingDeployment(null);
                    setShowDeploymentDialog(true);
                  }}
                  onEdit={(deployment) => {
                    setEditingDeployment(deployment);
                    setShowDeploymentDialog(true);
                  }}
                  onDelete={(deployment) => setDeletingDeployment(deployment)}
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="incidents">
          <IncidentsTab
            project={projectData}
            canCreate={canCreateIncident}
            canEdit={canManageIncidents}
            onAdd={() => {
              setEditingIncident(null);
              setShowIncidentDialog(true);
            }}
            onEdit={(incident) => {
              setEditingIncident(incident);
              setShowIncidentDialog(true);
            }}
          />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab
            project={projectData}
            canEdit={canManageDocuments}
            onAdd={() => {
              setEditingDocument(null);
              setShowDocumentDialog(true);
            }}
            onEdit={(doc) => {
              setEditingDocument(doc);
              setShowDocumentDialog(true);
            }}
            onDelete={(doc) => setDeletingDocument(doc)}
          />
        </TabsContent>
      </Tabs>

      <ProjectForm
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        project={projectData}
        onSubmit={async (data) => {
          await updateMutation.mutateAsync(data);
        }}
        onCancel={() => setShowEditDialog(false)}
        isLoading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Project"
        description={`Are you sure you want to delete "${projectData.name}"? This action cannot be undone.`}
        onConfirm={() => deleteMutation.mutate()}
        isConfirming={deleteMutation.isPending}
      />

      <FormDialog
        open={showAddEnvDialog}
        onOpenChange={setShowAddEnvDialog}
        title="Add Environment"
        maxWidth="md"
        onSubmit={() => {
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
        submitLabel="Add Environment"
        isSubmitting={addEnvMutation.isPending}
      >
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
              {environmentTypes.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
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
      </FormDialog>

      <CredentialDialog
        open={showAddCredentialDialog}
        onOpenChange={setShowAddCredentialDialog}
        title="Add Credential"
        submitLabel="Add Credential"
        form={credentialForm}
        setForm={setCredentialForm}
        onSubmit={() => addCredentialMutation.mutate(credentialForm)}
        isSubmitting={addCredentialMutation.isPending}
      />

      <CredentialDialog
        open={showEditCredentialDialog}
        onOpenChange={setShowEditCredentialDialog}
        title="Edit Credential"
        submitLabel="Save Changes"
        form={credentialForm}
        setForm={setCredentialForm}
        onSubmit={() => updateCredentialMutation.mutate(credentialForm)}
        isSubmitting={updateCredentialMutation.isPending}
        keepPasswordHint
      />

      <ConfirmDialog
        open={deletingEnv !== null}
        onOpenChange={() => setDeletingEnv(null)}
        title="Remove Environment"
        description={`Remove "${deletingEnv?.name ?? ''}"? Deployments targeting it will need a new environment.`}
        confirmLabel="Remove"
        onConfirm={() => deletingEnv && deleteEnvMutation.mutate(deletingEnv.id)}
        isConfirming={deleteEnvMutation.isPending}
      />

      <ConfirmDialog
        open={deletingCredential !== null}
        onOpenChange={() => setDeletingCredential(null)}
        title="Delete Credential"
        description={`Are you sure you want to delete "${deletingCredential?.name ?? ''}"? This action cannot be undone.`}
        onConfirm={() =>
          deletingCredential && deleteCredentialMutation.mutate(deletingCredential.id)
        }
        isConfirming={deleteCredentialMutation.isPending}
      />

      <ConfirmDialog
        open={deletingNode !== null}
        onOpenChange={() => setDeletingNode(null)}
        title="Delete Server"
        description={`Are you sure you want to delete "${deletingNode?.name ?? ''}"? This action cannot be undone.`}
        onConfirm={() => deletingNode && deleteNodeMutation.mutate(deletingNode.id)}
        isConfirming={deleteNodeMutation.isPending}
      />

      <ConfirmDialog
        open={deletingService !== null}
        onOpenChange={() => setDeletingService(null)}
        title="Delete Service"
        description={`Are you sure you want to delete "${deletingService?.name ?? ''}"? This action cannot be undone.`}
        onConfirm={() => deletingService && deleteServiceMutation.mutate(deletingService.id)}
        isConfirming={deleteServiceMutation.isPending}
      />

      <ConfirmDialog
        open={deletingDeployment !== null}
        onOpenChange={() => setDeletingDeployment(null)}
        title="Delete Deployment"
        description={`Delete the record for "${deletingDeployment?.name ?? ''}" v${deletingDeployment?.version ?? ''}? The release itself is unaffected — only this log entry goes away.`}
        onConfirm={() =>
          deletingDeployment && deleteDeploymentMutation.mutate(deletingDeployment.id)
        }
        isConfirming={deleteDeploymentMutation.isPending}
      />

      <ConfirmDialog
        open={deletingDocument !== null}
        onOpenChange={() => setDeletingDocument(null)}
        title="Delete Document"
        description={`Are you sure you want to delete "${deletingDocument?.title ?? ''}"? This action cannot be undone.`}
        onConfirm={() => deletingDocument && deleteDocumentMutation.mutate(deletingDocument.id)}
        isConfirming={deleteDocumentMutation.isPending}
      />

      <InfrastructureNodeDialog
        open={showNodeDialog}
        onOpenChange={setShowNodeDialog}
        projectId={projectId}
        node={editingNode}
        onSuccess={refresh}
      />

      <ServiceDialog
        open={showServiceDialog}
        onOpenChange={setShowServiceDialog}
        projectId={projectId}
        environments={projectData.environments}
        nodes={projectData.infrastructureNodes}
        service={editingService}
        onSuccess={refresh}
      />

      <DeploymentDialog
        open={showDeploymentDialog}
        onOpenChange={setShowDeploymentDialog}
        projectId={projectId}
        environments={projectData.environments}
        deployment={editingDeployment}
        onSuccess={refresh}
      />

      <IncidentDialog
        open={showIncidentDialog}
        onOpenChange={setShowIncidentDialog}
        projectId={projectId}
        incident={editingIncident}
        onSuccess={refresh}
      />

      <DocumentDialog
        open={showDocumentDialog}
        onOpenChange={setShowDocumentDialog}
        projectId={projectId}
        document={editingDocument}
        onSuccess={refresh}
      />
    </div>
  );
}

/** Placeholder laid out like the real page, so the header does not jump on load. */
function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid gap-6 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32 rounded" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map((row) => (
                <div key={row} className="flex justify-between">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Add/edit credential. Both modes share this form; only the password hint
 * differs — on edit an empty field means "keep the stored password", so the
 * label has to say so or people will assume they cleared it.
 */
function CredentialDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  form,
  setForm,
  onSubmit,
  isSubmitting,
  keepPasswordHint = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  form: CredentialForm;
  setForm: React.Dispatch<React.SetStateAction<CredentialForm>>;
  onSubmit: () => void;
  isSubmitting: boolean;
  keepPasswordHint?: boolean;
}) {
  // Credential kinds are master data, shared with the project credential list.
  const { data: credentialTypeData } = useReferenceData('credential_type');
  const credentialTypes = toSelectOptions(credentialTypeData);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      maxWidth="md"
      onSubmit={() => {
        if (!form.name.trim() || !form.host.trim()) {
          toast.error('Name and Host are required');
          return;
        }
        onSubmit();
      }}
      submitLabel={submitLabel}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Production Server"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((prev) => ({ ...prev, type: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {credentialTypes.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Port</Label>
          <Input
            type="number"
            value={form.port}
            onChange={(e) => setForm((prev) => ({ ...prev, port: e.target.value }))}
            placeholder="22"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Host *</Label>
        <Input
          value={form.host}
          onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))}
          placeholder="192.168.1.100 or hostname"
        />
      </div>
      <div className="space-y-2">
        <Label>Username</Label>
        <Input
          value={form.username}
          onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
          placeholder="root"
        />
      </div>
      <div className="space-y-2">
        <Label>{keepPasswordHint ? 'Password (leave blank to keep current)' : 'Password'}</Label>
        <Input
          type="password"
          value={form.password}
          onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          placeholder="••••••••"
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Main production web server"
        />
      </div>
    </FormDialog>
  );
}
