export interface User {
  id: number;
  name: string;
  email: string;
  emailVerifiedAt?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  roles: Role[] | string[];
  permissions: Permission[] | string[];
}

export interface Role {
  id?: number;
  name: string;
  guardName?: string;
  description?: string | null;
}

export interface Permission {
  id?: number;
  name: string;
  guardName?: string;
  description?: string | null;
  group?: string | null;
}

export interface Project {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  repositoryUrl: string | null;
  documentationUrl: string | null;
  ownerId: number;
  owner?: User;
  createdAt: string;
  updatedAt: string;
  environments?: Environment[];
  infrastructureNodes?: InfrastructureNode[];
  services?: Service[];
  applications?: Application[];
  deployments?: Deployment[];
  incidents?: Incident[];
  documents?: Document[];
  activities?: Activity[];
  teamAssignments?: TeamAssignment[];
  credentials?: Credential[];
  _count?: {
    environments?: number;
    services?: number;
    infrastructureNodes?: number;
    applications?: number;
    deployments?: number;
    incidents?: number;
  };
}

export type ProjectStatus = 'planning' | 'active' | 'inactive' | 'archived';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TeamAssignment {
  id: number;
  projectId: number;
  userId: number;
  role: string;
  assignedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user?: User;
  project?: Project;
}

export interface Environment {
  id: number;
  projectId: number;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  url: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  project?: Project;
}

export type EnvironmentType = 'development' | 'staging' | 'production' | 'testing';

export interface InfrastructureNode {
  id: number;
  projectId: number;
  environmentId: number | null;
  name: string;
  type: NodeType;
  hostname: string | null;
  ipAddress: string | null;
  status: NodeStatus;
  operatingSystem: string | null;
  cpuCores: number | null;
  memoryGb: number | null;
  storageGb: number | null;
  provider: string | null;
  providerRegion: string | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdBy?: number | null;
  createdByUser?: { id: number; name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  environment?: Environment;
}

export type NodeType = 'server' | 'database' | 'load-balancer' | 'cache' | 'queue' | 'storage' | 'network' | 'container' | 'kubernetes';
export type NodeStatus = 'active' | 'healthy' | 'warning' | 'critical' | 'offline' | 'down' | 'maintenance' | 'unknown';

export interface Service {
  id: number;
  projectId: number;
  environmentId: number | null;
  infrastructureNodeId: number | null;
  name: string;
  slug: string;
  type: string;
  status: string;
  version: string | null;
  port: number | null;
  healthCheckUrl: string | null;
  description: string | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  environment?: Environment;
}

export type ServiceType = 'api' | 'web' | 'worker' | 'scheduler' | 'gateway' | 'database' | 'cache' | 'queue' | 'other';
export type ServiceStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance';

export interface Application {
  id: number;
  projectId: number;
  environmentId: number | null;
  name: string;
  slug: string;
  type: string;
  status: string;
  version: string | null;
  repositoryUrl: string | null;
  deploymentUrl: string | null;
  healthCheckUrl: string | null;
  description: string | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  environment?: Environment;
}

export type ApplicationType = 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'cli' | 'library';
export type ApplicationStatus = 'active' | 'inactive' | 'building' | 'deploying' | 'error';

export interface Domain {
  id: number;
  projectId: number | null;
  serviceId: number | null;
  applicationId: number | null;
  name: string;
  type: string;
  status: string;
  registrar: string | null;
  expirationDate: string | null;
  autoRenew: boolean;
  nameservers: Record<string, unknown> | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  service?: Service;
  application?: Application;
}

export type DomainSSLStatus = 'valid' | 'expiring_soon' | 'expired' | 'invalid' | 'unknown';

export interface Deployment {
  id: number;
  projectId: number;
  environmentId: number | null;
  applicationId: number | null;
  name: string;
  version: string | null;
  status: string;
  branch: string | null;
  commitHash: string | null;
  commitMessage: string | null;
  deployedBy: number | null;
  deployedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  isRollback: boolean;
  rollbackFromId: number | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  environment?: Environment;
  application?: Application;
  deployedByUser?: User;
}

export type DeploymentStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';

export interface Incident {
  id: number;
  projectId: number;
  environmentId: number | null;
  title: string;
  slug: string;
  description: string | null;
  severity: string;
  status: string;
  priority: string;
  assignedTo: number | null;
  reportedBy: number | null;
  startedAt: string | null;
  resolvedAt: string | null;
  rootCause: string | null;
  resolution: string | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  environment?: Environment;
  reportedUser?: User;
  assignedUser?: User;
}

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'closed';

export interface ChangeManagement {
  id: number;
  projectId: number;
  environmentId: number | null;
  title: string;
  slug: string;
  description: string | null;
  type: string;
  status: string;
  riskLevel: string;
  priority: string;
  requestedBy: number | null;
  approvedBy: number | null;
  implementedBy: number | null;
  requestedAt: string | null;
  approvedAt: string | null;
  implementedAt: string | null;
  rollbackPlan: string | null;
  notes: string | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
}

export type ChangeType = 'standard' | 'normal' | 'emergency';
export type ChangeStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface BackupJob {
  id: number;
  projectId: number;
  environmentId: number | null;
  name: string;
  slug: string;
  type: string;
  status: string;
  schedule: string | null;
  retentionDays: number;
  storageLocation: string | null;
  storagePath: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastBackupSizeBytes: number | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  environment?: Environment;
}

export type BackupType = 'full' | 'incremental' | 'differential' | 'snapshot';
export type BackupStatus = 'success' | 'failed' | 'in_progress' | 'cancelled';

export interface DisasterRecoveryPlan {
  id: number;
  projectId: number;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  rpoHours: number | null;
  rtoHours: number | null;
  lastTestedAt: string | null;
  nextTestAt: string | null;
  testResults: Record<string, unknown> | null;
  procedures: Record<string, unknown> | null;
  contacts: Record<string, unknown> | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
}

export interface SecurityFinding {
  id: number;
  projectId: number;
  applicationId: number | null;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  severity: string;
  priority: string;
  type: string;
  source: string | null;
  cveId: string | null;
  cvssScore: number | null;
  affectedComponent: string | null;
  remediation: string | null;
  assignedTo: number | null;
  reportedBy: number | null;
  foundAt: string | null;
  resolvedAt: string | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  application?: Application;
}

export interface Document {
  id: number;
  projectId: number;
  title: string;
  slug: string;
  content: string | null;
  type: string;
  status: string;
  authorId: number | null;
  version: string;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  project?: Project;
  author?: User;
}

export interface Activity {
  id: number;
  logName: string | null;
  description: string;
  subjectType: string | null;
  subjectId: number | null;
  event: string | null;
  causerId: number | null;
  causerType: string | null;
  properties: Record<string, unknown> | null;
  batchUuid: string | null;
  createdAt: string;
  updatedAt: string;
  user?: User;
}

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalInfrastructureNodes: number;
  healthyNodes: number;
  warningNodes: number;
  criticalNodes: number;
  openIncidents: number;
  criticalIncidents: number;
  recentDeployments: Deployment[];
  recentActivities: { id: number; action: string; createdAt: string }[];
  expiringSSLCertificates: { id: number; name: string; notAfter: string | null }[];
  resourceHealth: {
    healthy: number;
    warning: number;
    critical: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    currentPage: number;
    lastPage: number;
    perPage: number;
    total: number;
    unreadCount?: number;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

export interface AuthResponse {
  user: {
    id: number;
    name: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
  accessToken: string;
}

export interface ProjectFilters {
  search?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  page?: number;
  perPage?: number;
}

export interface Credential {
  id: number;
  projectId: number;
  name: string;
  type: CredentialType;
  host: string;
  port: number | null;
  username: string | null;
  password: string;
  hasPassword?: boolean;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CredentialType = 'server' | 'database' | 'ssh' | 'api' | 'other';

// ── Notification Types ──────────────────────────────────────────────────────
export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export type NotificationType = 'welcome' | 'incident' | 'deployment' | 'system' | 'security';

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  incidentAlerts: boolean;
  deploymentUpdates: boolean;
  weeklyReport: boolean;
}

export interface BudgetItem {
  id: number;
  projectId: number | null;
  division: string;
  category: string;
  description: string;
  details: string | null;
  requestor: string;
  allocatedBudget: number;
  utilizedBudget: number;
  poNumber: string | null;
  currency: string;
  status: string;
  fiscalYear: string | null;
  isActive: boolean;
  metadata: any | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetExpenditure {
  id: number;
  budgetItemId: number;
  amount: number;
  description: string;
  vendor: string | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  expenditureDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BudgetCategory = 'Hardware' | 'Software' | 'Maintenance' | 'Office Equipment' | 'Rentals' | 'Hosting' | 'Security' | 'Training' | 'Consulting' | 'Other';

export type BudgetStatus = 'active' | 'pending' | 'approved' | 'completed' | 'cancelled';

export interface BudgetSummary {
  totalAllocated: number;
  totalUtilized: number;
  totalBalance: number;
  utilizationPercent: number;
  categories: BudgetCategorySummary[];
  divisions: BudgetDivisionSummary[];
}

export interface BudgetCategorySummary {
  name: string;
  allocated: number;
  utilized: number;
  balance: number;
  utilizationPercent: number;
}

export interface BudgetDivisionSummary {
  name: string;
  allocated: number;
  utilized: number;
  balance: number;
}

export type BudgetForm = Omit<BudgetItem, 'id' | 'utilizedBudget' | 'isActive' | 'createdAt' | 'updatedAt'>;

export type ExpenditureForm = Omit<BudgetExpenditure, 'id' | 'budgetItemId' | 'isActive' | 'createdAt' | 'updatedAt'>;

// ── Requisition Form Types ──────────────────────────────────────────────────

export interface RequisitionItem {
  id?: number;
  requisitionFormId?: number;
  description: string;
  qty: number;
  unitPrice: number;
  uom: string | null;
  remark: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RequisitionForm {
  id: number;
  division: string;
  processOwner: string | null;
  budgetItemId: number | null;
  totalEstimatedCost: number;
  requiredDate: string | null;
  purpose: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  requestedByName: string | null;
  requestedByDate: string | null;
  approvedByName: string | null;
  approvedByDate: string | null;
  isActive: boolean;
  metadata: any | null;
  createdAt: string;
  updatedAt: string;
  items?: RequisitionItem[];
  budgetItem?: {
    id: number;
    description: string;
    division: string;
    allocatedBudget: number;
    utilizedBudget: number;
    currency: string;
  } | null;
}

export type RequisitionFormStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export type RequisitionFormForm = Omit<RequisitionForm, 'id' | 'isActive' | 'createdAt' | 'updatedAt'> & {
  items: RequisitionItem[];
};

// ==================== Helpdesk Types ====================

export interface HelpdeskCategory {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { tickets: number };
}

export interface HelpdeskTicket {
  id: number;
  projectId: number | null;
  title: string;
  slug: string;
  description: string | null;
  status: HelpdeskTicketStatus;
  priority: HelpdeskTicketPriority;
  categoryId: number | null;
  source: string;
  assignedTo: number | null;
  reportedBy: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  slaResponseAt: string | null;
  slaResolutionAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  satisfaction: number | null;
  resolutionNotes: string | null;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: number; name: string; color: string | null } | null;
  assignee?: { id: number; name: string; email: string } | null;
  reporter?: { id: number; name: string; email: string } | null;
  project?: { id: number; name: string; slug: string } | null;
  comments?: HelpdeskComment[];
  attachments?: HelpdeskAttachment[];
  _count?: { comments: number; attachments: number };
}

export type HelpdeskTicketStatus = 'open' | 'in_progress' | 'awaiting_response' | 'resolved' | 'closed' | 'reopened';

export type HelpdeskTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface HelpdeskComment {
  id: number;
  ticketId: number;
  userId: number | null;
  content: string;
  isInternal: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user?: { id: number; name: string; email: string } | null;
}

export interface HelpdeskAttachment {
  id: number;
  ticketId: number;
  commentId: number | null;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedBy: number | null;
  isActive: boolean;
  createdAt: string;
  uploader?: { id: number; name: string } | null;
}

export interface HelpdeskStats {
  total: number;
  open: number;
  inProgress: number;
  awaitingResponse: number;
  resolvedToday: number;
  closedToday: number;
  myOpenTickets: number;
  priority: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  avgSatisfaction: number;
  totalRated: number;
}

export type HelpdeskTicketForm = Omit<HelpdeskTicket, 'id' | 'isActive' | 'createdAt' | 'updatedAt' | 'slug'>;

