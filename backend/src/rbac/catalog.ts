/**
 * Permission catalog — the single source of truth for every capability in the
 * platform. The seeder reads this to create `permissions` rows; the access API
 * reads it to render the permission matrix; the frontend reads the names from
 * the API (never a hard-coded list).
 *
 * Naming convention: `<module>.<resource>.<action>`
 *
 * Scope semantics (see rbac/effective.ts):
 *   self < team < department < all
 * `supportsScope: false` means the permission is binary — the scope column is
 * ignored and treated as "all".
 */

export type PermissionScope = "self" | "team" | "department" | "all";

export interface PermissionDefinition {
  name: string;
  group: string;
  description: string;
  /** Rendered in red with a confirmation prompt in the matrix UI. */
  isDangerous?: boolean;
  /** Whether per-role scope narrowing is meaningful for this permission. */
  supportsScope?: boolean;
}

export const PERMISSION_GROUPS = [
  "Dashboard",
  "My Work",
  "Timesheet",
  "Projects",
  "Tasks",
  "DevOps · Infrastructure",
  "DevOps · Delivery",
  "DevOps · Reliability",
  "DevOps · Network",
  "DevOps · Monitoring",
  "Helpdesk",
  "Procurement",
  "Budget",
  "Assets",
  "HR",
  "Approvals",
  "Administration",
] as const;

function p(
  name: string,
  group: string,
  description: string,
  extra: Partial<PermissionDefinition> = {}
): PermissionDefinition {
  return { name, group, description, ...extra };
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // ── Dashboard ─────────────────────────────────────────────────────────────
  p("dashboard.view", "Dashboard", "View the personal dashboard"),
  p("dashboard.view.org", "Dashboard", "View organisation-wide dashboard metrics"),

  // ── My Work ───────────────────────────────────────────────────────────────
  p("mywork.timesheet.own", "My Work", "Create and manage own timesheet entries"),
  p("mywork.calendar.own", "My Work", "View own calendar and attend meetings"),
  p("mywork.notification.own", "My Work", "Receive and manage own notifications"),
  p("mywork.settings.own", "My Work", "Manage own Digital Me profile and preferences"),

  // ── Timesheet ─────────────────────────────────────────────────────────────
  p("timesheet.entry.read.own", "Timesheet", "Read own time entries"),
  p("timesheet.entry.read.team", "Timesheet", "Read time entries of team members"),
  p("timesheet.entry.read.all", "Timesheet", "Read all time entries across the organisation", { isDangerous: true }),
  p("timesheet.entry.manage.other", "Timesheet", "Create or edit time entries on behalf of others", { isDangerous: true }),
  p("timesheet.entry.approve", "Timesheet", "Approve or reject submitted time entries", { supportsScope: true }),
  p("timesheet.settings.manage", "Timesheet", "Manage timesheet categories and approval rules"),

  // ── Projects ──────────────────────────────────────────────────────────────
  p("project.record.view", "Projects", "View project records"),
  p("project.record.create", "Projects", "Create projects"),
  p("project.record.manage", "Projects", "Edit project records, dates, health and status", { supportsScope: true }),
  p("project.record.delete", "Projects", "Archive or delete projects", { isDangerous: true }),
  p("project.team.manage", "Projects", "Assign and remove project team members", { supportsScope: true }),
  p("project.team.enroll.self", "Projects", "Self-enroll into projects that allow it"),
  p("project.environment.manage", "Projects", "Manage project environments"),
  p("project.credential.view", "Projects", "View project credentials", { isDangerous: true }),
  p("project.credential.manage", "Projects", "Create and update project credentials", { isDangerous: true }),
  p("project.document.view", "Projects", "View project documents"),
  p("project.document.manage", "Projects", "Create and edit project documents", { supportsScope: true }),

  // ── Tasks ─────────────────────────────────────────────────────────────────
  p("task.view", "Tasks", "View kanban tasks and subtasks"),
  p("task.create", "Tasks", "Create tasks and subtasks", { supportsScope: true }),
  p("task.manage", "Tasks", "Edit, move and assign tasks", { supportsScope: true }),
  p("task.delete", "Tasks", "Delete tasks and subtasks", { isDangerous: true }),
  p("task.comment", "Tasks", "Comment on tasks"),

  // ── DevOps · Infrastructure ───────────────────────────────────────────────
  p("devops.infrastructure.view", "DevOps · Infrastructure", "View infrastructure nodes"),
  p("devops.infrastructure.manage", "DevOps · Infrastructure", "Create and edit infrastructure nodes", { supportsScope: true }),
  p("devops.infrastructure.delete", "DevOps · Infrastructure", "Delete infrastructure nodes", { isDangerous: true }),
  p("devops.service.view", "DevOps · Infrastructure", "View services and applications"),
  p("devops.service.manage", "DevOps · Infrastructure", "Manage services and applications", { supportsScope: true }),

  // ── DevOps · Delivery ─────────────────────────────────────────────────────
  p("devops.deployment.view", "DevOps · Delivery", "View deployment records"),
  p("devops.deployment.create", "DevOps · Delivery", "Record a deployment", { supportsScope: true }),
  p("devops.deployment.update", "DevOps · Delivery", "Update deployment status", { supportsScope: true }),
  p("devops.deployment.approve", "DevOps · Delivery", "Approve production deployments", { supportsScope: true }),
  p("devops.deployment.delete", "DevOps · Delivery", "Delete deployment records", { isDangerous: true }),
  p("devops.change.view", "DevOps · Delivery", "View change requests"),
  p("devops.change.manage", "DevOps · Delivery", "Create and edit change requests", { supportsScope: true }),
  p("devops.change.approve", "DevOps · Delivery", "Approve change requests", { supportsScope: true }),

  // ── DevOps · Reliability ──────────────────────────────────────────────────
  p("devops.incident.view", "DevOps · Reliability", "View incidents"),
  p("devops.incident.create", "DevOps · Reliability", "Report incidents"),
  p("devops.incident.manage", "DevOps · Reliability", "Update, assign and resolve incidents", { supportsScope: true }),
  p("devops.incident.delete", "DevOps · Reliability", "Delete incident records", { isDangerous: true }),
  p("devops.backup.view", "DevOps · Reliability", "View backup jobs and DR plans"),
  p("devops.backup.manage", "DevOps · Reliability", "Manage backup jobs and DR plans", { supportsScope: true }),
  p("devops.security.view", "DevOps · Reliability", "View security findings"),
  p("devops.security.manage", "DevOps · Reliability", "Manage security findings", { supportsScope: true }),

  // ── DevOps · Network ──────────────────────────────────────────────────────
  p("devops.ssl.view", "DevOps · Network", "View SSL certificates"),
  p("devops.ssl.manage", "DevOps · Network", "Issue, renew and delete SSL certificates", { supportsScope: true }),
  p("devops.domain.view", "DevOps · Network", "View domains"),
  p("devops.domain.manage", "DevOps · Network", "Manage domains and DNS", { supportsScope: true }),

  // ── DevOps · Monitoring ───────────────────────────────────────────────────
  p("devops.grafana.view", "DevOps · Monitoring", "View Grafana dashboards"),
  p("devops.grafana.manage", "DevOps · Monitoring", "Configure Grafana integration"),

  // ── Helpdesk ──────────────────────────────────────────────────────────────
  p("helpdesk.ticket.create", "Helpdesk", "Submit a support ticket"),
  p("helpdesk.ticket.read.own", "Helpdesk", "View own support tickets"),
  p("helpdesk.ticket.read.all", "Helpdesk", "View all support tickets", { isDangerous: true }),
  p("helpdesk.ticket.manage", "Helpdesk", "Assign, update and resolve tickets", { supportsScope: true }),
  p("helpdesk.ticket.delete", "Helpdesk", "Delete support tickets", { isDangerous: true }),
  p("helpdesk.category.manage", "Helpdesk", "Manage helpdesk categories"),
  p("helpdesk.report.view", "Helpdesk", "View helpdesk analytics and reports"),

  // ── Procurement ───────────────────────────────────────────────────────────
  p("procurement.requisition.view", "Procurement", "View requisitions", { supportsScope: true }),
  p("procurement.requisition.create", "Procurement", "Create requisitions"),
  p("procurement.requisition.manage", "Procurement", "Edit and submit requisitions", { supportsScope: true }),
  p("procurement.requisition.approve", "Procurement", "Approve requisitions", { supportsScope: true }),
  p("procurement.requisition.delete", "Procurement", "Delete requisitions", { isDangerous: true }),
  p("procurement.rfq.view", "Procurement", "View RFQs and quotations"),
  p("procurement.rfq.manage", "Procurement", "Create and issue RFQs, record quotations"),
  p("procurement.vendor.view", "Procurement", "View vendors"),
  p("procurement.vendor.manage", "Procurement", "Create and edit vendors"),
  p("procurement.po.view", "Procurement", "View purchase orders"),
  p("procurement.po.manage", "Procurement", "Create and edit purchase orders"),
  p("procurement.po.approve", "Procurement", "Approve purchase orders", { supportsScope: true }),
  p("procurement.payment.view", "Procurement", "View payments"),
  p("procurement.payment.manage", "Procurement", "Record payments"),
  p("procurement.payment.approve", "Procurement", "Approve payments", { supportsScope: true }),
  p("procurement.grn.view", "Procurement", "View goods receipts"),
  p("procurement.grn.manage", "Procurement", "Record goods receipts"),
  p("procurement.settings.manage", "Procurement", "Manage approval policies, numbering and reference data"),

  // ── Budget ────────────────────────────────────────────────────────────────
  p("budget.view", "Budget", "View budget items and utilisation"),
  p("budget.manage", "Budget", "Create and edit budget items", { supportsScope: true }),
  p("budget.approve", "Budget", "Approve budget changes", { supportsScope: true }),

  // ── Assets ────────────────────────────────────────────────────────────────
  p("asset.view", "Assets", "View the asset register"),
  p("asset.view.own", "Assets", "View assets assigned to you"),
  p("asset.manage", "Assets", "Create, assign and transfer assets", { supportsScope: true }),
  p("asset.delete", "Assets", "Retire or delete assets", { isDangerous: true }),

  // ── HR ────────────────────────────────────────────────────────────────────
  p("hr.user.view", "HR", "View employee records"),
  p("hr.user.create", "HR", "Create employee accounts"),
  p("hr.user.manage", "HR", "Edit employee records, status and reporting line"),
  p("hr.user.delete", "HR", "Delete employee accounts", { isDangerous: true }),
  p("hr.user.impersonate", "HR", "Sign in as another user for support", { isDangerous: true }),
  p("hr.org.view", "HR", "View the organisation chart"),
  p("hr.org.manage", "HR", "Edit departments and reporting structure"),
  p("hr.team.view", "HR", "View team composition"),
  p("hr.team.manage", "HR", "Create teams and assign leads"),

  // ── Approvals ─────────────────────────────────────────────────────────────
  p("approval.request.view.own", "Approvals", "See the approval requests waiting on you"),
  p("approval.request.decide", "Approvals", "Approve or reject a request in your queue", { supportsScope: true }),
  p("approval.request.read.all", "Approvals", "View every approval request for audit", { isDangerous: true }),

  // ── Administration ────────────────────────────────────────────────────────
  p("admin.role.view", "Administration", "View roles and permissions"),
  p("admin.role.manage", "Administration", "Create roles and change permission grants", { isDangerous: true }),
  p("admin.permission.grant", "Administration", "Grant or deny permissions directly to a user", { isDangerous: true }),
  p("admin.superadmin.transfer", "Administration", "Transfer the super administrator role", { isDangerous: true }),
  p("admin.settings.manage", "Administration", "Manage system-wide settings"),
  p("admin.integration.manage", "Administration", "Manage Microsoft and other integrations"),
  p("admin.activity.view", "Administration", "View the full activity audit log"),
];

/** Fast lookup by permission name. */
export const PERMISSION_BY_NAME: Record<string, PermissionDefinition> =
  Object.fromEntries(PERMISSION_CATALOG.map((perm) => [perm.name, perm]));

export const ALL_PERMISSION_NAMES = PERMISSION_CATALOG.map((p) => p.name);

// ── Role presets ────────────────────────────────────────────────────────────

export interface RolePreset {
  name: string;
  description: string;
  level: number;
  color: string;
  isSystem?: boolean;
  isAssignable?: boolean;
  /** Exact permission names. Use `ALL_PERMISSION_NAMES` via the "*" wildcard. */
  permissions: string[] | "*";
  /** Permissions granted at a narrower scope than "all". */
  scoped?: Record<string, PermissionScope>;
}

const DEVOPS_VIEW = PERMISSION_CATALOG.filter(
  (perm) => perm.name.startsWith("devops.") && perm.name.endsWith(".view")
).map((perm) => perm.name);

const DEVOPS_OPERATE = PERMISSION_CATALOG.filter(
  (perm) =>
    perm.name.startsWith("devops.") &&
    /\.(view|create|update|manage)$/.test(perm.name)
).map((perm) => perm.name);

export const ROLE_PRESETS: RolePreset[] = [
  {
    name: "super-admin",
    description: "Unrestricted access. Exactly one holder at any time.",
    level: 100,
    color: "#dc2626",
    isSystem: true,
    isAssignable: false,
    permissions: "*",
  },
  {
    name: "hr-manager",
    description: "Owns the employee directory, reporting structure and teams.",
    level: 70,
    color: "#7c3aed",
    permissions: [
      "dashboard.view",
      "dashboard.view.org",
      "mywork.timesheet.own",
      "mywork.calendar.own",
      "mywork.notification.own",
      "mywork.settings.own",
      "timesheet.entry.read.own",
      "timesheet.entry.read.all",
      // HR managers have direct reports, and a direct-report timesheet route
      // lands on them first. Without these two grants the entry resolved to
      // them and their own queue answered 403 — the work was unreachable.
      "approval.request.view.own",
      "approval.request.decide",
      "hr.user.view",
      "hr.user.create",
      "hr.user.manage",
      "hr.user.delete",
      "hr.org.view",
      "hr.org.manage",
      "hr.team.view",
      "hr.team.manage",
      "project.record.view",
      "project.team.manage",
      "helpdesk.ticket.create",
      "helpdesk.ticket.read.own",
      "admin.role.view",
    ],
    scoped: {
      "project.team.manage": "all",
    },
  },
  {
    name: "department-head",
    description: "Runs one department: sees its people, approves their time, owns its records.",
    level: 65,
    color: "#0d9488",
    permissions: [
      "dashboard.view",
      "dashboard.view.org",
      "mywork.timesheet.own",
      "mywork.calendar.own",
      "mywork.notification.own",
      "mywork.settings.own",
      "timesheet.entry.read.own",
      "timesheet.entry.read.team",
      "timesheet.entry.approve",
      "approval.request.view.own",
      "approval.request.decide",
      // Read-only on the org: a head should see the tree and their teams but
      // must not restructure the company — that stays with `hr.org.manage`.
      "hr.org.view",
      "hr.team.view",
      "project.record.view",
      "task.view",
      "task.comment",
      "procurement.requisition.view",
      "procurement.requisition.approve",
      "helpdesk.ticket.create",
      "helpdesk.ticket.read.own",
      "asset.view",
    ],
    scoped: {
      "timesheet.entry.approve": "team",
      "procurement.requisition.approve": "department",
    },
  },
  {
    name: "project-manager-officer",
    description: "Owns project intake, records, teams and delivery tracking.",
    level: 60,
    color: "#0ea5e9",
    permissions: [
      "dashboard.view",
      "dashboard.view.org",
      "mywork.timesheet.own",
      "mywork.calendar.own",
      "mywork.notification.own",
      "mywork.settings.own",
      "timesheet.entry.read.own",
      "timesheet.entry.read.team",
      "timesheet.entry.approve",
      "approval.request.view.own",
      "approval.request.decide",
      "project.record.view",
      "project.record.create",
      "project.record.manage",
      "project.record.delete",
      "project.team.manage",
      "project.environment.manage",
      "project.document.view",
      "project.document.manage",
      "project.credential.view",
      "task.view",
      "task.create",
      "task.manage",
      "task.delete",
      "task.comment",
      "budget.view",
      "procurement.requisition.view",
      "procurement.requisition.create",
      "procurement.requisition.manage",
      "helpdesk.ticket.create",
      "helpdesk.ticket.read.own",
      "asset.view",
    ],
    scoped: {
      "timesheet.entry.approve": "team",
      "project.record.manage": "all",
      "task.manage": "all",
    },
  },
  {
    name: "devops-team-lead",
    description: "Leads a DevOps team; approves deliveries and changes for that team.",
    level: 55,
    color: "#f59e0b",
    permissions: [
      "dashboard.view",
      "dashboard.view.org",
      "mywork.timesheet.own",
      "mywork.calendar.own",
      "mywork.notification.own",
      "mywork.settings.own",
      "timesheet.entry.read.own",
      "timesheet.entry.read.team",
      "timesheet.entry.approve",
      "approval.request.view.own",
      "approval.request.decide",
      "project.record.view",
      "project.team.manage",
      "project.environment.manage",
      "project.credential.view",
      "project.credential.manage",
      "project.document.view",
      "project.document.manage",
      "task.view",
      "task.create",
      "task.manage",
      "task.comment",
      ...DEVOPS_OPERATE,
      "devops.deployment.approve",
      "devops.deployment.delete",
      "devops.change.approve",
      "devops.incident.delete",
      "devops.infrastructure.delete",
      "devops.security.manage",
      "helpdesk.ticket.create",
      "helpdesk.ticket.read.own",
      "helpdesk.ticket.read.all",
      "helpdesk.ticket.manage",
      "helpdesk.report.view",
      "asset.view",
    ],
    scoped: {
      "timesheet.entry.approve": "team",
      "project.record.view": "all",
    },
  },
  {
    name: "devops-assistant-team-lead",
    description: "Deputy DevOps lead; approves when the team lead is unavailable.",
    level: 50,
    color: "#eab308",
    permissions: [
      "dashboard.view",
      "mywork.timesheet.own",
      "mywork.calendar.own",
      "mywork.notification.own",
      "mywork.settings.own",
      "timesheet.entry.read.own",
      "timesheet.entry.read.team",
      "timesheet.entry.approve",
      "approval.request.view.own",
      "approval.request.decide",
      "project.record.view",
      "project.document.view",
      "task.view",
      "task.create",
      "task.manage",
      "task.comment",
      ...DEVOPS_OPERATE,
      "devops.deployment.approve",
      "devops.change.approve",
      "helpdesk.ticket.create",
      "helpdesk.ticket.read.own",
      "helpdesk.ticket.manage",
      "asset.view",
    ],
    scoped: {
      "timesheet.entry.approve": "team",
      "project.record.view": "all",
    },
  },
  {
    name: "devops-engineer",
    description: "Operates infrastructure and deployments within their team.",
    level: 40,
    color: "#22c55e",
    permissions: [
      "dashboard.view",
      "mywork.timesheet.own",
      "mywork.calendar.own",
      "mywork.notification.own",
      "mywork.settings.own",
      "timesheet.entry.read.own",
      "project.record.view",
      "project.document.view",
      "task.view",
      "task.create",
      "task.manage",
      "task.comment",
      ...DEVOPS_OPERATE,
      "helpdesk.ticket.create",
      "helpdesk.ticket.read.own",
      "helpdesk.ticket.manage",
      "asset.view",
    ],
    scoped: {
      "devops.infrastructure.view": "team",
      "devops.deployment.view": "team",
      "devops.incident.view": "team",
    },
  },
  {
    name: "finance",
    description: "Owns budget, procurement approvals and payment processing.",
    level: 45,
    color: "#06b6d4",
    permissions: [
      "dashboard.view",
      "dashboard.view.org",
      "mywork.timesheet.own",
      "mywork.calendar.own",
      "mywork.notification.own",
      "mywork.settings.own",
      "timesheet.entry.read.own",
      "budget.view",
      "budget.manage",
      "budget.approve",
      "procurement.requisition.view",
      "procurement.requisition.approve",
      "procurement.rfq.view",
      "procurement.rfq.manage",
      "procurement.vendor.view",
      "procurement.vendor.manage",
      "procurement.po.view",
      "procurement.po.manage",
      "procurement.po.approve",
      "procurement.payment.view",
      "procurement.payment.manage",
      "procurement.payment.approve",
      "approval.request.view.own",
      "approval.request.decide",
      "procurement.grn.view",
      "procurement.grn.manage",
      "procurement.settings.manage",
      "asset.view",
      "asset.manage",
      "project.record.view",
      "helpdesk.ticket.create",
      "helpdesk.ticket.read.own",
    ],
    scoped: {
      "procurement.requisition.approve": "all",
      "procurement.po.approve": "all",
      "procurement.payment.approve": "all",
    },
  },
  {
    name: "employee",
    description: "Baseline access for every staff member.",
    level: 10,
    color: "#64748b",
    permissions: [
      "dashboard.view",
      "mywork.timesheet.own",
      "mywork.calendar.own",
      "mywork.notification.own",
      "mywork.settings.own",
      "timesheet.entry.read.own",
      "approval.request.view.own",
      "project.record.view",
      "project.team.enroll.self",
      "task.view",
      "task.comment",
      "helpdesk.ticket.create",
      "helpdesk.ticket.read.own",
      "asset.view.own",
    ],
  },
];

export const ROLE_PRESET_BY_NAME: Record<string, RolePreset> = Object.fromEntries(
  ROLE_PRESETS.map((role) => [role.name, role])
);

/**
 * Expand a preset into concrete grants. Duplicates are collapsed so a preset
 * may list a permission both through a helper set and explicitly without
 * tripping the (permission, role) primary key.
 */
export function resolvePresetPermissions(
  preset: RolePreset
): { name: string; scope: PermissionScope }[] {
  const names = preset.permissions === "*" ? ALL_PERMISSION_NAMES : preset.permissions;
  const byName = new Map<string, PermissionScope>();
  for (const name of names) {
    const scope = preset.scoped?.[name] ?? byName.get(name) ?? "all";
    byName.set(name, scope);
  }
  return [...byName].map(([name, scope]) => ({ name, scope }));
}
