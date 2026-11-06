import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  FolderKanban,
  Globe,
  Headphones,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Network,
  Package,
  Rocket,
  Server,
  Shield,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Timer,
  Truck,
  Users,
} from 'lucide-react';

import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CalendarPage } from '@/features/my-work/calendar/CalendarPage';
import { TimesheetPage } from '@/features/my-work/timesheet/TimesheetPage';
import { TimesheetApprovalsPage } from '@/features/my-work/approvals/TimesheetApprovalsPage';
import { ApprovalsPage } from '@/features/my-work/approvals/ApprovalsPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ProjectDetailPage } from '@/features/projects/detail/ProjectDetailPage';
import { InfrastructurePage } from '@/features/devops/infrastructure/InfrastructurePage';
import { DeploymentsPage } from '@/features/devops/deployments/DeploymentsPage';
import { IncidentsPage } from '@/features/devops/incidents/IncidentsPage';
import { SslCertificatesPage } from '@/features/devops/ssl/SslCertificatesPage';
import { DomainsPage } from '@/features/devops/domains/DomainsPage';
import { GrafanaPage } from '@/features/devops/grafana/GrafanaPage';
import { HelpdeskPage } from '@/features/helpdesk/HelpdeskPage';
import { HelpdeskTicketDetailPage } from '@/features/helpdesk/HelpdeskTicketDetailPage';
import { HelpdeskManagePage } from '@/features/helpdesk/HelpdeskManagePage';
import { HelpdeskReportPage } from '@/features/helpdesk/HelpdeskReportPage';
import { BudgetPage } from '@/features/procurement/BudgetPage';
import { RequisitionsPage } from '@/features/procurement/RequisitionsPage';
import { RequisitionManagePage } from '@/features/procurement/RequisitionManagePage';
import { VendorManagementPage } from '@/features/procurement/VendorManagementPage';
import { PurchaseOrderListPage } from '@/features/procurement/PurchaseOrderListPage';
import { PurchaseOrderDetailPage } from '@/features/procurement/PurchaseOrderDetailPage';
import { DirectPurchaseListPage } from '@/features/procurement/DirectPurchaseListPage';
import { GoodsReceiptListPage } from '@/features/procurement/GoodsReceiptListPage';
import { AssetListPage } from '@/features/procurement/AssetListPage';
import { PaymentListPage } from '@/features/procurement/PaymentListPage';
import { RfqListPage } from '@/features/procurement/RfqListPage';
import { RfqDetailPage } from '@/features/procurement/RfqDetailPage';
import { InternalProjectListPage } from '@/features/procurement/InternalProjectListPage';
import { UsersPage } from '@/features/hr/UsersPage';
import { UserDetailPage } from '@/features/hr/UserDetailPage';
import { OrgChartPage } from '@/features/hr/OrgChartPage';
import { AccessControlPage } from '@/features/admin/AccessControlPage';
import { ActivityLogPage } from '@/features/admin/ActivityLogPage';
import { AdminSettingsPage } from '@/features/admin/settings/AdminSettingsPage';
import { SettingsPage } from '@/features/account/digital-me/SettingsPage';
// The Notifications page is parked (see the commented entry in APP_ROUTES).
// Re-import it here — `NotificationsPage`, plus `Bell` from lucide — when that
// block is switched back on.
import { ForbiddenPage } from '@/features/system/ForbiddenPage';
import { ComponentShowcasePage } from '@/features/system/ComponentShowcasePage';

/**
 * The route table.
 *
 * One entry per page, carrying both the element and the navigation metadata
 * that used to live twice — once in `App.tsx` as `<Route>`s and once in
 * `Sidebar.tsx` as a hard-coded array. Keeping them together is what stops a
 * nav item existing for a page the guard would bounce, or a page existing that
 * nobody can reach: the sidebar is *derived* from this list, so the two cannot
 * disagree.
 *
 * `meta.nav` is absent for pages that are real routes but not destinations —
 * detail pages reached from a list, legacy redirects, the auth screens.
 */

export type NavGroup = 'main' | 'mywork' | 'projects' | 'devops' | 'procurement' | 'hr' | 'admin';

/** Groups render in this order; each one's label is the sidebar heading. */
export const NAV_GROUPS: { key: NavGroup; label: string }[] = [
  { key: 'main', label: 'Main' },
  { key: 'mywork', label: 'My Work' },
  { key: 'projects', label: 'Projects' },
  { key: 'devops', label: 'DevOps Operations' },
  { key: 'procurement', label: 'Finance & Procurement' },
  { key: 'hr', label: 'People' },
  { key: 'admin', label: 'Administration' },
];

export interface NavMeta {
  group: NavGroup;
  label: string;
  icon: LucideIcon;
  /** Rendered before the label as a count badge, where a page has one. */
  order?: number;
}

export interface RouteMeta {
  title: string;
  /** Capability required. Omitted only for pages every signed-in user gets. */
  permission?: string;
  /** Any-of alternative to `permission`. */
  anyOf?: string[];
  /** The platform owner's own views — not expressible as a permission. */
  superAdminOnly?: boolean;
  /** Absent when the page is not a sidebar destination. */
  nav?: NavMeta;
}

export interface AppRoute {
  path: string;
  element: ReactElement;
  meta: RouteMeta;
}

export const APP_ROUTES: AppRoute[] = [
  // ── Main ────────────────────────────────────────────────────────────────
  {
    path: '',
    element: <DashboardPage />,
    meta: {
      title: 'Dashboard',
      nav: { group: 'main', label: 'Dashboard', icon: LayoutDashboard },
    },
  },

  // ── My Work — every user, no capability required ────────────────────────
  {
    path: 'my-work/calendar',
    element: <CalendarPage />,
    meta: {
      title: 'Calendar',
      nav: { group: 'mywork', label: 'Calendar', icon: CalendarDays },
    },
  },
  {
    path: 'my-work/timesheet',
    element: <TimesheetPage />,
    meta: { title: 'Timesheet', nav: { group: 'mywork', label: 'Timesheet', icon: Timer } },
  },
  {
    path: 'approvals',
    element: <ApprovalsPage />,
    meta: {
      // The queue is personal; the audit view inside the page is a separate
      // grant that the API enforces, so the route itself only needs this one.
      title: 'Approvals',
      permission: 'approval.request.view.own',
      nav: { group: 'mywork', label: 'Approvals', icon: Inbox },
    },
  },
  {
    path: 'my-work/approvals',
    element: <TimesheetApprovalsPage />,
    meta: {
      title: 'Timesheet Approvals',
      permission: 'timesheet.entry.approve',
      nav: { group: 'mywork', label: 'Timesheet Approvals', icon: ClipboardCheck },
    },
  },
  {
    // Every user may raise a ticket — it is the one support channel that does
    // not depend on a role.
    path: 'helpdesk',
    element: <HelpdeskPage />,
    meta: { title: 'Ticket', nav: { group: 'mywork', label: 'Ticket', icon: Headphones } },
  },
  // HIDE THIS FIRST
  // {
  //   // Personal, like the calendar: your own notification list, no capability.
  //   path: 'notifications',
  //   element: <NotificationsPage />,
  //   meta: {
  //     title: 'Notifications',
  //     nav: { group: 'mywork', label: 'Notifications', icon: Bell },
  //   },
  // },
  {
    // Digital Me is reached from the avatar menu in the top bar, not the
    // sidebar, so it carries no `nav` — it is a destination that just is not
    // a sidebar entry. No permission either: it is every signed-in user's own
    // profile, and each section inside it gates itself (the Nginx tab on
    // `admin.integration.manage`).
    path: 'settings',
    element: <SettingsPage />,
    meta: { title: 'Digital Me' },
  },
  {
    path: 'helpdesk/:id',
    element: <HelpdeskTicketDetailPage />,
    meta: { title: 'Ticket' },
  },
  {
    // Kept for links already written into notifications and the old sidebar.
    path: 'helpdesk/manage',
    element: <HelpdeskManagePage />,
    meta: { title: 'Helpdesk Queue', permission: 'helpdesk.ticket.manage' },
  },
  {
    path: 'helpdesk/reports',
    element: <HelpdeskReportPage />,
    meta: { title: 'Helpdesk Reports', permission: 'helpdesk.report.view' },
  },

  // ── Projects ────────────────────────────────────────────────────────────
  {
    path: 'projects',
    element: <ProjectsPage />,
    meta: {
      title: 'Projects',
      permission: 'project.record.view',
      nav: { group: 'projects', label: 'Projects', icon: FolderKanban },
    },
  },
  {
    path: 'projects/:id',
    element: <ProjectDetailPage />,
    meta: { title: 'Project', permission: 'project.record.view' },
  },
  {
    path: 'internal-projects',
    element: <InternalProjectListPage />,
    meta: {
      title: 'Internal Projects',
      permission: 'project.record.view',
      nav: { group: 'projects', label: 'Internal Projects', icon: FolderKanban },
    },
  },

  // ── DevOps Operations — one group, nine destinations ────────────────────
  {
    path: 'devops/infrastructure',
    element: <InfrastructurePage />,
    meta: {
      title: 'Infrastructure',
      permission: 'devops.infrastructure.view',
      nav: { group: 'devops', label: 'Infrastructure', icon: Server },
    },
  },
  {
    path: 'devops/deployments',
    element: <DeploymentsPage />,
    meta: {
      title: 'Deployments',
      permission: 'devops.deployment.view',
      nav: { group: 'devops', label: 'Deployments', icon: Rocket },
    },
  },
  {
    path: 'devops/incidents',
    element: <IncidentsPage />,
    meta: {
      title: 'Incidents',
      permission: 'devops.incident.view',
      nav: { group: 'devops', label: 'Incidents', icon: AlertTriangle },
    },
  },
  {
    path: 'devops/ssl',
    element: <SslCertificatesPage />,
    meta: {
      title: 'SSL Certificates',
      permission: 'devops.ssl.view',
      nav: { group: 'devops', label: 'SSL Certificates', icon: Shield },
    },
  },
  {
    path: 'devops/domains',
    element: <DomainsPage />,
    meta: {
      title: 'Domains',
      permission: 'devops.domain.view',
      nav: { group: 'devops', label: 'Domains', icon: Globe },
    },
  },
  {
    path: 'devops/assets',
    element: <AssetListPage />,
    meta: {
      title: 'Assets',
      permission: 'asset.view',
      nav: { group: 'devops', label: 'Assets', icon: ClipboardList },
    },
  },
  {
    path: 'devops/helpdesk',
    element: <HelpdeskManagePage />,
    meta: {
      title: 'Helpdesk Queue',
      permission: 'helpdesk.ticket.manage',
      nav: { group: 'devops', label: 'Helpdesk Queue', icon: Headphones },
    },
  },
  {
    path: 'devops/helpdesk/reports',
    element: <HelpdeskReportPage />,
    meta: {
      title: 'Helpdesk Reports',
      permission: 'helpdesk.report.view',
      nav: { group: 'devops', label: 'Helpdesk Reports', icon: BarChart3 },
    },
  },
  {
    path: 'devops/grafana',
    element: <GrafanaPage />,
    meta: {
      title: 'Grafana',
      permission: 'devops.grafana.view',
      nav: { group: 'devops', label: 'Grafana', icon: BarChart3 },
    },
  },

  // ── Procurement ─────────────────────────────────────────────────────────
  {
    path: 'procurement/budget',
    element: <BudgetPage />,
    meta: {
      title: 'Budget Control',
      permission: 'budget.view',
      nav: { group: 'procurement', label: 'Budget Control', icon: DollarSign },
    },
  },
  {
    path: 'procurement/requisitions',
    element: <RequisitionsPage />,
    meta: {
      title: 'Requisitions',
      permission: 'procurement.requisition.view',
      nav: { group: 'procurement', label: 'Requisitions', icon: FileText },
    },
  },
  {
    path: 'procurement/requisitions/manage',
    element: <RequisitionManagePage />,
    meta: { title: 'Requisition Approvals', permission: 'procurement.requisition.approve' },
  },
  {
    path: 'procurement/rfq',
    element: <RfqListPage />,
    meta: {
      title: 'RFQ / Tendering',
      permission: 'procurement.rfq.view',
      nav: { group: 'procurement', label: 'RFQ / Tendering', icon: MessageSquare },
    },
  },
  {
    path: 'procurement/rfq/:id',
    element: <RfqDetailPage />,
    meta: { title: 'RFQ', permission: 'procurement.rfq.view' },
  },
  {
    path: 'procurement/vendors',
    element: <VendorManagementPage />,
    meta: {
      title: 'Vendors',
      permission: 'procurement.vendor.view',
      nav: { group: 'procurement', label: 'Vendors', icon: Building2 },
    },
  },
  {
    path: 'procurement/purchase-orders',
    element: <PurchaseOrderListPage />,
    meta: {
      title: 'Purchase Orders',
      permission: 'procurement.po.view',
      nav: { group: 'procurement', label: 'Purchase Orders', icon: ShoppingCart },
    },
  },
  {
    path: 'procurement/purchase-orders/:id',
    element: <PurchaseOrderDetailPage />,
    meta: { title: 'Purchase Order', permission: 'procurement.po.view' },
  },
  {
    path: 'procurement/direct-purchases',
    element: <DirectPurchaseListPage />,
    meta: {
      title: 'Direct Purchases',
      permission: 'procurement.po.view',
      nav: { group: 'procurement', label: 'Direct Purchases', icon: Package },
    },
  },
  {
    path: 'procurement/goods-receipts',
    element: <GoodsReceiptListPage />,
    meta: {
      title: 'Goods Receipts',
      permission: 'procurement.grn.view',
      nav: { group: 'procurement', label: 'Goods Receipts', icon: Truck },
    },
  },
  {
    path: 'procurement/payments',
    element: <PaymentListPage />,
    meta: {
      title: 'Payments',
      permission: 'procurement.payment.view',
      nav: { group: 'procurement', label: 'Payments', icon: CreditCard },
    },
  },

  // ── People (HR) ─────────────────────────────────────────────────────────
  {
    path: 'hr/users',
    element: <UsersPage />,
    meta: {
      title: 'Employees',
      permission: 'hr.user.view',
      nav: { group: 'hr', label: 'Employees', icon: Users },
    },
  },
  {
    path: 'hr/users/:id',
    element: <UserDetailPage />,
    meta: { title: 'Employee record', permission: 'hr.user.view' },
  },
  {
    path: 'hr/org-chart',
    element: <OrgChartPage />,
    meta: {
      title: 'Org Chart',
      permission: 'hr.org.view',
      nav: { group: 'hr', label: 'Org Chart', icon: Network },
    },
  },

  // ── Administration ──────────────────────────────────────────────────────
  {
    path: 'admin/access',
    element: <AccessControlPage />,
    meta: {
      title: 'Access Control',
      permission: 'admin.role.view',
      nav: { group: 'admin', label: 'Access Control', icon: ShieldCheck },
    },
  },
  {
    path: 'admin/settings',
    element: <AdminSettingsPage />,
    meta: {
      title: 'Settings',
      // One page, four grants. The tab list is filtered by `can()` inside the
      // page, and Reference Data further filters its group picker: an
      // `admin.settings.manage` holder sees the key/value lists, an HR manager
      // sees Positions, a helpdesk manager sees Helpdesk categories. Admitting
      // them all here is what lets each reach their own list — without it,
      // folding those two screens into Reference Data would have taken them
      // away from the roles that own them.
      anyOf: [
        'timesheet.settings.manage',
        'procurement.settings.manage',
        'admin.settings.manage',
        'hr.org.manage',
        'helpdesk.ticket.manage',
      ],
      nav: { group: 'admin', label: 'Settings', icon: SlidersHorizontal },
    },
  },
  {
    path: 'activity-log',
    element: <ActivityLogPage />,
    meta: {
      title: 'Activity Log',
      // `admin.activity.view` rather than a super-admin-only gate, so an
      // auditor role created in /admin/access can be given the log without
      // handing over the whole platform. The API enforces the same permission.
      permission: 'admin.activity.view',
      nav: { group: 'admin', label: 'Activity Log', icon: Activity },
    },
  },

  // ── Support & utility ───────────────────────────────────────────────────
  { path: 'forbidden', element: <ForbiddenPage />, meta: { title: 'Forbidden' } },
  // Design-system sandbox. Not a product surface: it renders every primitive
  // with fake data, so it stays behind the platform owner.
  {
    path: 'components',
    element: <ComponentShowcasePage />,
    meta: { title: 'Components', superAdminOnly: true },
  },
];

/**
 * Where the old paths lead.
 *
 * Every one of these was reachable before the restructure, so they redirect
 * rather than 404 — a bookmark or an email link should still land on the page
 * it named. `sidebar` marks the ones that changed address in this phase.
 */
export const LEGACY_REDIRECTS: { from: string; to: string }[] = [
  { from: 'infrastructure', to: '/devops/infrastructure' },
  { from: 'deployments', to: '/devops/deployments' },
  { from: 'incidents', to: '/devops/incidents' },
  { from: 'ssl', to: '/devops/ssl' },
  { from: 'domains', to: '/devops/domains' },
  { from: 'assets', to: '/devops/assets' },
  { from: 'grafana', to: '/devops/grafana' },
  { from: 'budget', to: '/procurement/budget' },
  { from: 'requisitions', to: '/procurement/requisitions' },
  { from: 'requisitions/manage', to: '/procurement/requisitions/manage' },
  { from: 'rfq', to: '/procurement/rfq' },
  { from: 'vendors', to: '/procurement/vendors' },
  { from: 'purchase-orders', to: '/procurement/purchase-orders' },
  { from: 'direct-purchases', to: '/procurement/direct-purchases' },
  { from: 'goods-receipts', to: '/procurement/goods-receipts' },
  { from: 'payments', to: '/procurement/payments' },
  { from: 'profile', to: '/settings' },
  { from: 'admin/users', to: '/hr/users' },
  // Teams are no longer a page: membership and leadership are edited on the
  // employee record, so the old address lands on the directory.
  { from: 'hr/teams', to: '/hr/users' },
  // Timesheet categories are a group in Reference Data now, so the old
  // timesheet-settings addresses land on the tab that holds them.
  { from: 'settings/timesheet', to: '/admin/settings?tab=reference-data' },
  { from: 'settings/procurement', to: '/admin/settings?tab=approval-policies' },
  { from: 'admin/settings/timesheet', to: '/admin/settings?tab=reference-data' },
  { from: 'admin/settings/procurement', to: '/admin/settings?tab=approval-policies' },
];

/** Auth screens live outside the app shell. */
export const AUTH_ROUTES: AppRoute[] = [
  { path: '/login', element: <LoginPage />, meta: { title: 'Sign in' } },
  { path: '/register', element: <RegisterPage />, meta: { title: 'Create account' } },
];

/**
 * The sidebar, derived from `APP_ROUTES`.
 *
 * Filtering happens at render time against resolved access, not here — this
 * just groups and orders what the route table declared.
 */
/** A route that is a sidebar destination — narrowed so `meta.nav` is present. */
export interface NavRoute {
  path: string;
  element: ReactElement;
  meta: RouteMeta & { nav: NavMeta };
}

export function navGroupsFromRoutes(): {
  key: NavGroup;
  label: string;
  items: NavRoute[];
}[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: APP_ROUTES.filter((route) => route.meta.nav?.group === group.key) as NavRoute[],
  }));
}
