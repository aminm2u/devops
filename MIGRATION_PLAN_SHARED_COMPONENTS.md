# Migration Plan: Adopting Shared Components Across Existing Pages

## Document Info
- **File Name:** `MIGRATION_PLAN_SHARED_COMPONENTS.md`
- **Location:** Project root (`C:\Users\itmap\Desktop\m2u\devops\MIGRATION_PLAN_SHARED_COMPONENTS.md`)
- **Active Session Plan:** `C:\Users\itmap\.claude\plans\please-check-all-modal-atomic-wreath.md`
- **Status:** Stored & Ready for execution

---

## Executive Summary

Waves 1 and 2 delivered a complete library of 18 shared components:
- **Layout & Structure:** `PageHeader`, `DataTable`, `ListToolbar`, `Pagination`, `EmptyState`, `LoadingState`
- **Data Display:** `StatusBadge`, `StatCard`, `ProgressBar`, `InfoRow`, `DetailList`, `UserAvatar`
- **Forms & Inputs:** `FormField`, `FormGrid`, `FormDialog`, `ConfirmDialog`, `Button` (loading), `Checkbox`, `RadioGroup`, `Combobox`, `RichListBox`, `DateTimePicker`, `ColorPicker`, `SignaturePad`, `RichTextEditor`

Currently, ~25 pages and 6 dialogs across the application use disparate hand-rolled implementations (3 conflicting status color palettes, repetitive table markup, divergent search/filter rows, and inconsistent spacing). 

This plan presents an incremental, phased migration that modernizes existing pages without breaking functionality or adding TypeScript errors.

---

## Migration Principles & Guardrails

1. **Incremental Delivery:** Migrate in logical batches so changes are easily reviewed and verified.
2. **Zero Regressions:** Maintain current functionality (row actions, dialog triggers, permission checks, filters).
3. **Build Integrity:** Every phase must pass:
   - Filtered TypeScript check: zero new errors beyond the pre-existing 30-error baseline.
   - Production Vite build (`npx vite build`).
4. **Baseline File Isolation:** 11 files have pre-existing compiler noise (`ProfilePage`, `ProjectDetailPage`, `PurchaseOrderDetailPage`, `SettingsPage`, `HelpdeskReportPage`, `NotificationsPage`, `RegisterPage`, `AppLayout`, `AuthLayout`, `NotificationBell`, `date-picker`). Clean files are migrated first; baseline files are touched only in isolated, dedicated steps.

---

## Page-by-Page Component Adoption Matrix

| Page / Component | Target Components to Adopt | Complexity | Rationale & Code Savings |
|---|---|---|---|
| **PurchaseOrderListPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Low | Deletes ~80 lines: replaces card table, hand-rolled search/filter, and duplicate 8-status color map. |
| **RfqListPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Low | Replaces hand-rolled search/filter, table rows, and local 6-status color map. |
| **PaymentListPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Low | Adopts canonical payment status palette (preserves intentional amber approved state). |
| **AssetListPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Low | Replaces asset table and local status badge map; keeps category tag styling. |
| **GoodsReceiptListPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Low | Promotes existing EmptyState to DataTable; unifies 6 status badges. |
| **DirectPurchaseListPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Low | Standardizes table and replaces direct purchase status map. |
| **InternalProjectListPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge`, `ProgressBar` | Low | Adopts DataTable and replaces local progress bar with `ProgressBar`. |
| **VendorManagementPage.tsx** | `PageHeader`, `DataTable` | Low | Replaces vendor table; keeps custom star rating cell in `render`. |
| **ActivityLogPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Low | Replaces custom table and custom pagination buttons with `DataTable` pagination. |
| **DeploymentsPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge`, `UserAvatar` | Medium | Unifies deployment status badges, author avatars, and table pagination. |
| **IncidentsPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Medium | Preserves `onRowClick` navigation to incident details; severity & status badges. |
| **DomainsPage.tsx** | `PageHeader`, `DataTable`, `FormField` | Medium | Promotes existing dialog FormField into the page; unifies domain list table. |
| **SslCertificatesPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Medium | Standardizes certificate table; replaces custom expiry badges. |
| **RequisitionManagePage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Medium | Replaces outer filter Card with DataTable search+filters; approval dialogs intact. |
| **RequisitionsPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Medium | Uses DataTable `renderRowAfter` for expandable requisition line items; wires existing Pagination. |
| **UsersPage.tsx** | `PageHeader`, `DataTable`, `UserAvatar` | Medium | Replaces user table and uses `skeletonClassName="h-8 w-8 rounded-full"` for avatar column. |
| **HelpdeskPage.tsx** | `PageHeader`, `DataTable`, `StatusBadge` | Medium | Preserves role-based column visibility; unifies status and priority badges. |
| **HelpdeskManagePage.tsx** | `PageHeader`, `DataTable`, `StatCard` | Medium | Consolidates 4 filter dropdowns into DataTable toolbar; 6 stat cards to `StatCard`. |
| **DashboardPage.tsx** | `StatCard` | Low | Already uses `PageHeader`; replaces 4 hand-rolled KPI cards with `StatCard`. |
| **BudgetPage.tsx** | `PageHeader`, `StatCard`, `ProgressBar`, `DataTable` | Medium | Replaces 4 summary cards (`StatCard`), 2 utilization bars (`ProgressBar tone="auto"`), and items table. |
| **RfqDetailPage.tsx** | `PageHeader`, `StatusBadge`, `InfoRow`, `DetailList`, `DataTable` | Low-Med | Standardizes header, status badge, summary metadata list, and items/quotations tables. |
| **PurchaseOrderDetailPage.tsx** | `PageHeader`, `StatusBadge`, `InfoRow`, `DetailList`, `DataTable` | Medium (Baseline file) | Same as RFQ Detail; handled carefully to avoid disturbing baseline type noise. |
| **ProjectDetailPage.tsx** | `PageHeader`, `StatusBadge`, `ProgressBar` (in tabs) | Medium (Baseline file) | Finance tab budget progress, Team tab avatars, Kanban task progress. |
| **Dialogs (6 components)** | `FormDialog`, `FormField`, `FormGrid` | Low | `DeploymentDialog`, `IncidentDialog`, `InfrastructureNodeDialog`, `ServiceDialog`, `DocumentDialog`, `ProjectForm`. |

---

## Phased Execution Roadmap

### Phase 1: Procurement List Pages (Clean & High-Impact)
Migrate the 8 core procurement pages:
1. `PurchaseOrderListPage.tsx`
2. `RfqListPage.tsx`
3. `PaymentListPage.tsx`
4. `AssetListPage.tsx`
5. `GoodsReceiptListPage.tsx`
6. `DirectPurchaseListPage.tsx`
7. `InternalProjectListPage.tsx`
8. `VendorManagementPage.tsx`

**Scope of changes per page:**
- Replace hand-rolled `h1` container with `<PageHeader size="md" title="..." description="...">`
- Replace local `statusColor` record maps with `<StatusBadge domain="..." value={status} />`
- Replace `<Card><CardContent><Table>...` and search input with `<DataTable columns={...} data={...} search={{...}} filters={<Select.../>} />`
- Eliminate duplicate loading skeletons and empty state paragraphs (handled automatically by `DataTable`).

*Checkpoint 1:* Filtered tsc clean (0 new errors) + `npx vite build` pass.

---

### Phase 2: Operations & System Tables (Clean)
Migrate 6 operational tracking list pages:
1. `ActivityLogPage.tsx`
2. `DeploymentsPage.tsx`
3. `IncidentsPage.tsx` (with `onRowClick` navigation)
4. `DomainsPage.tsx`
5. `SslCertificatesPage.tsx`
6. `RequisitionManagePage.tsx`

**Scope of changes per page:**
- Adopt `PageHeader` and `DataTable`
- Wire server pagination via DataTable's `pagination={{ page, totalPages, onPageChange }}`
- Unify user avatar cells with `UserAvatar`
- Standardize status badges (e.g. `domain="helpdeskStatus"`, `domain="requisition"`)

*Checkpoint 2:* Filtered tsc clean (0 new errors) + `npx vite build` pass.

---

### Phase 3: Advanced User & Helpdesk Pages (Clean)
Migrate 4 higher-feature pages:
1. `UsersPage.tsx` (avatar skeleton, role badges)
2. `HelpdeskPage.tsx` (status and priority badges, role-conditional action buttons)
3. `HelpdeskManagePage.tsx` (multi-filter toolbar, 6 KPI cards to `StatCard`)
4. `RequisitionsPage.tsx` (expandable item rows via `renderRowAfter`)

*Checkpoint 3:* Filtered tsc clean (0 new errors) + `npx vite build` pass.

---

### Phase 4: Dashboard, Analytics & Detail Views
Migrate overview and detail views:
1. `DashboardPage.tsx` (4 KPI cards -> `StatCard`)
2. `BudgetPage.tsx` (4 KPI cards -> `StatCard`, utilization bars -> `ProgressBar tone="auto"`, budget table -> `DataTable`)
3. `RfqDetailPage.tsx` (`StatusBadge`, `InfoRow` + `DetailList`, RFQ Items & Quotations -> `DataTable`)
4. Baseline detail pages: `PurchaseOrderDetailPage.tsx`, `ProjectDetailPage.tsx` (Finance, Kanban, Team tabs)

*Checkpoint 4:* Filtered tsc clean (0 new errors) + `npx vite build` pass.

---

### Phase 5: Form Dialog Standardization
Standardize the 6 dialog components in `src/components/`:
1. `DeploymentDialog.tsx`
2. `IncidentDialog.tsx`
3. `InfrastructureNodeDialog.tsx`
4. `ServiceDialog.tsx`
5. `DocumentDialog.tsx`
6. `ProjectForm.tsx`

**Scope of changes per dialog:**
- Wrap form body in `<FormGrid columns={2}>`
- Wrap every input in `<FormField label="..." required={...} hint={...} error={...}>`
- Replace any native datetime inputs with `<DateTimePicker>`
- Replace any tag selects with `<MultiSelect>`

*Checkpoint 5:* Full verification suite + Docker frontend container rebuild (`docker compose build frontend && docker compose up -d frontend`).

---

## Verification & Rollback Strategy

1. **Per-Phase Checkpoint:**
   ```bash
   # In frontend/
   npx tsc --noEmit --project tsconfig.json --skipLibCheck 2>&1 | grep -E "^src" | grep -vE "AppLayout|AuthLayout|NotificationBell|date-picker|RegisterPage|HelpdeskReportPage|NotificationsPage|ProfilePage|ProjectDetailPage|PurchaseOrderDetailPage|SettingsPage"
   # Must yield 0 lines
   npx vite build
   # Must build successfully
   ```
2. **Visual Inspection:**
   - Test in both light and dark themes.
   - Verify pagination bounds and search filtering.
   - Confirm row click navigation and modal dialog triggers.
3. **Atomic Safety:** Each phase is self-contained and independently committable. If any issue arises in a subsequent phase, prior phases remain intact and valid.
