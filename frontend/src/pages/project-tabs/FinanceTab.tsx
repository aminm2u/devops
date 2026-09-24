import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Receipt } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

export function FinanceTab({ project, refetch }: { project: any, refetch: () => void }) {
  const { user } = useAuth();
  const budgets = project.budgetItems || [];
  const requisitions = project.requisitionForms || [];

  const [budgetOpen, setBudgetOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [budgetForm, setBudgetForm] = useState({
    category: '',
    description: '',
    allocatedBudget: '',
  });

  const [reqForm, setReqForm] = useState({
    division: '',
    purpose: '',
    totalEstimatedCost: '',
    budgetItemId: '',
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

  const handleAddReq = async () => {
    if (!reqForm.division || !reqForm.totalEstimatedCost) return;
    try {
      setLoading(true);
      await apiClient.post('/requisitions', {
        projectId: project.id,
        division: reqForm.division,
        purpose: reqForm.purpose,
        totalEstimatedCost: parseFloat(reqForm.totalEstimatedCost),
        budgetItemId: reqForm.budgetItemId ? parseInt(reqForm.budgetItemId) : null,
        status: 'draft',
        requestedByName: user?.name,
        items: [{ description: reqForm.purpose || 'General', qty: 1, unitPrice: parseFloat(reqForm.totalEstimatedCost) }],
      });
      toast.success('Requisition drafted successfully');
      setReqOpen(false);
      setReqForm({ division: '', purpose: '', totalEstimatedCost: '', budgetItemId: '' });
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to request items');
    } finally {
      setLoading(false);
    }
  };

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
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.category}</TableCell>
                      <TableCell>{Number(b.allocatedBudget).toLocaleString()}</TableCell>
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
                      <TableCell className="font-medium">REQ-{req.id.toString().padStart(4, '0')}</TableCell>
                      <TableCell>{req.division}</TableCell>
                      <TableCell>
                        {req.budgetItem ? (
                          <Badge variant="outline" className="text-xs">{req.budgetItem.category || req.budgetItem.description}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>{Number(req.totalEstimatedCost).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{req.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader><CardTitle>Add Project Budget</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
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
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setBudgetOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddBudget} disabled={loading}>Allocate</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="p-0">
          <Card className="pt-8 border-0 shadow-none">
            <CardHeader><CardTitle>Draft New Requisition</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Division/Department</Label>
                  <Input value={reqForm.division} onChange={e => setReqForm({...reqForm, division: e.target.value})} placeholder="e.g. Engineering, Marketing" />
                </div>
                <div className="space-y-2">
                  <Label>Budget Allocation</Label>
                  <Select value={reqForm.budgetItemId} onValueChange={v => setReqForm({...reqForm, budgetItemId: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a budget (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {budgets.length === 0 ? (
                        <SelectItem value="none" disabled>No budgets available</SelectItem>
                      ) : (
                        budgets.map((b: any) => (
                          <SelectItem key={b.id} value={b.id.toString()}>
                            {b.category} — {Number(b.allocatedBudget).toLocaleString()}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Purpose</Label>
                  <Input value={reqForm.purpose} onChange={e => setReqForm({...reqForm, purpose: e.target.value})} placeholder="Why is this needed?" />
                </div>
                <div className="space-y-2">
                  <Label>Estimated Total Cost (MYR)</Label>
                  <Input type="number" value={reqForm.totalEstimatedCost} onChange={e => setReqForm({...reqForm, totalEstimatedCost: e.target.value})} placeholder="0.00" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setReqOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddReq} disabled={loading}>Create Draft</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    </div>
  );
}