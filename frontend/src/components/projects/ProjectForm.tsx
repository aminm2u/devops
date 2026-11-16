import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { FormField } from '@/components/ui/form-field';
import { FormGrid } from '@/components/ui/form-grid';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { DatePicker } from '@/components/ui/date-picker';
import { useAuth } from '@/hooks/useAuth';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';
import apiClient from '@/api/client';
import { toLocalDateStr } from '@/lib/utils';
import type { Project } from '@/types';

interface ProjectFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  onSubmit: (data: Partial<Project>) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

export function ProjectForm({ open, onOpenChange, project, onSubmit, onCancel, isLoading }: ProjectFormProps) {
  const { user } = useAuth();
  // Status and priority come from master data rather than a literal list, so
  // the form cannot offer a value the list or the filter does not know about.
  const { data: statusData } = useReferenceData('status_project');
  const projectStatuses = toSelectOptions(statusData);
  const { data: priorityData } = useReferenceData('project_priority');
  const projectPriorities = toSelectOptions(priorityData);
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [status, setStatus] = useState(project?.status || 'planning');
  const [priority, setPriority] = useState(project?.priority || 'medium');
  // URL fields are commented out in the JSX below — the state stays so the
  // values survive a hidden-field round-trip without being cleared.
  const [repositoryUrl] = useState(project?.repositoryUrl || '');
  const [documentationUrl] = useState(project?.documentationUrl || '');
  const [ownerId, setOwnerId] = useState<string>(project?.ownerId?.toString() || user?.id?.toString() || '');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Commercial block: without-tax + tax, with the total derived (read-only).
  const [valueWithoutTax, setValueWithoutTax] = useState(
    project?.valueWithoutTax != null ? String(Number(project.valueWithoutTax)) : ''
  );
  const [taxAmount, setTaxAmount] = useState(
    project?.taxAmount != null ? String(Number(project.taxAmount)) : ''
  );
  const [hasWarranty, setHasWarranty] = useState(project?.hasWarranty ?? false);
  const [warrantyMonths, setWarrantyMonths] = useState(
    project?.warrantyMonths != null ? String(project.warrantyMonths) : ''
  );
  const [startDate, setStartDate] = useState(
    project?.startDate ? toLocalDateStr(new Date(project.startDate)) : ''
  );
  const [endDate, setEndDate] = useState(
    project?.expectedEndDate ? toLocalDateStr(new Date(project.expectedEndDate)) : ''
  );

  // Duration in months, derived from the dates: whole months between start
  // and end, counting a partial month as one (13 Mar → 13 Jun = 3).
  const durationMonths = (() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    if (end <= start) return null;
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() > start.getDate()) months += 1;
    return months;
  })();

  const valueWithoutTaxNum = Number(valueWithoutTax || 0);
  const taxNum = Number(taxAmount || 0);
  const valueWithTax = valueWithoutTaxNum + taxNum;

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiClient.get('/admin/users/list');
        setUsers(response.data.data || []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        // Fallback: use current user
        if (user) {
          setUsers([{ id: user.id, name: user.name, email: user.email }]);
        }
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [user]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';
    if (repositoryUrl && !/^https?:\/\/.+/.test(repositoryUrl)) {
      newErrors.repositoryUrl = 'Must be a valid URL';
    }
    if (documentationUrl && !/^https?:\/\/.+/.test(documentationUrl)) {
      newErrors.documentationUrl = 'Must be a valid URL';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      status: status as any,
      priority: priority as any,
      repositoryUrl: repositoryUrl.trim() || null,
      documentationUrl: documentationUrl.trim() || null,
      ownerId: ownerId ? parseInt(ownerId, 10) : undefined,
      valueWithoutTax: valueWithoutTax === '' ? null : valueWithoutTaxNum,
      taxAmount: taxAmount === '' ? null : taxNum,
      hasWarranty,
      warrantyMonths: hasWarranty && warrantyMonths !== '' ? parseInt(warrantyMonths, 10) : null,
      startDate: startDate ? new Date(startDate + 'T00:00:00').toISOString() : null,
      expectedEndDate: endDate ? new Date(endDate + 'T00:00:00').toISOString() : null,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={project ? 'Edit Project' : 'Create New Project'}
      description={project ? 'Update project details' : 'Fill in the details to create a new project'}
      maxWidth="xl"
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel={project ? 'Update Project' : 'Create Project'}
      isSubmitting={isLoading}
    >
      <FormField label="Project Name" htmlFor="name" required error={errors.name || undefined}>
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors({ ...errors, name: '' });
          }}
          placeholder="e.g., E-Commerce Platform"
          className={errors.name ? 'border-destructive' : ''}
        />
      </FormField>

      <FormField label="Description" htmlFor="description">
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the project"
          rows={3}
        />
      </FormField>

      <FormGrid>
        <FormField label="Status">
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projectStatuses.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Priority">
          <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projectPriorities.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormGrid>

      <FormGrid columns={3}>
        <FormField label="Start Date">
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Select start" />
        </FormField>
        <FormField label="End Date">
          <DatePicker value={endDate} onChange={setEndDate} placeholder="Select end" />
        </FormField>
        <FormField label="Duration (months)">
          <Input value={durationMonths ?? ''} placeholder="—" readOnly disabled />
        </FormField>
      </FormGrid>

      <FormGrid>
        <FormField label="Project Value (without tax)">
          <Input
            type="number"
            min={0}
            step="any"
            value={valueWithoutTax}
            onChange={(e) => setValueWithoutTax(e.target.value)}
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Tax">
          <Input
            type="number"
            min={0}
            step="any"
            value={taxAmount}
            onChange={(e) => setTaxAmount(e.target.value)}
            placeholder="0.00"
          />
        </FormField>
      </FormGrid>
      <FormField label="Total Project Value (with tax)">
        <Input
          value={valueWithTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          readOnly
          disabled
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="has-warranty"
            checked={hasWarranty}
            onCheckedChange={(checked) => {
              setHasWarranty(checked === true);
              if (checked !== true) setWarrantyMonths('');
            }}
          />
          <label htmlFor="has-warranty" className="text-sm font-medium leading-none dark:text-gray-400 text-gray-800">
            This project has a warranty period
          </label>
        </div>
        {hasWarranty && (
          <FormField label="Warranty Period (months)">
            <Input
              type="number"
              min={1}
              step="1"
              value={warrantyMonths}
              onChange={(e) => setWarrantyMonths(e.target.value)}
              placeholder="e.g., 12"
            />
          </FormField>
        )}
      </div>

      {/*
        Repository / Documentation URL fields — commented out for now.
        The state, validation and submit payload remain; restore these blocks
        to bring the fields back.
      */}
      {/*
      <FormField label="Repository URL" htmlFor="repo" error={errors.repositoryUrl || undefined}>
        <Input
          id="repo"
          value={repositoryUrl}
          onChange={(e) => {
            setRepositoryUrl(e.target.value);
            if (errors.repositoryUrl) setErrors({ ...errors, repositoryUrl: '' });
          }}
          placeholder="https://github.com/org/repo"
          className={errors.repositoryUrl ? 'border-destructive' : ''}
        />
      </FormField>

      <FormField label="Documentation URL" htmlFor="docs" error={errors.documentationUrl || undefined}>
        <Input
          id="docs"
          value={documentationUrl}
          onChange={(e) => {
            setDocumentationUrl(e.target.value);
            if (errors.documentationUrl) setErrors({ ...errors, documentationUrl: '' });
          }}
          placeholder="https://docs.example.com"
          className={errors.documentationUrl ? 'border-destructive' : ''}
        />
      </FormField>
      */}

      <FormField label="Project Owner">
        <Select value={ownerId} onValueChange={setOwnerId} disabled={loadingUsers}>
          <SelectTrigger>
            <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select owner"} />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id.toString()}>
                <div className="flex items-center gap-2">
                  <UserAvatar user={u} size="sm" />
                  <span>{u.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    </FormDialog>
  );
}
