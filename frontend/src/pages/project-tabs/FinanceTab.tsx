import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Receipt } from 'lucide-react';
import { ProgressBar } from '@/components/progress-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { RequisitionFormDialog } from '@/components/requisitions/RequisitionFormDialog';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

export function FinanceTab({ project, refetch }: { project: any, refetch: () => void }) {
  const { user } = useAuth();
  const budgets = project.budgetItems || [];
  const requisitions = project.requisitionForms || [];
  const purchaseOrders = project.purchaseOrders || [];

  const [budgetOpen, setBudgetOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [budgetForm, setBudgetForm] = useState({
    category: '',
    description: '',
    allocatedBudget: '',
  });

  const handleAddBudget = async () => {
    if (!budgetForm.category || !budgetForm.allocatedBudget) return;
    try {
      setLoading(true);
      await apiClient.post('/budget', {
        projectId: project.id,
        category: budgetForm.category,
        description: budgetForm.description || 'Project Budget Allocation',
        requestor: user?.name,
        allocatedBudget: parseFloat(budgetForm.allocatedBudget)
      });
      toast.success('Budget allocated successfully');
      setBudgetOpen(false);
      setBudgetForm({ category: '', description: '', allocatedBudget: '' });
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add budget');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReq = async (data: any) => {
    try {
      setLoading(true);
      await apiClient.post('/requisitions', data);
      toast.success('Requisition drafted successfully');
      setReqOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to request items');
    } finally {
      setLoading(false);
    }
  };

  const activeOrders = purchaseOrders.filter((po: any) => po.status !== 'cancelled');
  const poTotal = activeOrders.reduce((sum: number, po: any) => sum + Number(po.grandTotal || 0), 0);
  const poPaid = purchaseOrders.reduce((sum: number, po: any) =>
    sum + (po.payments || [])
      .filter((p: any) => p.status === 'paid')
      .reduce((ps: number, p: any) => ps + Number(p.totalPaid || 0), 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Finances & Requisitions</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Budget Allocations</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setBudgetOpen(true)}>
              <PlusCircle className="w-4 h-4 mr-2" /> Add Budget
            </Button>
          </CardHeader>
          <CardContent>
            {budgets.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">No budget allocated for this project.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Allocated</TableHead>
                    <TableHead className="min-w-[120px]">Utilization</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.category}</TableCell>
                      <TableCell>{Number(b.allocatedBudget).toLocaleString()}</TableCell>
                      <TableCell>
                        <ProgressBar
                          value={Number(b.allocatedBudget) > 0
                            ? Math.round((Number(b.utilizedBudget || 0) / Number(b.allocatedBudget)) * 100)
                            : 0}
                          tone="auto"
                        />
                      </TableCell>
                      <TableCell><Badge>{b.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Project Requisitions</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setReqOpen(true)}>
              <Receipt className="w-4 h-4 mr-2" /> Request Items
            </Button>
          </CardHeader>
          <CardContent>
            {requisitions.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">No requisitions created for this project.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Est. Cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requisitions.map((req: any) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">RF-{req.id.toString().padStart(4, '0')}</TableCell>
                      <TableCell>{req.division}</TableCell>
                      <TableCell>
                        {req.budgetItem ? (
                          <Badge variant="outline" className="text-xs">{req.budgetItem.category || req.budgetItem.description}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>{Number(req.totalEstimatedCost).toLocaleString()}</TableCell>
                      <TableCell><StatusBadge domain="requisition" value={req.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <p className="text-sm text-slate-500 mt-4">No purchase orders recorded for this project.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Grand Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po: any) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium">
                        <Link to={`/purchase-orders/${po.id}`} className="font-mono text-primary hover:underline">
                          {po.poNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{po.vendor?.name || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{(po.type || 'po').toUpperCase()}</Badge></TableCell>
                      <TableCell>{Number(po.grandTotal).toLocaleString()}</TableCell>
                      <TableCell><StatusBadge domain="po" value={po.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap gap-4 justify-end mt-3 text-sm text-muted-foreground">
                <span>{purchaseOrders.length} order{purchaseOrders.length === 1 ? '' : 's'}</span>
                <span>Total: <span className="font-medium text-foreground">MYR {poTotal.toLocaleString()}</span></span>
                <span>Paid: <span className="font-medium text-foreground">MYR {poPaid.toLocaleString()}</span></span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={budgetOpen}
        onOpenChange={setBudgetOpen}
        title="Add Project Budget"
        description="Allocate budget to a specific category"
        maxWidth="sm"
        onSubmit={handleAddBudget}
        submitLabel="Allocate"
        isSubmitting={loading}
      >
        <div className="space-y-2">
          <Label>Category</Label>
          <Input value={budgetForm.category} onChange={e => setBudgetForm({...budgetForm, category: e.target.value})} placeholder="e.g. AWS Hosting, Software Licenses" />
        </div>
        <div className="space-y-2">
          <Label>Amount (MYR)</Label>
          <Input type="number" value={budgetForm.allocatedBudget} onChange={e => setBudgetForm({...budgetForm, allocatedBudget: e.target.value})} placeholder="5000" />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input value={budgetForm.description} onChange={e => setBudgetForm({...budgetForm, description: e.target.value})} placeholder="Optional details..." />
        </div>
      </FormDialog>

      {reqOpen && (
        <RequisitionFormDialog
          projectId={project.id}
          purchaseType="project"
          onSubmit={handleCreateReq}
          onClose={() => setReqOpen(false)}
          isSubmitting={loading}
        />
      )}
    </div>
  );
}