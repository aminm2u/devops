import { useState, lazy, Suspense, type ReactNode } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  Eye,
  Inbox,
  Network,
  Plus,
  RefreshCw,
  Server,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/status-badge';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/empty-state';
import { StatCard } from '@/components/stat-card';
import { DetailList, InfoRow } from '@/components/info-row';
import { ListToolbar } from '@/components/list-toolbar';
import { ProgressBar } from '@/components/progress-bar';
import { Pagination } from '@/components/Pagination';
import { FormField } from '@/components/ui/form-field';
import { FormGrid } from '@/components/ui/form-grid';
import { FormDialog } from '@/components/ui/form-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Combobox } from '@/components/ui/combobox';
import { RichListBox } from '@/components/ui/rich-listbox';
import { MultiSelect } from '@/components/ui/multi-select';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { ColorPicker } from '@/components/ui/color-picker';
import { SignaturePad } from '@/components/ui/signature-pad';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Label } from '@/components/ui/label';

// Lazy chunk boundary for Tiptap rich editor to keep initial showcase chunk lightweight
const RichTextEditorDemo = lazy(() =>
  import('@/pages/showcase/RichTextEditorDemo').then((m) => ({
    default: m.RichTextEditorDemo,
  }))
);

/** One showcase section: heading + container. */
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-xl bg-card/30 p-6 space-y-4">{children}</div>
    </section>
  );
}

/** Tiny label above one example. */
function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/* =========================================================================
   Wave 2 Interactive Demo Subcomponents
   ========================================================================= */

function ButtonLoadingDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setLoading(!loading)}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          {loading ? 'Stop loading' : 'Simulate loading'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading={loading}>Save Changes</Button>
        <Button variant="secondary" loading={loading}>Export PDF</Button>
        <Button variant="destructive" loading={loading}>Delete Record</Button>
        <Button variant="outline" loading={loading}>Cancel</Button>
        <Button size="icon" loading={loading} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CheckboxRadioDemo() {
  const [agreed, setAgreed] = useState<boolean | 'indeterminate'>('indeterminate');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySlack, setNotifySlack] = useState(false);
  const [env, setEnv] = useState('staging');

  return (
    <FormGrid columns={2}>
      <FormField label="Notifications (Checkboxes)">
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="notify-email"
              checked={notifyEmail}
              onCheckedChange={(c) => setNotifyEmail(Boolean(c))}
            />
            <Label
              htmlFor="notify-email"
              className="mb-0 font-normal cursor-pointer text-sm select-none leading-none"
            >
              Email alerts on deployment failure
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="notify-slack"
              checked={notifySlack}
              onCheckedChange={(c) => setNotifySlack(Boolean(c))}
            />
            <Label
              htmlFor="notify-slack"
              className="mb-0 font-normal cursor-pointer text-sm select-none leading-none"
            >
              Slack webhook announcements
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="indet"
              checked={agreed}
              onCheckedChange={setAgreed}
            />
            <Label
              htmlFor="indet"
              className="mb-0 font-normal cursor-pointer text-sm select-none leading-none"
            >
              Indeterminate state toggle (Click to cycle)
            </Label>
          </div>
        </div>
      </FormField>

      <FormField label="Target Environment (Radio Group)">
        <RadioGroup value={env} onValueChange={setEnv} className="pt-1 space-y-3 gap-0">
          <div className="flex items-center gap-2.5">
            <RadioGroupItem value="development" id="r-dev" />
            <Label
              htmlFor="r-dev"
              className="mb-0 font-normal cursor-pointer text-sm select-none leading-none"
            >
              Development (local cluster)
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <RadioGroupItem value="staging" id="r-stg" />
            <Label
              htmlFor="r-stg"
              className="mb-0 font-normal cursor-pointer text-sm select-none leading-none"
            >
              Staging (pre-production mirror)
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <RadioGroupItem value="production" id="r-prod" />
            <Label
              htmlFor="r-prod"
              className="mb-0 font-normal cursor-pointer text-sm select-none leading-none"
            >
              Production (live customer traffic)
            </Label>
          </div>
        </RadioGroup>
      </FormField>
    </FormGrid>
  );
}

function ComboboxDemo() {
  const [vendor, setVendor] = useState('v1');
  const [options, setOptions] = useState([
    { label: 'Dell Technologies Malaysia', value: 'v1' },
    { label: 'Cisco Systems Networking', value: 'v2' },
    { label: 'Amazon Web Services Inc.', value: 'v3' },
    { label: 'Microsoft Azure Enterprise', value: 'v4' },
    { label: 'Red Hat Enterprise Software', value: 'v5' },
  ]);

  const handleCreate = () => {
    const newId = `v${options.length + 1}`;
    const newName = `Supplier ${options.length + 1} (Auto-created)`;
    setOptions([...options, { label: newName, value: newId }]);
    setVendor(newId);
  };

  return (
    <div className="space-y-2 max-w-sm">
      <Combobox
        options={options}
        value={vendor}
        onChange={setVendor}
        placeholder="Select supplier..."
        searchPlaceholder="Type to filter suppliers..."
        actionLabel="Create new vendor"
        onAction={handleCreate}
        clearable
      />
      <p className="text-xs text-muted-foreground">
        Selected: <span className="font-mono text-foreground font-medium">{vendor || '(none)'}</span>
      </p>
    </div>
  );
}

function RichListBoxDemo() {
  const [selected, setSelected] = useState('k8s');

  const groups = [
    {
      label: 'Infrastructure Services',
      items: [
        {
          value: 'k8s',
          label: 'Kubernetes Cluster',
          description: 'Production EKS 3-node master cluster',
          icon: Server,
          shortcut: '⌘K',
        },
        {
          value: 'docker',
          label: 'Docker Registry',
          description: 'Harbor private container image hub',
          icon: Server,
          shortcut: '⌘D',
        },
      ],
    },
    {
      label: 'Database Engines',
      items: [
        {
          value: 'pg',
          label: 'PostgreSQL 15',
          description: 'Primary relational DB with read replicas',
          icon: Database,
          shortcut: '⌘P',
        },
      ],
    },
    {
      label: 'Networking & Security',
      items: [
        {
          value: 'vpn',
          label: 'WireGuard VPN Gateway',
          description: 'Site-to-site encrypted tunnel',
          icon: Network,
        },
        {
          value: 'vault',
          label: 'HashiCorp Vault',
          description: 'Secrets management service (decommissioned)',
          icon: Shield,
          disabled: true,
        },
      ],
    },
  ];

  return (
    <div className="space-y-2 max-w-sm">
      <RichListBox
        groups={groups}
        value={selected}
        onChange={setSelected}
        placeholder="Choose cloud component..."
        searchPlaceholder="Search services..."
      />
      <p className="text-xs text-muted-foreground">
        Selected: <span className="font-mono text-foreground font-medium">{selected || '(none)'}</span>
      </p>
    </div>
  );
}

function MultiSelectDemo() {
  const [selectedTags, setSelectedTags] = useState<string[]>(['network', 'critical']);
  const tagOptions = [
    { label: 'Network', value: 'network' },
    { label: 'Critical Path', value: 'critical' },
    { label: 'Security Patch', value: 'security' },
    { label: 'Frontend UI', value: 'frontend' },
    { label: 'Database Migration', value: 'db' },
  ];

  return (
    <div className="space-y-2 max-w-md">
      <MultiSelect
        options={tagOptions}
        selected={selectedTags}
        onChange={setSelectedTags}
        placeholder="Select task tags..."
      />
      <p className="text-xs text-muted-foreground">
        Selected tags count: <span className="font-medium text-foreground">{selectedTags.length}</span>
      </p>
    </div>
  );
}

interface MockOrder {
  id: number;
  poNumber: string;
  vendor: string;
  creator: { id: number; name: string; email: string };
  amount: number;
  status: string;
  date: string;
  details: string;
}

const MOCK_ORDERS: MockOrder[] = [
  { id: 1, poNumber: 'PO-2026-0001', vendor: 'Dell Technologies', creator: { id: 1, name: 'Afif Azfar', email: 'afif@mwp.local' }, amount: 24500, status: 'approved', date: '2026-03-01', details: '10x Dell PowerEdge R650 Server Nodes' },
  { id: 2, poNumber: 'PO-2026-0002', vendor: 'Cisco Networking', creator: { id: 2, name: 'Ahmad Amin', email: 'amin@mwp.local' }, amount: 12800, status: 'dispatched', date: '2026-03-05', details: '4x Catalyst 9300 48-port Switches' },
  { id: 3, poNumber: 'PO-2026-0003', vendor: 'Amazon Web Services', creator: { id: 3, name: 'Sarah Tan', email: 'sarah@mwp.local' }, amount: 5600, status: 'completed', date: '2026-03-10', details: 'Annual Reserved Instances Commitment' },
  { id: 4, poNumber: 'PO-2026-0004', vendor: 'Red Hat Enterprise', creator: { id: 1, name: 'Afif Azfar', email: 'afif@mwp.local' }, amount: 8900, status: 'submitted', date: '2026-03-12', details: 'OpenShift Platform Plus Licences' },
  { id: 5, poNumber: 'PO-2026-0005', vendor: 'Microsoft Azure', creator: { id: 4, name: 'Kevin Lee', email: 'kevin@mwp.local' }, amount: 17300, status: 'partially_received', date: '2026-03-15', details: 'ExpressRoute Connectivity and Blob Tier' },
  { id: 6, poNumber: 'PO-2026-0006', vendor: 'Palo Alto Networks', creator: { id: 2, name: 'Ahmad Amin', email: 'amin@mwp.local' }, amount: 31000, status: 'draft', date: '2026-03-18', details: 'Next-Gen Firewall Appliances' },
  { id: 7, poNumber: 'PO-2026-0007', vendor: 'Oracle Hardware', creator: { id: 3, name: 'Sarah Tan', email: 'sarah@mwp.local' }, amount: 45000, status: 'cancelled', date: '2026-03-20', details: 'Exadata Storage Server Unit' },
];

function DataTableDemo() {
  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tablePage, setTablePage] = useState(1);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MockOrder | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filter mock data
  const filteredData = MOCK_ORDERS.filter((order) => {
    const matchesSearch =
      tableSearch === '' ||
      order.poNumber.toLowerCase().includes(tableSearch.toLowerCase()) ||
      order.vendor.toLowerCase().includes(tableSearch.toLowerCase()) ||
      order.creator.name.toLowerCase().includes(tableSearch.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const columns: DataTableColumn<MockOrder>[] = [
    {
      key: 'creator',
      header: 'Authorizer',
      width: 'w-48',
      skeletonClassName: 'h-8 w-8 rounded-full',
      render: (r) => (
        <div className="flex items-center gap-2">
          <UserAvatar user={r.creator} size="sm" />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{r.creator.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{r.creator.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'poNumber',
      header: 'PO Number',
      sortable: true,
      accessor: (r) => r.poNumber,
      render: (r) => <span className="font-mono text-xs font-semibold">{r.poNumber}</span>,
    },
    {
      key: 'vendor',
      header: 'Vendor Name',
      sortable: true,
      accessor: (r) => r.vendor,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge domain="po" value={r.status} />,
    },
    {
      key: 'amount',
      header: 'Total Amount',
      align: 'right',
      sortable: true,
      accessor: (r) => r.amount,
      render: (r) => (
        <span className="font-mono font-medium text-xs">
          RM {r.amount.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Issue Date',
      sortable: true,
      accessor: (r) => r.date,
      render: (r) => <span className="text-xs text-muted-foreground">{r.date}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-24',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedId(expandedId === r.id ? null : r.id);
            }}
            title="Toggle Details"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              alert(`Download PO PDF for ${r.poNumber}`);
            }}
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTableLoading(!tableLoading)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {tableLoading ? 'Show Data' : 'Test Skeleton Loading'}
          </Button>
        </div>

        {selectedOrder && (
          <p className="text-xs text-muted-foreground">
            Clicked Row: <span className="font-semibold text-foreground">{selectedOrder.poNumber}</span> ({selectedOrder.vendor})
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        loading={tableLoading}
        rowKey={(r) => r.id}
        onRowClick={(r) => setSelectedOrder(r)}
        renderRowAfter={(r) =>
          expandedId === r.id ? (
            <div className="rounded bg-muted/40 p-3 text-xs space-y-1">
              <span className="font-semibold text-foreground">Line Items Summary:</span>
              <p className="text-muted-foreground">{r.details}</p>
            </div>
          ) : null
        }
        search={{
          value: tableSearch,
          onChange: setTableSearch,
          placeholder: 'Search PO number, vendor, or authorizer...',
        }}
        filters={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        }
        pagination={{
          page: tablePage,
          totalPages: 4,
          onPageChange: setTablePage,
          totalItems: 28,
          itemsPerPage: 7,
        }}
      />
    </div>
  );
}

function DateTimePickerDemo() {
  const [dt1, setDt1] = useState('2026-09-25T14:30');
  const [dt2, setDt2] = useState('');

  return (
    <FormGrid columns={2}>
      <FormField label="Scheduled Maintenance Window (minuteStep = 5)">
        <DateTimePicker
          value={dt1}
          onChange={setDt1}
          placeholder="Pick deployment window..."
        />
        <p className="text-xs text-muted-foreground mt-1">
          Value: <span className="font-mono text-foreground font-medium">{dt1 || '(empty)'}</span>
        </p>
      </FormField>

      <FormField label="Audit Log Snapshot (minuteStep = 15)">
        <DateTimePicker
          value={dt2}
          onChange={setDt2}
          minuteStep={15}
          placeholder="Pick audit timestamp..."
        />
        <p className="text-xs text-muted-foreground mt-1">
          Value: <span className="font-mono text-foreground font-medium">{dt2 || '(empty)'}</span>
        </p>
      </FormField>
    </FormGrid>
  );
}

function ColorPickerDemo() {
  const [color1, setColor1] = useState('#3b82f6');
  const [color2, setColor2] = useState('#10b981aa');

  return (
    <div className="flex flex-wrap gap-8 items-start">
      <div className="space-y-2">
        <span className="text-xs font-medium text-foreground">Standard Hex with Quick Swatches</span>
        <ColorPicker
          value={color1}
          onChange={setColor1}
          presets={['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']}
        />
      </div>

      <div className="space-y-2">
        <span className="text-xs font-medium text-foreground">Hex + Alpha (Transparency)</span>
        <ColorPicker
          value={color2}
          onChange={setColor2}
          alpha
          presets={['#3b82f6ff', '#3b82f680', '#10b981ff', '#10b98180', '#f43f5eff']}
        />
      </div>
    </div>
  );
}

function SignaturePadDemo() {
  const [sigData, setSigData] = useState<string>('');

  return (
    <div className="space-y-4 max-w-md">
      <FormField label="Approver Digital Signature" hint="Draw on touch screen or drag mouse to authorize">
        <SignaturePad onChange={setSigData} />
      </FormField>

      {sigData && (
        <div className="space-y-1.5 pt-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Exported PNG Preview
          </span>
          <div className="h-16 w-48 rounded border border-border bg-white p-1 flex items-center justify-center">
            <img src={sigData} alt="Signature capture" className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Main Component Showcase Page
   ========================================================================= */

export function ComponentShowcasePage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(3);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-8">
      <PageHeader
        size="lg"
        title="Component Showcase"
        description="Internal QA and design system reference page for the shared UI component library."
      >
        <Badge variant="destructive">Temporary</Badge>
      </PageHeader>

      {/* 1. StatusBadge */}
      <Section
        title="StatusBadge"
        description="Domain-aware status colors. Unknown values fall back to the generic palette."
      >
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Example label="po">
            <div className="flex flex-wrap gap-2">
              {['draft', 'submitted', 'approved', 'dispatched', 'partially_received', 'fully_received', 'completed', 'cancelled'].map((v) => (
                <StatusBadge key={v} domain="po" value={v} />
              ))}
            </div>
          </Example>
          <Example label="rfq">
            <div className="flex flex-wrap gap-2">
              {['draft', 'sent', 'receiving', 'evaluating', 'awarded', 'cancelled'].map((v) => (
                <StatusBadge key={v} domain="rfq" value={v} />
              ))}
            </div>
          </Example>
          <Example label="payment (approved is amber intentionally)">
            <div className="flex flex-wrap gap-2">
              {['draft', 'pending', 'approved', 'paid', 'void', 'failed'].map((v) => (
                <StatusBadge key={v} domain="payment" value={v} />
              ))}
            </div>
          </Example>
          <Example label="grn">
            <div className="flex flex-wrap gap-2">
              {['pending', 'inspected', 'accepted', 'rejected', 'partial', 'cancelled'].map((v) => (
                <StatusBadge key={v} domain="grn" value={v} />
              ))}
            </div>
          </Example>
          <Example label="asset">
            <div className="flex flex-wrap gap-2">
              {['active', 'inactive', 'maintenance', 'disposed', 'decommissioned'].map((v) => (
                <StatusBadge key={v} domain="asset" value={v} />
              ))}
            </div>
          </Example>
          <Example label="internalProject">
            <div className="flex flex-wrap gap-2">
              {['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'].map((v) => (
                <StatusBadge key={v} domain="internalProject" value={v} />
              ))}
            </div>
          </Example>
          <Example label="requisition">
            <div className="flex flex-wrap gap-2">
              {['draft', 'submitted', 'approved', 'rejected'].map((v) => (
                <StatusBadge key={v} domain="requisition" value={v} />
              ))}
            </div>
          </Example>
          <Example label="helpdeskStatus (reopened is purple)">
            <div className="flex flex-wrap gap-2">
              {['open', 'in_progress', 'awaiting_response', 'resolved', 'closed', 'reopened'].map((v) => (
                <StatusBadge key={v} domain="helpdeskStatus" value={v} />
              ))}
            </div>
          </Example>
          <Example label="helpdeskPriority">
            <div className="flex flex-wrap gap-2">
              {['urgent', 'high', 'medium', 'low'].map((v) => (
                <StatusBadge key={v} domain="helpdeskPriority" value={v} />
              ))}
            </div>
          </Example>
          <Example label="custom label + icon override + unknown fallback">
            <div className="flex flex-wrap gap-2">
              <StatusBadge domain="po" value="approved" label="Passed Inspection" />
              <StatusBadge domain="po" value="completed" icon={<CheckCircle2 className="mr-1 h-3 w-3" />} />
              <StatusBadge domain="generic" value="some_random_state" />
            </div>
          </Example>
        </div>
      </Section>

      {/* 2. LoadingState */}
      <Section title="LoadingState" description="Replacement for hand-rolled Loader2 spinners.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4">
            <Example label="inline variant">
              <LoadingState variant="inline" label="Saving changes..." />
            </Example>
          </div>
          <div className="rounded-lg border p-4">
            <Example label="panel variant (default)">
              <LoadingState variant="panel" label="Loading data..." />
            </Example>
          </div>
          <div className="rounded-lg border p-4">
            <Example label="page variant">
              <LoadingState variant="page" label="Loading dashboard..." />
            </Example>
          </div>
        </div>
        <div className="rounded-lg border p-4 overflow-hidden relative h-40">
          <Example label="screen variant (clipped for showcase)">
            <LoadingState variant="screen" label="Loading application..." />
          </Example>
        </div>
      </Section>

      {/* 3. EmptyState */}
      <Section title="EmptyState" description="Standardized empty-result display with optional action button.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <Example label="Medium (default) with action">
              <EmptyState
                icon={Inbox}
                title="No purchase orders"
                description="Get started by creating your first purchase order for this project."
                action={
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" /> Create PO
                  </Button>
                }
              />
            </Example>
          </div>
          <div className="rounded-lg border p-4">
            <Example label="Small (compact table empty)">
              <EmptyState size="sm" title="No results found" description="Try adjusting your search or filters." />
            </Example>
          </div>
        </div>
      </Section>

      {/* 4. StatCard */}
      <Section title="StatCard" description="KPI dashboard cards with stacked, inline, and pill variants.">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard
            label="Total Spent"
            value="RM 48,250"
            caption="+12% from last month"
            icon={TrendingUp}
            iconClassName="text-green-500"
          />
          <StatCard
            label="Pending RFQs"
            value={8}
            caption="3 awaiting evaluation"
            icon={Inbox}
            iconClassName="text-amber-500"
          />
          <StatCard
            label="Active Vendors"
            value={24}
            layout="inline"
            icon={CheckCircle2}
            iconClassName="text-blue-500"
          />
          <StatCard
            label="Approval Rate"
            value="94%"
            pill
            caption="Last 30 days"
          />
        </div>
      </Section>

      {/* 5. InfoRow & DetailList */}
      <Section title="InfoRow & DetailList" description="Consistent key/value pairs for record detail views.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Row Layout (with DetailList separators)</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList>
                <InfoRow label="PO Number" value={<span className="font-mono">PO-2026-0042</span>} />
                <InfoRow label="Status" value={<StatusBadge domain="po" value="approved" />} />
                <InfoRow label="Vendor" value="Dell Technologies Malaysia" />
                <InfoRow label="Total Amount" value="RM 124,500.00" />
              </DetailList>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Stacked Layout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow layout="stacked" label="Project Description" value="Migration of on-prem infrastructure to multi-region cloud cluster." />
              <InfoRow layout="stacked" label="Scope of Work" value="Supply, deliver, install and configure 12x compute nodes with redundant 10Gbps uplinks." />
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* 6. FormGrid & FormField */}
      <Section title="FormGrid & FormField" description="Uniform 8px spacing, required asterisks, hints, and error states.">
        <FormGrid columns={2}>
          <FormField label="Vendor Name" required hint="Must match official SSM registration">
            <Input placeholder="e.g., Acme Sdn Bhd" />
          </FormField>
          <FormField label="Email" required error="Invalid email address format">
            <Input defaultValue="not-an-email" />
          </FormField>
          <FormField label="Notes" className="col-span-2" hint="Optional internal remarks">
            <Textarea placeholder="Add any delivery instructions..." rows={2} />
          </FormField>
        </FormGrid>
      </Section>

      {/* 7. ListToolbar */}
      <Section title="ListToolbar" description="Unified search input + filter controls row.">
        <ListToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search purchase orders..."
        >
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New PO
          </Button>
        </ListToolbar>
        <p className="text-xs text-muted-foreground">
          Live search value: &ldquo;<span className="font-mono text-foreground">{search}</span>&rdquo; | Filter: &ldquo;<span className="font-mono text-foreground">{filter}</span>&rdquo;
        </p>
      </Section>

      {/* 8. ProgressBar */}
      <Section title="ProgressBar" description="Tone-aware progress bars with budget thresholds.">
        <div className="space-y-4 max-w-xl">
          <Example label="auto tone: 45% (green)">
            <ProgressBar value={45} tone="auto" />
          </Example>
          <Example label="auto tone: 70% (yellow threshold >= 60%)">
            <ProgressBar value={70} tone="auto" />
          </Example>
          <Example label="auto tone: 85% (orange threshold >= 80%)">
            <ProgressBar value={85} tone="auto" />
          </Example>
          <Example label="auto tone: 105% (red threshold >= 100%, clamped fill)">
            <ProgressBar value={105} tone="auto" />
          </Example>
          <Example label="md size with percentage label inside">
            <ProgressBar value={62} size="md" showLabel tone="primary" />
          </Example>
        </div>
      </Section>

      {/* 9. Pagination */}
      <Section title="Pagination" description="Existing shared component — server-paginated pages should all use it.">
        <Pagination page={page} totalPages={8} onPageChange={setPage} totalItems={79} itemsPerPage={10} />
      </Section>

      {/* 10. Dialogs */}
      <Section title="Dialogs" description="Standardized FormDialog and ConfirmDialog shells.">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setFormOpen(true)}>Open FormDialog Demo</Button>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Open ConfirmDialog Demo
          </Button>
        </div>
      </Section>

      {/* 11. PageHeader */}
      <Section title="PageHeader" description="Consistent top-of-page header with size variants and icon support.">
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <PageHeader
              size="sm"
              title="Dashboard"
              description="Overview of your infrastructure and projects"
            />
          </div>
          <div className="rounded-lg border p-4">
            <PageHeader
              size="md"
              title="Direct Purchases"
              description="Quick purchases that bypass RFQ process"
            >
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> New Direct Purchase
              </Button>
            </PageHeader>
          </div>
          <div className="rounded-lg border p-4">
            <PageHeader
              size="lg"
              icon={BarChart3}
              title="Monthly Report"
              description="Helpdesk performance and ticket analytics"
            >
              <Button size="sm" variant="outline">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Export
              </Button>
            </PageHeader>
          </div>
        </div>
      </Section>

      {/* ===================================================================
          Wave 2 Showcase Sections
          =================================================================== */}

      {/* 12. Button Loading State */}
      <Section
        title="Button (Loading State)"
        description="Enhanced Button with loading spinner across variants and icon buttons."
      >
        <ButtonLoadingDemo />
      </Section>

      {/* 13. Checkbox & RadioGroup */}
      <Section
        title="Checkbox & RadioGroup"
        description="Standard Radix controls with indeterminate state and FormField composition."
      >
        <CheckboxRadioDemo />
      </Section>

      {/* 14. Combobox */}
      <Section
        title="Combobox (Single-Select Searchable + Pinned Action)"
        description="Searchable select with keyboard navigation and pinned '+ Create new' action."
      >
        <ComboboxDemo />
      </Section>

      {/* 15. RichListBox */}
      <Section
        title="RichListBox (Multi-line Items with Icons & Shortcuts)"
        description="Structured selection list for resources with icons, descriptions, and keyboard shortcuts."
      >
        <RichListBoxDemo />
      </Section>

      {/* 16. MultiSelect */}
      <Section
        title="MultiSelect (Chip Badges)"
        description="Multi-item selector with filter search and removable badge chips."
      >
        <MultiSelectDemo />
      </Section>

      {/* 17. DataTable */}
      <Section
        title="DataTable"
        description="Comprehensive data table with sortable headers, debounced search, skeleton states, avatar cells, expandable details, and server pagination."
      >
        <DataTableDemo />
      </Section>

      {/* 18. DateTimePicker */}
      <Section
        title="DateTimePicker"
        description="Two-row compact dropdown panel for selecting day/month/year and hour/minute without browser native quirks."
      >
        <DateTimePickerDemo />
      </Section>

      {/* 19. ColorPicker */}
      <Section
        title="ColorPicker"
        description="Visual saturation color picker with hex input, alpha channel option, and preset swatches."
      >
        <ColorPickerDemo />
      </Section>

      {/* 20. SignaturePad */}
      <Section
        title="SignaturePad"
        description="Touch-friendly canvas drawing pad for procurement and authorization signatures with undo and clear."
      >
        <SignaturePadDemo />
      </Section>

      {/* 21. RichTextEditor */}
      <Section
        title="RichTextEditor (Tiptap v3)"
        description="WYSIWYG editor with headings, bold/italic/underline, lists, links, and history. Loaded as an asynchronous chunk."
      >
        <Suspense fallback={<LoadingState label="Loading editor..." />}>
          <RichTextEditorDemo />
        </Suspense>
      </Section>

      {/* Global Dialog Demos */}
      <FormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Add Domain"
        description="Example FormDialog with FormField + FormGrid"
        maxWidth="lg"
        onSubmit={(e) => {
          e.preventDefault();
          setFormOpen(false);
        }}
        submitLabel="Create"
      >
        <FormGrid>
          <FormField label="Domain Name" required>
            <Input placeholder="e.g., example.com" />
          </FormField>
          <FormField label="Registrar">
            <Input placeholder="e.g., GoDaddy" />
          </FormField>
        </FormGrid>
      </FormDialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete domain?"
        description="This will permanently remove the domain. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => setConfirmOpen(false)}
      />
    </div>
  );
}
