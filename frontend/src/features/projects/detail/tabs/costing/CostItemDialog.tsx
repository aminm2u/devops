import { useEffect, useState } from 'react';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CostCategory, CostItem, CostItemPayload } from '@/api/costing';
import type { ScopeItem } from '@/api/scope';

/**
 * Add/edit a cost line. The scope select is the spine link — picking a scope
 * item makes this line's plan/actual roll up into that item (and its parents).
 */
export function CostItemDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  categories,
  scopeItems,
  budgetItems,
  item,
  defaultCategoryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CostItemPayload) => void;
  isSubmitting: boolean;
  categories: CostCategory[];
  scopeItems: ScopeItem[];
  budgetItems: { id: number; category: string; description: string }[];
  item: CostItem | null;
  defaultCategoryId: number | null;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [scopeItemId, setScopeItemId] = useState('');
  const [budgetItemId, setBudgetItemId] = useState('');
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [uom, setUom] = useState('');
  const [unitCost, setUnitCost] = useState('0');
  const [actualCost, setActualCost] = useState('0');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!open) return;
    setCategoryId(String(item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? ''));
    setScopeItemId(item?.scopeItemId ? String(item.scopeItemId) : '');
    setBudgetItemId(item?.budgetItemId ? String(item.budgetItemId) : '');
    setDescription(item?.description ?? '');
    setQty(item ? String(item.qty) : '1');
    setUom(item?.uom ?? '');
    setUnitCost(item ? String(item.unitCost) : '0');
    setActualCost(item ? String(item.actualCost) : '0');
    setRemarks(item?.remarks ?? '');
  }, [open, item, defaultCategoryId, categories]);

  const plan = Number(qty || 0) * Number(unitCost || 0);

  const handleSubmit = () => {
    if (!description.trim() || !categoryId) return;
    onSubmit({
      categoryId: Number(categoryId),
      scopeItemId: scopeItemId ? Number(scopeItemId) : null,
      budgetItemId: budgetItemId ? Number(budgetItemId) : null,
      description: description.trim(),
      qty: Number(qty || 0),
      uom: uom.trim() || null,
      unitCost: Number(unitCost || 0),
      actualCost: Number(actualCost || 0),
      remarks: remarks.trim() || null,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'Edit Cost Item' : 'Add Cost Item'}
      submitLabel={item ? 'Save Changes' : 'Add Item'}
      isSubmitting={isSubmitting}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Description *</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Integration Server"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Qty</Label>
          <Input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <Input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="unit / day / lot" />
        </div>
        <div className="space-y-2">
          <Label>Unit Cost</Label>
          <Input type="number" min={0} step="any" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end text-sm text-muted-foreground">
        Plan: <span className="ml-1 font-medium text-foreground">MYR {plan.toLocaleString()}</span>
      </div>
      <div className="space-y-2">
        <Label>Actual Cost</Label>
        <Input type="number" min={0} step="any" value={actualCost} onChange={(e) => setActualCost(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Scope Item</Label>
        <Select value={scopeItemId || 'none'} onValueChange={(v) => setScopeItemId(v === 'none' ? '' : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Not linked to scope —</SelectItem>
            {scopeItems.map((scope) => (
              <SelectItem key={scope.id} value={String(scope.id)}>
                {scope.wbsNumber} · {scope.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {budgetItems.length > 0 && (
        <div className="space-y-2">
          <Label>Budget Item (for later procurement)</Label>
          <Select value={budgetItemId || 'none'} onValueChange={(v) => setBudgetItemId(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Not linked —</SelectItem>
              {budgetItems.map((budget) => (
                <SelectItem key={budget.id} value={String(budget.id)}>
                  {budget.category} · {budget.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label>Remarks</Label>
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
      </div>
    </FormDialog>
  );
}
