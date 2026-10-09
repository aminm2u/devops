import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Plus, TrendingUp, TrendingDown, Edit2, Trash2, ChevronDown, ChevronUp, Package, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '@/components/ui/form-dialog';
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
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/stat-card';
import { ProgressBar } from '@/components/progress-bar';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import type { BudgetItem, BudgetExpenditure, BudgetSummary, BudgetCategorySummary, BudgetForm, ExpenditureForm } from '@/types';

const BUDGET_CATEGORIES = [
  'Hardware', 'Software', 'Maintenance', 'Office Equipment', 'Rentals',
  'Hosting', 'Security', 'Training', 'Consulting', 'Other'
];

const BUDGET_STATUSES = ['request', 'approved'];

const DIVISIONS = ['IT', 'DMA', 'HR', 'BD', 'DI', 'ADMIN'];

function formatCurrency(amount: number, currency: string = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function getBalanceColor(utilized: number, allocated: number) {
  const percent = allocated > 0 ? (utilized / allocated) * 100 : 0;
  if (percent >= 100) return 'text-red-600';
  if (percent >= 80) return 'text-orange-600';
  if (percent >= 60) return 'text-yellow-600';
  return 'text-green-600';
}

export function BudgetPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [fiscalYearFilter, setFiscalYearFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState<BudgetItem | null>(null);
  const [showExpenditures, setShowExpenditures] = useState<BudgetItem | null>(null);
  const [showAddExpenditure, setShowAddExpenditure] = useState<BudgetItem | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const [editingBudgetValue, setEditingBudgetValue] = useState<string>('');

  // Fetch budget items
  const { data: budgetData, isLoading } = useQuery({
    queryKey: ['budget', search, categoryFilter, statusFilter, divisionFilter, fiscalYearFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (divisionFilter !== 'all') params.append('division', divisionFilter);
      if (fiscalYearFilter !== 'all') params.append('fiscalYear', fiscalYearFilter);
      params.append('page', String(page));
      params.append('limit', '20');
      const response = await apiClient.get(`/budget?${params.toString()}`);
      return response.data;
    },
  });

  // Fetch summary
  const { data: summaryData } = useQuery({
    queryKey: ['budget-summary', fiscalYearFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fiscalYearFilter !== 'all') params.append('fiscalYear', fiscalYearFilter);
      const response = await apiClient.get(`/budget/summary?${params.toString()}`);
      return response.data.data as BudgetSummary;
    },
  });

  // Fetch expenditures for dialog
  const { data: expendituresData, isLoading: isLoadingExpenditures } = useQuery({
    queryKey: ['budget-expenditures', showExpenditures?.id],
    queryFn: async () => {
      if (!showExpenditures) return [];
      const response = await apiClient.get(`/budget/${showExpenditures.id}/expenditures`);
      return response.data.data as BudgetExpenditure[];
    },
    enabled: !!showExpenditures,
  });

  // Create budget item mutation
  const createMutation = useMutation({
    mutationFn: async (data: BudgetForm) => {
      const response = await apiClient.post('/budget', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Budget item created');
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      setShowCreateDialog(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create budget item');
    },
  });

  // Update budget item mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<BudgetForm> }) => {
      const response = await apiClient.put(`/budget/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Budget item updated');
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      setShowUpdateDialog(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update budget item');
    },
  });

  // Delete budget item mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.delete(`/budget/${id}`);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Budget item deleted');
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete budget item');
    },
  });

  // Add expenditure mutation
  const addExpenditureMutation = useMutation({
    mutationFn: async ({ budgetItemId, data }: { budgetItemId: number; data: ExpenditureForm }) => {
      const response = await apiClient.post(`/budget/${budgetItemId}/expenditures`, data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Expenditure added');
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      queryClient.invalidateQueries({ queryKey: ['budget-expenditures'] });
      setShowAddExpenditure(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to add expenditure');
    },
  });

  // Delete expenditure mutation
  const deleteExpenditureMutation = useMutation({
    mutationFn: async ({ budgetItemId, expId }: { budgetItemId: number; expId: number }) => {
      const response = await apiClient.delete(`/budget/${budgetItemId}/expenditures/${expId}`);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Expenditure deleted');
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      queryClient.invalidateQueries({ queryKey: ['budget-expenditures'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete expenditure');
    },
  });

  // Quick edit allocated budget mutation
  const quickEditMutation = useMutation({
    mutationFn: async ({ id, allocatedBudget }: { id: number; allocatedBudget: number }) => {
      const response = await apiClient.put(`/budget/${id}`, { allocatedBudget });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Budget updated');
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] });
      setEditingBudgetId(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update budget');
    },
  });

  const handleQuickEdit = (item: BudgetItem) => {
    setEditingBudgetId(item.id);
    setEditingBudgetValue(item.allocatedBudget.toString());
  };

  const handleQuickEditSave = () => {
    if (editingBudgetId && editingBudgetValue) {
      const newValue = parseFloat(editingBudgetValue);
      if (!isNaN(newValue) && newValue >= 0) {
        quickEditMutation.mutate({ id: editingBudgetId, allocatedBudget: newValue });
      } else {
        toast.error('Please enter a valid budget amount');
      }
    }
  };

  const handleQuickEditCancel = () => {
    setEditingBudgetId(null);
    setEditingBudgetValue('');
  };

  const budgetItems = budgetData?.data || [];
  const summary = summaryData;
  const meta = budgetData?.meta;

  const columns: DataTableColumn<BudgetItem>[] = [
    {
      key: 'expand',
      header: '',
      width: 'w-8',
      render: (item) =>
        expandedRow === item.id ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (item) => <Badge variant="outline">{item.category}</Badge>,
    },
    {
      key: 'description',
      header: 'Description',
      className: 'font-medium',
      accessor: (item) => item.description,
    },
    {
      key: 'division',
      header: 'Division',
      render: (item) => <Badge variant="secondary">{item.division}</Badge>,
    },
    {
      key: 'requestor',
      header: 'Requestor',
      accessor: (item) => item.requestor,
    },
    {
      key: 'allocated',
      header: 'Allocated',
      align: 'right',
      render: (item) =>
        editingBudgetId === item.id ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Input
              type="number"
              value={editingBudgetValue}
              onChange={(e) => setEditingBudgetValue(e.target.value)}
              className="w-24 h-7 text-right text-sm"
              min="0"
              step="0.01"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickEditSave();
                if (e.key === 'Escape') handleQuickEditCancel();
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleQuickEditSave}
              className="h-7 w-7 p-0 text-green-600"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleQuickEditCancel}
              className="h-7 w-7 p-0 text-gray-500"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <span
            className="cursor-pointer hover:bg-blue-500/10 px-1 rounded"
            onClick={(e) => {
              e.stopPropagation();
              handleQuickEdit(item);
            }}
            title="Click to edit budget"
          >
            {formatCurrency(item.allocatedBudget, item.currency)}
          </span>
        ),
    },
    {
      key: 'utilized',
      header: 'Utilized',
      align: 'right',
      className: 'tabular-nums',
      accessor: (item) => formatCurrency(item.utilizedBudget, item.currency),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (item) => (
        <span className={`font-medium ${getBalanceColor(item.utilizedBudget, item.allocatedBudget)}`}>
          {formatCurrency(item.allocatedBudget - item.utilizedBudget, item.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <Badge className={
          item.status === 'approved' ? 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20' :
          'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20'
        }>
          {item.status === 'request' ? 'Request' : 'Approved'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 'w-24',
      render: (item) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUpdateDialog(item)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowExpenditures(item)}
          >
            <Package className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm('Delete this budget item?')) {
                deleteMutation.mutate(item.id);
              }
            }}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Budget Control"
        description="Track IT division budgets, allocations, and expenditures"
      >
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Budget Item
        </Button>
      </PageHeader>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Allocated"
            value={formatCurrency(summary.totalAllocated)}
            valueClassName="text-blue-600"
            icon={DollarSign}
            iconClassName="text-blue-500"
          />
          <StatCard
            label="Total Utilized"
            value={formatCurrency(summary.totalUtilized)}
            valueClassName="text-orange-600"
            icon={TrendingUp}
            iconClassName="text-orange-500"
          />
          <StatCard
            label="Total Balance"
            value={formatCurrency(summary.totalBalance)}
            valueClassName={getBalanceColor(summary.totalUtilized, summary.totalAllocated)}
            icon={TrendingDown}
            iconClassName="text-green-500"
          />
          <StatCard
            label="Utilization"
            value={
              <>
                {summary.utilizationPercent}%
                <ProgressBar value={summary.utilizationPercent} tone="auto" className="mt-2" />
              </>
            }
            icon={Package}
            iconClassName="text-purple-500"
          />
        </div>
      )}

      {/* Category Breakdown */}
      {summary && summary.categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Budget by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary.categories.map((cat) => (
                <div key={cat.name} className="flex items-center gap-4">
                  <div className="w-32 font-medium">{cat.name}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{formatCurrency(cat.utilized)} / {formatCurrency(cat.allocated)}</span>
                      <span>{cat.utilizationPercent}%</span>
                    </div>
                    <ProgressBar value={cat.utilizationPercent} tone="auto" />
                  </div>
                  <div className="w-24 text-right text-sm font-medium">
                    {formatCurrency(cat.balance)} left
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={budgetItems}
        loading={isLoading}
        loadingRows={5}
        onRowClick={(item) => setExpandedRow(expandedRow === item.id ? null : item.id)}
        search={{
          value: search,
          onChange: (v) => { setSearch(v); setPage(1); },
          placeholder: 'Search budget items...',
        }}
        filters={
          <>
            <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {BUDGET_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="request">Request</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={divisionFilter} onValueChange={(val) => { setDivisionFilter(val); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="All Divisions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                {DIVISIONS.map((div) => (
                  <SelectItem key={div} value={div}>{div}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Fiscal Year (e.g. 2024)"
              value={fiscalYearFilter === 'all' ? '' : fiscalYearFilter}
              onChange={(e) => { setFiscalYearFilter(e.target.value || 'all'); setPage(1); }}
              className="w-full sm:w-[170px]"
            />
          </>
        }
        pagination={
          meta
            ? {
                page,
                totalPages: meta.lastPage,
                onPageChange: setPage,
                totalItems: meta.total,
                itemsPerPage: 20,
              }
            : undefined
        }
        emptyIcon={DollarSign}
        emptyTitle="No budget items found"
        emptyDescription="Create a new budget item to get started."
        renderRowAfter={(item) => {
          if (expandedRow !== item.id) return null;
          const utilizationPercent = item.allocatedBudget > 0
            ? (item.utilizedBudget / item.allocatedBudget) * 100
            : 0;
          return (
            <TableRow>
              <TableCell colSpan={columns.length} className="bg-muted/30">
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Division:</span>
                      <p className="font-medium">{item.division}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Currency:</span>
                      <p className="font-medium">{item.currency}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fiscal Year:</span>
                      <p className="font-medium">{item.fiscalYear || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Utilization:</span>
                      <p className="font-medium">{utilizationPercent.toFixed(1)}%</p>
                    </div>
                  </div>
                  {item.details && (
                    <div>
                      <span className="text-muted-foreground text-sm">Details:</span>
                      <p className="mt-1">{item.details}</p>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddExpenditure(item)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Expenditure
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        }}
      />

      {/* Create Budget Item Dialog */}
      {showCreateDialog && (
        <BudgetItemDialog
          onSubmit={(data) => createMutation.mutate(data)}
          onClose={() => setShowCreateDialog(false)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {/* Update Budget Item Dialog */}
      {showUpdateDialog && (
        <BudgetItemDialog
          item={showUpdateDialog}
          onSubmit={(data) => updateMutation.mutate({ id: showUpdateDialog.id, data })}
          onClose={() => setShowUpdateDialog(null)}
          isSubmitting={updateMutation.isPending}
        />
      )}

      {/* View Expenditures Dialog */}
      {showExpenditures && (
        <ExpendituresDialog
          item={showExpenditures}
          expenditures={expendituresData || []}
          isLoading={isLoadingExpenditures}
          onClose={() => setShowExpenditures(null)}
          onAddExpenditure={() => {
            setShowAddExpenditure(showExpenditures);
            setShowExpenditures(null);
          }}
          onDeleteExpenditure={(expId) => {
            deleteExpenditureMutation.mutate({ budgetItemId: showExpenditures.id, expId });
          }}
        />
      )}

      {/* Add Expenditure Dialog */}
      {showAddExpenditure && (
        <ExpenditureDialog
          onSubmit={(data) => addExpenditureMutation.mutate({ budgetItemId: showAddExpenditure.id, data })}
          onClose={() => setShowAddExpenditure(null)}
          isSubmitting={addExpenditureMutation.isPending}
          currency={showAddExpenditure.currency}
        />
      )}
    </div>
  );
}

// ── Budget Item Create/Edit Dialog ───────────────────────────────────────────

function BudgetItemDialog({
  item,
  onSubmit,
  onClose,
  isSubmitting,
}: {
  item?: BudgetItem;
  onSubmit: (data: BudgetForm) => void;
  onClose: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<BudgetForm>({
    projectId: item?.projectId || null,
    division: item?.division || 'IT',
    category: item?.category || '',
    description: item?.description || '',
    details: item?.details || '',
    requestor: item?.requestor || '',
    allocatedBudget: item?.allocatedBudget || 0,
    poNumber: item?.poNumber || '',
    currency: item?.currency || 'MYR',
    status: item?.status || 'request',
    fiscalYear: item?.fiscalYear || new Date().getFullYear().toString(),
    metadata: item?.metadata || null,
  });

  // Fetch users for requestor dropdown
  const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Fetch category breakdown for dynamic budget display
  const [categoryBreakdown, setCategoryBreakdown] = useState<BudgetCategorySummary[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiClient.get('/admin/users/list');
        setUsers(response.data.data || []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchCategoryBreakdown = async () => {
      try {
        const response = await apiClient.get('/budget/summary');
        setCategoryBreakdown(response.data.data?.categories || []);
      } catch (error) {
        console.error('Failed to fetch category breakdown:', error);
      }
    };
    fetchCategoryBreakdown();
  }, []);

  // Get current category's approved budget breakdown
  const currentCategoryBreakdown = categoryBreakdown.find(cat => cat.name === form.category);

  const handleSubmit = () => {
    onSubmit(form);
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={item ? 'Edit Budget Item' : 'Create Budget Item'}
      description={item ? 'Update budget item details' : 'Add a new budget item to track'}
      maxWidth="lg"
      onSubmit={handleSubmit}
      submitLabel={item ? 'Update' : 'Create'}
      isSubmitting={isSubmitting}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Category *</Label>
          <Select value={form.category} onValueChange={(val) => setForm({ ...form, category: val })}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {BUDGET_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(val) => setForm({ ...form, status: val })}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {BUDGET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Description *</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="e.g. Server upgrade for production"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Requestor *</Label>
          <Select value={form.requestor} onValueChange={(val) => setForm({ ...form, requestor: val })}>
            <SelectTrigger>
              <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select requestor"} />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.name}>
                  {user.name} ({user.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Division *</Label>
          <Select value={form.division} onValueChange={(val) => setForm({ ...form, division: val })}>
            <SelectTrigger>
              <SelectValue placeholder="Select division" />
            </SelectTrigger>
            <SelectContent>
              {DIVISIONS.map((div) => (
                <SelectItem key={div} value={div}>{div}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Allocated Budget *</Label>
          <Input
            type="number"
            value={form.allocatedBudget || ''}
            onChange={(e) => setForm({ ...form, allocatedBudget: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
          />
        </div>
        <div>
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={(val) => setForm({ ...form, currency: val })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MYR">MYR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Fiscal Year</Label>
          <Input
            value={form.fiscalYear || ''}
            onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })}
            placeholder="e.g. 2024"
          />
        </div>
      </div>

      {/* Dynamic Budget Breakdown by Category */}
      {form.category && currentCategoryBreakdown && (
        <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
          <h4 className="text-sm font-medium text-foreground mb-3">
            Budget Breakdown for {form.category}
          </h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Total Allocated</p>
              <p className="font-bold text-blue-600">{formatCurrency(currentCategoryBreakdown.allocated)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Utilized</p>
              <p className="font-bold text-orange-600">{formatCurrency(currentCategoryBreakdown.utilized)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Available Balance</p>
              <p className="font-bold text-green-600">{formatCurrency(currentCategoryBreakdown.balance)}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Utilization: {currentCategoryBreakdown.utilizationPercent}%</span>
              <span>{formatCurrency(currentCategoryBreakdown.balance)} remaining</span>
            </div>
            <ProgressBar value={currentCategoryBreakdown.utilizationPercent} tone="auto" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Your new allocation will be: {formatCurrency(currentCategoryBreakdown.allocated + form.allocatedBudget)}
          </p>
        </div>
      )}

      <div>
        <Label>Details</Label>
        <Textarea
          value={form.details || ''}
          onChange={(e) => setForm({ ...form, details: e.target.value })}
          placeholder="Additional details about this budget item"
          rows={3}
        />
      </div>
    </FormDialog>
  );
}

// ── View Expenditures Dialog ─────────────────────────────────────────────────

function ExpendituresDialog({
  item,
  expenditures,
  isLoading,
  onClose,
  onAddExpenditure,
  onDeleteExpenditure,
}: {
  item: BudgetItem;
  expenditures: BudgetExpenditure[];
  isLoading: boolean;
  onClose: () => void;
  onAddExpenditure: () => void;
  onDeleteExpenditure: (expId: number) => void;
}) {
  const totalSpent = expenditures.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={`Expenditures for ${item.description}`}
      description={`${formatCurrency(item.utilizedBudget, item.currency)} spent of ${formatCurrency(item.allocatedBudget, item.currency)}`}
      maxWidth="lg"
      footer={
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-bold text-foreground">{formatCurrency(totalSpent, item.currency)}</span>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="button" onClick={onAddExpenditure}>
              <Plus className="w-4 h-4 mr-2" />
              Add Expenditure
            </Button>
          </div>
        </div>
      }
    >
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : expenditures.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No expenditures recorded yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenditures.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell>{exp.expenditureDate ? new Date(exp.expenditureDate).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{exp.description}</TableCell>
                    <TableCell>{exp.vendor || '-'}</TableCell>
                    <TableCell>{exp.invoiceNumber || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(exp.amount, item.currency)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Delete this expenditure?')) {
                            onDeleteExpenditure(exp.id);
                          }
                        }}
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
    </FormDialog>
  );
}

// ── Add Expenditure Dialog ───────────────────────────────────────────────────

function ExpenditureDialog({
  onSubmit,
  onClose,
  isSubmitting,
  currency = 'MYR',
}: {
  onSubmit: (data: ExpenditureForm) => void;
  onClose: () => void;
  isSubmitting: boolean;
  currency?: string;
}) {
  const [form, setForm] = useState<ExpenditureForm>({
    amount: 0,
    description: '',
    vendor: '',
    invoiceNumber: '',
    poNumber: '',
    expenditureDate: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = () => {
    onSubmit(form);
  };

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title="Add Expenditure"
      description="Record a new expenditure for this budget item"
      maxWidth="md"
      onSubmit={handleSubmit}
      submitLabel="Add Expenditure"
      isSubmitting={isSubmitting}
    >
      <div>
        <Label>Amount ({currency}) *</Label>
        <Input
          type="number"
          value={form.amount || ''}
          onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          min="0"
          step="0.01"
          required
        />
      </div>
      <div>
        <Label>Description *</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="e.g. Vendor payment for server"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Vendor</Label>
          <Input
            value={form.vendor || ''}
            onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            placeholder="e.g. Dell Technologies"
          />
        </div>
        <div>
          <Label>Invoice Number</Label>
          <Input
            value={form.invoiceNumber || ''}
            onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            placeholder="e.g. INV-2024-001"
          />
        </div>
      </div>
      <div>
        <Label>PO Number</Label>
        <Input
          value={form.poNumber || ''}
          onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
          placeholder="e.g. PO-2024-001"
        />
      </div>
      <div>
        <Label>Expenditure Date</Label>
        <DatePicker
          value={form.expenditureDate || ''}
          onChange={(v) => setForm({ ...form, expenditureDate: v })}
        />
      </div>
    </FormDialog>
  );
}
