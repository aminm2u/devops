import { useEffect, useState } from 'react';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ResourceAssignment, ResourcePayload } from '@/api/costing';

/** Add/edit one row of the resources cost block (person × rate × weeks). */
export function ResourceDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  resource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ResourcePayload) => void;
  isSubmitting: boolean;
  resource: ResourceAssignment | null;
}) {
  const [name, setName] = useState('');
  const [positionCode, setPositionCode] = useState('');
  const [costPerDay, setCostPerDay] = useState('0');
  const [weeksRequired, setWeeksRequired] = useState('0');
  const [daysPerWeek, setDaysPerWeek] = useState('5');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(resource?.name ?? '');
    setPositionCode(resource?.positionCode ?? '');
    setCostPerDay(resource ? String(resource.costPerDay) : '0');
    setWeeksRequired(resource ? String(resource.weeksRequired) : '0');
    setDaysPerWeek(resource ? String(resource.daysPerWeek) : '5');
    setRemarks(resource?.remarks ?? '');
  }, [open, resource]);

  const budget = Number(costPerDay || 0) * Number(weeksRequired || 0) * Number(daysPerWeek || 5);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      positionCode: positionCode.trim() || 'TS',
      costPerDay: Number(costPerDay || 0),
      weeksRequired: Number(weeksRequired || 0),
      daysPerWeek: Number(daysPerWeek || 5),
      remarks: remarks.trim() || null,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={resource ? 'Edit Resource' : 'Add Resource'}
      submitLabel={resource ? 'Save Changes' : 'Add Resource'}
      isSubmitting={isSubmitting}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="space-y-2">
          <Label>Position Code</Label>
          <Input value={positionCode} onChange={(e) => setPositionCode(e.target.value)} placeholder="PM / GIS-L / TS1" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Cost / Day</Label>
          <Input type="number" min={0} step="any" value={costPerDay} onChange={(e) => setCostPerDay(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Weeks</Label>
          <Input type="number" min={0} step="any" value={weeksRequired} onChange={(e) => setWeeksRequired(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Days / Week</Label>
          <Input type="number" min={1} max={7} value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end text-sm text-muted-foreground">
        Budget:{' '}
        <span className="ml-1 font-medium text-foreground">
          MYR {budget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="space-y-2">
        <Label>Remarks</Label>
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
      </div>
    </FormDialog>
  );
}
