import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

interface Deployment {
  id: number;
  projectId: number;
  name: string;
  version: string;
  status: string;
  branch?: string | null;
  commitHash?: string | null;
  commitMessage?: string | null;
  notes?: string | null;
  environmentId?: number | null;
}

interface DeploymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  environments?: { id: number; name: string }[];
  deployment?: Deployment | null;
  onSuccess?: () => void;
}

const emptyForm = {
  name: '',
  version: '',
  status: 'pending',
  branch: '',
  commitHash: '',
  commitMessage: '',
  notes: '',
  environmentId: '',
};

export function DeploymentDialog({
  open,
  onOpenChange,
  projectId,
  environments = [],
  deployment,
  onSuccess,
}: DeploymentDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (deployment) {
      setForm({
        name: deployment.name || '',
        version: deployment.version || '',
        status: deployment.status || 'pending',
        branch: deployment.branch || '',
        commitHash: deployment.commitHash || '',
        commitMessage: deployment.commitMessage || '',
        notes: deployment.notes || '',
        environmentId: deployment.environmentId?.toString() || '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [deployment, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Deployment name is required');
      return;
    }
    if (!form.version.trim()) {
      toast.error('Version is required');
      return;
    }

    setIsPending(true);
    try {
      const payload: any = {
        projectId,
        name: form.name.trim(),
        version: form.version.trim(),
        status: form.status,
        branch: form.branch.trim() || null,
        commitHash: form.commitHash.trim() || null,
        commitMessage: form.commitMessage.trim() || null,
        notes: form.notes.trim() || null,
        environmentId: form.environmentId ? parseInt(form.environmentId) : null,
      };

      if (deployment) {
        await apiClient.put(`/deployments/${deployment.id}`, payload);
        toast.success('Deployment updated');
      } else {
        await apiClient.post('/deployments', payload);
        toast.success('Deployment created');
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save deployment');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={deployment ? 'Edit Deployment' : 'New Deployment'}
      description={deployment ? 'Update deployment details' : 'Create a new deployment'}
      maxWidth="md"
      onSubmit={handleSubmit}
      submitLabel={deployment ? 'Update' : 'Create'}
      isSubmitting={isPending}
    >
      <FormField label="Name" required>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g., Production Release v2.1"
        />
      </FormField>

      <FormGrid>
        <FormField label="Version" required>
          <Input
            value={form.version}
            onChange={(e) => setForm({ ...form, version: e.target.value })}
            placeholder="e.g., 2.1.0"
          />
        </FormField>
        <FormField label="Status">
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="rolled_back">Rolled Back</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </FormGrid>

      <FormGrid>
        <FormField label="Branch">
          <Input
            value={form.branch}
            onChange={(e) => setForm({ ...form, branch: e.target.value })}
            placeholder="e.g., main"
          />
        </FormField>
        <FormField label="Commit Hash">
          <Input
            value={form.commitHash}
            onChange={(e) => setForm({ ...form, commitHash: e.target.value })}
            placeholder="e.g., abc1234"
          />
        </FormField>
      </FormGrid>

      {environments.length > 0 && (
        <FormField label="Environment">
          <Select value={form.environmentId} onValueChange={(v) => setForm({ ...form, environmentId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {environments.map((env) => (
                <SelectItem key={env.id} value={env.id.toString()}>
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      <FormField label="Commit Message">
        <Textarea
          value={form.commitMessage}
          onChange={(e) => setForm({ ...form, commitMessage: e.target.value })}
          placeholder="Brief description of changes"
          rows={2}
        />
      </FormField>

      <FormField label="Notes">
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Additional deployment notes"
          rows={3}
        />
      </FormField>
    </FormDialog>
  );
}
